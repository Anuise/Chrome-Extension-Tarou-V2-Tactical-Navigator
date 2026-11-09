// 原始回應錄製器的純函式：判斷要不要錄、歸到哪一場、超過上限時刪哪幾場、匯出時遮罩
// 不依賴 Vue 與 chrome API；chrome.storage 的讀寫在 store.ts
import dayjs from 'dayjs'

/** 錄製的一筆：AJAX 回應原樣保存；WebSocket 訊框的 url 為 WS_URL，responseData 是解析後的訊息 */
export interface RecRecord {
  t: number
  url: string
  requestData?: string | null
  responseData?: unknown
}

/** `tn:rec:index` 的一筆，代表一場；陣列依建立順序排列，也就是開始時間由舊到新 */
export interface RecIndexEntry {
  raidId: string
  /** start.json 的 quest_id；錄到 start.json 之前沒有 */
  questId?: string
  startedAt: number
  /** 最後一次收到這場的資料（含截斷後略過的），用來判斷哪一場是「最近一場」，以及超過上限時先刪哪一場 */
  lastAt: number
  count: number
  bytes: number
  /** 這一場單獨就超過總量上限，之後的資料不再錄 */
  truncated: boolean
}

export interface RecLimits {
  maxRaids: number
  maxBytes: number
}

// 依賴 manifest 的 unlimitedStorage：沒有這個權限時 chrome.storage.local 只有 10 MB 且和 upstream 共用，
// 錄一場就會把配額用完，upstream 的寫入跟著失敗（同步 upstream 時的檢查見 RULES §7）
export const REC_LIMITS: RecLimits = { maxRaids: 3, maxBytes: 50 * 1024 * 1024 }

export const REC_ENABLED_KEY = 'tn:rec:enabled'
export const REC_INDEX_KEY = 'tn:rec:index'
export const WS_URL = 'websocket'

export function recKey(raidId: string, seq: number): string {
  return `tn:rec:${raidId}:${seq}`
}

/** 一場已寫入的全部 key */
export function entryKeys(entry: RecIndexEntry): string[] {
  return Array.from({ length: entry.count }, (_, seq) => recKey(entry.raidId, seq))
}

/** 不限 upstream 有處理的那幾支，戰鬥中的 API 都錄 */
export function isRecordable(url: string): boolean {
  return /\/rest\/(?:raid|multiraid)\//.test(url)
}

/** JSON 字串的 UTF-8 位元組數 */
export function byteLength(record: RecRecord): number {
  return new TextEncoder().encode(JSON.stringify(record)).length
}

/** requestData 的解析結果；不是字串（沒有 requestData，或 jQuery 的 data 是 null）或不是 JSON 時回傳 undefined */
function parseRequestData(requestData: string | null | undefined): unknown {
  if (typeof requestData !== 'string')
    return undefined
  try {
    return JSON.parse(requestData)
  }
  catch {
    return undefined
  }
}

function toRaidId(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0)
    return String(value)
  if (typeof value === 'string' && /^[1-9]\d*$/.test(value))
    return value
  return undefined
}

function raidIdField(value: unknown): string | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? toRaidId((value as Record<string, unknown>).raid_id) : undefined
}

export type RaidIdSource = 'request' | 'response' | 'url'

/**
 * 從一筆紀錄本身判斷 raid_id，依序取：
 * 解析後 requestData 的 raid_id → responseData 的 raid_id → URL 路徑（不含查詢字串）裡第一段 8 位以上的數字。
 * 都取不到回傳 undefined
 */
