<script setup lang="ts">
// 「偵測到的狀態」：唯讀顯示 snapshot，讓玩家對照遊戲畫面確認資料讀得對；不做任何設定
import type { BattleSnapshot } from '~/tn/battle-script/core'
import copy from 'copy-text-to-clipboard'
import { ElMessage } from 'element-plus'
import { computed } from 'vue'
import { toDiagnostics } from '~/tn/battle-script/diagnostics'
import { getBuffIcon } from '~/tn/core/upstream'

const props = defineProps<{ snapshot: BattleSnapshot }>()

// 面板只渲染這份資料，按鈕複製同一份，兩邊的值一定一致
const diagnostics = computed(() => toDiagnostics(props.snapshot))
const lastTurn = computed(() => (typeof diagnostics.value.lastTurn === 'string' ? undefined : diagnostics.value.lastTurn))

function handleCopy() {
  if (copy(JSON.stringify(diagnostics.value, null, 2)))
    ElMessage.success('已複製診斷資料')
}

/** CDN 上的 buff 圖示網址，只用 <img> 顯示（RULES §5.1 的例外）；getBuffIcon 只組字串 */
function buffIcon(status: string) {
  return getBuffIcon({ status }, 0)
}
</script>

<template>
  <el-collapse w-300px>
    <el-collapse-item title="偵測到的狀態" name="diagnostics">
      <div flex flex-col gap-8px text-12px>
        <div flex items-center justify-between gap-6px>
          <span text-neutral-4>沒有資料的欄位顯示「未取得」</span>
          <el-button size="small" @click="handleCopy">
            複製診斷資料
          </el-button>
        </div>

        <el-descriptions size="small" :column="2" border>
          <el-descriptions-item label="回合">
            {{ diagnostics.turn }}
          </el-descriptions-item>
          <el-descriptions-item label="boss HP%">
            {{ diagnostics.hpPercent }}
          </el-descriptions-item>
          <el-descriptions-item label="回合開始 HP%">
            {{ diagnostics.turnStartHp }}
          </el-descriptions-item>
          <el-descriptions-item label="破壞之力">
            {{ diagnostics.gauge }}
          </el-descriptions-item>
          <el-descriptions-item label="DC%">
            {{ diagnostics.chain }}
          </el-descriptions-item>
          <el-descriptions-item label="發動過連鎖">
            {{ diagnostics.chainUsed }}
          </el-descriptions-item>
          <el-descriptions-item label="預兆" :span="2">
            {{ diagnostics.omen }}
          </el-descriptions-item>
        </el-descriptions>

        <div font-bold>
          前排角色
        </div>
        <div v-for="ally in diagnostics.allies" :key="ally.id" flex flex-col gap-4px rounded-md p-6px ring-1 ring-neutral-7>
          <div break-all text-13px font-bold>
            {{ ally.id }}
          </div>
          <div>主角：{{ ally.isLeader }}・存活：{{ ally.alive }}・HP：{{ ally.hp }}／{{ ally.hpMax }}</div>
          <div>buff：{{ ally.buffs.length === 0 ? '無' : '' }}</div>
          <div v-if="ally.buffs.length > 0" flex flex-wrap gap-x-8px gap-y-2px>
            <span v-for="buff in ally.buffs" :key="buff.status" inline-flex items-center gap-2px>
              <img :src="buffIcon(buff.status)" :alt="buff.status" h-20px w-20px>
              {{ buff.status }}
              <span text-neutral-4>剩餘 {{ buff.remain }}</span>
            </span>
          </div>
          <div>技能：{{ ally.abilities.length === 0 ? '無' : '' }}</div>
          <table v-if="ally.abilities.length > 0" w-full text-center>
            <thead text-neutral-4>
              <tr><th>格</th><th>技能 ID</th><th>用過</th><th>可用</th><th>冷卻</th></tr>
            </thead>
            <tbody>
              <tr v-for="ability in ally.abilities" :key="ability.slot">
                <td>{{ ability.slot }}</td><td>{{ ability.abilityId }}</td><td>{{ ability.used }}</td><td>{{ ability.ready }}</td><td>{{ ability.recast }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="diagnostics.allies.length === 0" text-neutral-4>
          無
        </div>

        <div font-bold>
          召喚石
        </div>
        <table v-if="diagnostics.summons.length > 0" w-full text-center>
          <thead text-neutral-4>
            <tr><th>來源</th><th>ID</th><th>用過</th><th>可用</th><th>冷卻</th></tr>
          </thead>
          <tbody>
            <tr v-for="(summon, index) in diagnostics.summons" :key="index">
              <td>{{ summon.from }}</td><td>{{ summon.id }}</td><td>{{ summon.used }}</td><td>{{ summon.ready }}</td><td>{{ summon.recast }}</td>
            </tr>
          </tbody>
        </table>
        <div v-else text-neutral-4>
          無
        </div>

        <div font-bold>
          上一回合
        </div>
        <el-descriptions v-if="lastTurn" size="small" :column="2" border>
          <el-descriptions-item label="回合">
            {{ lastTurn.turn }}
          </el-descriptions-item>
          <el-descriptions-item label="放 FC">
            {{ lastTurn.fc }}
          </el-descriptions-item>
          <el-descriptions-item label="防禦" :span="2">
            {{ lastTurn.guards.length === 0 ? '無' : lastTurn.guards.join('、') }}
          </el-descriptions-item>
          <el-descriptions-item label="預兆" :span="2">
            {{ lastTurn.omen }}
          </el-descriptions-item>
        </el-descriptions>
        <div v-else text-neutral-4>
          {{ diagnostics.lastTurn }}
        </div>
      </div>
    </el-collapse-item>
  </el-collapse>
</template>
