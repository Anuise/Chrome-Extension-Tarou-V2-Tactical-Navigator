import type { RecIndexEntry, RecRecord } from './core'
import assert from 'node:assert/strict'
// eslint-disable-next-line test/no-import-node-test
import { after, afterEach, before, beforeEach, describe, it, mock } from 'node:test'
import { StorageSerializers } from '@vueuse/core'
import { REC_ENABLED_KEY, REC_INDEX_KEY, REC_LIMITS } from './core'
import { clearRecordings, loadRecords, recordParcel, setupRecorderWebSocket } from './store'

// 假的 chrome.storage.local：Map 實作 get／set／remove，並記下每次 set、remove 動到哪些 key
const data = new Map<string, unknown>()
const calls: { op: 'set' | 'remove', keys: string[] }[] = []
/** 設定後，下一次 get 先讀出當下的值，等這個 Promise 完成才回傳：模擬「讀完索引、還沒寫回」 */
let holdNextGet: Promise<void> | undefined
/** 設定後，下一次 set 直接 reject */
let failNextSet = false
const local = {
  async get(keys: string | string[] | null) {
    const list = keys === null ? [...data.keys()] : [keys].flat()
    const snapshot = Object.fromEntries(list.filter(key => data.has(key)).map(key => [key, structuredClone(data.get(key))]))
    const hold = holdNextGet
    holdNextGet = undefined
    await hold
    return snapshot
  },
  async set(items: Record<string, unknown>) {
    if (failNextSet) {
      failNextSet = false
      throw new Error('set 失敗')
    }
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

// 假的 chrome.debugger：只有 onEvent.addListener，沒有 attach、sendCommand、detach，誤呼叫就會丟錯
type DebuggerListener = (source: unknown, method: string, params?: unknown) => void
const debuggerListeners: DebuggerListener[] = []

// 假的 navigator.locks：同名的工作真的排隊，前一個完成（不論成敗）才執行下一個
const lockChains = new Map<string, Promise<unknown>>()
function requestLock(name: string, task: () => Promise<void>): Promise<void> {
  const run = (lockChains.get(name) ?? Promise.resolve()).then(task)
  lockChains.set(name, run.catch(() => {}))
  return run
}

const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
before(() => {
  (globalThis as unknown as { chrome: unknown }).chrome = {
    storage: { local },
    debugger: { onEvent: { addListener: (listener: DebuggerListener) => debuggerListeners.push(listener) } },
  }
  Object.defineProperty(globalThis, 'navigator', { value: { locks: { request: requestLock } }, configurable: true })
})
after(() => {
  delete (globalThis as unknown as { chrome?: unknown }).chrome
  if (originalNavigator)
    Object.defineProperty(globalThis, 'navigator', originalNavigator)
})

// 讓錯誤 log 不污染測試輸出，並能檢查有沒有印出
let consoleError: ReturnType<typeof mock.method>
beforeEach(() => {
  data.clear()
  calls.length = 0
  holdNextGet = undefined
  failNextSet = false
  consoleError = mock.method(console, 'error', () => {})
})
afterEach(() => {
  consoleError.mock.restore()
})

/** 等佇列跑完：假 storage 的操作都是 microtask，下一個 macrotask 時已全部完成 */
function flush() {
  return new Promise(resolve => setImmediate(resolve))
}

function entry(raidId: string, lastAt: number, fields: Partial<RecIndexEntry> = {}): RecIndexEntry {
  return { raidId, startedAt: lastAt, lastAt, count: 1, bytes: 10, truncated: false, ...fields }
}

function enable() {
  // 側欄頁的開關是 useWebExtensionStorage<boolean>，用同一個 serializer 產生值，兩端的格式綁在一起
  data.set(REC_ENABLED_KEY, StorageSerializers.boolean.write(true))
}

const parcel = { url: '/rest/raid/ability_result.json?uid=1', requestData: '{"raid_id":11111111}', responseData: { status: { turn: 1 } } }

describe('錄製開關', () => {
  it('開關的值和側欄頁 useWebExtensionStorage 寫入的格式相同時才錄', async () => {
    enable()
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
    enable()
    recordParcel({ ...parcel, url: '/rest/quest/assist_list/0' })
    await flush()
    assert.deepEqual(calls, [])
  })
})

describe('寫入順序', () => {
  it('紀錄與索引同一次寫入，超過場數上限要刪的舊場排在後面', async () => {
    enable()
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
    enable()
    for (let turn = 1; turn <= 3; turn++)
      recordParcel({ ...parcel, responseData: { status: { turn } } })
    await flush()
    assert.deepEqual([0, 1, 2].map(seq => (data.get(`tn:rec:11111111:${seq}`) as { responseData: unknown }).responseData), [1, 2, 3].map(turn => ({ status: { turn } })))
    assert.equal((data.get(REC_INDEX_KEY) as RecIndexEntry[])[0].count, 3)
  })

  it('這一場加上這筆會超過總量上限時，只寫索引（標記截斷），不寫紀錄', async () => {
    enable()
    data.set(REC_INDEX_KEY, [entry('11111111', 1, { bytes: REC_LIMITS.maxBytes - 10 })])
    recordParcel(parcel)
    await flush()
    assert.deepEqual(calls, [{ op: 'set', keys: [REC_INDEX_KEY] }])
    assert.equal((data.get(REC_INDEX_KEY) as RecIndexEntry[])[0].truncated, true)
    assert.equal(data.has('tn:rec:11111111:1'), false)
  })

  it('一筆寫入失敗後佇列照常往下走，下一筆仍寫入，失敗以 [tn] 前綴印出', async () => {
    enable()
    failNextSet = true
    recordParcel({ ...parcel, responseData: { status: { turn: 1 } } })
    recordParcel({ ...parcel, responseData: { status: { turn: 2 } } })
    await flush()
    // 第一筆沒寫進去，索引也沒更新，所以第二筆的序號是 0
    assert.deepEqual((data.get('tn:rec:11111111:0') as { responseData: unknown }).responseData, { status: { turn: 2 } })
    assert.equal((data.get(REC_INDEX_KEY) as RecIndexEntry[])[0].count, 1)
    assert.equal(consoleError.mock.callCount(), 1)
    assert.match(String(consoleError.mock.calls[0].arguments[0]), /^\[tn\]/)
  })
})

describe('Web Lock', () => {
  it('側欄的「全部清除」等 background 寫完才執行：索引與紀錄一致，沒有殘留', async () => {
    // 側欄與 background 是不同的 JS context，各有自己的佇列；再載入一份 store.ts 模擬側欄
    const panelPath = './store.ts?ctx=panel'
    const panel = await import(panelPath) as typeof import('./store')
    // 確認是另一份模組實例（各自的佇列），不是同一份
    assert.notEqual(panel.clearRecordings, clearRecordings)
    enable()
    data.set(REC_INDEX_KEY, [entry('11111111', 1)])
    data.set('tn:rec:11111111:0', { t: 0, url: '/x' })
    let release!: () => void
    holdNextGet = new Promise(resolve => release = resolve)
    // background 讀完舊索引後卡住
    recordParcel(parcel)
    await flush()
    // 這時側欄按「全部清除」
    const cleared = panel.clearRecordings()
    await flush()
    release()
    await cleared
    await flush()
    assert.deepEqual([...data.keys()], [REC_ENABLED_KEY])
  })
})

describe('WebSocket', () => {
  it('只錄 payload 以 42 開頭的 Network.webSocketFrameReceived，歸到最近一場；其他事件與壞掉的 JSON 不錄也不丟錯', async () => {
    enable()
    data.set(REC_INDEX_KEY, [entry('11111111', 1)])
    setupRecorderWebSocket()
    const listener = debuggerListeners.at(-1)!
    const source = { tabId: 1 }
    const events: [string, unknown][] = [
      ['Network.webSocketFrameSent', { response: { payloadData: '42["raid",{"sent":1}]' } }],
      ['Network.webSocketFrameReceived', { response: { payloadData: '3probe' } }],
      ['Network.webSocketFrameReceived', { response: { payloadData: '40' } }],
      ['Network.webSocketFrameReceived', { response: { payloadData: 42 } }],
      ['Network.webSocketFrameReceived', {}],
      ['Network.webSocketFrameReceived', undefined],
      ['Network.webSocketFrameReceived', { response: { payloadData: '42{壞掉' } }],
      ['Network.webSocketFrameReceived', { response: { payloadData: '42["raid",{"bossUpdate":{"param":{"boss1_hp":5}}}]' } }],
    ]
    for (const [method, params] of events)
      assert.doesNotThrow(() => listener(source, method, params), method)
    await flush()
    assert.deepEqual(calls.map(c => c.keys), [['tn:rec:11111111:1', REC_INDEX_KEY]])
    const record = data.get('tn:rec:11111111:1') as RecRecord
    assert.deepEqual({ ...record, t: 0 }, { t: 0, url: 'websocket', responseData: ['raid', { bossUpdate: { param: { boss1_hp: 5 } } }] })
    // 壞掉的 JSON 只印 log
    assert.equal(consoleError.mock.callCount(), 1)
    assert.match(String(consoleError.mock.calls[0].arguments[0]), /^\[tn\]/)
  })
})

describe('loadRecords', () => {
  it('依序號讀出一場的紀錄，讀不到的序號略過', async () => {
    data.set('tn:rec:7:0', { t: 0, url: '/a' })
    data.set('tn:rec:7:2', { t: 2, url: '/c' })
    data.set('tn:rec:8:1', { t: 9, url: '/other' })
    assert.deepEqual(await loadRecords(entry('7', 1, { count: 3 })), [{ t: 0, url: '/a' }, { t: 2, url: '/c' }])
  })
})

describe('clearRecordings', () => {
  it('刪掉全部 tn:rec: 開頭的 key（含沒被索引指到的殘留），保留開關與其他 key', async () => {
    enable()
    data.set(REC_INDEX_KEY, [entry('1', 1)])
    data.set('tn:rec:1:0', { t: 0, url: '/x' })
    data.set('tn:rec:999:0', { t: 0, url: '/orphan' })
    data.set('battleRecord', [])
    data.set('tn:battle-scripts', '[]')
    await clearRecordings()
    assert.deepEqual([...data.keys()].sort(), ['battleRecord', REC_ENABLED_KEY, 'tn:battle-scripts'].sort())
  })
})
