import type { RecIndexEntry } from './core'
import assert from 'node:assert/strict'
// eslint-disable-next-line test/no-import-node-test
import { after, before, beforeEach, describe, it } from 'node:test'
import { StorageSerializers } from '@vueuse/core'
import { REC_ENABLED_KEY, REC_INDEX_KEY } from './core'
import { clearRecordings, recordParcel } from './store'

// 假的 chrome.storage.local：Map 實作 get／set／remove，並記下每次 set、remove 動到哪些 key
const data = new Map<string, unknown>()
const calls: { op: 'set' | 'remove', keys: string[] }[] = []
const local = {
  async get(keys: string | string[] | null) {
    const list = keys === null ? [...data.keys()] : [keys].flat()
    return Object.fromEntries(list.filter(key => data.has(key)).map(key => [key, structuredClone(data.get(key))]))
  },
  async set(items: Record<string, unknown>) {
    calls.push({ op: 'set', keys: Object.keys(items) })
    for (const [key, value] of Object.entries(items))
      data.set(key, structuredClone(value))
  },
  async remove(keys: string | string[]) {
    calls.push({ op: 'remove', keys: [keys].flat() })
    for (const key of [keys].flat())
      data.delete(key)
  },
}

const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
before(() => {
  (globalThis as unknown as { chrome: unknown }).chrome = { storage: { local } }
  // 假的 navigator.locks：直接執行 callback
  Object.defineProperty(globalThis, 'navigator', { value: { locks: { request: (_name: string, task: () => Promise<void>) => task() } }, configurable: true })
})
after(() => {
  delete (globalThis as unknown as { chrome?: unknown }).chrome
  if (originalNavigator)
    Object.defineProperty(globalThis, 'navigator', originalNavigator)
})
beforeEach(() => {
  data.clear()
  calls.length = 0
})

/** 等佇列跑完：假 storage 的操作都是 microtask，下一個 macrotask 時已全部完成 */
function flush() {
  return new Promise(resolve => setImmediate(resolve))
}

function entry(raidId: string, lastAt: number): RecIndexEntry {
  return { raidId, startedAt: lastAt, lastAt, count: 1, bytes: 10, truncated: false }
}

const parcel = { url: '/rest/raid/ability_result.json?uid=1', requestData: '{"raid_id":11111111}', responseData: { status: { turn: 1 } } }

describe('錄製開關', () => {
  it('開關的值和側欄頁 useWebExtensionStorage 寫入的格式相同時才錄', async () => {
    // 側欄頁的開關是 useWebExtensionStorage<boolean>，用同一個 serializer 產生值，兩端的格式綁在一起
    data.set(REC_ENABLED_KEY, StorageSerializers.boolean.write(true))
    recordParcel(parcel)
    await flush()
    assert.deepEqual([...data.keys()].sort(), [REC_ENABLED_KEY, REC_INDEX_KEY, 'tn:rec:11111111:0'].sort())
    const record = data.get('tn:rec:11111111:0') as Record<string, unknown>
    assert.deepEqual({ ...record, t: 0 }, { t: 0, ...parcel })
  })

  it('開關關閉或沒有設定時不寫入任何東西', async () => {
    for (const enabled of [StorageSerializers.boolean.write(false), undefined]) {
      data.clear()
      if (enabled !== undefined)
        data.set(REC_ENABLED_KEY, enabled)
      recordParcel(parcel)
      await flush()
      assert.deepEqual(calls, [], String(enabled))
    }
  })

  it('不在錄製範圍的 URL 不寫入', async () => {
    data.set(REC_ENABLED_KEY, StorageSerializers.boolean.write(true))
    recordParcel({ ...parcel, url: '/rest/quest/assist_list/0' })
    await flush()
    assert.deepEqual(calls, [])
  })
})

describe('寫入順序', () => {
  it('紀錄與索引同一次寫入，超過場數上限要刪的舊場排在後面', async () => {
    data.set(REC_ENABLED_KEY, StorageSerializers.boolean.write(true))
    data.set(REC_INDEX_KEY, [entry('1', 1), entry('2', 2), entry('3', 3)])
    for (const raidId of ['1', '2', '3'])
      data.set(`tn:rec:${raidId}:0`, { t: 0, url: '/x' })
    recordParcel(parcel)
    await flush()
    assert.deepEqual(calls, [
      { op: 'set', keys: ['tn:rec:11111111:0', REC_INDEX_KEY] },
      { op: 'remove', keys: ['tn:rec:1:0'] },
    ])
    assert.deepEqual((data.get(REC_INDEX_KEY) as RecIndexEntry[]).map(e => e.raidId), ['2', '3', '11111111'])
  })

  it('連續收到多筆時依序寫入，序號不互相覆蓋', async () => {
    data.set(REC_ENABLED_KEY, StorageSerializers.boolean.write(true))
    for (let turn = 1; turn <= 3; turn++)
      recordParcel({ ...parcel, responseData: { status: { turn } } })
    await flush()
    assert.deepEqual([0, 1, 2].map(seq => (data.get(`tn:rec:11111111:${seq}`) as { responseData: unknown }).responseData), [1, 2, 3].map(turn => ({ status: { turn } })))
    assert.equal((data.get(REC_INDEX_KEY) as RecIndexEntry[])[0].count, 3)
  })
})

describe('clearRecordings', () => {
  it('刪掉全部 tn:rec: 開頭的 key（含沒被索引指到的殘留），保留開關與其他 key', async () => {
    data.set(REC_ENABLED_KEY, StorageSerializers.boolean.write(true))
    data.set(REC_INDEX_KEY, [entry('1', 1)])
    data.set('tn:rec:1:0', { t: 0, url: '/x' })
    data.set('tn:rec:999:0', { t: 0, url: '/orphan' })
    data.set('battleRecord', [])
    data.set('tn:battle-scripts', '[]')
    await clearRecordings()
    assert.deepEqual([...data.keys()].sort(), ['battleRecord', REC_ENABLED_KEY, 'tn:battle-scripts'].sort())
  })
})
