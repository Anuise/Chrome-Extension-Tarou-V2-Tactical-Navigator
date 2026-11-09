import type { BattleInfo } from '~/tn/core/upstream'
import assert from 'node:assert/strict'
// eslint-disable-next-line test/no-import-node-test
import { describe, it } from 'node:test'
import { exportBattleRecord, isLatestBattleOngoing } from './record'

/** 一場戰鬥紀錄：只放部分欄位，匯出不依賴紀錄的形狀 */
function record(raidId: number, questId: string) {
  return {
    quest_id: questId,
    raid_id: raidId,
    turn: 7,
    isSolo: true,
    player: [{ pid: '3040190000', is_dead: false, damage: { total: { value: 123456 } } }],
    actionQueue: [{ turn: 1, bossHpPercent: 98.5, actionList: [] }],
  }
}

describe('exportBattleRecord', () => {
  it('檔名帶本機時間，月、日、時、分、秒補成兩位數', () => {
    assert.equal(exportBattleRecord([record(1, '305421')], new Date(2026, 0, 2, 3, 4, 5)).name, 'tn-battle-record-20260102-030405.json')
  })

  it('檔名的小時為 24 小時制', () => {
    assert.equal(exportBattleRecord([record(1, '305421')], new Date(2026, 10, 9, 23, 59, 58)).name, 'tn-battle-record-20261109-235958.json')
  })

  it('內容是全部紀錄原樣，依傳入順序', () => {
    const records = [record(3, '305421'), record(2, '305701'), record(1, '305421')]

    assert.deepEqual(JSON.parse(exportBattleRecord(records, new Date(2026, 10, 9)).text), records)
  })

  it('內容縮排 2 格、結尾換行', () => {
    const records = [{ raid_id: 2, quest_id: '305421' }, { raid_id: 1, quest_id: '305701' }]

    assert.equal(
      exportBattleRecord(records, new Date(2026, 10, 9)).text,
      '[\n  {\n    "raid_id": 2,\n    "quest_id": "305421"\n  },\n  {\n    "raid_id": 1,\n    "quest_id": "305701"\n  }\n]\n',
    )
  })

  it('沒有紀錄時內容為空陣列（側欄頁會先擋下，不下載）', () => {
    assert.equal(exportBattleRecord([], new Date(2026, 10, 9)).text, '[]\n')
  })
})

/** battleInfo：只放判斷用到的 bossInfo 欄位 */
function battleInfo(battleId: string, hp: number) {
  return { bossInfo: { battleId, hp } } as Partial<BattleInfo>
}

describe('isLatestBattleOngoing', () => {
  it('最新一場就是目前的戰鬥，而且 boss HP 大於 0 時為 true', () => {
    assert.equal(isLatestBattleOngoing([record(2, '305421'), record(1, '305421')], battleInfo('2', 1)), true)
  })

  it('boss HP 為 0（已擊倒）時為 false', () => {
    assert.equal(isLatestBattleOngoing([record(2, '305421')], battleInfo('2', 0)), false)
  })

  it('目前的戰鬥不是最新一場時為 false，即使 boss HP 大於 0', () => {
    assert.equal(isLatestBattleOngoing([record(2, '305421'), record(1, '305421')], battleInfo('1', 5000)), false)
    assert.equal(isLatestBattleOngoing([record(2, '305421')], battleInfo('3', 5000)), false)
  })

  it('battleInfo 沒有 bossInfo（剛安裝）時為 false', () => {
    assert.equal(isLatestBattleOngoing([record(2, '305421')], {}), false)
  })

  it('沒有紀錄時為 false', () => {
    assert.equal(isLatestBattleOngoing([], battleInfo('2', 5000)), false)
  })
})
