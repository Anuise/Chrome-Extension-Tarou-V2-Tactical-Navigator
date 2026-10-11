// 戰鬥腳本核心模組：純 TypeScript，不依賴 Vue、chrome API 與 upstream 型別
import type { BattleScript, BattleScriptCondition, BattleScriptRange, BattleScriptRule } from 'tn'

/** 規則比對的輸入：目前的戰鬥狀態，由側欄頁從 upstream 的 battleInfo 轉換而來 */
export interface BattleSnapshot {
  /** 沒有任何戰鬥資料（視為不在戰鬥中）時為 undefined */
  questId?: string
  /** 多段戰的第幾場 */
  battleCount: number
  turn?: number
  /** boss HP 百分比（0–100） */
  hpPercent?: number
  /** boss 獨有計量條，例如破壞之力；boss 沒有時為 undefined */
  gauge?: number
  /** 預兆文字，多個預兆以 `|` 連接；沒有預兆時為空字串 */
  omenText: string
  /** boss 身上所有 buff 與 debuff 的 status，例如 `4052_1` */
  bossBuffStatuses: string[]
}

/** validateScript 回報的一個錯誤 */
export interface ScriptValidationError {
  /** 欄位路徑，例如 `rules[2].when.hp` */
  path: string
  /** 錯誤所在的規則索引（0 起算，同 path 中的 `rules[n]`）；不在任何規則內時省略 */
  ruleIndex?: number
  /** 錯誤說明，不含路徑 */
  message: string
}

/** validateScript 的結果 */
export type ValidateScriptResult = { ok: true, script: BattleScript } | { ok: false, errors: ScriptValidationError[] }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value !== ''
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isRange(value: unknown): value is BattleScriptRange {
  return Array.isArray(value) && value.length === 2 && value.every(isNumber)
}

const TEXT = '必須是非空字串'
const RANGE = '必須是兩個數字的區間，例如 [15, 50]'

/** 驗證匯入的戰鬥腳本是否符合 schema version 1；不符合時一次回報所有錯誤 */
export function validateScript(input: unknown): ValidateScriptResult {
  const errors: ScriptValidationError[] = []
  const report = (path: string, message: string) => {
    // rules[n] 底下的錯誤一併標出規則索引
    const ruleIndex = /^rules\[(\d+)\]/.exec(path)?.[1]
    errors.push(ruleIndex === undefined ? { path, message } : { path, ruleIndex: Number(ruleIndex), message })
  }
  const join = (path: string, key: string) => (path ? `${path}.${key}` : key)

  /** 檢查是否為只含 keys 欄位的物件，並回報缺少的必要欄位 */
  const checkObject = (value: unknown, path: string, keys: string[], required = keys): value is Record<string, unknown> => {
    if (!isRecord(value)) {
      report(path, path ? '必須是物件' : '戰鬥腳本必須是 JSON 物件')
      return false
    }
    for (const key of required) {
      if (value[key] === undefined)
        report(join(path, key), '缺少必要欄位')
    }
    // 打錯的欄位名稱會被靜默忽略（例如條件變成恆成立），所以未知欄位一律視為錯誤
    for (const key of Object.keys(value)) {
      if (!keys.includes(key))
        report(join(path, key), '未知的欄位')
    }
    return true
  }
  /** 有寫的欄位才檢查型別；缺少的必要欄位已由 checkObject 回報 */
  const checkField = (obj: Record<string, unknown>, path: string, key: string, valid: (value: unknown) => boolean, message: string) => {
    if (obj[key] !== undefined && !valid(obj[key]))
      report(join(path, key), message)
  }
  const isTextList = (value: unknown) => Array.isArray(value) && value.every(isText)

  /** 操作建議：有 text 欄位視為純文字，否則視為角色 + 技能名 */
  const checkAdvice = (item: unknown, path: string) => {
    const keys = isRecord(item) && item.text !== undefined ? ['text'] : ['character', 'skill']
    if (checkObject(item, path, keys)) {
      for (const key of keys)
        checkField(item, path, key, isText, TEXT)
    }
  }

  const checkRule = (rule: unknown, path: string) => {
    if (!checkObject(rule, path, ['note', 'when', 'advice']))
      return
    checkField(rule, path, 'note', isText, TEXT)
    const whenPath = `${path}.when`
    if (rule.when !== undefined && checkObject(rule.when, whenPath, ['turn', 'hp', 'gauge', 'omen', 'bossBuff'], [])) {
      checkField(rule.when, whenPath, 'turn', value => isNumber(value) || isRange(value), '必須是數字或兩個數字的區間，例如 3 或 [1, 3]')
      checkField(rule.when, whenPath, 'hp', isRange, RANGE)
      checkField(rule.when, whenPath, 'gauge', isRange, RANGE)
      // 空字串會讓子字串與前綴比對恆成立
      checkField(rule.when, whenPath, 'omen', isText, TEXT)
      checkField(rule.when, whenPath, 'bossBuff', isText, TEXT)
    }
    checkField(rule, path, 'advice', Array.isArray, '必須是陣列')
    if (Array.isArray(rule.advice))
      rule.advice.forEach((item, index) => checkAdvice(item, `${path}.advice[${index}]`))
  }

  if (isRecord(input) && input.version !== undefined && input.version !== 1) {
    // 其他版本的欄位定義不同，只回報版本錯誤
    report('version', `不支援的版本 ${JSON.stringify(input.version)}，只支援 1`)
  }
  else if (checkObject(input, '', ['version', 'name', 'questId', 'battleCount', 'party', 'rules'], ['version', 'name', 'questId', 'rules'])) {
    checkField(input, '', 'name', isText, TEXT)
    checkField(input, '', 'questId', isText, TEXT)
    checkField(input, '', 'battleCount', value => Number.isInteger(value) && (value as number) >= 1, '必須是正整數')
    if (input.party !== undefined && checkObject(input.party, 'party', ['characters', 'summons'])) {
      checkField(input.party, 'party', 'characters', isTextList, '必須是由非空字串組成的陣列')
      checkField(input.party, 'party', 'summons', isTextList, '必須是由非空字串組成的陣列')
    }
    checkField(input, '', 'rules', Array.isArray, '必須是陣列')
    if (Array.isArray(input.rules))
      input.rules.forEach((rule, index) => checkRule(rule, `rules[${index}]`))
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, script: input as BattleScript }
}

