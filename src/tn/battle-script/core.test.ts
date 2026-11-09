import type { BattleScript, BattleScriptCondition, BattleScriptRule } from 'tn'
import type { BattleSnapshot, SnapshotTurn } from './core'
import assert from 'node:assert/strict'
// eslint-disable-next-line test/no-import-node-test
import { describe, it } from 'node:test'
import { selectAdvice, validateScript } from './core'

/** spec 範例的完整腳本：用到所有欄位、五種條件與兩種操作建議 */
function fullScript(): BattleScript {
  return {
    version: 1,
    name: '顕現 破壞神意版',
    questId: '305421',
    battleCount: 1,
    party: { characters: ['主角', 'ガブリエル'], summons: ['ルシフェル'] },
    rules: [
      {
        note: '第二階段：四王天出現',
        when: { turn: [1, 3], hp: [50, 15], gauge: [50, 100], omen: '浄土', bossBuff: '4052_1' },
        advice: [{ character: '主角', skill: 'ディスペル' }, { text: '先存奧義' }],
      },
      { note: '第 5 回合', when: { turn: 5 }, advice: [] },
    ],
  }
}

/** 驗證必須失敗；回傳每個 error 指向的規則索引與欄位路徑 */
function errorLocations(input: unknown) {
  const result = validateScript(input)
  if (result.ok)
    assert.fail('預期驗證失敗')
  return result.errors.map(({ ruleIndex, path }) => ({ ruleIndex, path }))
}

/** 規則的條件依序為 whens 的腳本：驗證必須失敗，回傳每個 error 的路徑與說明 */
function conditionErrors(...whens: unknown[]) {
  const result = validateScript({ ...fullScript(), rules: whens.map(when => ({ note: '條件', when, advice: [] })) })
  if (result.ok)
    assert.fail('預期驗證失敗')
  return result.errors.map(({ path, message }) => [path, message])
}

// validateScript 的錯誤說明
const TEXT = '必須是非空字串'
const RANGE = '必須是兩個數字的區間，例如 [15, 50]'
const BOOL = '必須是 true 或 false'
const SLOT = '必須是 1–4 的整數'

