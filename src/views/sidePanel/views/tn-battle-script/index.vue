<script setup lang="ts">
import type { BattleScript } from 'tn'
import type { ImportResult } from '~/tn/battle-script/manage'
import { useFileDialog } from '@vueuse/core'
import copy from 'copy-text-to-clipboard'
import { ElMessage } from 'element-plus'
import { computed, ref, watch } from 'vue'
import { selectAdvice } from '~/tn/battle-script/core'
import { exportScript, importScripts, removeScript } from '~/tn/battle-script/manage'
import { toBattleSnapshot } from '~/tn/battle-script/snapshot'
import { battleScripts, selectedScriptKey } from '~/tn/battle-script/store'
import { battleInfo, BossCard } from '~/tn/core/upstream'

const snapshot = computed(() => toBattleSnapshot(battleInfo.value))
// upstream 沒有「戰鬥中」旗標，battleInfo 戰後也不清除：有最近一場的戰鬥資料就視為在戰鬥中
const inBattle = computed(() => snapshot.value.questId !== undefined)
// 戰鬥狀態、腳本或選中的腳本改變時重新計算；規則不記錄觸發狀態
const selection = computed(() => selectAdvice(battleScripts.value.filter(s => s.enabled).map(s => s.script), snapshot.value, selectedScriptKey.value))

// 戰鬥資料戰後不清除，幾乎一直「在戰鬥中」，所以腳本管理放在獨立分頁，戰前整理不用捲過 boss 狀態卡與建議區。
// 不在戰鬥中（剛安裝）時預設顯示腳本管理；進入新的一場戰鬥時自動切到目前戰鬥
const tab = ref(inBattle.value ? 'battle' : 'manage')
watch(() => battleInfo.value.bossInfo?.battleId, (battleId) => {
  if (battleId)
    tab.value = 'battle'
})

function handleCopyQuestInfo() {
  const { questId, battleCount, bossBuffStatuses } = snapshot.value
  const questInfo = { questId, battleCount, bossName: battleInfo.value.bossInfo?.name, bossBuffStatuses }
  if (copy(JSON.stringify(questInfo, null, 2)))
    ElMessage.success('已複製目前關卡資訊')
}

/** 最近一次匯入的結果：成功與失敗分開列出 */
const importReport = ref<Omit<ImportResult, 'stored'>>({ imported: [], failures: [] })
const { open, reset, onChange } = useFileDialog({ accept: '.json', multiple: true })

onChange(async (fileList) => {
  // reset() 會以 null 觸發 onChange
  if (!fileList)
    return
  // 先同步取出 File，之後再次 reset() 也不影響這一批
  const files = await Promise.all(Array.from(fileList, async file => ({ name: file.name, text: await file.text() })))
  const { stored, imported, failures } = importScripts(battleScripts.value, files)
  // 全部失敗時不寫入任何資料
  if (imported.length > 0)
    battleScripts.value = stored
  importReport.value = { imported, failures }
})

function handleImport() {
  reset()
  open()
}

function handleExport(script: BattleScript) {
  const { name, text } = exportScript(script)
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}

function handleRemove(script: BattleScript) {
  battleScripts.value = removeScript(battleScripts.value, script)
}
</script>

<template>
  <el-tabs v-model="tab" stretch>
    <el-tab-pane label="目前戰鬥" name="battle">
      <div fc flex-col gap-10px>
        <template v-if="inBattle">
          <BossCard />
          <el-descriptions w-300px size="small" :column="2" border>
            <el-descriptions-item label="關卡" align="center">
              {{ snapshot.questId }}
            </el-descriptions-item>
            <el-descriptions-item label="第幾場" align="center">
              {{ snapshot.battleCount }}
            </el-descriptions-item>
          </el-descriptions>
          <div w-300px flex flex-col gap-6px>
            <template v-if="selection.selectedScript">
              <div flex items-center gap-6px text-12px text-neutral-4>
                腳本：
                <el-select
                  v-if="selection.matchedScripts.length > 1" :model-value="selection.selectedScript.key" size="small" flex-1
                  @change="selectedScriptKey = $event"
                >
                  <el-option v-for="matched in selection.matchedScripts" :key="matched.key" :label="matched.script.name" :value="matched.key" />
                </el-select>
                <template v-else>
                  {{ selection.selectedScript.script.name }}
                </template>
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
          <el-button size="small" type="primary" @click="handleCopyQuestInfo">
            複製目前關卡資訊
          </el-button>
        </template>
        <el-result v-else icon="info" sub-title="進入戰鬥後會顯示目前關卡資訊與操作建議" />
      </div>
    </el-tab-pane>

    <el-tab-pane label="腳本管理" name="manage">
      <div fc flex-col gap-10px>
        <el-button size="small" type="primary" @click="handleImport">
          匯入戰鬥腳本
        </el-button>
        <el-alert
          v-if="importReport.imported.length > 0" w-300px type="success" :title="`已匯入 ${importReport.imported.length} 份`"
          @close="importReport.imported = []"
        >
          <div v-for="(item, index) in importReport.imported" :key="index">
            {{ item.fileName }}：{{ item.scriptName }}
          </div>
        </el-alert>
        <!-- 關閉時移除該筆資料：el-alert 關閉後會自己保持隱藏，下次匯入要建立新的 el-alert 才會顯示 -->
        <el-alert
          v-for="failure in importReport.failures" :key="failure.fileName" w-300px type="error" :title="`匯入失敗：${failure.fileName}`"
          @close="importReport.failures = importReport.failures.filter(f => f !== failure)"
        >
          <div v-for="(message, index) in failure.errors" :key="index">
            {{ message }}
          </div>
        </el-alert>

        <div v-for="item in battleScripts" :key="`${item.script.questId}/${item.script.name}`" w-300px flex flex-col gap-4px rounded-md p-8px text-12px ring-1 ring-neutral-7>
          <div flex items-center gap-6px>
            <el-checkbox v-model="item.enabled" :aria-label="`啟用「${item.script.name}」`" />
            <div min-w-0 flex-1 break-all text-14px font-bold>
              {{ item.script.name }}
            </div>
            <el-button link size="small" type="primary" @click="handleExport(item.script)">
              匯出
            </el-button>
            <el-popconfirm
              :title="`確定刪除「${item.script.name}」？`" confirm-button-text="刪除" cancel-button-text="取消" width="220"
              @confirm="handleRemove(item.script)"
            >
              <template #reference>
                <el-button link size="small" type="danger">
                  刪除
                </el-button>
              </template>
            </el-popconfirm>
          </div>
          <div text-neutral-4>
            關卡 {{ item.script.questId }}{{ item.script.battleCount ? ` 第 ${item.script.battleCount} 場` : '' }}・規則 {{ item.script.rules.length }} 條
          </div>
          <template v-if="item.script.party">
            <div>角色：{{ item.script.party.characters.join('、') }}</div>
            <div>召喚：{{ item.script.party.summons.join('、') }}</div>
          </template>
          <div v-else text-neutral-4>
            出戰名單：未填寫
          </div>
        </div>
        <div v-if="battleScripts.length === 0" text-13px text-neutral-4>
          尚未匯入戰鬥腳本
        </div>
      </div>
    </el-tab-pane>
  </el-tabs>
</template>