export function resolveRaidId(record: RecRecord): { raidId: string, source: RaidIdSource } | undefined {
  const fromRequest = raidIdField(parseRequestData(record.requestData))
  if (fromRequest)
    return { raidId: fromRequest, source: 'request' }
  const fromResponse = raidIdField(record.responseData)
  if (fromResponse)
    return { raidId: fromResponse, source: 'response' }
  const path = record.url.split(/[?#]/)[0]
  const fromUrl = path.match(/\/(\d{8,})(?=[/.]|$)/)?.[1]
  if (fromUrl)
    return { raidId: fromUrl, source: 'url' }
  return undefined
}

/**
 * 這筆該歸到哪一場，回傳 undefined 表示不錄（索引是空的）。
 * - requestData、responseData 的 raid_id 可以建立新的一場
 * - URL 路徑取到的數字只能對到索引裡已有的場次：路徑裡的長數字可能是角色 ID 等其他 ID，建新場會把正在錄的場次擠掉
 * - 其他情況歸到最後收到資料的那一場
 */
export function raidIdOf(record: RecRecord, index: readonly RecIndexEntry[]): string | undefined {
  const resolved = resolveRaidId(record)
  if (resolved && (resolved.source !== 'url' || index.some(e => e.raidId === resolved.raidId)))
    return resolved.raidId
  let latest: RecIndexEntry | undefined
  for (const entry of index) {
    if (!latest || entry.lastAt >= latest.lastAt)
      latest = entry
  }
  return latest?.raidId
}

const START_JSON = /\/rest\/(?:raid|multiraid)\/start\.json/

/** start.json 回應的 quest_id */
export function questIdOf(record: RecRecord): string | undefined {
  if (!START_JSON.test(record.url))
    return undefined
  const questId = (record.responseData as Record<string, unknown> | undefined)?.quest_id
  return questId === undefined || questId === null || questId === '' ? undefined : String(questId)
}

export interface AppendPlan {
  index: RecIndexEntry[]
  /** 這筆要寫入的 key；undefined 表示不寫（這場已截斷） */
  key?: string
  /** 要刪掉的場次，呼叫端要刪掉它們的 entryKeys */
  removed: RecIndexEntry[]
}

/**
 * 把一筆加進某一場，回傳新索引、要寫入的 key 與要刪掉的場次；不修改傳入的索引。
 * - 新的一場接在索引最後
 * - 這場已截斷：不寫入
 * - 這場加上這筆會超過 maxBytes：標記截斷，不寫入
 * - 寫入後場數超過 maxRaids 或總量超過 maxBytes：由 lastAt 最小（最久沒收到資料）的一場開始刪，不刪這一場；
 *   lastAt 相同時先刪索引裡排前面（較早開始）的
 */
export function planAppend(
  index: readonly RecIndexEntry[],
  item: { raidId: string, questId?: string, bytes: number, now: number },
  limits: RecLimits,
): AppendPlan {
  const found = index.find(e => e.raidId === item.raidId)
  const entry: RecIndexEntry = found
    ? { ...found }
    : { raidId: item.raidId, startedAt: item.now, lastAt: item.now, count: 0, bytes: 0, truncated: false }
  // 既有的一場維持原本的位置，新的一場接在最後：索引順序一直是開始時間由舊到新
  let list = found ? index.map(e => e === found ? entry : e) : [...index, entry]

  entry.lastAt = item.now
  if (item.questId && !entry.questId)
    entry.questId = item.questId

  let key: string | undefined
  if (!entry.truncated) {
    if (entry.bytes + item.bytes > limits.maxBytes) {
      entry.truncated = true
    }
    else {
      key = recKey(entry.raidId, entry.count)
      entry.count += 1
      entry.bytes += item.bytes
    }
  }

  const removed: RecIndexEntry[] = []
  const total = () => list.reduce((sum, e) => sum + e.bytes, 0)
  while (list.length > limits.maxRaids || total() > limits.maxBytes) {
    const others = list.filter(e => e !== entry)
    // 只剩這一場時，它單獨不會超過 maxBytes（超過的話上面已標記截斷而沒寫入）
    if (others.length === 0)
      break
    const stalest = others.reduce((a, b) => b.lastAt < a.lastAt ? b : a)
    removed.push(stalest)
    list = list.filter(e => e !== stalest)
  }

  return { index: list, key, removed }
}

/** key 去掉 `_`、轉小寫後包含這些字就換成 "***"；viewer_id 和 user_id 是不同的編號體系，不放進代號對照表 */
const MASKED_KEY_PARTS = ['viewerid', 'nickname', 'username', 'userimage']
/** 聊天：分析戰鬥用不到，而且有其他玩家的發言，值整個遮掉；commentData、user_comment 是聊天文字的容器，掛在其他 key 底下時也遮 */
const CHAT_KEYS = new Set(['chatAdd', 'raidPost', 'raidGet', 'commentData', 'user_comment'])
const MASK = '***'

/** ID 欄位表示「沒有」的值：不是個人資料，原樣保留，不編成代號 */
const EMPTY_IDS = new Set<unknown>([0, '', '0'])

/** 玩家 ID 換成代號；同一個匯出檔共用一個，才會同一人同一代號 */
export type IdCoder = (id: string | number) => string

/** 自己的 ID 換成 "self"，其他人依第一次出現的順序換成 "p1"、"p2"…；比對時轉成字串，123 和 "123" 是同一人 */
export function createIdCoder(selfId: string | undefined): IdCoder {
  const codes = new Map<string, string>()
  return (id) => {
    const key = String(id)
    if (key === selfId)
      return 'self'
    let code = codes.get(key)
    if (code === undefined) {
      code = `p${codes.size + 1}`
      codes.set(key, code)
    }
    return code
  }
}

/** 自己的 ID：任一筆紀錄 URL 的 uid= 參數；找不到時用 start.json 回應的 user_id；都沒有回傳 undefined */
export function findSelfId(records: readonly RecRecord[]): string | undefined {
  for (const record of records) {
    const uid = record.url.match(/[?&]uid=([^&#]+)/)?.[1]
    if (uid)
      return uid
  }
  for (const record of records) {
    if (!START_JSON.test(record.url))
      continue
    const userId = (record.responseData as Record<string, unknown> | null | undefined)?.user_id
    if (typeof userId === 'string' || typeof userId === 'number')
      return String(userId)
  }
  return undefined
}

function maskEntry(key: string, value: unknown, code: IdCoder): unknown {
  if (CHAT_KEYS.has(key))
    return MASK
  const normalized = key.replaceAll('_', '').toLowerCase()
  const isId = normalized === 'uid' || normalized.includes('userid')
  if (isId || MASKED_KEY_PARTS.some(part => normalized.includes(part))) {
    // 只換字串與數字：非個人 buff 的 personal_buff_user_id 是 false，換掉會失去「不是個人 buff」這個資訊；
    // ID 欄位的 0、""、"0" 同理，表示「沒有」，原樣保留
    if (typeof value === 'string' || typeof value === 'number')
      return !isId ? MASK : EMPTY_IDS.has(value) ? value : code(value)
    // 值是陣列時逐一套用同一個 key 的規則：字串與數字換掉，物件照舊往下走訪
    if (Array.isArray(value))
      return value.map(item => maskEntry(key, item, code))
  }
  return maskValue(value, code)
}

/**
 * 深層走訪（物件依 key 的順序、深度優先），回傳新物件，不修改傳入的值：
 * - key 去掉 `_`、轉小寫後包含 userid 或等於 uid：值是字串或數字時換成代號；0、""、"0" 原樣保留
 * - key 去掉 `_`、轉小寫後包含 viewerid、nickname、username、userimage：值是字串或數字時換成 "***"
 * - 上面兩種 key 的值是陣列時，陣列裡的字串與數字照同樣規則換掉
 * - key 是 chatAdd、raidPost、raidGet、commentData、user_comment：值整個換成 "***"
 */
export function maskValue(value: unknown, code: IdCoder): unknown {
  if (Array.isArray(value))
    return value.map(item => maskValue(item, code))
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, maskEntry(k, v, code)]))
  return value
}

/** URL 查詢參數 uid、user_id 的值換成代號（空字串與 "0" 原樣保留），viewer_id 換成 "***" */
export function maskUrl(url: string, code: IdCoder): string {
  return url.replace(/([?&])(uid|user_id|viewer_id)=([^&#]*)/g, (_match, sep: string, name: string, id: string) =>
    `${sep}${name}=${name === 'viewer_id' ? MASK : EMPTY_IDS.has(id) ? id : code(id)}`)
}

/** 字串能解析成 JSON 時，解析、處理後再轉回字串；不是 JSON 的字串原樣保留 */
function maskJsonString(text: string, code: IdCoder): string {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  }
  catch {
    return text
  }
  return JSON.stringify(maskValue(parsed, code))
}

/**
 * 匯出用的遮罩：依 URL、requestData、responseData 的順序處理，代號照這個順序編。
 * requestData、responseData 是字串時，能解析成 JSON 就解析、處理後再轉回字串；不是 JSON 的字串（例如 HTML）與 null 原樣保留
 */
export function maskRecord(record: RecRecord, code: IdCoder): RecRecord {
  const url = maskUrl(record.url, code)
  const requestData = typeof record.requestData === 'string' ? maskJsonString(record.requestData, code) : record.requestData
  const responseData = typeof record.responseData === 'string' ? maskJsonString(record.responseData, code) : maskValue(record.responseData, code)
  return { ...record, url, requestData, responseData }
}

/**
 * 匯出一場：檔名為 tn-rec-<raidId>-YYYYMMDD-HHmmss.json（本機時間），
 * 內容是索引資料加上遮罩後的 records，不縮排、結尾換行。
 * 玩家 ID 換成代號：自己是 self，其他人依出現順序（紀錄順序；每筆先 URL、再 requestData、最後 responseData）是 p1、p2…
 */
export function buildExport(entry: RecIndexEntry, records: readonly RecRecord[], now: Date): { name: string, text: string } {
  // 整個檔共用一個 IdCoder，紀錄依序處理，代號才會跨紀錄一致
  const code = createIdCoder(findSelfId(records))
  const data = { ...entry, records: records.map(record => maskRecord(record, code)) }
  return { name: `tn-rec-${entry.raidId}-${dayjs(now).format('YYYYMMDD-HHmmss')}.json`, text: `${JSON.stringify(data)}\n` }
}
