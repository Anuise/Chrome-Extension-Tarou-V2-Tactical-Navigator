import type { BattleScript, BattleState } from 'tn'
import type { BattleInfo, BattleRecord } from '~/tn/core/upstream'
import assert from 'node:assert/strict'
// eslint-disable-next-line test/no-import-node-test
import { describe, it } from 'node:test'
import { selectAdvice } from './core'
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

// upstream 的戰鬥紀錄：只放 snapshot 會讀的欄位。player 的順序與 tn 狀態的 allies 相同（都是 start.json player.param 的順序）
const record = {
  raid_id: 1234567890,
  player: [
    { pid: '450201', is_dead: false },
    { pid: '3040390000', is_dead: true },
    { pid: '3040617000', is_dead: false },
    { pid: '3040100000', is_dead: false },
    { pid: '3040200000', is_dead: false },
  ],
  actionQueue: [
    {
      turn: 1,
      bossHpPercent: 100,
      interrupt_display_text: '',
      guard_status: [{ num: 0, is_guard_status: 0 }, { num: 1, is_guard_status: 1 }],
      actionList: [
        { type: 'ability', id: '100', icon: 'x' },
        { type: 'ability', id: '110', icon: 'x' },
        { type: 'summon', id: '2040080000', icon: 'x' },
        { type: 'attack', id: 'attack', icon: 'attack' },
      ],
    },
    {
      turn: 2,
      bossHpPercent: 80,
      interrupt_display_text: '浄土',
      guard_status: [{ num: 2, is_guard_status: 1 }, { num: 3, is_guard_status: 0 }],
      actionList: [{ type: 'ability', id: '100', icon: 'x' }, { type: 'fc', id: '1', icon: '1' }, { type: 'attack', id: 'attack', icon: 'attack' }],
    },
    {
      turn: 3,
      bossHpPercent: 49.5,
      guard_status: [],
      actionList: [],
    },
  ],
} as unknown as BattleRecord

// tn 狀態：D（player 4）換上前排第 2 格，A（player 1）在後排
const state: BattleState = {
  raidId: '1234567890',
  questId: '305421',
  battleCount: 2,
  userId: '1000',
  allies: [
    { id: '450201', isLeader: true, buffStatuses: ['7743_3', '1001'], abilities: [{ slot: 1, abilityId: '100' }, { slot: 2, abilityId: '101' }] },
    { id: '3040390000', isLeader: false, buffStatuses: [], abilities: [{ slot: 1, abilityId: '110' }] },
    { id: '3040617000', isLeader: false, buffStatuses: ['7349_7'], abilities: [] },
    { id: '3040100000', isLeader: false, buffStatuses: [], abilities: [] },
    { id: '3040200000', isLeader: false, buffStatuses: [], abilities: [] },
  ],
  formation: [0, 4, 2, 3],
  summons: [
    { from: 'main', id: '2040080000', used: 1 },
    { from: 'sub', id: '2040003000', used: 0 },
    { from: 'sub', id: '', used: 0 },
    { from: 'friend', id: '2040080000', used: 0 },
  ],
  chainAbilityIds: ['900001', '900002'],
  chainUsed: true,
  bossBuffStatuses: ['3353_1', '6711_14'],
  bossBuffHistory: [{ turn: 1, statuses: ['1009_1'] }, { turn: 3, statuses: ['3353_1', '6711_14'] }],
}

