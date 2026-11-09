import assert from 'node:assert/strict'
// eslint-disable-next-line test/no-import-node-test
import { describe, it } from 'node:test'
import { exportBattleRecord } from './record'

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

  it('內容是全部紀錄原樣，依傳入順序；縮排 2 格、結尾換行', () => {
    const records = [record(3, '305421'), record(2, '305701'), record(1, '305421')]
    const { text } = exportBattleRecord(records, new Date(2026, 10, 9))

    assert.deepEqual(JSON.parse(text), records)
    assert.equal(text, `${JSON.stringify(records, null, 2)}\n`)
  })
})
