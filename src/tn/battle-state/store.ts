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

chrome.storage.local.get(BATTLE_STATE_KEY).then(items => battleState.value = parse(items[BATTLE_STATE_KEY]))
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes[BATTLE_STATE_KEY])
    battleState.value = parse(changes[BATTLE_STATE_KEY].newValue)
})
