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
  turn: 3,
  abilityList: [],
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
  it('沒有任何戰鬥資料時視為不在戰鬥中：questId 為 undefined，沒有資料的欄位都是 undefined 或空陣列', () => {
    const snapshot = toBattleSnapshot({}, [], null)

    assert.equal(snapshot.questId, undefined)
    assert.equal(snapshot.battleCount, undefined)
    assert.equal(snapshot.turn, undefined)
    assert.equal(snapshot.hpPercent, undefined)
    assert.equal(snapshot.gauge, undefined)
    assert.equal(snapshot.omenText, '')
    assert.equal(snapshot.bossBuffStatuses, undefined)
    assert.deepEqual(snapshot.allies, [])
    assert.deepEqual(snapshot.summons, [])
    assert.equal(snapshot.chain, undefined)
    assert.equal(snapshot.chainUsed, undefined)
    assert.deepEqual(snapshot.history, [])
  })

  it('只有 battleInfo 時：questId、回合、HP、計量條、預兆與 boss buff 取自 battleInfo；第幾場與連鎖不補預設值', () => {
    assert.deepEqual(toBattleSnapshot(inBattle, [], null), {
      questId: '305421',
      battleCount: undefined,
      turn: 3,
      hpPercent: 49.5,
      gauge: 70,
      omenText: '浄土|破壊',
      bossBuffStatuses: ['1001_1', '4052_1'],
      allies: [],
      summons: [],
      chainUsed: undefined,
      history: [],
    })
  })

  it('有 tn 狀態時：第幾場、boss buff 與連鎖採用 tn 的值', () => {
    const snapshot = toBattleSnapshot(inBattle, [record], state)

    assert.equal(snapshot.battleCount, 2)
    assert.deepEqual(snapshot.bossBuffStatuses, ['3353_1', '6711_14'])
    assert.equal(snapshot.chainUsed, true)
  })

  it('我方角色：id、主角、buff、技能格取自 tn 狀態，前排看 tn 的 formation，dead 取自 upstream 戰鬥紀錄，技能 used 是 actionQueue 裡該技能 ID 的次數', () => {
    const { allies } = toBattleSnapshot(inBattle, [record], state)

    // 能不能按、冷卻、HP、buff 剩餘回合這次不填
    assert.equal(allies[0].hp, undefined)
    assert.equal(allies[0].abilities[0].ready, undefined)
    assert.equal(allies[0].abilities[0].recast, undefined)
    assert.equal(allies[0].buffs[0].remain, undefined)
    assert.deepEqual(allies.map(a => a.id), ['450201', '3040390000', '3040617000', '3040100000', '3040200000'])
    assert.deepEqual(allies.map(a => a.isLeader), [true, false, false, false, false])
    assert.deepEqual(allies.map(a => a.front), [true, false, true, true, true])
    assert.deepEqual(allies.map(a => a.dead), [false, true, false, false, false])
    assert.deepEqual(allies[0].buffs, [{ status: '7743_3' }, { status: '1001' }])
    assert.deepEqual(allies[0].abilities, [{ slot: 1, abilityId: '100', used: 2 }, { slot: 2, abilityId: '101', used: 0 }])
    assert.deepEqual(allies[1].abilities, [{ slot: 1, abilityId: '110', used: 1 }])
  })

  it('dead 用 pid 對到 upstream 戰鬥紀錄的角色，不依賴 player 的順序；對不到時為 undefined', () => {
    const reordered = { ...record, player: [...record.player].reverse().filter(player => player.pid !== '3040100000') }

    assert.deepEqual(toBattleSnapshot(inBattle, [reordered], state).allies.map(a => a.dead), [false, true, false, undefined, false])
  })

  it('技能 used 也算子技能：upstream 記的是子技能 id 時，算進母技能', () => {
    const withSub = {
      ...record,
      abilityList: [{ type: 'ability', id: '101', icon: '', subAbility: [{ id: '101_a', index: '1', icon: '' }, { id: 2010, index: '2', icon: '' }] }],
      actionQueue: [
        { ...record.actionQueue[0], actionList: [{ type: 'ability', id: '101_a' }, { type: 'ability', id: 2010 }] },
        { ...record.actionQueue[1], actionList: [{ type: 'ability', id: '101' }] },
      ],
    } as unknown as BattleRecord

    assert.deepEqual(toBattleSnapshot(inBattle, [withSub], state).allies[0].abilities.map(a => a.used), [0, 3])
  })

  it('技能 used 只算 type 為 ability 的行動，id 相同的其他行動不算', () => {
    const mixed = {
      ...record,
      actionQueue: [{ ...record.actionQueue[0], actionList: [{ type: 'ability', id: '100' }, { type: 'summon', id: '100' }, { type: 'temporary', id: '100' }] }],
    } as unknown as BattleRecord

    assert.equal(toBattleSnapshot(inBattle, [mixed], state).allies[0].abilities[0].used, 1)
  })

  it('回合：有目前這一場的戰鬥紀錄時取 battleRecord.turn，沒有時才用 bossInfo.turn', () => {
    // bossInfo.turn 只在回應有 boss_gauge 時更新，可能停在上一回合
    const stale = { ...inBattle, bossInfo: { ...inBattle.bossInfo!, turn: 2 } }

    assert.equal(toBattleSnapshot(stale, [record], state).turn, 3)
    assert.equal(toBattleSnapshot(stale, [], state).turn, 2)
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

  it('沒有目前這一場的 tn 狀態時：第幾場與連鎖為 undefined，boss buff 改回 upstream，我方與召喚石為空，歷史沒有 boss buff', () => {
    const snapshot = toBattleSnapshot(inBattle, [record], { ...state, raidId: '999' })

    assert.equal(snapshot.battleCount, undefined)
    assert.deepEqual(snapshot.bossBuffStatuses, ['1001_1', '4052_1'])
    assert.deepEqual(snapshot.allies, [])
    assert.deepEqual(snapshot.summons, [])
    assert.equal(snapshot.chainUsed, undefined)
    assert.equal(snapshot.history.length, 3)
    assert.ok(snapshot.history.every(turn => turn.bossBuffStatuses === undefined))
  })

  it('沒有目前這一場的 upstream 戰鬥紀錄時：歷史為空，dead 與技能 used 為 undefined，召喚次數仍取自 tn', () => {
    const snapshot = toBattleSnapshot(inBattle, [{ ...record, raid_id: 999 }], state)

    assert.deepEqual(snapshot.history, [])
    assert.deepEqual(snapshot.allies.map(a => a.dead), [undefined, undefined, undefined, undefined, undefined])
    assert.deepEqual(snapshot.allies[0].abilities.map(a => a.used), [undefined, undefined])
    assert.deepEqual(snapshot.summons.map(s => s.used), [1, 0, 0])
  })

  it('upstream 存的 questId 是數字時轉成字串，讓腳本能以字串比對', () => {
    const bossInfo = { ...inBattle.bossInfo!, questId: 305421 as unknown as string }

    assert.equal(toBattleSnapshot({ ...inBattle, bossInfo }, [], null).questId, '305421')
  })

  it('舊版存下的 bossInfo 沒有 addition 時不拋錯，計量條為 undefined', () => {
    const { addition: _, ...bossInfo } = inBattle.bossInfo!

    assert.equal(toBattleSnapshot({ ...inBattle, bossInfo: bossInfo as BattleInfo['bossInfo'] }, [], null).gauge, undefined)
  })

  it('舊版存下的 buffInfo 沒有 bossBuffs、也沒有 tn 狀態時不拋錯，boss buff 為 undefined', () => {
    assert.equal(toBattleSnapshot({ ...inBattle, buffInfo: {} as BattleInfo['buffInfo'] }, [], null).bossBuffStatuses, undefined)
  })

  const rule = (note: string, when: BattleScript['rules'][number]['when']) => ({ note, when, advice: [] })

  it('組出的 snapshot 可以讓新條件成立', () => {
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

  it('缺資料時，不知道的條件一律不成立；有寫 battleCount 的腳本不相符', () => {
    const rules = [
      rule('還沒放過連鎖', { chainUsed: false }),
      rule('主角活著', { ally: { who: '主角', dead: false } }),
      rule('主角 2 技還沒用', { ability: { who: '主角', slot: 2, used: [0, 0] } }),
      rule('boss 有 3353', { bossBuff: '3353' }),
    ]
    const withCount: BattleScript = { version: 1, name: '有寫第幾場', questId: '305421', battleCount: 2, rules }
    const noCount: BattleScript = { version: 1, name: '沒寫第幾場', questId: '305421', rules }
    const notes = (snapshot: ReturnType<typeof toBattleSnapshot>) => selectAdvice([noCount], snapshot).activeRules.map(r => r.note)

    // 兩者都有（對照組）：每一條都成立，確認底下的不成立是因為缺資料
    const full = toBattleSnapshot(inBattle, [record], { ...state, chainUsed: false })
    assert.deepEqual(notes(full), ['還沒放過連鎖', '主角活著', '主角 2 技還沒用', 'boss 有 3353'])
    assert.equal(selectAdvice([withCount], full).matchedScripts.length, 1)

    // 沒有 tn 狀態：連鎖不知道；我方角色沒有資料；boss buff 改用 upstream 的值（沒有 3353）
    const noState = toBattleSnapshot(inBattle, [record], null)
    assert.deepEqual(notes(noState), [])
    assert.equal(selectAdvice([withCount], noState).matchedScripts.length, 0)

    // 沒有戰鬥紀錄：dead、used 不知道
    const noRecord = toBattleSnapshot(inBattle, [], { ...state, chainUsed: false })
    assert.deepEqual(notes(noRecord), ['還沒放過連鎖', 'boss 有 3353'])

    // 兩者都沒有，upstream 也沒有 boss buff
    const nothing = toBattleSnapshot({ ...inBattle, buffInfo: {} as BattleInfo['buffInfo'] }, [], null)
    assert.deepEqual(notes(nothing), [])
    assert.equal(selectAdvice([withCount], nothing).matchedScripts.length, 0)
  })
})