describe('validateScript', () => {
  it('合法腳本通過驗證，回傳內容相同的腳本', () => {
    assert.deepEqual(validateScript(fullScript()), { ok: true, script: fullScript() })
  })

  it('省略 battleCount、party 與所有條件，且 when 為空物件、advice 為空陣列時仍通過驗證', () => {
    const script = { version: 1, name: '最小腳本', questId: '305421', rules: [{ note: '恆成立', when: {}, advice: [] }] }

    assert.deepEqual(validateScript(script), { ok: true, script })
  })

  it('error 含可直接顯示的說明文字', () => {
    const script = fullScript()
    const rules = [script.rules[0], { note: 'HP 寫單一數字', when: { hp: 50 }, advice: [] }]

    assert.deepEqual(validateScript({ ...script, rules }), {
      ok: false,
      errors: [{ path: 'rules[1].when.hp', ruleIndex: 1, message: '必須是兩個數字的區間，例如 [15, 50]' }],
    })
  })

  it('缺少腳本的必要欄位時，error 指向該欄位且不帶規則索引', () => {
    assert.deepEqual(errorLocations({}), [
      { ruleIndex: undefined, path: 'version' },
      { ruleIndex: undefined, path: 'name' },
      { ruleIndex: undefined, path: 'questId' },
      { ruleIndex: undefined, path: 'rules' },
    ])
  })

  it('version 不是 1 時只回報版本錯誤，不以 version 1 的格式檢查其他欄位', () => {
    for (const version of [2, '1'])
      assert.deepEqual(errorLocations({ version, name: '新格式', questId: '305421', steps: [] }), [{ ruleIndex: undefined, path: 'version' }])
  })

  it('整份輸入不是物件時，回報一個路徑為空字串的 error', () => {
    for (const input of [null, '腳本', 1, []])
      assert.deepEqual(errorLocations(input), [{ ruleIndex: undefined, path: '' }])
  })

  it('腳本欄位型別錯誤時，error 指向該欄位', () => {
    const input = {
      ...fullScript(),
      name: '',
      questId: 305421,
      battleCount: '1',
      party: { characters: '主角', summons: [] },
      rules: {},
    }

    assert.deepEqual(errorLocations(input), [
      { ruleIndex: undefined, path: 'name' },
      { ruleIndex: undefined, path: 'questId' },
      { ruleIndex: undefined, path: 'battleCount' },
      { ruleIndex: undefined, path: 'party.characters' },
      { ruleIndex: undefined, path: 'rules' },
    ])
  })

  it('規則缺少必要欄位時，error 指出規則索引與欄位路徑', () => {
    const script = fullScript()

    assert.deepEqual(errorLocations({ ...script, rules: [script.rules[0], {}] }), [
      { ruleIndex: 1, path: 'rules[1].note' },
      { ruleIndex: 1, path: 'rules[1].when' },
      { ruleIndex: 1, path: 'rules[1].advice' },
    ])
  })

  it('規則與操作建議的型別錯誤時，error 指出規則索引與欄位路徑', () => {
    const rules = [
      { note: 1, when: [], advice: {} },
      { note: '說明', when: {}, advice: ['先存奧義', { character: '主角' }, { text: '' }] },
    ]

    assert.deepEqual(errorLocations({ ...fullScript(), rules }), [
      { ruleIndex: 0, path: 'rules[0].note' },
      { ruleIndex: 0, path: 'rules[0].when' },
      { ruleIndex: 0, path: 'rules[0].advice' },
      { ruleIndex: 1, path: 'rules[1].advice[0]' },
      { ruleIndex: 1, path: 'rules[1].advice[1].skill' },
      { ruleIndex: 1, path: 'rules[1].advice[2].text' },
    ])
  })

  it('條件的區間格式錯誤時，error 指向該條件；只有 turn 可以寫單一數字', () => {
    const rules = [
      { note: '少一個端點', when: { turn: [1] }, advice: [] },
      { note: 'HP 寫單一數字', when: { hp: 50 }, advice: [] },
      { note: '端點不是數字', when: { gauge: ['50', 100] }, advice: [] },
      { note: '多一個端點', when: { hp: [50, 15, 0] }, advice: [] },
    ]

    assert.deepEqual(errorLocations({ ...fullScript(), rules }), [
      { ruleIndex: 0, path: 'rules[0].when.turn' },
      { ruleIndex: 1, path: 'rules[1].when.hp' },
      { ruleIndex: 2, path: 'rules[2].when.gauge' },
      { ruleIndex: 3, path: 'rules[3].when.hp' },
    ])
  })

  it('omen 與 bossBuff 不是非空字串時回報 error：空字串會讓條件恆成立', () => {
    const rules = [{ note: '預兆與 buff', when: { omen: '', bossBuff: 4052 }, advice: [] }]

    assert.deepEqual(errorLocations({ ...fullScript(), rules }), [
      { ruleIndex: 0, path: 'rules[0].when.omen' },
      { ruleIndex: 0, path: 'rules[0].when.bossBuff' },
    ])
  })

  it('未知的欄位回報 error：打錯的欄位名稱會讓條件被忽略', () => {
    const script = fullScript()
    const input = {
      ...script,
      battlecount: 2,
      party: { ...script.party, leader: '主角' },
      rules: [{
        note: '打錯條件名稱',
        when: { hpp: [0, 50] },
        advice: [{ character: '主角', skill: 'ディスペル', target: 'boss' }],
        memo: '備註',
      }],
    }

    assert.deepEqual(errorLocations(input), [
      { ruleIndex: undefined, path: 'battlecount' },
      { ruleIndex: undefined, path: 'party.leader' },
      { ruleIndex: 0, path: 'rules[0].memo' },
      { ruleIndex: 0, path: 'rules[0].when.hpp' },
      { ruleIndex: 0, path: 'rules[0].advice[0].target' },
    ])
  })

  it('新條件的合法寫法通過驗證：單一物件或陣列、巢狀 not、含 {n} 的 omen', () => {
    const rules = [
      { note: '預兆數字', when: { omen: '{n}ヒット', omenNum: [0, 40] }, advice: [] },
      { note: '只比格式', when: { omen: '{n}ダメージ' }, advice: [] },
      {
        note: '全部新條件',
        when: {
          not: { not: { bossBuff: '4055_1' } },
          ally: [{ who: '主角', dead: false, front: true }, { who: '3040390000', buff: '7349_', stack: [7, 10], remain: [1, 3] }],
          ability: { who: '3040617000', slot: 3, ready: true, recast: [0, 0], used: [0, 1] },
          summon: [{ id: '2040080000', from: 'friend', ready: true }, { id: '2040094000', recast: [0, 2], used: [0, 0] }],
          chain: [77, 100],
          chainUsed: false,
          lastTurn: { fc: true, guard: '3040617000', attack: '主角', omen: 'フェイタルチェイン' },
          seenOmen: 'アビダメ',
          turnStartHp: [15, 16],
        },
        advice: [],
      },
    ]
    const input = { ...fullScript(), rules }

    assert.deepEqual(validateScript(input), { ok: true, script: input })
  })

  it('omenNum 必須和含 {n} 的 omen 一起寫；omen 裡的 {n} 只能有一個', () => {
    assert.deepEqual(conditionErrors(
      { omenNum: [0, 40] },
      { omen: 'ヒット', omenNum: [0, 40] },
      { omen: '{n}万ダメ{n}ヒット' },
      { omen: '{n}ヒット', omenNum: 40 },
    ), [
      ['rules[0].when.omenNum', '必須和含 {n} 的 omen 一起寫'],
      ['rules[1].when.omenNum', '必須和含 {n} 的 omen 一起寫'],
      ['rules[2].when.omen', '只能有一個 {n}'],
      ['rules[3].when.omenNum', RANGE],
    ])
  })

  it('not 裡照同一套規則驗證，錯誤路徑接在 not 之後；not 是空物件時回報 error：加上 not 之後恆不成立', () => {
    assert.deepEqual(conditionErrors(
      { not: {} },
      { not: { not: {} } },
      { not: { hpp: [0, 50], ability: { who: '主角', slot: 5 } } },
      { not: [] },
    ), [
      ['rules[0].when.not', '不能是空物件'],
      ['rules[1].when.not.not', '不能是空物件'],
      ['rules[2].when.not.hpp', '未知的欄位'],
      ['rules[2].when.not.ability.slot', SLOT],
      ['rules[3].when.not', '必須是物件'],
    ])
  })

  it('ally 的錯誤指向該項；stack、remain 必須和 buff 一起寫；空陣列回報 error', () => {
    assert.deepEqual(conditionErrors(
      { ally: [{ who: '' }, { who: '3040390000', stack: [7, 10], remain: [1, 3] }] },
      { ally: { buff: '', stack: 7, remain: [1], dead: 'true', front: 1, target: 'boss' } },
      { ally: [] },
      { ally: ['主角'] },
    ), [
      ['rules[0].when.ally[0].who', TEXT],
      ['rules[0].when.ally[1].stack', '必須和 buff 一起寫'],
      ['rules[0].when.ally[1].remain', '必須和 buff 一起寫'],
      ['rules[1].when.ally.who', '缺少必要欄位'],
      ['rules[1].when.ally.target', '未知的欄位'],
      ['rules[1].when.ally.buff', TEXT],
      ['rules[1].when.ally.stack', RANGE],
      ['rules[1].when.ally.remain', RANGE],
      ['rules[1].when.ally.dead', BOOL],
      ['rules[1].when.ally.front', BOOL],
      ['rules[2].when.ally', '至少要有一項'],
      ['rules[3].when.ally[0]', '必須是物件'],
    ])
  })

  it('ability 缺少 who 或 slot、slot 不是 1–4 的整數、欄位型別錯誤時回報 error；空陣列回報 error', () => {
    assert.deepEqual(conditionErrors(
      { ability: { ready: 'true', recast: 0, used: [1], skill: 'ディスペル' } },
      { ability: [{ who: '主角', slot: 0 }, { who: '主角', slot: 5 }, { who: '主角', slot: 1.5 }, { who: '', slot: '1' }] },
      { ability: [] },
    ), [
      ['rules[0].when.ability.who', '缺少必要欄位'],
      ['rules[0].when.ability.slot', '缺少必要欄位'],
      ['rules[0].when.ability.skill', '未知的欄位'],
      ['rules[0].when.ability.ready', BOOL],
      ['rules[0].when.ability.recast', RANGE],
      ['rules[0].when.ability.used', RANGE],
      ['rules[1].when.ability[0].slot', SLOT],
      ['rules[1].when.ability[1].slot', SLOT],
      ['rules[1].when.ability[2].slot', SLOT],
      ['rules[1].when.ability[3].who', TEXT],
      ['rules[1].when.ability[3].slot', SLOT],
      ['rules[2].when.ability', '至少要有一項'],
    ])
  })

  it('summon 缺少 id、from 不是 main／sub／friend、欄位型別錯誤時回報 error；空陣列回報 error', () => {
    assert.deepEqual(conditionErrors(
      { summon: { from: 'support', ready: 1, recast: [0], used: '0', name: 'ゼウス' } },
      { summon: [{ id: '' }, { id: '2040080000', from: 'main' }] },
      { summon: [] },
    ), [
      ['rules[0].when.summon.id', '缺少必要欄位'],
      ['rules[0].when.summon.name', '未知的欄位'],
      ['rules[0].when.summon.from', '必須是 "main"、"sub" 或 "friend"'],
      ['rules[0].when.summon.ready', BOOL],
      ['rules[0].when.summon.recast', RANGE],
      ['rules[0].when.summon.used', RANGE],
      ['rules[1].when.summon[0].id', TEXT],
      ['rules[2].when.summon', '至少要有一項'],
    ])
  })

  it('lastTurn 是空物件或欄位型別錯誤時回報 error；chain、chainUsed、seenOmen、turnStartHp 型別錯誤時回報 error', () => {
    assert.deepEqual(conditionErrors(
      { lastTurn: {} },
      { lastTurn: { fc: 'yes', guard: '', attack: 3040617000, omen: '', ougi: true } },
      { lastTurn: 'fc' },
      { chain: 77, chainUsed: 'true', seenOmen: '', turnStartHp: [15] },
    ), [
      ['rules[0].when.lastTurn', '至少要寫一個欄位'],
      ['rules[1].when.lastTurn.ougi', '未知的欄位'],
      ['rules[1].when.lastTurn.fc', BOOL],
      ['rules[1].when.lastTurn.guard', TEXT],
      ['rules[1].when.lastTurn.attack', TEXT],
      ['rules[1].when.lastTurn.omen', TEXT],
      ['rules[2].when.lastTurn', '必須是物件'],
      ['rules[3].when.chain', RANGE],
      ['rules[3].when.chainUsed', BOOL],
      ['rules[3].when.seenOmen', TEXT],
      ['rules[3].when.turnStartHp', RANGE],
    ])
  })
})

