// 原始回應錄製器的純函式：判斷要不要錄、歸到哪一場、超過上限時刪哪幾場、匯出時遮罩
// 不依賴 Vue 與 chrome API；chrome.storage 的讀寫在 store.ts
import dayjs from 'dayjs'

/** 錄製的一筆：AJAX 回應原樣保存；WebSocket 訊框的 url 為 WS_URL，responseData 是解析後的訊息 */
export interface RecRecord {
  t: number
  url: string
  requestData?: unknown
  responseData?: unknown
}

/** `tn:rec:index` 的一筆，代表一場；陣列依建立順序排列，也就是開始時間由舊到新 */
export interface RecIndexEntry {
  raidId: string
  /** start.json 的 quest_id；錄到 start.json 之前沒有 */
  questId?: string
  startedAt: number
  /** 最後一次收到這場的資料（含截斷後略過的），用來判斷哪一場是「最近一場」 */
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

/** requestData 是 JSON 字串時回傳解析結果，否則原樣回傳；解析失敗回傳 undefined */
function parseRequestData(requestData: unknown): unknown {
  if (typeof requestData !== 'string')
    return requestData
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

/** 這筆該歸到哪一場：紀錄本身判斷不出來時，歸到最後收到資料的那一場；索引是空的回傳 undefined */
export function raidIdOf(record: RecRecord, index: readonly RecIndexEntry[]): string | undefined {
  const resolved = resolveRaidId(record)?.raidId
  if (resolved)
    return resolved
  let latest: RecIndexEntry | undefined
  for (const entry of index) {
    if (!latest || entry.lastAt >= latest.lastAt)
      latest = entry
  }
  return latest?.raidId
}

/** start.json 回應的 quest_id */
export function questIdOf(record: RecRecord): string | undefined {
  if (!/\/rest\/(?:raid|multiraid)\/start\.json/.test(record.url))
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
 * - 寫入後場數超過 maxRaids 或總量超過 maxBytes：由最舊的一場開始刪，不刪這一場
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
    const oldest = list.find(e => e !== entry)
    // 只剩這一場時，它單獨不會超過 maxBytes（超過的話上面已標記截斷而沒寫入）
    if (!oldest)
      break
    removed.push(oldest)
    list = list.filter(e => e !== oldest)
  }

  return { index: list, key, removed }
}

const MASKED_KEYS = new Set(['user_id', 'viewer_id', 'nickname'])
const MASK = '***'

/** 深層走訪，key 是 user_id、viewer_id、nickname 的值換成 "***"；回傳新物件，不修改傳入的值 */
export function maskValue(value: unknown): unknown {
  if (Array.isArray(value))
    return value.map(maskValue)
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, MASKED_KEYS.has(k) ? MASK : maskValue(v)]))
  return value
}

/** URL 查詢參數 uid 的值換成 "***" */
export function maskUrl(url: string): string {
  return url.replace(/([?&]uid=)[^&#]*/g, `$1${MASK}`)
}

/** 匯出用的遮罩：requestData 是 JSON 字串時解析後遮罩再轉回字串，不是 JSON 的字串原樣保留 */
export function maskRecord(record: RecRecord): RecRecord {
  let requestData = record.requestData
  if (typeof requestData === 'string') {
    try {
      requestData = JSON.stringify(maskValue(JSON.parse(requestData)))
    }
    catch {}
  }
  else {
    requestData = maskValue(requestData)
  }
  return { ...record, url: maskUrl(record.url), requestData, responseData: maskValue(record.responseData) }
}

/**
 * 匯出一場：檔名為 tn-rec-<raidId>-YYYYMMDD-HHmmss.json（本機時間），
 * 內容是索引資料加上遮罩後的 records，不縮排、結尾換行
 */
export function buildExport(entry: RecIndexEntry, records: readonly RecRecord[], now: Date): { name: string, text: string } {
  const data = { ...entry, records: records.map(maskRecord) }
  return { name: `tn-rec-${entry.raidId}-${dayjs(now).format('YYYYMMDD-HHmmss')}.json`, text: `${JSON.stringify(data)}\n` }
}
