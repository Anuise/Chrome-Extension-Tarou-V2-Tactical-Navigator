<script setup lang="ts">
import copy from 'copy-text-to-clipboard'
import { ElMessage } from 'element-plus'
import { computed } from 'vue'
import { toBattleSnapshot } from '~/tn/battle-script/snapshot'
import { battleInfo, BossCard } from '~/tn/core/upstream'

const snapshot = computed(() => toBattleSnapshot(battleInfo.value))
// upstream 沒有「戰鬥中」旗標，battleInfo 戰後也不清除：有最近一場的戰鬥資料就視為在戰鬥中
const inBattle = computed(() => snapshot.value.questId !== undefined)

function handleCopyQuestInfo() {
  const { questId, battleCount, bossBuffStatuses } = snapshot.value
  const questInfo = { questId, battleCount, bossName: battleInfo.value.bossInfo?.name, bossBuffStatuses }
  if (copy(JSON.stringify(questInfo, null, 2)))
    ElMessage.success('已複製目前關卡資訊')
}
</script>

<template>
  <div fc flex-col gap-10px>
    <template v-if="inBattle">
      <BossCard />
      <el-descriptions w-300px size="small" :column="2" border>
        <el-descriptions-item label="questId" align="center">
          {{ snapshot.questId }}
        </el-descriptions-item>
        <el-descriptions-item label="第幾場" align="center">
          {{ snapshot.battleCount }}
        </el-descriptions-item>
      </el-descriptions>
      <el-button size="small" type="primary" @click="handleCopyQuestInfo">
        複製目前關卡資訊
      </el-button>
    </template>
    <el-result v-else icon="info" sub-title="進入戰鬥後會顯示目前關卡資訊" />
  </div>
</template>