/** 顕現戰第 3 回合：HP 49.5%、破壞之力 70、預兆「浄土|破壊」，boss 身上有 1001_1 與 4052_1 */
const snapshot: BattleSnapshot = {
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
}

function rule(note: string, when: BattleScriptCondition = {}): BattleScriptRule {
  return { note, when, advice: [{ text: note }] }
}

function script(rules: BattleScriptRule[], fields: Partial<BattleScript> = {}): BattleScript {
  return { version: 1, name: '測試腳本', questId: '305421', rules, ...fields }
}

/** 在 battle 狀態下，只有一條規則的相符腳本中，這條規則是否成立 */
function holds(when: BattleScriptCondition, battle: BattleSnapshot = snapshot) {
  return selectAdvice([script([rule('規則', when)])], battle).activeRules.length === 1
}

describe('selectAdvice', () => {
  it('questId 相同的腳本相符並被選中；when 為空的規則恆成立，依腳本順序列出', () => {
    const matched = script([rule('開場'), rule('提醒')])
    const result = selectAdvice([matched], snapshot)

    assert.deepEqual(result.matchedScripts.map(m => m.script), [matched])
    assert.equal(result.selectedScript?.script, matched)
    assert.deepEqual(result.activeRules, matched.rules)
  })

  it('沒有 questId 相同的腳本時無相符腳本、沒有選中腳本、沒有成立的規則', () => {
    assert.deepEqual(selectAdvice([script([rule('別的關卡')], { questId: '999999' })], snapshot), {
      matchedScripts: [],
      selectedScript: undefined,
      activeRules: [],
    })
  })

  it('腳本未寫 battleCount 或與目前第幾場相同時相符，不同時不相符', () => {
    const scripts = [
      script([], { name: '不分場次' }),
      script([], { name: '第 1 場', battleCount: 1 }),
      script([], { name: '第 2 場', battleCount: 2 }),
    ]

    assert.deepEqual(selectAdvice(scripts, snapshot).matchedScripts.map(m => m.script.name), ['不分場次', '第 1 場'])
    // 不知道第幾場時，只有沒寫 battleCount 的腳本相符
    assert.deepEqual(selectAdvice(scripts, { ...snapshot, battleCount: undefined }).matchedScripts.map(m => m.script.name), ['不分場次'])
  })

  it('turn 寫單一數字時，回合相同才成立', () => {
    assert.equal(holds({ turn: 3 }), true)
    assert.equal(holds({ turn: 4 }), false)
  })

  it('turn 寫區間時兩端都包含，端點順序不限', () => {
    assert.equal(holds({ turn: [1, 3] }), true)
    assert.equal(holds({ turn: [3, 5] }), true)
    assert.equal(holds({ turn: [5, 3] }), true)
    assert.equal(holds({ turn: [4, 6] }), false)
    assert.equal(holds({ turn: [2, 1] }), false)
  })

  it('hp 區間比對 boss HP 百分比，兩端都包含，端點順序不限', () => {
    assert.equal(holds({ hp: [50, 15] }), true)
    assert.equal(holds({ hp: [49.5, 60] }), true)
    assert.equal(holds({ hp: [0, 49.5] }), true)
    assert.equal(holds({ hp: [15, 49] }), false)
    assert.equal(holds({ hp: [100, 50] }), false)
  })

  it('gauge 區間比對 boss 獨有計量條，兩端都包含，端點順序不限', () => {
    assert.equal(holds({ gauge: [50, 70] }), true)
    assert.equal(holds({ gauge: [100, 70] }), true)
    assert.equal(holds({ gauge: [0, 69] }), false)
  })

  it('omen 是預兆文字的子字串時成立；沒有預兆時不成立', () => {
    assert.equal(holds({ omen: '浄土' }), true)
    assert.equal(holds({ omen: '破壊' }), true)
    assert.equal(holds({ omen: '再生' }), false)
    assert.equal(holds({ omen: '浄土' }, { ...snapshot, omenText: '' }), false)
  })

  it('bossBuff 是任一個 boss buff status 的前綴時成立；只是子字串不算', () => {
    assert.equal(holds({ bossBuff: '4052_1' }), true)
    assert.equal(holds({ bossBuff: '4052' }), true)
    assert.equal(holds({ bossBuff: '1001' }), true)
    assert.equal(holds({ bossBuff: '052_1' }), false)
    assert.equal(holds({ bossBuff: '4052' }, { ...snapshot, bossBuffStatuses: [] }), false)
    assert.equal(holds({ bossBuff: '4052' }, { ...snapshot, bossBuffStatuses: undefined }), false)
  })

  it('多個條件全部成立才成立（AND）', () => {
    const when: BattleScriptCondition = { turn: [1, 3], hp: [50, 15], gauge: [50, 100], omen: '浄土', bossBuff: '4052' }

    assert.equal(holds(when), true)
    assert.equal(holds({ ...when, bossBuff: '9999' }), false)
    assert.equal(holds({ ...when, turn: 4 }), false)
  })

  it('多條規則同時成立時依腳本順序全部列出，不成立的略過', () => {
    const rules = [rule('HP 50% 以下', { hp: [0, 50] }), rule('第 5 回合', { turn: 5 }), rule('浄土', { omen: '浄土' }), rule('提醒')]

    assert.deepEqual(selectAdvice([script(rules)], snapshot).activeRules.map(r => r.note), ['HP 50% 以下', '浄土', '提醒'])
  })

  it('不在戰鬥中時不拋錯，也沒有相符腳本', () => {
    const notInBattle: BattleSnapshot = { battleCount: 1, omenText: '', bossBuffStatuses: [], allies: [], summons: [], chainUsed: false, history: [] }

    assert.deepEqual(selectAdvice([script([rule('開場')])], notInBattle), {
      matchedScripts: [],
      selectedScript: undefined,
      activeRules: [],
    })
  })

  it('snapshot 缺少回合、HP 或計量條時不拋錯：寫了該條件的規則不成立，其他規則照常成立', () => {
    const missing: BattleSnapshot = { ...snapshot, turn: undefined, hpPercent: undefined, gauge: undefined }
    const rules = [rule('回合', { turn: [1, 99] }), rule('HP', { hp: [0, 100] }), rule('計量條', { gauge: [0, 100] }), rule('預兆', { omen: '浄土' })]

    assert.deepEqual(selectAdvice([script(rules)], missing).activeRules.map(r => r.note), ['預兆'])
  })

  it('同關卡有多份相符腳本、未指定選中腳本時，選第一份並只列出它成立的規則', () => {
    const scripts = [script([rule('破壞版')], { name: '破壞神意版' }), script([rule('再生版')], { name: '再生神意版' })]
    const result = selectAdvice(scripts, snapshot)

    assert.deepEqual(result.matchedScripts.map(m => m.script.name), ['破壞神意版', '再生神意版'])
    assert.equal(result.selectedScript?.script.name, '破壞神意版')
    assert.deepEqual(result.activeRules.map(r => r.note), ['破壞版'])
  })

  it('指定相符腳本的 key 時選中該份腳本，只列出它成立的規則', () => {
    const scripts = [script([rule('破壞版')], { name: '破壞神意版' }), script([rule('再生版')], { name: '再生神意版' })]
    const key = selectAdvice(scripts, snapshot).matchedScripts[1].key
    const result = selectAdvice(scripts, snapshot, key)

    assert.equal(result.selectedScript?.key, key)
    assert.equal(result.selectedScript?.script.name, '再生神意版')
    assert.deepEqual(result.activeRules.map(r => r.note), ['再生版'])
  })

  it('指定的 key 沒有對應的相符腳本時（例如已停用或是別的關卡），改選第一份', () => {
    const scripts = [script([rule('破壞版')], { name: '破壞神意版' }), script([rule('再生版')], { name: '再生神意版' })]
    const otherQuestKey = selectAdvice([script([], { questId: '999999' })], { ...snapshot, questId: '999999' }).matchedScripts[0].key

    assert.equal(selectAdvice(scripts, snapshot, otherQuestKey).selectedScript?.script.name, '破壞神意版')
  })

  it('key 只由 questId 與 name 決定：同名腳本重新匯入新版內容後，原本的 key 仍選中它', () => {
    const before = [script([rule('破壞版')], { name: '破壞神意版' }), script([rule('再生版')], { name: '再生神意版' })]
    const key = selectAdvice(before, snapshot).matchedScripts[1].key
    const after = [before[0], script([rule('再生版 v2')], { name: '再生神意版' })]

    assert.deepEqual(selectAdvice(after, snapshot, key).activeRules.map(r => r.note), ['再生版 v2'])
  })
})

