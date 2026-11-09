// 戰鬥腳本核心模組：純 TypeScript，不依賴 Vue、chrome API 與 upstream 型別
import type {
  BattleScript,
  BattleScriptAbilityCondition,
  BattleScriptAllyCondition,
  BattleScriptCondition,
  BattleScriptLastTurnCondition,
  BattleScriptRange,
  BattleScriptRule,
  BattleScriptSummonCondition,
} from 'tn'

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
  /** 我方角色，依 start.json player.param 的順序（含後排）；沒有資料時為空陣列 */
  allies: SnapshotAlly[]
  /** 召喚石（主召、副召、好友）；沒有資料時為空陣列 */
  summons: SnapshotSummon[]
  /** 連鎖條（DC）百分比；沒有資料時為 undefined */
  chain?: number
  /** 本場是否發動過連鎖技能 */
  chainUsed: boolean
  /** 每回合一筆，依回合遞增；最後一筆是目前回合 */
  history: SnapshotTurn[]
}

export interface SnapshotAlly {
  /** pid 底線前的部分；角色是角色 ID（例：尤妮 3040390000） */
  id: string
  /** 主角 */
  isLeader: boolean
  /** 在前排 */
  front: boolean
  dead: boolean
  hp?: number
  hpMax?: number
  /** buff 與 debuff；remain 只有拿得到剩餘回合時才有 */
  buffs: { status: string, remain?: number }[]
  abilities: SnapshotAbility[]
}

export interface SnapshotAbility {
  /** 技能格，1 起算 */
  slot: number
  abilityId: string
  /** 能不能按；不知道時 undefined */
  ready?: boolean
  /** 剩餘冷卻回合；不知道時 undefined */
  recast?: number
  /** 本場用過幾次 */
  used: number
}

export interface SnapshotSummon {
  from: 'main' | 'sub' | 'friend'
  /** 召喚石 ID，例：宙斯 2040080000 */
  id: string
  ready?: boolean
  recast?: number
  /** 本場召喚過幾次 */
  used: number
}

