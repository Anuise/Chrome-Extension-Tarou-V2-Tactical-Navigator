import type { BattleState } from 'tn'
import assert from 'node:assert/strict'
// eslint-disable-next-line test/no-import-node-test
import { beforeEach, describe, it, mock } from 'node:test'
import { BATTLE_STATE_KEY, handleBattleState } from './background'

// 假的 chrome.storage.local：get、set 都晚一拍才完成，沒有串成佇列時後一筆會讀到舊值
let store: Record<string, unknown>
const local = {
  get: mock.fn(async (key: string) => {
    await new Promise(resolve => setTimeout(resolve, 5))
    return { [key]: store[key] }
  }),
  set: mock.fn(async (items: Record<string, unknown>) => {
    await new Promise(resolve => setTimeout(resolve, 5))
    Object.assign(store, items)
  }),
}
Object.assign(globalThis, { chrome: { storage: { local } } })

function stored(): BattleState {
  return JSON.parse(store[BATTLE_STATE_KEY] as string) as BattleState
}

const startJson = {
  raid_id: 111,
  quest_id: '305701',
  user_id: '1000',
  turn: 1,
  battle: { total: 1, count: '1' },
  player: { param: [{ pid: '450201_fig', leader: 1, condition: {} }] },
  ability: { 1: { pos: 0, list: { 1: [{ 'ability-id': '100', 'class': '' }] } } },
  boss: { param: [{ hp: '5000', condition: { buff: [{ status: '1009_1' }] } }] },
  summon: [{ id: '2040080000' }],
  supporter: { id: '2040003000' },
}
const start = { url: '/rest/multiraid/start.json', responseData: startJson }
const summon = { url: '/rest/multiraid/summon_result.json', requestData: '{"summon_id":"supporter"}', responseData: { scenario: [], status: { turn: 2 } } }

describe('handleBattleState', () => {
  beforeEach(() => {
    store = {}
    local.get.mock.resetCalls()
    local.set.mock.resetCalls()
  })

  it('連續收到的回應依序處理，後一筆讀得到前一筆寫入的狀態', async () => {
    handleBattleState(start)
    handleBattleState(summon)
    await handleBattleState(summon)

    assert.deepEqual(stored().summons.map(s => s.used), [0, 2])
    assert.deepEqual(stored().bossBuffHistory.map(h => h.turn), [1, 2])
  })

  it('以 JSON 字串存在 tn:battle-state，同 useWebExtensionStorage 的物件格式', async () => {
    await handleBattleState(start)

    assert.equal(typeof store['tn:battle-state'], 'string')
    assert.equal(stored().raidId, '111')
  })

  it('與戰鬥狀態無關的回應不讀也不寫 storage', async () => {
    await handleBattleState({ url: '/quest/quest_data', responseData: {} })

    assert.equal(local.get.mock.callCount(), 0)
    assert.equal(local.set.mock.callCount(), 0)
  })

  it('還沒收到 start.json 時，行動回應不寫入', async () => {
    await handleBattleState(summon)

    assert.equal(local.set.mock.callCount(), 0)
    assert.equal(store[BATTLE_STATE_KEY], undefined)
  })

  it('一筆處理失敗只印 log，後面的回應照常處理', async () => {
    const consoleError = mock.method(console, 'error', () => {})
    try {
      handleBattleState(start)
      handleBattleState({ ...summon, requestData: '{not json' })
      await handleBattleState(summon)

      assert.equal(consoleError.mock.callCount(), 1)
      assert.match(String(consoleError.mock.calls[0].arguments[0]), /^\[tn\]/)
      assert.deepEqual(stored().summons.map(s => s.used), [0, 1])
    }
    finally {
      consoleError.mock.restore()
    }
  })
})
