declare module 'tn' {
  /** 數字區間：兩端都包含，端點順序不限（`[50, 15]` 與 `[15, 50]` 相同） */
  type BattleScriptRange = [number, number]

  /**
   * 規則的條件：每個欄位都可省略，寫了的全部成立才算成立；空物件恆成立。
   * snapshot 裡對應的值不存在、或找不到對象（角色、技能、召喚石、上一回合）時，該條件不成立。
   */
  interface BattleScriptCondition {
    /** 回合：單一回合或區間 */
    turn?: number | BattleScriptRange
    /** boss HP 百分比區間 */
    hp?: BattleScriptRange
    /** boss 獨有計量條區間，例如破壞之力 */
    gauge?: BattleScriptRange
    /**
     * 預兆文字的子字串。可以放一個 `{n}` 代表一個數字（以數字開頭，可含逗號），
     * 此時改對以 `|` 分開的每一段預兆比對，任一段符合即成立，例如 `{n}ヒット`
     */
    omen?: string
    /** `omen` 的 `{n}` 取到的數字所在區間；必須和含 `{n}` 的 `omen` 一起寫 */
    omenNum?: BattleScriptRange
    /** boss buff 的 status 前綴：任一個 boss buff 的 status 以它開頭即成立 */
    bossBuff?: string
    /** 裡面的條件不成立；不能是空物件 */
    not?: BattleScriptCondition
    /** 我方角色的狀態；寫成陣列時每一項都要成立，不能是空陣列 */
    ally?: BattleScriptAllyCondition | BattleScriptAllyCondition[]
    /** 我方角色的技能；寫成陣列時每一項都要成立，不能是空陣列 */
    ability?: BattleScriptAbilityCondition | BattleScriptAbilityCondition[]
    /** 召喚石；寫成陣列時每一項都要成立，不能是空陣列 */
    summon?: BattleScriptSummonCondition | BattleScriptSummonCondition[]
    /** 連鎖條（DC）百分比區間 */
    chain?: BattleScriptRange
    /** 本場是否發動過連鎖技能 */
    chainUsed?: boolean
    /** 上一回合發生的事 */
    lastTurn?: BattleScriptLastTurnCondition
    /** 本場任一回合（含目前回合）的預兆文字含這個子字串 */
    seenOmen?: string
    /** 目前回合開始時的 boss HP 百分比區間 */
    turnStartHp?: BattleScriptRange
  }

  /** 角色：`"主角"` 對到主角，其他字串對到角色 ID，例如 `"3040390000"` */
  type BattleScriptWho = string

  /** 指定角色的狀態：角色要找得到，寫了的欄位全部成立 */
  interface BattleScriptAllyCondition {
    who: BattleScriptWho
    /** buff 或 debuff 的 status 前綴；stack、remain 對同一個 buff 比對 */
    buff?: string
    /** 層數：status 去掉 buff 前綴與開頭的一個 `_` 之後，開頭的連續數字；必須和 buff 一起寫 */
    stack?: BattleScriptRange
    /** 剩餘回合；必須和 buff 一起寫 */
    remain?: BattleScriptRange
    dead?: boolean
    /** 在前排 */
    front?: boolean
  }

  /** 指定角色的第幾個技能 */
  interface BattleScriptAbilityCondition {
    who: BattleScriptWho
    /** 技能格，1–4 */
    slot: number
    /** 能不能按；不知道時不成立 */
    ready?: boolean
    /** 剩餘冷卻回合區間 */
    recast?: BattleScriptRange
    /** 本場用過幾次的區間 */
    used?: BattleScriptRange
  }

  /** 召喚石：符合 id（與 from）的任一張滿足全部有寫的欄位即成立 */
  interface BattleScriptSummonCondition {
    /** 召喚石 ID，例如 `"2040080000"` */
    id: string
    /** 主召、副召或好友 */
    from?: 'main' | 'sub' | 'friend'
    /** 能不能召喚；不知道時不成立 */
    ready?: boolean
    /** 剩餘冷卻回合區間 */
    recast?: BattleScriptRange
    /** 本場召喚過幾次的區間 */
    used?: BattleScriptRange
  }

  /** 上一回合：沒有上一回合時不成立；至少要寫一個欄位 */
  interface BattleScriptLastTurnCondition {
    /** 有沒有放 FC */
    fc?: boolean
    /** 這個角色有防禦 */
    guard?: BattleScriptWho
    /** 有普攻，而且這個角色沒有防禦 */
    attack?: BattleScriptWho
    /** 預兆文字的子字串（不支援 `{n}`） */
    omen?: string
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
