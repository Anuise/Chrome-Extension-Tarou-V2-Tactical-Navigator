// 錄製器的 chrome.storage 讀寫：background 錄製、側欄頁清除與匯出都用這裡
// 錄製資料直接用 chrome.storage.local，不用 useWebExtensionStorage（它每次變動都把整個值重寫）
// 只被動接收遊戲自己發出的請求的回應，絕不主動發請求（RULES §5）
// 模組頂層不可呼叫 chrome API（dispatch.test.ts 會經 dispatch.ts 間接 import 本檔）
import type { RecIndexEntry, RecRecord } from './core'
import type { TnParcel } from '~/tn/core/dispatch'
import { byteLength, entryKeys, isRecordable, planAppend, questIdOf, raidIdOf, REC_ENABLED_KEY, REC_INDEX_KEY, REC_LIMITS, WS_URL } from './core'

const LOCK = 'tn:rec'
let queue: Promise<unknown> = Promise.resolve()

/**
 * 寫入串成一條佇列，避免序號互相覆蓋。
 * 每個工作再取同名的 Web Lock：側欄頁的「全部清除」也取這把鎖，才不會在 background 讀完索引、還沒寫回時清掉
 */
function enqueue(task: () => Promise<void>): Promise<void> {
  const run = queue.then(() => navigator.locks.request(LOCK, task))
  queue = run.catch(error => console.error('[tn] 錄製寫入失敗', error))
  return run
}

/** 讀出索引；狀態一律從 storage 讀，service worker 被關掉重開後照樣接上 */
export async function loadIndex(): Promise<RecIndexEntry[]> {
  const stored = await chrome.storage.local.get(REC_INDEX_KEY)
  return (stored[REC_INDEX_KEY] as RecIndexEntry[] | undefined) ?? []
}

function append(record: RecRecord): void {
  // 失敗已在 enqueue 印出
  enqueue(async () => {
    const stored = await chrome.storage.local.get([REC_ENABLED_KEY, REC_INDEX_KEY])
    // 側欄頁以 useWebExtensionStorage 存這個開關，布林值會序列化成字串 'true'／'false'
    if (stored[REC_ENABLED_KEY] !== 'true')
      return
    const index = (stored[REC_INDEX_KEY] as RecIndexEntry[] | undefined) ?? []
    const raidId = raidIdOf(record, index)
    if (!raidId)
      return
    const plan = planAppend(index, { raidId, questId: questIdOf(record), bytes: byteLength(record), now: record.t }, REC_LIMITS)
    // 紀錄與索引同一次寫入；先寫新索引再刪舊場，中途被關掉頂多留下沒被索引指到的舊紀錄
    await chrome.storage.local.set(plan.key ? { [plan.key]: record, [REC_INDEX_KEY]: plan.index } : { [REC_INDEX_KEY]: plan.index })
    if (plan.removed.length > 0)
      await chrome.storage.local.remove(plan.removed.flatMap(entryKeys))
  }).catch(() => {})
}

/** dispatch.ts 的 handler：戰鬥中的 AJAX 回應原樣錄下 */
export function recordParcel(parcel: TnParcel): void {
  if (!isRecordable(parcel.url))
    return
  append({ t: Date.now(), url: parcel.url, requestData: parcel.requestData, responseData: parcel.responseData })
}

/**
 * 被動錄下 WebSocket 訊框（payload 以 42 開頭），歸到最近一場。
 * debugger 由 upstream 在側欄開著時掛上，這裡只監聽事件，不 attach、不送指令
 */
export function setupRecorderWebSocket(): void {
  chrome.debugger.onEvent.addListener((_source, method, params) => {
    try {
      if (method !== 'Network.webSocketFrameReceived')
        return
      const payload = (params as { response?: { payloadData?: unknown } } | undefined)?.response?.payloadData
      if (typeof payload !== 'string' || !payload.startsWith('42'))
        return
      append({ t: Date.now(), url: WS_URL, responseData: JSON.parse(payload.slice(2)) })
    }
    catch (error) {
      console.error('[tn] WebSocket 訊框錄製失敗', error)
    }
  })
}

/** 讀出一場的全部紀錄；讀不到的序號略過 */
export async function loadRecords(entry: RecIndexEntry): Promise<RecRecord[]> {
  const keys = entryKeys(entry)
  const stored = await chrome.storage.local.get(keys)
  return keys.map(key => stored[key] as RecRecord | undefined).filter(record => record !== undefined)
}

/** 刪掉全部錄製資料與索引（保留開關）；連沒被索引指到的殘留紀錄一起刪 */
export function clearRecordings(): Promise<void> {
  return enqueue(async () => {
    const keys = Object.keys(await chrome.storage.local.get(null)).filter(key => key.startsWith('tn:rec:') && key !== REC_ENABLED_KEY)
    await chrome.storage.local.remove(keys)
  })
}
