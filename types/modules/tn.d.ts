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

  /**
   * storage key `tn:battle-state`：tn 自己解析原始回應得到的目前這一場戰鬥狀態，只存一場。
   * raid_id 變了就整份重建；同一場重新整理（再收到 start.json）時保留召喚次數、chainUsed 與 boss buff 歷史
   */
  interface BattleState {
    raidId: string
    questId: string
    /** 多段戰的第幾場（start.json 的 battle.count） */
    battleCount: number
    /** 自己的 user id（start.json 的 user_id），用來過濾 boss 身上別人的個人 buff */
    userId: string
    /** 我方角色，依 start.json player.param 的順序（含後排）；索引就是 player 索引 */
    allies: BattleStateAlly[]
    /** 前排各格（0 起算）是 allies 的第幾個 */
    formation: number[]
    /** 召喚石：主召、副召依格號排列（第 n 格在索引 n-1），好友召喚在最後 */
    summons: BattleStateSummon[]
    /** 連鎖技能（DC）的 ability ID，依 start.json group_gauge.ability_list 的順序 */
    chainAbilityIds: string[]
    /** 本場發動過連鎖技能 */
    chainUsed: boolean
    /** 目前主 boss 身上的 buff 與 debuff status，以 status 去重 */
    bossBuffStatuses: string[]
    /** 每回合一筆：回合開始時（該回合第一個回應處理完）的 boss buff status，依回合遞增 */
    bossBuffHistory: { turn: number, statuses: string[] }[]
  }

  interface BattleStateAlly {
    /** pid 底線前的部分；角色是角色 ID */
    id: string
    /** 主角 */
    isLeader: boolean
    /** buff 與 debuff 的 status，以 status 去重 */
    buffStatuses: string[]
    /** 技能格與技能 ID；只有上過前排的角色才有 */
    abilities: { slot: number, abilityId: string }[]
  }

  interface BattleStateSummon {
    from: 'main' | 'sub' | 'friend'
    /** 召喚石 ID；空的格子為空字串 */
    id: string
    /** 本場召喚過幾次 */
    used: number
  }
}
