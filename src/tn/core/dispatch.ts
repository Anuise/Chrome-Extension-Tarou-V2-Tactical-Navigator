import { recordParcel, setupRecorderWebSocket } from '~/tn/recorder/store'

/** 內容腳本送來的 AJAX 回應，結構與 upstream `unpack` 解析的物件相同 */
export interface TnParcel {
  url: string
  /** jQuery 的 settings.data：POST 是字串；GET 時 jQuery 併進 URL 後刪掉，這個欄位不存在；有些請求是 null */
  requestData?: string | null
  responseData?: unknown
}

/** 回傳 Promise 時，rejection 由 dispatchParcel 接住並印 log */
export type TnHandler = (parcel: TnParcel) => void | Promise<void>

/**
 * 解析 parcel 並依序交給每個 handler。
 * parcel 不是字串就忽略；JSON 壞掉、handler 丟錯或回傳的 Promise reject 都只印 log，絕不往外丟錯。
 */
export function dispatchParcel(parcel: unknown, handlers: TnHandler[]): void {
  if (typeof parcel !== 'string')
    return

  let parsed: TnParcel
  try {
    parsed = JSON.parse(parcel) as TnParcel
  }
  catch (error) {
    console.error('[tn] parcel 解析失敗', error)
    return
  }

  for (const handler of handlers) {
    try {
      const result = handler(parsed)
      if (result instanceof Promise)
        result.catch(error => console.error('[tn] handler 執行失敗', error))
    }
    catch (error) {
      console.error('[tn] handler 執行失敗', error)
    }
  }
}

// 後續票各在這裡加一個 import 和一個項目
// handler 不可修改傳入的 parcel：同一個物件會交給每個 handler，錄製器會延後寫入
// 每個 AJAX 回應（不只戰鬥）都會呼叫每個 handler，請先用 URL 過濾，同步部分要快
const handlers: TnHandler[] = [
  recordParcel,
]

/** 掛在 background 的 `onMessage('express')` 裡，緊接在 upstream `unpack` 之後（RULES §3） */
export function tnUnpack(parcel: unknown): void {
  dispatchParcel(parcel, handlers)
}

// 後續票各在這裡加一個 import 和一個項目
const setups: (() => void)[] = [
  setupRecorderWebSocket,
]

/**
 * tn 的 Chrome 原生事件監聽（`chrome.webRequest`、`chrome.contextMenus` 等）都放這裡（RULES §3）。
 * 每個 setup 都要同步註冊監聽，不可 await；丟錯只會印 log，不影響 upstream 與其他 setup
 */
export function setupTnBackground(): void {
  for (const setup of setups) {
    try {
      setup()
    }
    catch (error) {
      console.error('[tn] setup 執行失敗', error)
    }
  }
}
