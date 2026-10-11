// upstream 介面層：tn 程式碼只從這裡取用 upstream 模組，upstream 改名或搬檔時只需改這個檔（RULES §6）
// upstream 的 storage ref 一律唯讀
export type { BattleInfo } from 'battle'
export { useWebExtensionStorage } from '~/composables/useWebExtensionStorage'
export { battleInfo } from '~/logic'
export { default as BossCard } from '~/views/sidePanel/views/combat/components/BossCard.vue'
