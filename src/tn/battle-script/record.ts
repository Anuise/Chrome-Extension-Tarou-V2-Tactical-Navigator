// 匯出戰鬥紀錄的純函式：把 upstream 的 battleRecord 原樣組成一個 JSON 檔
// 不依賴 Vue 與 chrome API；battleRecord 由側欄頁經 upstream.ts 唯讀取得後傳入
import type { ScriptFile } from './manage'
import type { BattleInfo } from '~/tn/core/upstream'
import dayjs from 'dayjs'

/**
 * 匯出全部戰鬥紀錄：檔名為 tn-battle-record-YYYYMMDD-HHmmss.json（本機時間），
 * 內容是傳入的紀錄原樣，不篩選、不改順序，縮排 2 格、結尾換行
 */
export function exportBattleRecord(records: readonly unknown[], now: Date): ScriptFile {
  return { name: `tn-battle-record-${dayjs(now).format('YYYYMMDD-HHmmss')}.json`, text: `${JSON.stringify(records, null, 2)}\n` }
}

/**
 * 找出可能還沒打完的目前這場：battleInfo 的 boss HP 大於 0 時，回傳 battleId 相同的那筆紀錄；否則回傳 undefined。
 * upstream 開戰時就把這一場加進 battleRecord，之後每次行動才更新，這時匯出的紀錄只到進行中的回合。
 * 和 upstream 一樣用 find 找目前這場：回到已有紀錄的戰鬥時，upstream 不會把它移到最前面。
 * 只能盡力而為，boss HP 不一定反映戰鬥有沒有結束：
 * - 全滅、撤退，以及多人戰由別人擊倒卻沒收到 battleFinish 時，HP 仍大於 0，會被當成還在打
 * - 多隻敵人時，upstream 擊倒任何一隻都會把 HP 設成 0，要等 0 號位的 HP 再更新才會改回來；
 *   0 號位先倒下時，可能整場剩下的回合都不會被當成還在打
 * 改這裡的判斷或上面的說明時，要同步改 07 票（.scratch/battle-script/issues/07-export-battle-record.md）的「戰鬥中匯出的判斷」
 */
export function findOngoingRecord<T extends { raid_id: number }>(records: readonly T[], battleInfo: Partial<BattleInfo>): T | undefined {
  // battleInfo 是 storage 裡的資料：剛安裝時為空物件，沒有 bossInfo；舊資料可能沒有 hp
  const bossInfo = battleInfo.bossInfo
  // 與 upstream 相同，raid_id 轉成字串後和 battleId 比對
  return bossInfo && bossInfo.hp > 0 ? records.find(r => String(r.raid_id) === bossInfo.battleId) : undefined
}
