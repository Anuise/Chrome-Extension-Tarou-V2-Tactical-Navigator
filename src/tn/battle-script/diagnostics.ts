// 「偵測到的狀態」面板與「複製診斷資料」共用的顯示資料：純函式，不依賴 Vue、chrome API 與 upstream。
// 面板只渲染這份資料，按鈕複製它的 JSON，兩邊的值一定一致；「未取得」也只在這裡決定
import type { BattleSnapshot } from './core'

/** 沒有資料的欄位一律顯示這個字，不猜值 */
export const NOT_AVAILABLE = '未取得'

/** 顯示用的值：有資料時是數字或文字，沒有時是「未取得」 */
export type Shown = number | string

export interface DiagnosticsAlly {
  id: string
  isLeader: string
  alive: string
  hp: Shown
  hpMax: Shown
  buffs: { status: string, remain: Shown }[]
  abilities: { slot: number, abilityId: string, used: number, ready: string, recast: Shown }[]
}

export interface DiagnosticsSummon {
  from: string
  id: string
  used: number
  ready: string
  recast: Shown
}

export interface DiagnosticsLastTurn {
  turn: number
  fc: string
  /** 防禦的角色 id */
  guards: string[]
  omen: string
}

export interface Diagnostics {
  turn: Shown
  hpPercent: Shown
  /** 目前回合開始時的 boss HP% */
  turnStartHp: Shown
  /** 破壞之力 */
  gauge: Shown
  omen: string
  /** DC% */
  chain: Shown
  chainUsed: string
  /** 只列前排角色，依 player 順序 */
  allies: DiagnosticsAlly[]
  summons: DiagnosticsSummon[]
  /** 上一回合的摘要；沒有上一回合時是說明文字 */
  lastTurn: DiagnosticsLastTurn | string
}

const NO_LAST_TURN = '沒有上一回合'
const NO_OMEN = '無'
const FROM_LABELS = { main: '主召', sub: '副召', friend: '好友' } as const

function shown(value: number | undefined): Shown {
  return value ?? NOT_AVAILABLE
}

function yesNo(value: boolean | undefined): string {
  return value === undefined ? NOT_AVAILABLE : value ? '是' : '否'
}

/** 把 snapshot 轉成面板顯示與複製用的資料 */
export function toDiagnostics(snapshot: BattleSnapshot): Diagnostics {
  const previous = snapshot.history.at(-2)
  return {
    turn: shown(snapshot.turn),
    hpPercent: shown(snapshot.hpPercent),
    turnStartHp: shown(snapshot.history.at(-1)?.hpAtStart),
    gauge: shown(snapshot.gauge),
    omen: snapshot.omenText || NO_OMEN,
    chain: shown(snapshot.chain),
    chainUsed: yesNo(snapshot.chainUsed),
    allies: snapshot.allies.filter(ally => ally.front).map(ally => ({
      id: ally.id,
      isLeader: yesNo(ally.isLeader),
      alive: yesNo(!ally.dead),
      hp: shown(ally.hp),
      hpMax: shown(ally.hpMax),
      buffs: ally.buffs.map(buff => ({ status: buff.status, remain: shown(buff.remain) })),
      abilities: ally.abilities.map(ability => ({
        slot: ability.slot,
        abilityId: ability.abilityId,
        used: ability.used,
        ready: yesNo(ability.ready),
        recast: shown(ability.recast),
      })),
    })),
    summons: snapshot.summons.map(summon => ({
      from: FROM_LABELS[summon.from],
      id: summon.id,
      used: summon.used,
      ready: yesNo(summon.ready),
      recast: shown(summon.recast),
    })),
    lastTurn: previous
      ? {
          turn: previous.turn,
          fc: yesNo(previous.actions.some(action => action.type === 'fc')),
          guards: previous.guards,
          omen: previous.omenText || NO_OMEN,
        }
      : NO_LAST_TURN,
  }
}
