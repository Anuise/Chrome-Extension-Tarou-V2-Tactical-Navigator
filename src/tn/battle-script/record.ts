// 匯出戰鬥紀錄的純函式：把 upstream 的 battleRecord 原樣組成一個 JSON 檔
// 不依賴 Vue 與 chrome API；battleRecord 由側欄頁經 upstream.ts 唯讀取得後傳入
import type { ScriptFile } from './manage'
import dayjs from 'dayjs'

/**
 * 匯出全部戰鬥紀錄：檔名為 tn-battle-record-YYYYMMDD-HHmmss.json（本機時間），
 * 內容是傳入的紀錄原樣，不篩選、不改順序，縮排 2 格、結尾換行
 */
export function exportBattleRecord(records: readonly unknown[], now: Date): ScriptFile {
  return { name: `tn-battle-record-${dayjs(now).format('YYYYMMDD-HHmmss')}.json`, text: `${JSON.stringify(records, null, 2)}\n` }
}
