import type { BattleSnapshot } from './core'
import assert from 'node:assert/strict'
// eslint-disable-next-line test/no-import-node-test
import { describe, it } from 'node:test'
import { NOT_AVAILABLE, toDiagnostics } from './diagnostics'

/** 每個欄位都有值的 snapshot（含 T4b 之後才會有的 hp、ready、recast、chain、remain） */
const full: BattleSnapshot = {
  questId: '305701',
  battleCount: 2,
  turn: 3,
  hpPercent: 49.5,
  gauge: 70,
  omenText: '600万ダメ5ヒット',
  bossBuffStatuses: ['3353_1', '1427'],
  allies: [
    {
      id: '450201',
      isLeader: true,
      front: true,
      dead: false,
      hp: 12000,
      hpMax: 20000,
      buffs: [{ status: '7743_3', remain: 2 }, { status: '1001' }],
      abilities: [{ slot: 1, abilityId: '100', ready: true, recast: 0, used: 2 }, { slot: 2, abilityId: '101', ready: false, recast: 3, used: 0 }],
    },
    { id: '3040390000', isLeader: false, front: false, dead: false, buffs: [], abilities: [] },
    { id: '3040617000', isLeader: false, front: true, dead: true, buffs: [], abilities: [{ slot: 1, abilityId: '120', used: 1 }] },
  ],
  summons: [
    { from: 'main', id: '2040080000', ready: true, recast: 0, used: 1 },
    { from: 'sub', id: '2040003000', used: 0 },
    { from: 'friend', id: '2040080000', ready: false, recast: 5, used: 1 },
  ],
  chain: 77,
  chainUsed: true,
  history: [
    { turn: 1, hpAtStart: 100, omenText: '', guards: [], actions: [] },
    { turn: 2, hpAtStart: 80, omenText: '浄土', guards: ['3040617000', '450201'], actions: [{ type: 'ability', id: '100' }, { type: 'fc', id: '1' }] },
    { turn: 3, hpAtStart: 50, omenText: '600万ダメ5ヒット', guards: [], actions: [] },
  ],
}

/** toBattleSnapshot 在沒有 tn 狀態時給的 snapshot：我方、召喚石是空陣列，第幾場與連鎖是 undefined */
function withoutState(snapshot: BattleSnapshot): BattleSnapshot {
  return { ...snapshot, battleCount: undefined, chainUsed: undefined, allies: [], summons: [] }
}

/** toBattleSnapshot 在沒有戰鬥紀錄時給的 snapshot：history 是空陣列，dead 與技能 used 是 undefined */
function withoutRecord(snapshot: BattleSnapshot): BattleSnapshot {
  return {
    ...snapshot,
    history: [],
    allies: snapshot.allies.map(ally => ({ ...ally, dead: undefined, abilities: ally.abilities.map(ability => ({ ...ability, used: undefined })) })),
  }
}