describe('toBattleSnapshot', () => {
  it('沒有任何戰鬥資料時視為不在戰鬥中：questId 為 undefined，其餘欄位為空值', () => {
    const snapshot = toBattleSnapshot({}, [], null)

    assert.equal(snapshot.questId, undefined)
    assert.equal(snapshot.battleCount, 1)
    assert.equal(snapshot.turn, undefined)
    assert.equal(snapshot.hpPercent, undefined)
    assert.equal(snapshot.gauge, undefined)
    assert.equal(snapshot.omenText, '')
    assert.deepEqual(snapshot.bossBuffStatuses, [])
    assert.deepEqual(snapshot.allies, [])
    assert.deepEqual(snapshot.summons, [])
    assert.equal(snapshot.chain, undefined)
    assert.equal(snapshot.chainUsed, false)
    assert.deepEqual(snapshot.history, [])
  })

  it('只有 battleInfo 時：questId、回合、HP、計量條、預兆與 boss buff 取自 battleInfo，第幾場為 1，我方、召喚石、連鎖與歷史為空值', () => {
    assert.deepEqual(toBattleSnapshot(inBattle, [], null), {
      questId: '305421',
      battleCount: 1,
      turn: 3,
      hpPercent: 49.5,
      gauge: 70,
      omenText: '浄土|破壊',
      bossBuffStatuses: ['1001_1', '4052_1'],
      allies: [],
      summons: [],
      chainUsed: false,
      history: [],
    })
  })

  it('有 tn 狀態時：第幾場與 boss buff 採用 tn 的值', () => {
    const snapshot = toBattleSnapshot(inBattle, [record], state)

    assert.equal(snapshot.battleCount, 2)
    assert.deepEqual(snapshot.bossBuffStatuses, ['3353_1', '6711_14'])
    assert.equal(snapshot.chainUsed, true)
  })

  it('我方角色：id、主角、buff、技能格取自 tn 狀態，前排看 tn 的 formation，dead 取自 upstream 戰鬥紀錄，技能 used 是 actionQueue 裡該技能 ID 的次數', () => {
    const { allies } = toBattleSnapshot(inBattle, [record], state)

    assert.deepEqual(allies.map(a => a.id), ['450201', '3040390000', '3040617000', '3040100000', '3040200000'])
    assert.deepEqual(allies.map(a => a.isLeader), [true, false, false, false, false])
    assert.deepEqual(allies.map(a => a.front), [true, false, true, true, true])
    assert.deepEqual(allies.map(a => a.dead), [false, true, false, false, false])
    assert.deepEqual(allies[0].buffs, [{ status: '7743_3' }, { status: '1001' }])
    assert.deepEqual(allies[0].abilities, [{ slot: 1, abilityId: '100', used: 2 }, { slot: 2, abilityId: '101', used: 0 }])
    assert.deepEqual(allies[1].abilities, [{ slot: 1, abilityId: '110', used: 1 }])
    // 能不能按、冷卻、HP、buff 剩餘回合這次不填
    assert.equal(allies[0].hp, undefined)
    assert.equal(allies[0].abilities[0].ready, undefined)
    assert.equal(allies[0].abilities[0].recast, undefined)
    assert.equal(allies[0].buffs[0].remain, undefined)
  })

  it('召喚石取自 tn 狀態，空的格子不列入', () => {
    assert.deepEqual(toBattleSnapshot(inBattle, [record], state).summons, [
      { from: 'main', id: '2040080000', used: 1 },
      { from: 'sub', id: '2040003000', used: 0 },
      { from: 'friend', id: '2040080000', used: 0 },
    ])
  })

  it('history 由 actionQueue 依序轉換：防禦的 num 對到角色 id，boss buff 取自 tn 的每回合紀錄，最後一筆是目前回合', () => {
    assert.deepEqual(toBattleSnapshot(inBattle, [record], state).history, [
      {
        turn: 1,
        hpAtStart: 100,
        omenText: '',
        bossBuffStatuses: ['1009_1'],
        guards: ['3040390000'],
        actions: [{ type: 'ability', id: '100' }, { type: 'ability', id: '110' }, { type: 'summon', id: '2040080000' }, { type: 'attack', id: 'attack' }],
      },
      {
        turn: 2,
        hpAtStart: 80,
        omenText: '浄土',
        // tn 沒記到的回合為 undefined
        bossBuffStatuses: undefined,
        guards: ['3040617000'],
        actions: [{ type: 'ability', id: '100' }, { type: 'fc', id: '1' }, { type: 'attack', id: 'attack' }],
      },
      { turn: 3, hpAtStart: 49.5, omenText: '', bossBuffStatuses: ['3353_1', '6711_14'], guards: [], actions: [] },
    ])
  })

  it('tn 狀態屬於別場時不採用：第幾場、boss buff 改回 upstream，我方與召喚石為空，歷史沒有 boss buff', () => {
    const snapshot = toBattleSnapshot(inBattle, [record], { ...state, raidId: '999' })

    assert.equal(snapshot.battleCount, 1)
    assert.deepEqual(snapshot.bossBuffStatuses, ['1001_1', '4052_1'])
    assert.deepEqual(snapshot.allies, [])
    assert.deepEqual(snapshot.summons, [])
    assert.equal(snapshot.chainUsed, false)
    assert.equal(snapshot.history.length, 3)
    assert.ok(snapshot.history.every(turn => turn.bossBuffStatuses === undefined))
  })

  it('沒有目前這一場的 upstream 戰鬥紀錄時：歷史為空，dead 為 false，技能 used 為 0', () => {
    const snapshot = toBattleSnapshot(inBattle, [{ ...record, raid_id: 999 }], state)

    assert.deepEqual(snapshot.history, [])
    assert.deepEqual(snapshot.allies.map(a => a.dead), [false, false, false, false, false])
    assert.equal(snapshot.allies[0].abilities[0].used, 0)
  })

  it('upstream 存的 questId 是數字時轉成字串，讓腳本能以字串比對', () => {
    const bossInfo = { ...inBattle.bossInfo!, questId: 305421 as unknown as string }

    assert.equal(toBattleSnapshot({ ...inBattle, bossInfo }, [], null).questId, '305421')
  })

  it('舊版存下的 bossInfo 沒有 addition 時不拋錯，計量條為 undefined', () => {
    const { addition: _, ...bossInfo } = inBattle.bossInfo!

    assert.equal(toBattleSnapshot({ ...inBattle, bossInfo: bossInfo as BattleInfo['bossInfo'] }, [], null).gauge, undefined)
  })

  it('舊版存下的 buffInfo 沒有 bossBuffs 時不拋錯，boss buff 為空陣列', () => {
    assert.deepEqual(toBattleSnapshot({ ...inBattle, buffInfo: {} as BattleInfo['buffInfo'] }, [], null).bossBuffStatuses, [])
  })

  it('組出的 snapshot 可以讓新條件成立', () => {
    const rule = (note: string, when: BattleScript['rules'][number]['when']) => ({ note, when, advice: [] })
    const script: BattleScript = {
      version: 1,
      name: '測試',
      questId: '305421',
      battleCount: 2,
      rules: [
        rule('上一回合 3040617000 防禦', { lastTurn: { guard: '3040617000' } }),
        rule('上一回合放過 FC', { lastTurn: { fc: true } }),
        rule('主角有 7743', { ally: { who: '主角', buff: '7743', stack: [3, 3] } }),
        rule('3040390000 戰鬥不能、在後排', { ally: { who: '3040390000', dead: true, front: false } }),
        rule('主角 1 技用過 2 次', { ability: { who: '主角', slot: 1, used: [2, 2] } }),
        rule('好友宙斯還沒召喚', { summon: { id: '2040080000', from: 'friend', used: [0, 0] } }),
        rule('發動過連鎖', { chainUsed: true }),
        rule('回合開始 HP 49～50', { turnStartHp: [49, 50] }),
        rule('不成立：技能能不能按還不知道', { ability: { who: '主角', slot: 1, ready: true } }),
      ],
    }

    const { activeRules } = selectAdvice([script], toBattleSnapshot(inBattle, [record], state))

    assert.deepEqual(activeRules.map(r => r.note), [
      '上一回合 3040617000 防禦',
      '上一回合放過 FC',
      '主角有 7743',
      '3040390000 戰鬥不能、在後排',
      '主角 1 技用過 2 次',
      '好友宙斯還沒召喚',
      '發動過連鎖',
      '回合開始 HP 49～50',
    ])
  })
})
