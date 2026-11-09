import type { BattleState } from 'tn'
import type { AttackResultJson, BattleStartJson } from '~/tn/core/upstream'
import assert from 'node:assert/strict'
// eslint-disable-next-line test/no-import-node-test
import { describe, it } from 'node:test'
import { applyActionResult, applyStartJson, classifyUrl, reduceBattleState } from './parse'

// 合成資料：結構照 public-sources S1 的真實回應與 upstream source.d.ts，只放解析會讀的欄位
const ME = '1000'
const OTHER = '2000'

/** 5 人隊：主角、A、B、C 在前排，D 在後排 */
function startJson(overrides: Record<string, unknown> = {}): BattleStartJson {
  return {
    raid_id: 111,
    quest_id: '305701',
    user_id: ME,
    turn: 1,
    battle: { total: 3, count: '2' },
    player: {
      param: [
        { pid: '450201_fig', leader: 1, condition: { buff: [{ status: '1001' }, { status: '7743_3' }], debuff: [{ status: '1001' }] } },
        { pid: '3040390000_02', leader: 0, condition: { buff: [{ status: '7349_1' }], debuff: null } },
        { pid: '3040617000_01', leader: 0, condition: { buff: null, debuff: [{ status: '1371_3' }] } },
        { pid: '3040100000_01', leader: 0, condition: {} },
        { pid: '3040200000_01', leader: 0, condition: { buff: [{ status: '1001' }] } },
      ],
    },
    ability: {
      1: { pos: 0, list: { 1: [{ 'ability-id': '100', 'class': 'ico-ability1_3 ability-character-num-1-1' }], 2: [{ 'ability-id': '101', 'class': 'ico-ability2_3 ability-character-num-1-2' }] } },
      2: { pos: 1, list: { 1: [{ 'ability-id': '110', 'class': 'ico-ability3_1 ability-character-num-2-1' }] } },
      3: { pos: 2, list: { 1: [{ 'ability-id': 120, 'class': 'ico-ability4_1 ability-character-num-3-1' }] } },
      4: { pos: 3, list: { 1: [{ 'ability-id': '130', 'class': 'ico-ability5_1 ability-character-num-4-1' }] } },
    },
    boss: {
      param: [
        { hp: '0', condition: { buff: [{ status: '9999' }] } },
        {
          hp: '5000',
          condition: {
            buff: [
              { status: '1009_1', personal_buff_user_id: false },
              { status: '1009_1', personal_buff_user_id: false },
              { status: '4055_1', personal_buff_user_id: OTHER },
              { status: '6711_14', personal_buff_user_id: ME },
            ],
            debuff: [{ status: '1427', personal_debuff_user_id: false }, { status: '3312', personal_debuff_user_id: OTHER }],
          },
        },
      ],
    },
    summon: [{ id: '2040080000' }, { id: 2040003000 }, { id: null }],
    supporter: { id: '2040080000' },
    group_gauge: { id: 'chain', value: 10, ability_list: [{ ability_id: 900001 }, { ability_id: 900002 }] },
    ...overrides,
  } as unknown as BattleStartJson
}

function action(scenario: unknown[], status?: Record<string, unknown>): AttackResultJson {
  return { scenario, status } as unknown as AttackResultJson
}

function condition(to: 'player' | 'boss', pos: number, buff: string[] | null, debuff: string[] | null = null) {
  return { cmd: 'condition', to, pos, condition: { buff: buff?.map(status => ({ status })) ?? null, debuff: debuff?.map(status => ({ status })) ?? null, num: pos + 1 } }
}

