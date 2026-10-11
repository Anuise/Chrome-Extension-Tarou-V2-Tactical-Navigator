import type { BattleSnapshot } from './core'
import type { BattleInfo } from '~/tn/core/upstream'

/** 把 upstream 的 battleInfo 轉成 BattleSnapshot；沒有 bossInfo（不在戰鬥中）時 questId 為 undefined */
export function toBattleSnapshot(battleInfo: Partial<BattleInfo>): BattleSnapshot {
  const { bossInfo, buffInfo } = battleInfo
  // battleInfo 是 storage 裡的資料，舊版存下的可能缺少型別上必有的欄位（例如 addition、bossBuffs），巢狀欄位一律用 optional chaining
  return {
    // 型別雖然是 string，upstream 其他地方仍會包一層 String()，這裡也一樣，確保以字串比對
    questId: bossInfo ? String(bossInfo.questId) : undefined,
    // upstream 沒有保存 start.json 的 battle.count，依 spec 一律視為第 1 場
    battleCount: 1,
    turn: bossInfo?.turn,
    hpPercent: bossInfo?.hpPercent,
    gauge: bossInfo?.addition?.genesis,
    omenText: bossInfo?.interrupt_display_text ?? '',
    bossBuffStatuses: buffInfo?.bossBuffs?.map(buff => buff.status) ?? [],
  }
}
