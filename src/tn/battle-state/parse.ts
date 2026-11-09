// 戰鬥狀態解析：純函式，不依賴 Vue 與 chrome API，node:test 可直接測
// 只被動解析遊戲自己發出的請求的回應，絕不主動發請求（RULES §5）
import type { BattleState, BattleStateAlly } from 'tn'
import type { TnParcel } from '~/tn/core/dispatch'
import type { Ability, AttackResultJson, BattleStartJson, Buff, Condition } from '~/tn/core/upstream'

/** 行動回應的種類：召喚與連鎖技能要額外記錄，其餘只更新 buff、前排、技能格與回合 */
export type ActionKind = 'summon' | 'chain' | 'other'

const START_URL = /\/rest\/(?:raid|multiraid)\/start\.json/
// 與 upstream useDataCenter.ts 的行動回應正則一致
const ACTION_URLS: [RegExp, ActionKind][] = [
  [/\/rest\/(?:raid|multiraid)\/normal_attack_result\.json/, 'other'],
  [/\/rest\/(?:raid|multiraid)\/summon_result\.json/, 'summon'],
  [/\/rest\/(?:raid|multiraid)\/fatal_chain_result\.json/, 'other'],
  [/\/rest\/(?:raid|multiraid)\/ability_result\.json/, 'other'],
  [/\/rest\/(?:raid|multiraid)\/group_gauge_action_result\.json/, 'chain'],
  [/\/rest\/(?:raid|multiraid)\/temporary_item_result\.json/, 'other'],
  [/\/rest\/(?:raid|multiraid)\/event_temporary_item_result\.json/, 'other'],
  [/\/rest\/(?:raid|multiraid)\/user_recovery\.json/, 'other'],
]

/** 依 URL 分辨回應類型；與戰鬥狀態無關時回傳 undefined */
export function classifyUrl(url: string): 'start' | ActionKind | undefined {
  if (START_URL.test(url))
    return 'start'
  return ACTION_URLS.find(([pattern]) => pattern.test(url))?.[1]
}

/** buff 與 debuff 合併後以 status 去重（保留第一個）；buff、debuff 可能是 null */
function mergeStatuses(condition: Condition | null | undefined, keep: (buff: Buff) => boolean = () => true): string[] {
  const buffs = [...(condition?.buff ?? []), ...(condition?.debuff ?? [])].filter(keep)
  return [...new Set(buffs.map(buff => buff.status))]
}

/**
 * boss 的 buff：帶個人標記的項目只保留屬於自己的。
 * upstream 用 userInfo.uid 過濾，沒去過個人頁時 uid 是空的，個人 buff 會全部被濾掉，所以改用 start.json 的 user_id
 */
function bossStatuses(condition: Condition | null | undefined, userId: string): string[] {
  return mergeStatuses(condition, (buff) => {
    const owner = buff.personal_buff_user_id || buff.personal_debuff_user_id
    return !owner || String(owner) === userId
  })
}

/** 以 ability[k].pos（player 索引）找角色，覆蓋技能格對應；不在這份 ability 裡的角色保留舊的對應 */
function applyAbility(allies: BattleStateAlly[], ability: Ability | undefined): void {
  for (const { pos, list } of Object.values(ability ?? {})) {
    const ally = allies[Number(pos)]
    if (ally)
      ally.abilities = Object.entries(list).map(([slot, entries]) => ({ slot: Number(slot), abilityId: String(entries[0]['ability-id']) }))
  }
}

/** 回合和歷史最後一筆不同時，記下目前的 boss buff */
function recordTurn(state: BattleState, turn: number): void {
  if (state.bossBuffHistory.at(-1)?.turn !== turn)
    state.bossBuffHistory.push({ turn, statuses: [...state.bossBuffStatuses] })
}

/**
 * start.json：以 start.json 重建狀態。
 * 同一場（raid_id 相同，玩家重新整理）時保留 start.json 拿不到的累計值：召喚次數、chainUsed、boss buff 歷史
 */
