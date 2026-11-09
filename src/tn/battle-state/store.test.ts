import type { BattleState } from 'tn'
import assert from 'node:assert/strict'
// eslint-disable-next-line test/no-import-node-test
import { afterEach, beforeEach, describe, it, mock } from 'node:test'
import { BATTLE_STATE_KEY } from './background'

// 假的 chrome.storage：get 由各測試決定何時、回傳什麼；onChanged 記下監聽，測試自己觸發
type ChangeListener = (changes: Record<string, { newValue?: unknown }>, areaName: string) => void
let listeners: ChangeListener[] = []
let getImpl: (key: string) => Promise<Record<string, unknown>>
Object.assign(globalThis, {
  chrome: {
    storage: {
      local: { get: (key: string) => getImpl(key) },
      onChanged: { addListener: (listener: ChangeListener) => listeners.push(listener) },
    },
  },
})

const OLD = { raidId: '111' } as BattleState
const NEW = { raidId: '222' } as BattleState

function emit(changes: Record<string, { newValue?: unknown }>, areaName = 'local') {
  for (const listener of listeners)
    listener(changes, areaName)
}

/** store.ts 在模組頂層讀取並註冊監聽：每個測試各載入一份新的模組實例，模擬重新打開側欄 */
let loads = 0
async function load() {
  const path = `./store.ts?case=${loads++}`
  return (await import(path) as typeof import('./store')).battleState
}

const tick = () => new Promise(resolve => setTimeout(resolve, 0))

describe('battleState（側欄讀 tn:battle-state 的唯讀 ref）', () => {
  let consoleError: ReturnType<typeof mock.method>
  beforeEach(() => {
    listeners = []
    getImpl = async key => ({ [key]: JSON.stringify(OLD) })
    consoleError = mock.method(console, 'error', () => {})
  })
  afterEach(() => {
    consoleError.mock.restore()
  })

  it('載入時讀出 storage 的 JSON 字串；沒有這個 key 時是 null', async () => {
    const battleState = await load()
    await tick()
    assert.deepEqual(battleState.value, OLD)

    getImpl = async () => ({})
    const empty = await load()
    await tick()
    assert.equal(empty.value, null)
  })

  it('只接受 local 區、tn:battle-state 這個 key 的變更', async () => {
    const battleState = await load()
    await tick()

    emit({ [BATTLE_STATE_KEY]: { newValue: JSON.stringify(NEW) } }, 'sync')
    assert.deepEqual(battleState.value, OLD)
    emit({ 'tn:battle-scripts': { newValue: JSON.stringify(NEW) } })
    assert.deepEqual(battleState.value, OLD)
    emit({ [BATTLE_STATE_KEY]: { newValue: JSON.stringify(NEW) } })
    assert.deepEqual(battleState.value, NEW)
    // key 被移除時是 null
    emit({ [BATTLE_STATE_KEY]: {} })
    assert.equal(battleState.value, null)
  })

  it('onChanged 比第一次 get 先送到時，晚回來的 get（舊快照）不會蓋掉新狀態', async () => {
    let resolveGet!: () => void
    getImpl = key => new Promise(resolve => resolveGet = () => resolve({ [key]: JSON.stringify(OLD) }))
    const battleState = await load()

    emit({ [BATTLE_STATE_KEY]: { newValue: JSON.stringify(NEW) } })
    resolveGet()
    await tick()

    assert.deepEqual(battleState.value, NEW)
  })

  it('第一次 get 失敗時以 [tn] 前綴印出錯誤，ref 維持 null', async () => {
    getImpl = async () => {
      throw new Error('讀取失敗')
    }
    const battleState = await load()
    await tick()

    assert.equal(battleState.value, null)
    assert.equal(consoleError.mock.callCount(), 1)
    assert.match(String(consoleError.mock.calls[0].arguments[0]), /^\[tn\]/)
  })
})
