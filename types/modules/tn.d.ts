declare module 'tn' {
  /** 數字區間：兩端都包含，端點順序不限（`[50, 15]` 與 `[15, 50]` 相同） */
  type BattleScriptRange = [number, number]

  /** 規則的條件：每個欄位都可省略，寫了的全部成立才算成立；空物件恆成立 */
  interface BattleScriptCondition {
    /** 回合：單一回合或區間 */
    turn?: number | BattleScriptRange
    /** boss HP 百分比區間 */
    hp?: BattleScriptRange
    /** boss 獨有計量條區間，例如破壞之力 */
    gauge?: BattleScriptRange
    /** 預兆文字的子字串 */
    omen?: string
    /** boss buff 的 status 前綴：任一個 boss buff 的 status 以它開頭即成立 */
    bossBuff?: string
  }

  /** 操作建議：角色 + 技能名，或純文字 */
  type BattleScriptAdvice = { character: string, skill: string } | { text: string }

  /** 規則：條件成立時顯示說明文字與操作建議 */
  interface BattleScriptRule {
    /** 說明文字，例如「第二階段：四王天出現」 */
    note: string
    when: BattleScriptCondition
    advice: BattleScriptAdvice[]
  }

  /** 戰鬥腳本（schema version 1）；唯一鍵為 questId + name */
  interface BattleScript {
    version: 1
    name: string
    /** 關卡的 quest ID，以字串比對 */
    questId: string
    /** 多段戰的第幾場；省略時不比對 */
    battleCount?: number
    /** 出戰名單，只供顯示 */
    party?: { characters: string[], summons: string[] }
    /** 依腳本順序比對與列出 */
    rules: BattleScriptRule[]
  }

  /** storage key `tn:battle-scripts` 的一筆資料：匯入的腳本原文與啟用狀態 */
  interface StoredBattleScript {
    enabled: boolean
    script: BattleScript
  }
}