describe('applyStartJson', () => {
  it('以 start.json 建立狀態：基本資訊、角色、前排、技能格、召喚、連鎖、boss buff 與第一筆回合歷史', () => {
    const state = applyStartJson(null, startJson())

    assert.equal(state.raidId, '111')
    assert.equal(state.questId, '305701')
    assert.equal(state.battleCount, 2)
    assert.equal(state.userId, ME)
    assert.deepEqual(state.allies.map(a => a.id), ['450201', '3040390000', '3040617000', '3040100000', '3040200000'])
    assert.deepEqual(state.allies.map(a => a.isLeader), [true, false, false, false, false])
    // buff＋debuff 以 status 去重；buff、debuff 是 null 或沒有時當成空的
    assert.deepEqual(state.allies.map(a => a.buffStatuses), [['1001', '7743_3'], ['7349_1'], ['1371_3'], [], ['1001']])
    assert.deepEqual(state.formation, [0, 1, 2, 3])
    assert.deepEqual(state.allies[0].abilities, [{ slot: 1, abilityId: '100' }, { slot: 2, abilityId: '101' }])
    assert.deepEqual(state.allies[2].abilities, [{ slot: 1, abilityId: '120' }])
    // 後排沒有技能格對應
    assert.deepEqual(state.allies[4].abilities, [])
    assert.deepEqual(state.summons, [
      { from: 'main', id: '2040080000', used: 0 },
      { from: 'sub', id: '2040003000', used: 0 },
      { from: 'sub', id: '', used: 0 },
      { from: 'friend', id: '2040080000', used: 0 },
    ])
    assert.deepEqual(state.chainAbilityIds, ['900001', '900002'])
    assert.equal(state.chainUsed, false)
    // 主 boss 是第一隻 HP 不是 0 的；別人的個人 buff 被濾掉
    assert.deepEqual(state.bossBuffStatuses, ['1009_1', '6711_14', '1427'])
    assert.deepEqual(state.bossBuffHistory, [{ turn: 1, statuses: ['1009_1', '6711_14', '1427'] }])
  })

  it('leader 旗標標在誰身上，誰就是主角', () => {
    const data = startJson()
    data.player.param.forEach((player, index) => player.leader = index === 2 ? 1 : 0)

    assert.deepEqual(applyStartJson(null, data).allies.map(a => a.isLeader), [false, false, true, false, false])
  })

  it('沒有任何角色帶 leader 旗標時，第 0 個是主角', () => {
    const data = startJson()
    data.player.param.forEach(player => delete (player as { leader?: number }).leader)

    assert.deepEqual(applyStartJson(null, data).allies.map(a => a.isLeader), [true, false, false, false, false])
  })

  it('沒有 battle.count、group_gauge 時，第幾場為 1、連鎖技能為空', () => {
    const state = applyStartJson(null, startJson({ battle: undefined, group_gauge: undefined }))

    assert.equal(state.battleCount, 1)
    assert.deepEqual(state.chainAbilityIds, [])
  })

  it('開幕特動：start.json 帶的 scenario 照行動回應處理，回合歷史記處理後的 boss buff', () => {
    const state = applyStartJson(null, startJson({
      scenario: [condition('boss', 0, ['1009_1', '3353_1']), condition('player', 1, ['7349_2'])],
      status: { turn: 1 },
    }))

    assert.deepEqual(state.bossBuffStatuses, ['1009_1', '3353_1'])
    assert.deepEqual(state.allies[1].buffStatuses, ['7349_2'])
    assert.deepEqual(state.bossBuffHistory, [{ turn: 1, statuses: ['1009_1', '3353_1'] }])
  })

  it('同一場重新整理：buff 等用 start.json 重建，保留召喚次數、chainUsed 與 boss buff 歷史', () => {
    let state = applyStartJson(null, startJson())
    state = applyActionResult(state, action([], { turn: 2 }), 'summon', { summon_id: 'supporter' })
    state = applyActionResult(state, action([condition('boss', 0, ['4055_1'])], { turn: 3 }), 'chain')

    const reloaded = applyStartJson(state, startJson({ turn: 3 }))

    assert.deepEqual(reloaded.allies[1].buffStatuses, ['7349_1'])
    assert.deepEqual(reloaded.bossBuffStatuses, ['1009_1', '6711_14', '1427'])
    assert.equal(reloaded.summons[3].used, 1)
    assert.equal(reloaded.chainUsed, true)
    // 目前回合已經有一筆，不重複記
    assert.deepEqual(reloaded.bossBuffHistory, [
      { turn: 1, statuses: ['1009_1', '6711_14', '1427'] },
      { turn: 2, statuses: ['1009_1', '6711_14', '1427'] },
      { turn: 3, statuses: ['4055_1'] },
    ])
  })

  it('換場（raid_id 不同）時整份重建：召喚次數、chainUsed 與歷史都歸零', () => {
    let state = applyStartJson(null, startJson())
    state = applyActionResult(state, action([], { turn: 2 }), 'summon', { summon_id: 1 })
    state = applyActionResult(state, action([], { turn: 2 }), 'chain')

    const next = applyStartJson(state, startJson({ raid_id: 222, turn: 1, battle: { total: 3, count: '3' } }))

    assert.equal(next.raidId, '222')
    assert.equal(next.battleCount, 3)
    assert.deepEqual(next.summons.map(s => s.used), [0, 0, 0, 0])
    assert.equal(next.chainUsed, false)
    assert.deepEqual(next.bossBuffHistory, [{ turn: 1, statuses: ['1009_1', '6711_14', '1427'] }])
  })
})