const UNI = '3040390000'
const DOG = '3040617000'
const BACK_ROW = '3040111000'
const ZEUS = '2040080000'
const SUB_SUMMON = '2040094000'

/**
 * 同一場戰鬥的完整 snapshot（第 3 回合）：
 * - 主角：技能 1 可用、技能 2 冷卻 3 回合、技能 3 不知道能不能按；
 * - 尤妮：兩個 7349 buff（7 層沒有剩餘回合、3 層剩 2 回合）與一個沒有層數的 1000；
 * - 狗在前排陣亡，另一人在後排；
 * - 召喚石：主召與好友都是宙斯（主召冷卻中、好友可用），副召不知道能不能召喚；
 * - 上一回合（第 2 回合）：尤妮與已不在隊伍中的角色防禦，有放 FC 與普攻。
 */
const full: BattleSnapshot = {
  ...snapshot,
  allies: [
    {
      id: '360001',
      isLeader: true,
      front: true,
      dead: false,
      buffs: [{ status: '2001_10' }],
      abilities: [
        { slot: 1, abilityId: '1', ready: true, recast: 0, used: 1 },
        { slot: 2, abilityId: '2', ready: false, recast: 3, used: 0 },
        { slot: 3, abilityId: '3', used: 0 },
      ],
    },
    {
      id: UNI,
      isLeader: false,
      front: true,
      dead: false,
      buffs: [{ status: '7349_7' }, { status: '7349_3', remain: 2 }, { status: '1000', remain: 1 }],
      abilities: [{ slot: 2, abilityId: '4', ready: true, recast: 0, used: 2 }],
    },
    { id: DOG, isLeader: false, front: true, dead: true, buffs: [], abilities: [] },
    { id: BACK_ROW, isLeader: false, front: false, dead: false, buffs: [], abilities: [] },
  ],
  summons: [
    { from: 'main', id: ZEUS, ready: false, recast: 5, used: 1 },
    { from: 'sub', id: SUB_SUMMON, used: 0 },
    { from: 'friend', id: ZEUS, ready: true, recast: 0, used: 0 },
  ],
  chain: 77,
  chainUsed: false,
  history: [
    { turn: 1, hpAtStart: 100, omenText: 'アビダメ', guards: [], actions: [] },
    {
      turn: 2,
      hpAtStart: 70,
      omenText: 'フェイタルチェイン',
      guards: [UNI, '3999999000'],
      actions: [{ type: 'ability', id: '1' }, { type: 'fc' }, { type: 'attack' }],
    },
    { turn: 3, hpAtStart: 55, omenText: '浄土|破壊', guards: [], actions: [] },
  ],
}