export function applyStartJson(prev: BattleState | null, data: BattleStartJson): BattleState {
  const raidId = String(data.raid_id)
  const userId = String(data.user_id)
  const same = prev?.raidId === raidId ? prev : undefined

  const allies: BattleStateAlly[] = data.player.param.map(player => ({
    id: player.pid.split('_')[0],
    isLeader: Number(player.leader) === 1,
    buffStatuses: mergeStatuses(player.condition),
    abilities: [],
  }))
  // 沒有任何角色帶 leader 旗標時，照 upstream 的做法把第 0 個當主角
  if (allies.length > 0 && !allies.some(ally => ally.isLeader))
    allies[0].isLeader = true
  applyAbility(allies, data.ability)

  // 同 upstream：主 boss 是第一隻 HP 不是 0 的 boss
  const boss = data.boss.param.find(b => Number(b.hp) !== 0) ?? data.boss.param[0]

  const summons: BattleState['summons'] = [
    ...data.summon.map((summon, index) => ({ from: index === 0 ? 'main' as const : 'sub' as const, id: summon?.id ? String(summon.id) : '' })),
    { from: 'friend' as const, id: data.supporter?.id ? String(data.supporter.id) : '' },
  ].map((summon, index) => {
    const old = same?.summons[index]
    return { ...summon, used: old?.from === summon.from && old.id === summon.id ? old.used : 0 }
  })

  let state: BattleState = {
    raidId,
    questId: String(data.quest_id),
    battleCount: Number(data.battle?.count) || 1,
    userId,
    allies,
    formation: Object.values(data.ability).map(a => Number(a.pos)),
    summons,
    chainAbilityIds: data.group_gauge?.ability_list.map(a => String(a.ability_id)) ?? [],
    chainUsed: same?.chainUsed ?? false,
    bossBuffStatuses: bossStatuses(boss?.condition, userId),
    bossBuffHistory: same ? structuredClone(same.bossBuffHistory) : [],
  }
  // 開幕特動：start.json 也帶 scenario 與 status，照行動回應處理（同 upstream）
  if (Array.isArray(data.scenario))
    state = applyActionResult(state, data as AttackResultJson, 'other')
  recordTurn(state, Number(data.turn))
  return state
}

/**
 * 行動回應（普攻、技能、召喚、FC、DC、道具）：更新前排、技能格、buff、召喚次數、連鎖與每回合 boss buff。
 * `request` 是請求參數（requestData 解析後），召喚時用 summon_id 找格子
 */
export function applyActionResult(state: BattleState, data: AttackResultJson, kind: ActionKind, request?: { summon_id?: string | number }): BattleState {
  const next = structuredClone(state)
  const { scenario, status } = data

  // 同 upstream：scenario 的 pos 用這個回應處理完的前排對到角色
  if (status?.formation)
    next.formation = status.formation.map(Number)
  applyAbility(next.allies, status?.ability)

  // condition 指令是該對象目前完整的 buff 清單，每個位置取最後一個
  const playerConditions = new Map<number, Condition | null>()
  let bossCondition: Condition | null | undefined
  for (const item of scenario) {
    // scenario 裡也會夾著陣列，只看物件
    if (typeof item !== 'object' || item === null || Array.isArray(item) || item.cmd !== 'condition')
      continue
    if (item.to === 'player' && typeof item.pos === 'number')
      playerConditions.set(item.pos, item.condition)
    if (item.to === 'boss' && item.pos === 0)
      bossCondition = item.condition
  }
  for (const [pos, condition] of playerConditions) {
    const ally = next.allies[next.formation[pos]]
    if (ally)
      ally.buffStatuses = mergeStatuses(condition)
  }
  if (bossCondition !== undefined)
    next.bossBuffStatuses = bossStatuses(bossCondition, next.userId)

  if (kind === 'summon' && request?.summon_id !== undefined) {
    // summon_id 是 'supporter'（好友召喚）或 1 起算的格號
    const summon = String(request.summon_id) === 'supporter'
      ? next.summons.find(s => s.from === 'friend')
      : next.summons.filter(s => s.from !== 'friend')[Number(request.summon_id) - 1]
    if (summon)
      summon.used++
  }

  if (kind === 'chain')
    next.chainUsed = true

  if (status?.turn !== undefined)
    recordTurn(next, Number(status.turn))
  return next
}

/**
 * 依一筆 AJAX 回應算出新的戰鬥狀態。與戰鬥狀態無關、或還沒收到 start.json 時回傳原本的 state（同一個參考），呼叫端據此判斷要不要寫入
 */
export function reduceBattleState(state: BattleState | null, parcel: TnParcel): BattleState | null {
  const kind = classifyUrl(parcel.url)
  const data = parcel.responseData
  if (!kind || typeof data !== 'object' || data === null)
    return state

  if (kind === 'start')
    return applyStartJson(state, data as BattleStartJson)

  // 行動回應沒有 raid_id，一律套到目前這一場（同 upstream 以最近一次 start.json 為準）
  if (!state || !Array.isArray((data as AttackResultJson).scenario))
    return state
  const request = kind === 'summon' && parcel.requestData ? JSON.parse(parcel.requestData) as { summon_id?: string } : undefined
  return applyActionResult(state, data as AttackResultJson, kind, request)
}