describe('applyActionResult', () => {
  const base = applyStartJson(null, startJson())

  it('condition 指令整個覆蓋該前排位置角色的 buff，每個位置取最後一個', () => {
    const state = applyActionResult(base, action([
      condition('player', 1, ['7349_2', '1001']),
      [{ cmd: 'condition', to: 'player', pos: 1 }],
      condition('player', 1, ['7349_3'], ['1371_1', '7349_3']),
      condition('player', 2, null, null),
      { cmd: 'condition', to: 'field_effect', condition: [] },
    ]), 'other')

    assert.deepEqual(state.allies[1].buffStatuses, ['7349_3', '1371_1'])
    assert.deepEqual(state.allies[2].buffStatuses, [])
    // 沒有 condition 指令的位置不變
    assert.deepEqual(state.allies[0].buffStatuses, ['1001', '7743_3'])
  })

  it('to boss、pos 0 的 condition 更新 boss buff，其他 boss 位置不影響', () => {
    const state = applyActionResult(base, action([
      condition('boss', 0, ['3353_1']),
      condition('boss', 0, ['3353_2'], ['1427']),
      condition('boss', 1, ['8888']),
    ]), 'other')

    assert.deepEqual(state.bossBuffStatuses, ['3353_2', '1427'])
  })

  it('沒有 boss condition 時保留目前的 boss buff', () => {
    assert.deepEqual(applyActionResult(base, action([condition('player', 0, [])]), 'other').bossBuffStatuses, base.bossBuffStatuses)
  })

  it('boss 的個人 buff 只保留屬於自己的（user_id 可能是數字）', () => {
    const state = applyActionResult(base, action([{
      cmd: 'condition',
      to: 'boss',
      pos: 0,
      condition: {
        buff: [
          { status: 'a', personal_buff_user_id: false },
          { status: 'b', personal_buff_user_id: OTHER },
          { status: 'c', personal_buff_user_id: Number(ME) },
        ],
        debuff: [{ status: 'd', personal_debuff_user_id: ME }, { status: 'e', personal_debuff_user_id: OTHER }],
      },
    }]), 'other')

    assert.deepEqual(state.bossBuffStatuses, ['a', 'c', 'd'])
  })

  it('status.formation 更新前排，condition 的 pos 用新的前排對到角色', () => {
    // D（player 4）換到前排第 2 格（pos 1），A（player 1）下到後排
    const swapped = applyActionResult(base, action(
      [condition('player', 1, ['5555'])],
      { formation: ['0', '4', '2', '3'], ability: { 2: { pos: 4, list: { 1: [{ 'ability-id': '140', 'class': '' }], 3: [{ 'ability-id': '142', 'class': '' }] } } } },
    ), 'other')

    assert.deepEqual(swapped.formation, [0, 4, 2, 3])
    assert.deepEqual(swapped.allies[4].buffStatuses, ['5555'])
    assert.deepEqual(swapped.allies[1].buffStatuses, ['7349_1'])
    // 技能格以 pos（player 索引）為準；下到後排的角色保留舊的對應
    assert.deepEqual(swapped.allies[4].abilities, [{ slot: 1, abilityId: '140' }, { slot: 3, abilityId: '142' }])
    assert.deepEqual(swapped.allies[1].abilities, [{ slot: 1, abilityId: '110' }])

    // 之後沒帶 formation 的回應沿用新的前排
    const later = applyActionResult(swapped, action([condition('player', 1, ['6666'])]), 'other')
    assert.deepEqual(later.allies[4].buffStatuses, ['6666'])
    assert.deepEqual(later.allies[1].buffStatuses, ['7349_1'])
  })

  it('召喚：依 summon_id 把該格的使用次數 +1（supporter 是好友，數字是 1 起算的格號）', () => {
    let state = applyActionResult(base, action([]), 'summon', { summon_id: '2' })
    state = applyActionResult(state, action([]), 'summon', { summon_id: 1 })
    state = applyActionResult(state, action([]), 'summon', { summon_id: 'supporter' })
    state = applyActionResult(state, action([]), 'summon', { summon_id: '2' })
    // 超出格數（第 4 格會落到好友）不計
    state = applyActionResult(state, action([]), 'summon', { summon_id: '4' })

    assert.deepEqual(state.summons.map(s => s.used), [1, 2, 0, 1])
  })

  it('不是召喚回應時，即使帶了 summon_id 也不計次', () => {
    assert.deepEqual(applyActionResult(base, action([]), 'other', { summon_id: '1' }).summons.map(s => s.used), [0, 0, 0, 0])
  })

  it('連鎖技能回應把 chainUsed 設為 true', () => {
    assert.equal(applyActionResult(base, action([]), 'chain').chainUsed, true)
    assert.equal(applyActionResult(base, action([]), 'other').chainUsed, false)
  })

  it('status.turn 變了才記一筆回合歷史，內容是這個回應處理完的 boss buff', () => {
    let state = applyActionResult(base, action([condition('boss', 0, ['3353_1'])], { turn: 2 }), 'other')
    state = applyActionResult(state, action([condition('boss', 0, ['3353_2'])], { turn: 2 }), 'other')
    state = applyActionResult(state, action([]), 'other')

    assert.deepEqual(state.bossBuffStatuses, ['3353_2'])
    assert.deepEqual(state.bossBuffHistory, [
      { turn: 1, statuses: ['1009_1', '6711_14', '1427'] },
      { turn: 2, statuses: ['3353_1'] },
    ])
  })

  it('不改動傳入的 state', () => {
    const before = structuredClone(base)
    applyActionResult(base, action([condition('player', 0, ['x']), condition('boss', 0, ['y'])], { turn: 5, formation: ['3', '2', '1', '0'] }), 'summon', { summon_id: '1' })

    assert.deepEqual(base, before)
  })
})

