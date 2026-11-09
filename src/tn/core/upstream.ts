// upstream 介面層：tn 程式碼只從這裡取用 upstream 模組，upstream 改名或搬檔時只需改這個檔（RULES §6）
// upstream 的 storage ref 一律唯讀
export type { BattleInfo } from 'battle'
export type { BattleRecord } from 'extension'
export type { Ability, AttackResultJson, BattleStartJson, Buff, Condition } from 'source'
// getBuffIcon 只用 status 組出 CDN 圖示網址的字串，沒有其他行為（RULES §5.1）
export { getBuffIcon } from '~/composables/useImage'
export { useWebExtensionStorage } from '~/composables/useWebExtensionStorage'
export { battleInfo, battleRecord } from '~/logic'
export { default as BossCard } from '~/views/sidePanel/views/combat/components/BossCard.vue'
