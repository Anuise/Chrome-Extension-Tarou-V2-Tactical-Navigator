import type { BattleScript, BattleScriptCondition, BattleScriptRule } from 'tn'
import type { BattleSnapshot } from './core'
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
    const notInBattle: BattleSnapshot = { battleCount: 1, omenText: '', bossBuffStatuses: [] }

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
