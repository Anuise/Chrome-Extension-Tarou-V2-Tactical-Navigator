// 戰鬥腳本的儲存：只寫入 tn 自己的 storage key `tn:battle-scripts`
// 會帶入 chrome API，核心模組與 node:test 測試不可 import 本檔
import type { BattleScript, StoredBattleScript } from 'tn'
import { useWebExtensionStorage } from '~/tn/core/upstream'

/** 已匯入的戰鬥腳本與啟用狀態，依匯入順序排列 */
export const battleScripts = useWebExtensionStorage<StoredBattleScript[]>('tn:battle-scripts', [])

/** 保存一份已通過 validateScript 的腳本並啟用；同關卡同名（questId + name）的舊版直接覆蓋 */
export function saveScript(script: BattleScript) {
  const stored = { enabled: true, script }
  const index = battleScripts.value.findIndex(s => s.script.questId === script.questId && s.script.name === script.name)
  if (index === -1)
    battleScripts.value.push(stored)
  else
    battleScripts.value[index] = stored
}
