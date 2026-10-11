<script setup lang="ts">
import { useFileDialog } from '@vueuse/core'
import copy from 'copy-text-to-clipboard'
import { ElMessage } from 'element-plus'
import { computed, ref } from 'vue'
import { selectAdvice, validateScript } from '~/tn/battle-script/core'
import { toBattleSnapshot } from '~/tn/battle-script/snapshot'
import { battleScripts, saveScript } from '~/tn/battle-script/store'
import { battleInfo, BossCard } from '~/tn/core/upstream'

const snapshot = computed(() => toBattleSnapshot(battleInfo.value))
// upstream 沒有「戰鬥中」旗標，battleInfo 戰後也不清除：有最近一場的戰鬥資料就視為在戰鬥中
const inBattle = computed(() => snapshot.value.questId !== undefined)
// 戰鬥狀態或腳本改變時重新計算；規則不記錄觸發狀態
const selection = computed(() => selectAdvice(battleScripts.value.filter(s => s.enabled).map(s => s.script), snapshot.value))

function handleCopyQuestInfo() {
  const { questId, battleCount, bossBuffStatuses } = snapshot.value
  const questInfo = { questId, battleCount, bossName: battleInfo.value.bossInfo?.name, bossBuffStatuses }
  if (copy(JSON.stringify(questInfo, null, 2)))
    ElMessage.success('已複製目前關卡資訊')
}

/** 最近一次匯入失敗的檔名與錯誤訊息 */
const importFailure = ref<{ fileName: string, errors: string[] }>()
const { open, reset, onChange } = useFileDialog({ accept: '.json', multiple: false })

onChange(async (files) => {
  // reset() 會以 null 觸發 onChange
  const file = files?.[0]
  if (!file)
    return
  importFailure.value = undefined

  let input: unknown
  try {
    input = JSON.parse(await file.text())
  }
  catch (error) {
    importFailure.value = { fileName: file.name, errors: [`不是有效的 JSON：${String(error)}`] }
    return
  }

  // 驗證失敗時整份拒絕，不寫入任何資料
  const result = validateScript(input)
  if (!result.ok) {
    importFailure.value = { fileName: file.name, errors: result.errors.map(e => (e.path ? `${e.path}：${e.message}` : e.message)) }
    return
  }
  saveScript(result.script)
  ElMessage.success(`已匯入「${result.script.name}」`)
})

function handleImport() {
  reset()
  open()
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
      <div w-300px flex flex-col gap-6px>
        <template v-if="selection.selectedScript">
          <div text-12px text-neutral-4>
            腳本：{{ selection.selectedScript.script.name }}
          </div>
          <div v-for="(rule, index) in selection.activeRules" :key="index" rounded-md p-8px ring-1 ring-neutral-7>
            <div text-14px font-bold>
              {{ rule.note }}
            </div>
            <div v-for="(item, itemIndex) in rule.advice" :key="itemIndex" mt-4px text-13px>
              <template v-if="'text' in item">
                {{ item.text }}
              </template>
              <template v-else>
                <span text-teal-4>{{ item.character }}</span>：{{ item.skill }}
              </template>
            </div>
          </div>
          <div v-if="selection.activeRules.length === 0" text-center text-13px text-neutral-4>
            目前沒有成立的規則
          </div>
        </template>
        <div v-else text-center text-13px text-neutral-4>
          無符合腳本
        </div>
      </div>
    </template>
    <el-result v-else icon="info" sub-title="進入戰鬥後會顯示目前關卡資訊" />
    <div fc>
      <el-button v-if="inBattle" size="small" type="primary" @click="handleCopyQuestInfo">
        複製目前關卡資訊
      </el-button>
      <el-button size="small" type="primary" @click="handleImport">
        匯入戰鬥腳本
      </el-button>
    </div>
    <el-alert v-if="importFailure" w-300px type="error" :title="`匯入失敗：${importFailure.fileName}`" @close="importFailure = undefined">
      <div v-for="(message, index) in importFailure.errors" :key="index">
        {{ message }}
      </div>
    </el-alert>
  </div>
</template>