describe('toDiagnostics', () => {
  it('有值的欄位照原值顯示；布林顯示「是」「否」；召喚來源用中文；只列前排角色', () => {
    assert.deepEqual(toDiagnostics(full), {
      battleCount: 2,
      turn: 3,
      hpPercent: 49.5,
      turnStartHp: 50,
      gauge: 70,
      omen: '600万ダメ5ヒット',
      chain: 77,
      chainUsed: '是',
      bossBuffs: ['3353_1', '1427'],
      allies: [
        {
          id: '450201',
          isLeader: '是',
          alive: '是',
          hp: 12000,
          hpMax: 20000,
          buffs: [{ status: '7743_3', remain: 2 }, { status: '1001', remain: NOT_AVAILABLE }],
          abilities: [
            { slot: 1, abilityId: '100', used: 2, ready: '是', recast: 0 },
            { slot: 2, abilityId: '101', used: 0, ready: '否', recast: 3 },
          ],
        },
        {
          id: '3040617000',
          isLeader: '否',
          alive: '否',
          hp: NOT_AVAILABLE,
          hpMax: NOT_AVAILABLE,
          buffs: [],
          abilities: [{ slot: 1, abilityId: '120', used: 1, ready: NOT_AVAILABLE, recast: NOT_AVAILABLE }],
        },
      ],
      summons: [
        { from: '主召', id: '2040080000', used: 1, ready: '是', recast: 0 },
        { from: '副召', id: '2040003000', used: 0, ready: NOT_AVAILABLE, recast: NOT_AVAILABLE },
        { from: '好友', id: '2040080000', used: 1, ready: '否', recast: 5 },
      ],
      lastTurn: { turn: 2, fc: '是', guards: ['3040617000', '450201'], omen: '浄土' },
    })
  })

  it('有資料、但個別欄位沒有值時，那些欄位顯示「未取得」，不猜值', () => {
    const sparse: BattleSnapshot = {
      ...full,
      turn: undefined,
      hpPercent: undefined,
      gauge: undefined,
      chain: undefined,
      omenText: '',
      allies: [{ id: '450201', isLeader: true, front: true, dead: false, buffs: [{ status: '1001' }], abilities: [{ slot: 1, abilityId: '100', used: 0 }] }],
      summons: [{ from: 'main', id: '2040080000', used: 0 }],
      history: [{ turn: 1, omenText: '', guards: [], actions: [] }],
    }

    const diagnostics = toDiagnostics(sparse)

    assert.equal(diagnostics.turn, NOT_AVAILABLE)
    assert.equal(diagnostics.hpPercent, NOT_AVAILABLE)
    assert.equal(diagnostics.turnStartHp, NOT_AVAILABLE)
    assert.equal(diagnostics.gauge, NOT_AVAILABLE)
    assert.equal(diagnostics.chain, NOT_AVAILABLE)
    // 沒有預兆是已知的「沒有」，不是未取得
    assert.equal(diagnostics.omen, '無')
    assert.deepEqual(diagnostics.allies, [{
      id: '450201',
      isLeader: '是',
      alive: '是',
      hp: NOT_AVAILABLE,
      hpMax: NOT_AVAILABLE,
      buffs: [{ status: '1001', remain: NOT_AVAILABLE }],
      abilities: [{ slot: 1, abilityId: '100', used: 0, ready: NOT_AVAILABLE, recast: NOT_AVAILABLE }],
    }])
    assert.deepEqual(diagnostics.summons, [{ from: '主召', id: '2040080000', used: 0, ready: NOT_AVAILABLE, recast: NOT_AVAILABLE }])
  })

  it('沒有 tn 狀態時：第幾場、發動過連鎖、前排角色、召喚石都是「未取得」', () => {
    const diagnostics = toDiagnostics(withoutState(full))

    assert.equal(diagnostics.battleCount, NOT_AVAILABLE)
    assert.equal(diagnostics.chainUsed, NOT_AVAILABLE)
    assert.equal(diagnostics.allies, NOT_AVAILABLE)
    assert.equal(diagnostics.summons, NOT_AVAILABLE)
    // 上一回合來自 battleRecord，照常有值
    assert.deepEqual(diagnostics.lastTurn, { turn: 2, fc: '是', guards: ['3040617000', '450201'], omen: '浄土' })
  })

  it('沒有戰鬥紀錄時：存活、技能用過、回合開始 HP%、上一回合都是「未取得」；召喚次數照常', () => {
    const diagnostics = toDiagnostics(withoutRecord(full))
    const allies = diagnostics.allies as Exclude<typeof diagnostics.allies, string>

    assert.deepEqual(allies.map(ally => ally.alive), [NOT_AVAILABLE, NOT_AVAILABLE])
    assert.deepEqual(allies[0].abilities.map(ability => ability.used), [NOT_AVAILABLE, NOT_AVAILABLE])
    assert.equal(diagnostics.turnStartHp, NOT_AVAILABLE)
    assert.equal(diagnostics.lastTurn, NOT_AVAILABLE)
    assert.deepEqual((diagnostics.summons as Exclude<typeof diagnostics.summons, string>).map(summon => summon.used), [1, 0, 1])
  })

  it('兩者都沒有、boss buff 也沒有資料時：這些欄位全部是「未取得」', () => {
    const diagnostics = toDiagnostics({ ...withoutRecord(withoutState(full)), bossBuffStatuses: undefined })

    for (const key of ['battleCount', 'chainUsed', 'bossBuffs', 'allies', 'summons', 'lastTurn', 'turnStartHp'] as const)
      assert.equal(diagnostics[key], NOT_AVAILABLE, key)
  })

  it('boss buff 是空陣列時照原樣輸出（面板顯示「無」），不是「未取得」', () => {
    assert.deepEqual(toDiagnostics({ ...full, bossBuffStatuses: [] }).bossBuffs, [])
  })

  it('history 只有目前回合時，上一回合顯示「沒有上一回合」；回合開始 HP 取最後一筆', () => {
    const diagnostics = toDiagnostics({ ...full, history: full.history.slice(0, 1) })

    assert.equal(diagnostics.lastTurn, '沒有上一回合')
    assert.equal(diagnostics.turnStartHp, 100)
  })

  it('上一回合沒有 FC、沒有預兆時顯示「否」「無」，防禦是空清單', () => {
    // 目前是第 2 回合，上一回合是第 1 回合
    const diagnostics = toDiagnostics({ ...full, history: full.history.slice(0, 2) })

    assert.deepEqual(diagnostics.lastTurn, { turn: 1, fc: '否', guards: [], omen: '無' })
  })
})
