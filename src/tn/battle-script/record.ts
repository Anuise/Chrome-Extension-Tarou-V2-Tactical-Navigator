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
 * 最新一場是否可能還沒打完：最新一場（records[0]）就是 battleInfo 目前的戰鬥，而且 boss HP 還大於 0。
 * upstream 開戰時就把這一場加進 battleRecord，之後每次行動才更新，這時匯出的紀錄只到目前的回合。
 * 全滅、撤退的場次 boss HP 也大於 0，所以只能說「可能」。
 */
export function isLatestBattleOngoing(records: readonly { raid_id: number }[], battleInfo: Partial<BattleInfo>): boolean {
  const latest = records.at(0)
  // battleInfo 是 storage 裡的資料，剛安裝時為空物件，bossInfo 可能不存在
  const bossInfo = battleInfo.bossInfo
  // 與 upstream 相同，raid_id 轉成字串後和 battleId 比對
  return latest !== undefined && bossInfo !== undefined && String(latest.raid_id) === bossInfo.battleId && bossInfo.hp > 0
}
