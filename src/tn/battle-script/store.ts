// 戰鬥腳本的儲存：只寫入 tn 自己的 storage key
// 會帶入 chrome API，核心模組與 node:test 測試不可 import 本檔
import type { StoredBattleScript } from 'tn'
import { useWebExtensionStorage } from '~/tn/core/upstream'

/** 已匯入的戰鬥腳本與啟用狀態，依匯入順序排列；增刪改由 manage.ts 的純函式產生新清單 */
export const battleScripts = useWebExtensionStorage<StoredBattleScript[]>('tn:battle-scripts', [])

/** 同關卡有多份相符腳本時使用者選中的腳本（selectAdvice 回傳的 key）；空字串表示沒選過，由 selectAdvice 取第一份 */
export const selectedScriptKey = useWebExtensionStorage<string>('tn:battle-script-selected', '')
