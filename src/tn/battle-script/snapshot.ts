import type { BattleState } from 'tn'
import type { BattleSnapshot, SnapshotTurn } from './core'
import type { BattleInfo, BattleRecord } from '~/tn/core/upstream'

/**
 * 由 upstream 的 battleInfo、battleRecord 與 tn 的 tn:battle-state 組出 BattleSnapshot；沒有 bossInfo（不在戰鬥中）時 questId 為 undefined。
 * 兩者都只採用屬於目前這一場（battleInfo.bossInfo.battleId）的資料。
 * 沒有資料的欄位一律是 undefined，不補預設值（用到它們的條件不成立）；技能能不能按、冷卻、HP、DC%、buff 剩餘回合還沒讀取，也一律不填
 */
export function toBattleSnapshot(battleInfo: Partial<BattleInfo>, battleRecord: BattleRecord[], battleState: BattleState | null): BattleSnapshot {
  const { bossInfo, buffInfo } = battleInfo
  const battleId = bossInfo?.battleId
  const record = battleRecord.find(item => String(item.raid_id) === battleId)
  const state = battleState?.raidId === battleId ? battleState : null
  const actionQueue = record?.actionQueue ?? []

  /** 本場用過幾次：actionQueue 裡 type 為 ability、id 是該技能或它的子技能的行動數；沒有戰鬥紀錄時為 undefined */
  const usedCount = (abilityId: string) => {
    if (!record)
      return undefined
    // 有「選擇」介面的技能（get_select_if）與暗器，upstream 在 actionQueue 記的是子技能的 id
    const subIds = record.abilityList?.find(ability => ability.id === abilityId)?.subAbility?.map(sub => String(sub.id)) ?? []
    const ids = new Set([abilityId, ...subIds])
    return actionQueue.reduce((count, turn) => count + turn.actionList.filter(action => action.type === 'ability' && ids.has(String(action.id))).length, 0)
  }

  const history: SnapshotTurn[] = actionQueue.map(turn => ({
    turn: turn.turn,
    hpAtStart: turn.bossHpPercent,
    omenText: turn.interrupt_display_text ?? '',
    bossBuffStatuses: state?.bossBuffHistory.find(item => item.turn === turn.turn)?.statuses,
    // guard_status 的 num 是 player 索引，id 與 allies 同為 pid 底線前的部分
    guards: turn.guard_status.filter(guard => guard.is_guard_status).flatMap(guard => record?.player[guard.num]?.pid ?? []),
    actions: turn.actionList.map(({ type, id }) => ({ type, id })),
  }))

  // battleInfo 是 storage 裡的資料，舊版存下的可能缺少型別上必有的欄位（例如 addition、bossBuffs），巢狀欄位一律用 optional chaining
  return {
    // 型別雖然是 string，upstream 其他地方仍會包一層 String()，這裡也一樣，確保以字串比對
    questId: bossInfo ? String(bossInfo.questId) : undefined,
    // upstream 沒有保存 start.json 的 battle.count，只能取自 tn 狀態
    battleCount: state?.battleCount,
    // bossInfo.turn 只在回應有 boss_gauge 時更新；battleRecord.turn 每個行動回應都會更新
    turn: record?.turn ?? bossInfo?.turn,
    hpPercent: bossInfo?.hpPercent,
    gauge: bossInfo?.addition?.genesis,
    omenText: bossInfo?.interrupt_display_text ?? '',
    // tn 用自己的 user_id 過濾個人 buff，比 upstream 可靠，有 tn 狀態時優先採用
    bossBuffStatuses: state?.bossBuffStatuses ?? buffInfo?.bossBuffs?.map(buff => buff.status),
    allies: state?.allies.map((ally, index) => ({
      id: ally.id,
      isLeader: ally.isLeader,
      front: state.formation.includes(index),
      // upstream 重新整理時也是用 pid 對角色，不依賴 player 的順序
      dead: record?.player.find(player => player.pid === ally.id)?.is_dead,
      buffs: ally.buffStatuses.map(status => ({ status })),
      abilities: ally.abilities.map(({ slot, abilityId }) => ({ slot, abilityId, used: usedCount(abilityId) })),
    })) ?? [],
    // 空的召喚格不列入
    summons: state?.summons.filter(summon => summon.id !== '') ?? [],
    chainUsed: state?.chainUsed,
    history,
  }
}