/** 與目前戰鬥相符的一份腳本 */
export interface MatchedScript {
  /** 由腳本唯一鍵 questId + name 組成；切換腳本時傳回 selectAdvice 的 selectedScriptKey */
  key: string
  script: BattleScript
}

/** selectAdvice 的結果 */
export interface AdviceSelection {
  /** 與目前戰鬥相符的腳本，保持輸入順序 */
  matchedScripts: MatchedScript[]
  /** 選中的腳本：selectedScriptKey 對應的相符腳本，沒有對應時取第一份；沒有相符腳本時為 undefined */
  selectedScript?: MatchedScript
  /** 選中腳本中目前成立的規則，保持腳本順序 */
  activeRules: BattleScriptRule[]
}

/** 數值是否落在區間內：兩端都包含，端點順序不限；沒有數值時不成立 */
function inRange(value: number | undefined, [a, b]: BattleScriptRange): boolean {
  return value !== undefined && Math.min(a, b) <= value && value <= Math.max(a, b)
}

/** 規則的條件是否全部成立 */
function holds({ turn, hp, gauge, omen, bossBuff }: BattleScriptCondition, snapshot: BattleSnapshot): boolean {
  return (turn === undefined || inRange(snapshot.turn, typeof turn === 'number' ? [turn, turn] : turn))
    && (hp === undefined || inRange(snapshot.hpPercent, hp))
    && (gauge === undefined || inRange(snapshot.gauge, gauge))
    && (omen === undefined || snapshot.omenText.includes(omen))
    && (bossBuff === undefined || snapshot.bossBuffStatuses.some(status => status.startsWith(bossBuff)))
}

/** 從已啟用的腳本中找出與目前戰鬥相符的腳本，並列出選中腳本中成立的規則 */
export function selectAdvice(scripts: BattleScript[], snapshot: BattleSnapshot, selectedScriptKey?: string): AdviceSelection {
  const matchedScripts = scripts
    .filter(script => script.questId === snapshot.questId
      && (script.battleCount === undefined || script.battleCount === snapshot.battleCount))
    .map(script => ({ key: `${script.questId}:${script.name}`, script }))
  const selectedScript = matchedScripts.find(({ key }) => key === selectedScriptKey) ?? matchedScripts[0]
  const activeRules = selectedScript?.script.rules.filter(rule => holds(rule.when, snapshot)) ?? []
  return { matchedScripts, selectedScript, activeRules }
}
