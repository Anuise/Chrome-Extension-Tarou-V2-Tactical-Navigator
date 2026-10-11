import type { BattleInfo } from '~/tn/core/upstream'
import assert from 'node:assert/strict'
// eslint-disable-next-line test/no-import-node-test
import { describe, it } from 'node:test'
import { toBattleSnapshot } from './snapshot'

const inBattle: Partial<BattleInfo> = {
  bossInfo: {
    questId: '305421',
    battleId: '1234567890',
    imgId: '7300431',
    name: 'Lv350 顕現せし破壊の化身',
    hp: 495_000_000,
    hpmax: 1_000_000_000,
    hpPercent: 49.5,
    turn: 3,
    timer: 3000,
    countDownTime: 0,
    turnWaiting: 0,
    interrupt_display_text: '浄土|破壊',
    lv: '350',
    attribute: '5',
    addition: { genesis: 70 },
    limitNum: 1,
    fellow: 1,
  },
  buffInfo: {
    bossBuffs: [{ status: '1001_1' }, { status: '4052_1' }],
    playerBuffs: [],
  },
}

describe('toBattleSnapshot', () => {
  it('沒有任何戰鬥資料時視為不在戰鬥中：questId 為 undefined，其餘欄位為空值', () => {
    const snapshot = toBattleSnapshot({})

    assert.equal(snapshot.questId, undefined)
    assert.equal(snapshot.battleCount, 1)
    assert.equal(snapshot.turn, undefined)
    assert.equal(snapshot.hpPercent, undefined)
    assert.equal(snapshot.gauge, undefined)
    assert.equal(snapshot.omenText, '')
    assert.deepEqual(snapshot.bossBuffStatuses, [])
  })

  it('戰鬥中把 questId、回合、HP、計量條、預兆與 boss buff 轉進 snapshot，第幾場為 1', () => {
    assert.deepEqual(toBattleSnapshot(inBattle), {
      questId: '305421',
      battleCount: 1,
      turn: 3,
      hpPercent: 49.5,
      gauge: 70,
      omenText: '浄土|破壊',
      bossBuffStatuses: ['1001_1', '4052_1'],
    })
  })

  it('upstream 存的 questId 是數字時轉成字串，讓腳本能以字串比對', () => {
    const bossInfo = { ...inBattle.bossInfo!, questId: 305421 as unknown as string }

    assert.equal(toBattleSnapshot({ ...inBattle, bossInfo }).questId, '305421')
  })
})
