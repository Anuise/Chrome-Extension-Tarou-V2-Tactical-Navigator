// 戰鬥腳本管理的純函式：匯入、刪除、匯出
// 不依賴 Vue 與 chrome API；由側欄頁把回傳的清單寫回 tn:battle-scripts
import type { BattleScript, StoredBattleScript } from 'tn'
import { validateScript } from './core'

/** 匯入或匯出的一個 JSON 檔 */
export interface ScriptFile {
  name: string
  text: string
}

/** importScripts 的結果 */
export interface ImportResult {
  /** 匯入後的腳本清單 */
  stored: StoredBattleScript[]
  /** 匯入成功的檔案，依檔案順序 */
  imported: { fileName: string, scriptName: string }[]
  /** 匯入失敗的檔案與錯誤訊息，依檔案順序 */
  failures: { fileName: string, errors: string[] }[]
}

/** 解析並驗證一個檔案；失敗時回傳可直接顯示的錯誤訊息 */
function readScript(text: string): { ok: true, script: BattleScript } | { ok: false, errors: string[] } {
  let input: unknown
  try {
    input = JSON.parse(text)
  }
  catch (error) {
    return { ok: false, errors: [`不是有效的 JSON：${String(error)}`] }
  }
  const validation = validateScript(input)
  // 錯誤顯示為「欄位路徑：說明」，路徑中的 rules[n] 即規則索引；整份不是物件時路徑為空字串，只顯示說明
  return validation.ok ? validation : { ok: false, errors: validation.errors.map(e => (e.path ? `${e.path}：${e.message}` : e.message)) }
}

/** 是否為同一份腳本：唯一鍵為 questId + name */
function isSameScript(a: BattleScript, b: BattleScript) {
  return a.questId === b.questId && a.name === b.name
}

/**
 * 匯入多個檔案：每份各自驗證，失敗的整份拒絕，不影響其他份。
 * 匯入的腳本一律啟用；同關卡同名的舊版在原位置覆蓋，新腳本加在最後。
 */
export function importScripts(stored: StoredBattleScript[], files: ScriptFile[]): ImportResult {
  const result: ImportResult = { stored: [...stored], imported: [], failures: [] }
  for (const file of files) {
    const read = readScript(file.text)
    if (!read.ok) {
      result.failures.push({ fileName: file.name, errors: read.errors })
      continue
    }
    const entry = { enabled: true, script: read.script }
    const index = result.stored.findIndex(s => isSameScript(s.script, read.script))
    if (index === -1)
      result.stored.push(entry)
    else
      result.stored[index] = entry
    result.imported.push({ fileName: file.name, scriptName: read.script.name })
  }
  return result
}

/** 刪除同關卡同名（questId + name）的腳本 */
export function removeScript(stored: StoredBattleScript[], script: BattleScript): StoredBattleScript[] {
  return stored.filter(s => !isSameScript(s.script, script))
}

/**
 * 匯出一份腳本：檔名與 repo 的 battle-scripts/<questId>-<名稱>.json 一致；
 * 內容縮排 2 格、結尾換行，存進 repo 也能通過 lint
 */
export function exportScript(script: BattleScript): ScriptFile {
  return { name: `${script.questId}-${script.name}.json`, text: `${JSON.stringify(script, null, 2)}\n` }
}