/** 上一回合（第 2 回合）換成 previous 之後的 full */
function withPreviousTurn(previous: Partial<SnapshotTurn>): BattleSnapshot {
  const [first, second, current] = full.history
  return { ...full, history: [first, { ...second, ...previous }, current] }
}

describe('selectAdvice 的新條件', () => {
  it('omen 沒有 {n} 時行為不變：對整串預兆做子字串比對', () => {
    assert.equal(holds({ omen: '浄土|破壊' }), true)
    assert.equal(holds({ omen: '土|破' }), true)
  })

  it('omen 含 {n} 時取出預兆裡的數字，落在 omenNum 區間內才成立；數字去掉逗號再比對', () => {
    const hits = { ...snapshot, omenText: '浄土|30ヒット' }
    const damage = { ...snapshot, omenText: '100,000,000ダメージ' }

    assert.equal(holds({ omen: '{n}ヒット', omenNum: [0, 40] }, hits), true)
    assert.equal(holds({ omen: '{n}ヒット', omenNum: [30, 30] }, hits), true)
    assert.equal(holds({ omen: '{n}ヒット', omenNum: [31, 40] }, hits), false)
    assert.equal(holds({ omen: '{n}ダメージ', omenNum: [100_000_000, 100_000_000] }, damage), true)
    assert.equal(holds({ omen: '{n}ダメージ', omenNum: [0, 100] }, damage), false)
  })

  it('omen 含 {n} 時，一段預兆裡有兩個數字，只取符合格式的那一個', () => {
    const battle = { ...snapshot, omenText: '600万ダメ5ヒット' }

    assert.equal(holds({ omen: '{n}ヒット', omenNum: [5, 5] }, battle), true)
    assert.equal(holds({ omen: '{n}ヒット', omenNum: [600, 600] }, battle), false)
    assert.equal(holds({ omen: '{n}万ダメ', omenNum: [600, 600] }, battle), true)
  })

  it('omen 含 {n} 時對以 | 分開的每一段比對，任一段符合即成立', () => {
    const battle = { ...snapshot, omenText: '50ヒット|30ヒット' }

    assert.equal(holds({ omen: '{n}ヒット', omenNum: [0, 40] }, battle), true)
    assert.equal(holds({ omen: '{n}ヒット', omenNum: [41, 49] }, battle), false)
    // 每一段都不含 |，所以格式不能跨段
    assert.equal(holds({ omen: '{n}|30' }, battle), false)
  })

  it('omen 含 {n}、沒寫 omenNum 時只要求格式符合，數字不限；沒有預兆時不成立', () => {
    assert.equal(holds({ omen: '{n}ヒット' }, { ...snapshot, omenText: '999ヒット' }), true)
    assert.equal(holds({ omen: '{n}ヒット' }, { ...snapshot, omenText: 'ヒット' }), false)
    assert.equal(holds({ omen: '{n}ヒット' }, { ...snapshot, omenText: '' }), false)
  })

  it('{n} 的數字必須以數字開頭；omen 的其餘字元照字面比對，不當作正規表示式', () => {
    assert.equal(holds({ omen: '{n}ダメージ' }, { ...snapshot, omenText: ',ダメージ' }), false)
    assert.equal(holds({ omen: '({n}回)', omenNum: [3, 3] }, { ...snapshot, omenText: '連続攻撃(3回)' }), true)
    assert.equal(holds({ omen: '.{n}' }, { ...snapshot, omenText: 'a3' }), false)
  })

  it('not 裡的條件不成立時成立，可以巢狀', () => {
    assert.equal(holds({ not: { bossBuff: '4052' } }), false)
    assert.equal(holds({ not: { bossBuff: '9999' } }), true)
    assert.equal(holds({ not: { turn: 3, bossBuff: '9999' } }), true)
    assert.equal(holds({ not: { not: { bossBuff: '4052' } } }), true)
  })

  it('not 包住沒有值的條件時成立', () => {
    assert.equal(holds({ not: { chain: [0, 100] } }), true)
    assert.equal(holds({ not: { ally: { who: '主角' } } }), true)
  })

  it('ally 的 who 寫「主角」時對到主角，其他字串對到角色 ID；找不到角色時不成立', () => {
    assert.equal(holds({ ally: { who: '主角' } }, full), true)
    assert.equal(holds({ ally: { who: UNI } }, full), true)
    assert.equal(holds({ ally: { who: '3999999000' } }, full), false)
    assert.equal(holds({ ally: { who: '主角' } }), false)
  })

  it('ally 的 dead、front 要和角色狀態相等', () => {
    assert.equal(holds({ ally: { who: DOG, dead: true, front: true } }, full), true)
    assert.equal(holds({ ally: { who: DOG, dead: false } }, full), false)
    // 不知道存活時，不論寫 true 或 false 都不成立
    const unknown = { ...full, allies: full.allies.map(ally => ({ ...ally, dead: undefined })) }
    assert.equal(holds({ ally: { who: DOG, dead: true } }, unknown), false)
    assert.equal(holds({ ally: { who: '主角', dead: false } }, unknown), false)
    assert.equal(holds({ ally: { who: BACK_ROW, front: false } }, full), true)
    assert.equal(holds({ ally: { who: BACK_ROW, front: true } }, full), false)
  })

  it('ally 的 buff 是該角色任一個 buff status 的前綴時成立', () => {
    assert.equal(holds({ ally: { who: UNI, buff: '7349' } }, full), true)
    assert.equal(holds({ ally: { who: UNI, buff: '349' } }, full), false)
    assert.equal(holds({ ally: { who: '主角', buff: '7349' } }, full), false)
  })

  it('ally 的 stack 取 buff 前綴與開頭一個 _ 之後的數字；取不到數字時不成立', () => {
    assert.equal(holds({ ally: { who: UNI, buff: '7349', stack: [7, 10] } }, full), true)
    assert.equal(holds({ ally: { who: UNI, buff: '7349_', stack: [7, 7] } }, full), true)
    assert.equal(holds({ ally: { who: UNI, buff: '7349', stack: [8, 10] } }, full), false)
    assert.equal(holds({ ally: { who: '主角', buff: '2001', stack: [10, 10] } }, full), true)
    assert.equal(holds({ ally: { who: UNI, buff: '1000', stack: [0, 99] } }, full), false)
  })

  it('ally 的 remain 比對 buff 的剩餘回合，沒有值時不成立；stack 與 remain 必須由同一個 buff 滿足', () => {
    assert.equal(holds({ ally: { who: UNI, buff: '1000', remain: [1, 1] } }, full), true)
    assert.equal(holds({ ally: { who: '主角', buff: '2001', remain: [0, 99] } }, full), false)
    assert.equal(holds({ ally: { who: UNI, buff: '7349', stack: [3, 3], remain: [2, 2] } }, full), true)
    assert.equal(holds({ ally: { who: UNI, buff: '7349', stack: [7, 7], remain: [2, 2] } }, full), false)
  })

  it('ally 寫成陣列時每一項都要成立', () => {
    assert.equal(holds({ ally: [{ who: '主角', dead: false }, { who: UNI, buff: '7349' }] }, full), true)
    assert.equal(holds({ ally: [{ who: '主角', dead: false }, { who: UNI, buff: '9999' }] }, full), false)
  })

  it('ability 的 ready 要和技能狀態相等；不知道能不能按時，不論寫 true 或 false 都不成立', () => {
    assert.equal(holds({ ability: { who: '主角', slot: 1, ready: true } }, full), true)
    assert.equal(holds({ ability: { who: '主角', slot: 1, ready: false } }, full), false)
    assert.equal(holds({ ability: { who: '主角', slot: 2, ready: false } }, full), true)
    assert.equal(holds({ ability: { who: '主角', slot: 3, ready: true } }, full), false)
    assert.equal(holds({ ability: { who: '主角', slot: 3, ready: false } }, full), false)
  })

  it('ability 的 recast、used 比對區間；recast 沒有值時不成立', () => {
    assert.equal(holds({ ability: { who: '主角', slot: 2, recast: [1, 3] } }, full), true)
    assert.equal(holds({ ability: { who: '主角', slot: 2, recast: [0, 2] } }, full), false)
    assert.equal(holds({ ability: { who: '主角', slot: 3, recast: [0, 99] } }, full), false)
    assert.equal(holds({ ability: { who: '主角', slot: 1, used: [1, 99] } }, full), true)
    assert.equal(holds({ ability: { who: '主角', slot: 2, used: [1, 99] } }, full), false)
    // 不知道用過幾次時不成立（「還沒用過」也不成立）
    const unknown = { ...full, allies: full.allies.map(ally => ({ ...ally, abilities: ally.abilities.map(ability => ({ ...ability, used: undefined })) })) }
    assert.equal(holds({ ability: { who: '主角', slot: 2, used: [0, 0] } }, unknown), false)
  })

  it('ability 找不到角色或技能格時不成立；只寫 who 與 slot 時找得到就成立', () => {
    assert.equal(holds({ ability: { who: UNI, slot: 2 } }, full), true)
    assert.equal(holds({ ability: { who: UNI, slot: 4 } }, full), false)
    assert.equal(holds({ ability: { who: '3999999000', slot: 1 } }, full), false)
  })

  it('ability 寫成陣列時每一項都要成立', () => {
    assert.equal(holds({ ability: [{ who: '主角', slot: 1, ready: true }, { who: UNI, slot: 2, ready: true }] }, full), true)
    assert.equal(holds({ ability: [{ who: '主角', slot: 1, ready: true }, { who: '主角', slot: 2, ready: true }] }, full), false)
  })

  it('summon 符合 id 的召喚石不只一張時，任一張滿足全部有寫的欄位即成立', () => {
    assert.equal(holds({ summon: { id: ZEUS, ready: true } }, full), true)
    assert.equal(holds({ summon: { id: ZEUS, recast: [5, 5], used: [1, 1] } }, full), true)
    // 好友可用但沒召喚過、主召召喚過但不可用：沒有一張同時滿足
    assert.equal(holds({ summon: { id: ZEUS, ready: true, used: [1, 1] } }, full), false)
  })

  it('summon 寫了 from 時只比對該位置的召喚石', () => {
    assert.equal(holds({ summon: { id: ZEUS, from: 'friend', ready: true } }, full), true)
    assert.equal(holds({ summon: { id: ZEUS, from: 'main', ready: true } }, full), false)
    assert.equal(holds({ summon: { id: ZEUS, from: 'sub' } }, full), false)
  })

  it('summon 找不到召喚石，或 ready、recast 沒有值時不成立', () => {
    assert.equal(holds({ summon: { id: '2040999000' } }, full), false)
    assert.equal(holds({ summon: { id: SUB_SUMMON, ready: true } }, full), false)
    assert.equal(holds({ summon: { id: SUB_SUMMON, ready: false } }, full), false)
    assert.equal(holds({ summon: { id: SUB_SUMMON, recast: [0, 99] } }, full), false)
    assert.equal(holds({ summon: { id: SUB_SUMMON, used: [0, 0] } }, full), true)
    assert.equal(holds({ summon: { id: SUB_SUMMON, used: [0, 0] } }, { ...full, summons: full.summons.map(summon => ({ ...summon, used: undefined })) }), false)
  })

  it('summon 寫成陣列時每一項都要成立', () => {
    assert.equal(holds({ summon: [{ id: ZEUS, from: 'friend', ready: true }, { id: SUB_SUMMON }] }, full), true)
    assert.equal(holds({ summon: [{ id: ZEUS, from: 'friend', ready: true }, { id: ZEUS, from: 'main', ready: true }] }, full), false)
  })

  it('chain 區間比對連鎖條，沒有值時不成立；chainUsed 要和是否發動過連鎖技能相等', () => {
    assert.equal(holds({ chain: [77, 100] }, full), true)
    assert.equal(holds({ chain: [0, 76] }, full), false)
    assert.equal(holds({ chain: [0, 100] }), false)
    assert.equal(holds({ chainUsed: false }, full), true)
    assert.equal(holds({ chainUsed: true }, full), false)
    assert.equal(holds({ chainUsed: true }, { ...full, chainUsed: true }), true)
    assert.equal(holds({ chainUsed: false }, { ...full, chainUsed: true }), false)
  })

  it('chainUsed 沒有值時，不論寫 true 或 false 都不成立', () => {
    assert.equal(holds({ chainUsed: false }, { ...full, chainUsed: undefined }), false)
    assert.equal(holds({ chainUsed: true }, { ...full, chainUsed: undefined }), false)
  })

  it('lastTurn 看倒數第二筆歷史；只有目前回合或沒有歷史時不成立', () => {
    assert.equal(holds({ lastTurn: { fc: true } }, full), true)
    assert.equal(holds({ lastTurn: { fc: false } }, { ...full, history: full.history.slice(0, 1) }), false)
    assert.equal(holds({ lastTurn: { fc: false } }, { ...full, history: [] }), false)
  })

  it('lastTurn 的 fc 要和上一回合有沒有放 FC 相等', () => {
    assert.equal(holds({ lastTurn: { fc: true } }, full), true)
    assert.equal(holds({ lastTurn: { fc: false } }, full), false)
    assert.equal(holds({ lastTurn: { fc: false } }, withPreviousTurn({ actions: [{ type: 'attack' }] })), true)
  })

  it('lastTurn 的 guard：該角色在上一回合防禦時成立；who 對不到角色時不成立', () => {
    assert.equal(holds({ lastTurn: { guard: UNI } }, full), true)
    assert.equal(holds({ lastTurn: { guard: '主角' } }, full), false)
    assert.equal(holds({ lastTurn: { guard: '主角' } }, withPreviousTurn({ guards: ['360001'] })), true)
    assert.equal(holds({ lastTurn: { guard: '3999999000' } }, full), false)
  })

  it('lastTurn 的 attack：上一回合有普攻、而且該角色沒有防禦時成立；who 對不到角色時不成立', () => {
    assert.equal(holds({ lastTurn: { attack: '主角' } }, full), true)
    assert.equal(holds({ lastTurn: { attack: UNI } }, full), false)
    assert.equal(holds({ lastTurn: { attack: '主角' } }, withPreviousTurn({ actions: [{ type: 'fc' }] })), false)
    assert.equal(holds({ lastTurn: { attack: '3888888000' } }, full), false)
  })

  it('lastTurn 的 omen 只比對上一回合的預兆，不看目前與更早的回合', () => {
    assert.equal(holds({ lastTurn: { omen: 'フェイタル' } }, full), true)
    assert.equal(holds({ lastTurn: { omen: '浄土' } }, full), false)
    assert.equal(holds({ lastTurn: { omen: 'アビダメ' } }, full), false)
  })

  it('seenOmen 比對本場任一回合與目前的預兆', () => {
    assert.equal(holds({ seenOmen: 'アビダメ' }, full), true)
    assert.equal(holds({ seenOmen: 'フェイタル' }, full), true)
    assert.equal(holds({ seenOmen: '再生' }, full), false)
    // 沒有歷史時仍比對目前的預兆
    assert.equal(holds({ seenOmen: '破壊' }), true)
  })

  it('turnStartHp 比對最後一筆歷史的回合開始 HP；沒有歷史或沒記到時不成立', () => {
    assert.equal(holds({ turnStartHp: [50, 60] }, full), true)
    assert.equal(holds({ turnStartHp: [70, 70] }, full), false)
    assert.equal(holds({ turnStartHp: [0, 100] }), false)
    assert.equal(holds({ turnStartHp: [0, 100] }, { ...full, history: [{ ...full.history[2], hpAtStart: undefined }] }), false)
  })

  it('新條件與既有條件全部成立才成立（AND）', () => {
    const when: BattleScriptCondition = {
      turn: 3,
      ally: { who: UNI, buff: '7349', stack: [7, 10] },
      ability: { who: '主角', slot: 1, ready: true },
      summon: { id: ZEUS, from: 'friend', ready: true },
      lastTurn: { fc: true },
      not: { chainUsed: true },
    }

    assert.equal(holds(when, full), true)
    assert.equal(holds({ ...when, chain: [0, 50] }, full), false)
    assert.equal(holds({ ...when, ability: { who: '主角', slot: 2, ready: true } }, full), false)
  })
})
