import type { BattleScript, StoredBattleScript } from 'tn'
import assert from 'node:assert/strict'
// eslint-disable-next-line test/no-import-node-test
import { describe, it } from 'node:test'
import { exportScript, importScripts, removeScript } from './manage'

/** 一份合法的戰鬥腳本 */
function script(name: string, fields: Partial<BattleScript> = {}): BattleScript {
  return { version: 1, name, questId: '305421', rules: [{ note: '開場', when: {}, advice: [{ text: '先存奧義' }] }], ...fields }
}

/** 匯入用的檔案：內容為 JSON 文字 */
function file(name: string, content: unknown) {
  return { name, text: JSON.stringify(content) }
}

describe('importScripts', () => {
  it('合法的腳本加在清單最後並啟用，回報成功的檔名與腳本名稱', () => {
    const stored: StoredBattleScript[] = [{ enabled: false, script: script('既有腳本') }]

    assert.deepEqual(importScripts(stored, [file('destroy.json', script('破壞神意版'))]), {
      stored: [{ enabled: false, script: script('既有腳本') }, { enabled: true, script: script('破壞神意版') }],
      imported: [{ fileName: 'destroy.json', scriptName: '破壞神意版' }],
      failures: [],
    })
  })

  it('驗證失敗的檔案整份拒絕，逐條列出錯誤的欄位路徑（含規則索引）；同批的其他檔案照常匯入', () => {
    const broken = {
      ...script('壞掉的腳本'),
      rules: [
        { note: '開場', when: {}, advice: [] },
        { note: 'HP 寫成單一數字、技能沒寫', when: { hp: 50 }, advice: [{ character: '主角' }] },
      ],
    }
    const files = [file('destroy.json', script('破壞神意版')), file('broken.json', broken), file('rebirth.json', script('再生神意版'))]

    assert.deepEqual(importScripts([], files), {
      stored: [{ enabled: true, script: script('破壞神意版') }, { enabled: true, script: script('再生神意版') }],
      imported: [{ fileName: 'destroy.json', scriptName: '破壞神意版' }, { fileName: 'rebirth.json', scriptName: '再生神意版' }],
      failures: [{
        fileName: 'broken.json',
        errors: ['rules[1].when.hp：必須是兩個數字的區間，例如 [15, 50]', 'rules[1].advice[0].skill：缺少必要欄位'],
      }],
    })
  })

  it('不是有效 JSON 的檔案回報解析錯誤，同批的其他檔案照常匯入', () => {
    const { imported, failures } = importScripts([], [{ name: 'broken.json', text: '{ "version": 1, ' }, file('destroy.json', script('破壞神意版'))])

    assert.deepEqual(imported, [{ fileName: 'destroy.json', scriptName: '破壞神意版' }])
    assert.deepEqual(failures.map(f => f.fileName), ['broken.json'])
    assert.match(failures[0].errors.join('\n'), /^不是有效的 JSON：/)
  })

  it('同關卡同名（questId + name）的腳本在原位置覆蓋並重新啟用；別的關卡的同名腳本另外加入', () => {
    const stored: StoredBattleScript[] = [{ enabled: false, script: script('破壞神意版') }, { enabled: true, script: script('再生神意版') }]
    const newVersion = script('破壞神意版', { rules: [{ note: '新版規則', when: { turn: 1 }, advice: [] }] })
    const otherQuest = script('破壞神意版', { questId: '305431' })

    assert.deepEqual(importScripts(stored, [file('v2.json', newVersion), file('other.json', otherQuest)]).stored, [
      { enabled: true, script: newVersion },
      { enabled: true, script: script('再生神意版') },
      { enabled: true, script: otherQuest },
    ])
  })

  it('同一批選了同關卡同名的多個檔案時，後面的覆蓋前面的，清單中只留一份', () => {
    const newVersion = script('破壞神意版', { rules: [] })

    assert.deepEqual(importScripts([], [file('v1.json', script('破壞神意版')), file('v2.json', newVersion)]).stored, [
      { enabled: true, script: newVersion },
    ])
  })

  it('整份不是 JSON 物件時，錯誤訊息只有說明、沒有欄位路徑', () => {
    assert.deepEqual(importScripts([], [file('list.json', [script('破壞神意版')])]).failures, [
      { fileName: 'list.json', errors: ['戰鬥腳本必須是 JSON 物件'] },
    ])
  })
})

describe('removeScript', () => {
  it('只刪除同關卡同名的那一份，其他腳本與啟用狀態不變', () => {
    const stored: StoredBattleScript[] = [
      { enabled: true, script: script('破壞神意版') },
      { enabled: false, script: script('破壞神意版', { questId: '305431' }) },
      { enabled: true, script: script('再生神意版') },
    ]

    assert.deepEqual(removeScript(stored, script('破壞神意版')), [
      { enabled: false, script: script('破壞神意版', { questId: '305431' }) },
      { enabled: true, script: script('再生神意版') },
    ])
  })
})

describe('exportScript', () => {
  it('檔名為 <questId>-<name>.json，內容是縮排 2 格、結尾換行的 JSON', () => {
    const minimal: BattleScript = { version: 1, name: '破壞神意版', questId: '305421', rules: [] }

    assert.deepEqual(exportScript(minimal), {
      name: '305421-破壞神意版.json',
      text: '{\n  "version": 1,\n  "name": "破壞神意版",\n  "questId": "305421",\n  "rules": []\n}\n',
    })
  })

  it('匯出的檔案再匯入後，清單與匯出前相同', () => {
    const full = script('破壞神意版', {
      battleCount: 1,
      party: { characters: ['主角', 'ガブリエル'], summons: ['ルシフェル'] },
      rules: [{
        note: '第二階段：四王天出現',
        when: { turn: [1, 3], hp: [50, 15], gauge: [50, 100], omen: '浄土', bossBuff: '4052_' },
        advice: [{ character: '主角', skill: 'ディスペル' }, { text: '先存奧義' }],
      }],
    })
    const stored: StoredBattleScript[] = [{ enabled: true, script: full }, { enabled: true, script: script('再生神意版') }]

    assert.deepEqual(importScripts(stored, [exportScript(full)]).stored, stored)
  })
})
