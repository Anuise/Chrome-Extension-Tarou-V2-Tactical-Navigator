import { handleBattleState } from '~/tn/battle-state/background'
import { recordParcel, setupRecorderWebSocket } from '~/tn/recorder/store'

/** 內容腳本送來的 AJAX 回應，結構與 upstream `unpack` 解析的物件相同 */
export interface TnParcel {
  url: string
  requestData?: string
  responseData?: unknown
}

/**
 * 解析 parcel 並依序交給每個 handler。
 * parcel 不是字串就忽略；JSON 壞掉或 handler 丟錯都只印 log，絕不往外丟錯。
 */
export function dispatchParcel(parcel: unknown, handlers: ((parcel: TnParcel) => void)[]): void {
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
      handler(parsed)
    }
    catch (error) {
      console.error('[tn] handler 執行失敗', error)
    }
  }
}

// 後續票各在這裡加一個 import 和一個項目
const handlers: ((parcel: TnParcel) => void)[] = [
  recordParcel,
  handleBattleState,
]

/** 掛在 background 的 `onMessage('express')` 裡，緊接在 upstream `unpack` 之後（RULES §3） */
export function tnUnpack(parcel: unknown): void {
  dispatchParcel(parcel, handlers)
}

/** tn 的 Chrome 原生事件監聽（`chrome.webRequest`、`chrome.contextMenus` 等）都放這裡（RULES §3） */
export function setupTnBackground(): void {
  setupRecorderWebSocket()
}