describe('classifyUrl', () => {
  it('依 URL 分出 start.json 與各種行動回應', () => {
    assert.equal(classifyUrl('https://game.granbluefantasy.jp/rest/raid/start.json?_=1'), 'start')
    assert.equal(classifyUrl('/rest/multiraid/start.json'), 'start')
    assert.equal(classifyUrl('/rest/multiraid/summon_result.json'), 'summon')
    assert.equal(classifyUrl('/rest/raid/group_gauge_action_result.json'), 'chain')
    for (const name of ['normal_attack_result', 'ability_result', 'fatal_chain_result', 'temporary_item_result', 'event_temporary_item_result', 'user_recovery'])
      assert.equal(classifyUrl(`/rest/multiraid/${name}.json`), 'other', name)
    assert.equal(classifyUrl('/rest/multiraid/guard_setting.json'), undefined)
    assert.equal(classifyUrl('/quest/quest_data'), undefined)
  })
})

describe('reduceBattleState', () => {
  const start = { url: '/rest/multiraid/start.json', responseData: startJson() }

  it('與戰鬥狀態無關的回應回傳同一個 state', () => {
    const state = reduceBattleState(null, start)
    assert.equal(reduceBattleState(state, { url: '/rest/multiraid/guard_setting.json', responseData: {} }), state)
  })

  it('還沒收到 start.json 時忽略行動回應', () => {
    assert.equal(reduceBattleState(null, { url: '/rest/multiraid/ability_result.json', responseData: action([]) }), null)
  })

  it('沒有 scenario 的行動回應（例如錯誤訊息）不更新', () => {
    const state = reduceBattleState(null, start)
    assert.equal(reduceBattleState(state, { url: '/rest/multiraid/ability_result.json', responseData: { popup: {} } }), state)
  })

  it('召喚回應從 requestData 取 summon_id', () => {
    const state = reduceBattleState(null, start)
    const next = reduceBattleState(state, {
      url: '/rest/multiraid/summon_result.json',
      requestData: JSON.stringify({ raid_id: 111, summon_id: 'supporter' }),
      responseData: action([]),
    }) as BattleState

    assert.deepEqual(next.summons.map(s => s.used), [0, 0, 0, 1])
  })

  it('召喚回應的 requestData 是 null 時不拋錯，也不計次', () => {
    const state = reduceBattleState(null, start)
    const next = reduceBattleState(state, { url: '/rest/multiraid/summon_result.json', requestData: null, responseData: action([]) }) as BattleState

    assert.deepEqual(next.summons.map(s => s.used), [0, 0, 0, 0])
  })

  it('連鎖技能回應記為已發動', () => {
    const state = reduceBattleState(null, start)
    const next = reduceBattleState(state, { url: '/rest/multiraid/group_gauge_action_result.json', requestData: '{}', responseData: action([]) }) as BattleState

    assert.equal(next.chainUsed, true)
  })
})
