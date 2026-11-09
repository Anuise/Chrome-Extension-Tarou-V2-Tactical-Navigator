// 戰鬥狀態的讀取端：側欄頁用。會帶入 chrome API，純函式與 node:test 測試不可 import 本檔
import type { BattleState } from 'tn'
import { shallowRef } from 'vue'
import { BATTLE_STATE_KEY } from './background'

function parse(raw: unknown): BattleState | null {
  return typeof raw === 'string' ? JSON.parse(raw) as BattleState : null
}

/**
 * tn:battle-state 的唯讀 ref。只有 background 的寫入佇列可以寫這個 key，
 * 所以不用 useWebExtensionStorage：它讀到值後會原樣寫回一次，可能蓋掉 background 剛寫入的新狀態
 */
export const battleState = shallowRef<BattleState | null>(null)

// onChanged 先收到新狀態時，晚回來的 get 是舊快照，不可蓋掉（同錄製頁的做法）
let changed = false
chrome.storage.local.get(BATTLE_STATE_KEY)
  .then((items) => {
    if (!changed)
      battleState.value = parse(items[BATTLE_STATE_KEY])
  })
  .catch(error => console.error('[tn] 讀取戰鬥狀態失敗', error))
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes[BATTLE_STATE_KEY]) {
    changed = true
    battleState.value = parse(changes[BATTLE_STATE_KEY].newValue)
  }
})
