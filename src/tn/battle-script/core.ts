// 戰鬥腳本核心模組：純 TypeScript，不依賴 Vue、chrome API 與 upstream 型別

/** 規則比對的輸入：目前的戰鬥狀態，由側欄頁從 upstream 的 battleInfo 轉換而來 */
export interface BattleSnapshot {
  /** 沒有任何戰鬥資料（視為不在戰鬥中）時為 undefined */
  questId?: string
  /** 多段戰的第幾場 */
  battleCount: number
  turn?: number
  /** boss HP 百分比（0–100） */
  hpPercent?: number
  /** boss 獨有計量條，例如破壞之力；boss 沒有時為 undefined */
  gauge?: number
  /** 預兆文字，多個預兆以 `|` 連接；沒有預兆時為空字串 */
  omenText: string
  /** boss 身上所有 buff 與 debuff 的 status，例如 `4052_1` */
  bossBuffStatuses: string[]
}
