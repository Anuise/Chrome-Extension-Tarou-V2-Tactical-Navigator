// 戰鬥狀態的寫入端：在 background 由 tnUnpack 呼叫，解析回應後寫進 tn:battle-state
import type { BattleState } from 'tn'
import type { TnParcel } from '~/tn/core/dispatch'
import { classifyUrl, reduceBattleState } from './parse'

export const BATTLE_STATE_KEY = 'tn:battle-state'

// 寫入串成佇列，前一筆寫完才處理下一筆。每一筆都從 storage 讀出最新的值再寫回，
// 不把狀態放在記憶體，因為 service worker 閒置時會被關掉
let queue: Promise<void> = Promise.resolve()

async function update(parcel: TnParcel): Promise<void> {
  const stored = (await chrome.storage.local.get(BATTLE_STATE_KEY))[BATTLE_STATE_KEY]
  // 與 useWebExtensionStorage 的物件格式相同（JSON 字串），側欄頁可以直接用它讀
  const state = typeof stored === 'string' ? JSON.parse(stored) as BattleState : null
  const next = reduceBattleState(state, parcel)
  if (next !== state)
    await chrome.storage.local.set({ [BATTLE_STATE_KEY]: JSON.stringify(next) })
}

/** tnUnpack 的 handler：與戰鬥狀態無關的回應直接略過；回傳佇列的尾端，測試用來等待寫入完成 */
export function handleBattleState(parcel: TnParcel): Promise<void> {
  if (classifyUrl(parcel.url)) {
    queue = queue
      .then(() => update(parcel))
      .catch(error => console.error('[tn] 戰鬥狀態更新失敗', error))
  }
  return queue
}