export interface SnapshotTurn {
  turn: number
  /** 回合開始時的 boss HP%；不知道時 undefined */
  hpAtStart?: number
  /** 回合開始時的預兆文字（多個以 `|` 連接，沒有為空字串） */
  omenText: string
  /** 回合開始時的 boss buff；tn 沒記到時 undefined */
  bossBuffStatuses?: string[]
  /** 這回合防禦的角色 id */
  guards: string[]
  /** 這回合依序做的事；type 沿用 upstream：ability、fc、summon、attack、temporary… */
  actions: { type: string, id?: string }[]
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

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

/** omen 裡代表「這裡是一個數字」的記號 */
const OMEN_NUMBER = '{n}'

// validateScript 共用的錯誤說明
const INVALID_TEXT_MESSAGE = '必須是非空字串'
const INVALID_RANGE_MESSAGE = '必須是兩個數字的區間，例如 [15, 50]'
const INVALID_BOOLEAN_MESSAGE = '必須是 true 或 false'

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
        checkField(item, path, key, isText, INVALID_TEXT_MESSAGE)
    }
  }

  /** 可以寫成單一物件或陣列的條件；陣列的每一項以 `[i]` 標出路徑 */
  const checkOneOrMany = (value: unknown, path: string, check: (item: unknown, path: string) => void) => {
    if (!Array.isArray(value))
      return check(value, path)
    // 空陣列恆成立，被 not 包住時就恆不成立
    if (value.length === 0)
      report(path, '至少要有一項')
    value.forEach((item, index) => check(item, `${path}[${index}]`))
  }

  const checkAlly = (ally: unknown, path: string) => {
    if (!checkObject(ally, path, ['who', 'buff', 'stack', 'remain', 'dead', 'front'], ['who']))
      return
    checkField(ally, path, 'who', isText, INVALID_TEXT_MESSAGE)
    checkField(ally, path, 'buff', isText, INVALID_TEXT_MESSAGE)
    for (const key of ['stack', 'remain']) {
      checkField(ally, path, key, isRange, INVALID_RANGE_MESSAGE)
      // 層數與剩餘回合都是對 buff 指定的那個 buff 比對
      if (ally[key] !== undefined && ally.buff === undefined)
        report(join(path, key), '必須和 buff 一起寫')
    }
    checkField(ally, path, 'dead', isBoolean, INVALID_BOOLEAN_MESSAGE)
    checkField(ally, path, 'front', isBoolean, INVALID_BOOLEAN_MESSAGE)
  }

  /** ability 與 summon 共用的 ready、recast、used */
  const checkUsage = (obj: Record<string, unknown>, path: string) => {
    checkField(obj, path, 'ready', isBoolean, INVALID_BOOLEAN_MESSAGE)
    checkField(obj, path, 'recast', isRange, INVALID_RANGE_MESSAGE)
    checkField(obj, path, 'used', isRange, INVALID_RANGE_MESSAGE)
  }

  const checkAbility = (ability: unknown, path: string) => {
    if (!checkObject(ability, path, ['who', 'slot', 'ready', 'recast', 'used'], ['who', 'slot']))
      return
    checkField(ability, path, 'who', isText, INVALID_TEXT_MESSAGE)
    checkField(ability, path, 'slot', value => Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 4, '必須是 1–4 的整數')
    checkUsage(ability, path)
  }

  const checkSummon = (summon: unknown, path: string) => {
    if (!checkObject(summon, path, ['id', 'from', 'ready', 'recast', 'used'], ['id']))
      return
    checkField(summon, path, 'id', isText, INVALID_TEXT_MESSAGE)
    checkField(summon, path, 'from', value => ['main', 'sub', 'friend'].includes(value as string), '必須是 "main"、"sub" 或 "friend"')
    checkUsage(summon, path)
  }

  const checkLastTurn = (lastTurn: unknown, path: string) => {
    if (!checkObject(lastTurn, path, ['fc', 'guard', 'attack', 'omen'], []))
      return
    // 空物件會變成「有上一回合就成立」，看起來像沒寫完
    if (Object.keys(lastTurn).length === 0)
      report(path, '至少要寫一個欄位')
    checkField(lastTurn, path, 'fc', isBoolean, INVALID_BOOLEAN_MESSAGE)
    for (const key of ['guard', 'attack', 'omen'])
      checkField(lastTurn, path, key, isText, INVALID_TEXT_MESSAGE)
  }

  const checkCondition = (when: unknown, path: string) => {
    const keys = ['turn', 'hp', 'gauge', 'omen', 'omenNum', 'bossBuff', 'not', 'ally', 'ability', 'summon', 'chain', 'chainUsed', 'lastTurn', 'seenOmen', 'turnStartHp']
    if (!checkObject(when, path, keys, []))
      return
    checkField(when, path, 'turn', value => isNumber(value) || isRange(value), '必須是數字或兩個數字的區間，例如 3 或 [1, 3]')
    checkField(when, path, 'hp', isRange, INVALID_RANGE_MESSAGE)
    checkField(when, path, 'gauge', isRange, INVALID_RANGE_MESSAGE)
    // 空字串會讓子字串與前綴比對恆成立
    checkField(when, path, 'omen', isText, INVALID_TEXT_MESSAGE)
    if (isText(when.omen) && when.omen.split(OMEN_NUMBER).length > 2)
      report(join(path, 'omen'), `只能有一個 ${OMEN_NUMBER}`)
    checkField(when, path, 'omenNum', isRange, INVALID_RANGE_MESSAGE)
    if (when.omenNum !== undefined && !(isText(when.omen) && when.omen.includes(OMEN_NUMBER)))
      report(join(path, 'omenNum'), `必須和含 ${OMEN_NUMBER} 的 omen 一起寫`)
    checkField(when, path, 'bossBuff', isText, INVALID_TEXT_MESSAGE)
    if (when.not !== undefined) {
      // 空物件恆成立，加上 not 之後恆不成立，幾乎一定是寫錯
      if (isRecord(when.not) && Object.keys(when.not).length === 0)
        report(join(path, 'not'), '不能是空物件')
      else
        checkCondition(when.not, join(path, 'not'))
    }
    if (when.ally !== undefined)
      checkOneOrMany(when.ally, join(path, 'ally'), checkAlly)
    if (when.ability !== undefined)
      checkOneOrMany(when.ability, join(path, 'ability'), checkAbility)
    if (when.summon !== undefined)
      checkOneOrMany(when.summon, join(path, 'summon'), checkSummon)
    checkField(when, path, 'chain', isRange, INVALID_RANGE_MESSAGE)
    checkField(when, path, 'chainUsed', isBoolean, INVALID_BOOLEAN_MESSAGE)
    if (when.lastTurn !== undefined)
      checkLastTurn(when.lastTurn, join(path, 'lastTurn'))
    checkField(when, path, 'seenOmen', isText, INVALID_TEXT_MESSAGE)
    checkField(when, path, 'turnStartHp', isRange, INVALID_RANGE_MESSAGE)
  }

  const checkRule = (rule: unknown, path: string) => {
    if (!checkObject(rule, path, ['note', 'when', 'advice']))
      return
    checkField(rule, path, 'note', isText, INVALID_TEXT_MESSAGE)
    if (rule.when !== undefined)
      checkCondition(rule.when, `${path}.when`)
    checkField(rule, path, 'advice', Array.isArray, '必須是陣列')
    if (Array.isArray(rule.advice))
      rule.advice.forEach((item, index) => checkAdvice(item, `${path}.advice[${index}]`))
  }

  if (isRecord(input) && input.version !== undefined && input.version !== 1) {
    // 其他版本的欄位定義不同，只回報版本錯誤
    report('version', `不支援的版本 ${JSON.stringify(input.version)}，只支援 1`)
  }
  else if (checkObject(input, '', ['version', 'name', 'questId', 'battleCount', 'party', 'rules'], ['version', 'name', 'questId', 'rules'])) {
    checkField(input, '', 'name', isText, INVALID_TEXT_MESSAGE)
    checkField(input, '', 'questId', isText, INVALID_TEXT_MESSAGE)
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

/** 正規表示式的特殊字元照字面跳脫 */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * omen 是否成立：沒有 `{n}` 時是整串預兆的子字串比對；
 * 有 `{n}` 時對以 `|` 分開的每一段比對格式，任一段符合、且取到的數字落在 omenNum（有寫的話）內即成立
 */
function omenHolds(omen: string, omenNum: BattleScriptRange | undefined, omenText: string): boolean {
  if (!omen.includes(OMEN_NUMBER))
    return omenText.includes(omen)
  const [before, after] = omen.split(OMEN_NUMBER)
  const pattern = new RegExp(`${escapeRegExp(before)}(\\d[\\d,]*)${escapeRegExp(after)}`)
  return omenText.split('|').some((segment) => {
    const digits = pattern.exec(segment)?.[1]
    return digits !== undefined && (omenNum === undefined || inRange(Number(digits.replaceAll(',', '')), omenNum))
  })
}

/** who 對到的角色：`"主角"` 對到主角，其他字串對到角色 ID */
function findAlly(allies: SnapshotAlly[], who: string): SnapshotAlly | undefined {
  return allies.find(ally => (who === '主角' ? ally.isLeader : ally.id === who))
}

/** buff 的層數：status 去掉 buff 前綴與開頭的一個 `_` 之後，開頭的連續數字；取不到時為 undefined */
function buffStack(status: string, buff: string): number | undefined {
  const digits = /^_?(\d+)/.exec(status.slice(buff.length))?.[1]
  return digits === undefined ? undefined : Number(digits)
}

function allyHolds({ who, buff, stack, remain, dead, front }: BattleScriptAllyCondition, allies: SnapshotAlly[]): boolean {
  const ally = findAlly(allies, who)
  return ally !== undefined
    && (dead === undefined || ally.dead === dead)
    && (front === undefined || ally.front === front)
    // stack 與 remain 必須由同一個 buff 滿足
    && (buff === undefined || ally.buffs.some(item => item.status.startsWith(buff)
      && (stack === undefined || inRange(buffStack(item.status, buff), stack))
      && (remain === undefined || inRange(item.remain, remain))))
}

/** ability 與 summon 共用的 ready、recast、used；snapshot 的 ready 是 undefined 時，寫了 ready 就不成立 */
function usageHolds(
  target: Pick<SnapshotAbility, 'ready' | 'recast' | 'used'>,
  { ready, recast, used }: Pick<BattleScriptAbilityCondition, 'ready' | 'recast' | 'used'>,
): boolean {
  return (ready === undefined || target.ready === ready)
    && (recast === undefined || inRange(target.recast, recast))
    && (used === undefined || inRange(target.used, used))
}

function abilityHolds({ who, slot, ...usage }: BattleScriptAbilityCondition, allies: SnapshotAlly[]): boolean {
  const ability = findAlly(allies, who)?.abilities.find(item => item.slot === slot)
  return ability !== undefined && usageHolds(ability, usage)
}

function summonHolds({ id, from, ...usage }: BattleScriptSummonCondition, summons: SnapshotSummon[]): boolean {
  // 主召與好友可能是同一張召喚石：任一張滿足全部有寫的欄位即成立
  return summons.some(summon => summon.id === id && (from === undefined || summon.from === from) && usageHolds(summon, usage))
}

function lastTurnHolds({ fc, guard, attack, omen }: BattleScriptLastTurnCondition, { allies, history }: BattleSnapshot): boolean {
  const previous = history.at(-2)
  if (previous === undefined)
    return false
  /** who 在上一回合有沒有防禦；對不到角色時為 undefined */
  const guarded = (who: string) => {
    const id = findAlly(allies, who)?.id
    return id === undefined ? undefined : previous.guards.includes(id)
  }
  return (fc === undefined || previous.actions.some(action => action.type === 'fc') === fc)
    && (guard === undefined || guarded(guard) === true)
    && (attack === undefined || (previous.actions.some(action => action.type === 'attack') && guarded(attack) === false))
    && (omen === undefined || previous.omenText.includes(omen))
}

/** 規則的條件是否全部成立 */
function holds(
  { turn, hp, gauge, omen, omenNum, bossBuff, not, ally, ability, summon, chain, chainUsed, lastTurn, seenOmen, turnStartHp }: BattleScriptCondition,
  snapshot: BattleSnapshot,
): boolean {
  return (turn === undefined || inRange(snapshot.turn, typeof turn === 'number' ? [turn, turn] : turn))
    && (hp === undefined || inRange(snapshot.hpPercent, hp))
    && (gauge === undefined || inRange(snapshot.gauge, gauge))
    && (omen === undefined || omenHolds(omen, omenNum, snapshot.omenText))
    && (bossBuff === undefined || snapshot.bossBuffStatuses.some(status => status.startsWith(bossBuff)))
    && (not === undefined || !holds(not, snapshot))
    && (ally === undefined || [ally].flat().every(item => allyHolds(item, snapshot.allies)))
    && (ability === undefined || [ability].flat().every(item => abilityHolds(item, snapshot.allies)))
    && (summon === undefined || [summon].flat().every(item => summonHolds(item, snapshot.summons)))
    && (chain === undefined || inRange(snapshot.chain, chain))
    && (chainUsed === undefined || snapshot.chainUsed === chainUsed)
    && (lastTurn === undefined || lastTurnHolds(lastTurn, snapshot))
    && (seenOmen === undefined || [...snapshot.history.map(item => item.omenText), snapshot.omenText].some(text => text.includes(seenOmen)))
    && (turnStartHp === undefined || inRange(snapshot.history.at(-1)?.hpAtStart, turnStartHp))
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
