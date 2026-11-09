<script setup lang="ts">
import type { RecIndexEntry } from '~/tn/recorder/core'
import dayjs from 'dayjs'
import { ElMessage } from 'element-plus'
import { computed, onScopeDispose, ref } from 'vue'
import { useWebExtensionStorage } from '~/tn/core/upstream'
import { buildExport, REC_ENABLED_KEY, REC_INDEX_KEY, REC_LIMITS } from '~/tn/recorder/core'
import { clearRecordings, loadIndex, loadRecords } from '~/tn/recorder/store'

const enabled = useWebExtensionStorage<boolean>(REC_ENABLED_KEY, false)

// 索引由 background 直接寫進 chrome.storage.local，這裡只讀，靠 onChanged 跟著更新
const index = ref<RecIndexEntry[]>([])
loadIndex().then(value => index.value = value)
function onStorageChanged(changes: Record<string, chrome.storage.StorageChange>, area: string) {
  if (area === 'local' && REC_INDEX_KEY in changes)
    index.value = (changes[REC_INDEX_KEY].newValue as RecIndexEntry[] | undefined) ?? []
}
chrome.storage.onChanged.addListener(onStorageChanged)
onScopeDispose(() => chrome.storage.onChanged.removeListener(onStorageChanged))

// 最新的一場排最前面
const raids = computed(() => [...index.value].reverse())
const totalBytes = computed(() => index.value.reduce((sum, entry) => sum + entry.bytes, 0))

function formatBytes(bytes: number) {
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** 以瀏覽器下載一個 JSON 檔 */
function download({ name, text }: { name: string, text: string }) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}

async function handleExport(entry: RecIndexEntry) {
  try {
    const records = await loadRecords(entry)
    download(buildExport(entry, records, new Date()))
    if (records.length < entry.count)
      ElMessage.warning(`已匯出 ${records.length} 筆，有 ${entry.count - records.length} 筆讀不到`)
    else
      ElMessage.success(`已匯出 ${records.length} 筆`)
  }
  catch (error) {
    console.error('[tn] 匯出錄製資料失敗', error)
    ElMessage.error(`匯出失敗：${String(error)}`)
  }
}

async function handleClear() {
  try {
    await clearRecordings()
    ElMessage.success('已清除全部錄製資料')
  }
  catch (error) {
    console.error('[tn] 清除錄製資料失敗', error)
    ElMessage.error(`清除失敗：${String(error)}`)
  }
}
</script>

<template>
  <div fc flex-col gap-10px>
    <div w-300px flex items-center gap-8px>
      <el-button v-if="enabled" size="small" type="danger" @click="enabled = false">
        停止錄製
      </el-button>
      <el-button v-else size="small" type="primary" @click="enabled = true">
        開始錄製
      </el-button>
      <span text-13px :class="enabled ? 'text-red-4' : 'text-neutral-4'">
        {{ enabled ? '錄製中' : '未錄製' }}
      </span>
    </div>

    <div w-300px flex flex-col gap-4px text-12px text-neutral-4>
      <div>開啟後，戰鬥中遊戲自己發出的 API 回應會原樣存下來，供研究戰鬥資料格式。錄製功能不會主動向遊戲伺服器發送任何請求。</div>
      <div>・請在進入戰鬥前開始錄製；已經在戰鬥中時，重新整理戰鬥頁面，可以補錄目前回合的開場資料，之前回合的回應補不回來。</div>
      <div>・打完請立即匯出，並停止錄製（只保留最近 {{ REC_LIMITS.maxRaids }} 場，多段戰每一段算一場）。</div>
      <div>・資料只存在本機（這台電腦的瀏覽器），不會上傳。</div>
      <div>・匯出時，玩家 ID 會換成代號：自己是 self，其他玩家依出現順序是 p1、p2…（同一個檔案內固定）；暱稱、頭像、聊天內容換成 ***。</div>
      <div>・把匯出檔交給 Claude 分析時，檔案內容會送到模型服務。</div>
      <div>・總共超過 {{ formatBytes(REC_LIMITS.maxBytes) }} 時，刪除最久沒有新資料的一場；單一場超過上限時，停止錄這一場。</div>
      <div>・多人戰的 WebSocket 訊息，要在進入戰鬥時側欄或戰鬥視窗已經開著才錄得到；進戰鬥後才打開側欄時，重新整理戰鬥頁面才錄得到。</div>
      <div>・錄製時只開一個戰鬥分頁（多分頁時 WebSocket 訊框可能歸錯場）。</div>
    </div>

    <div v-for="entry in raids" :key="entry.raidId" w-300px flex flex-col gap-4px rounded-md p-8px text-12px ring-1 ring-neutral-7>
      <div flex items-center gap-6px>
        <div min-w-0 flex-1 break-all text-14px font-bold>
          {{ entry.questId ? `關卡 ${entry.questId}` : '關卡不明' }}
        </div>
        <el-tag v-if="entry.truncated" size="small" type="warning">
          已截斷
        </el-tag>
        <el-button link size="small" type="primary" @click="handleExport(entry)">
          匯出
        </el-button>
      </div>
      <div text-neutral-4>
        {{ dayjs(entry.startedAt).format('YYYY/MM/DD HH:mm:ss') }}・{{ entry.count }} 筆・{{ formatBytes(entry.bytes) }}
      </div>
      <div text-neutral-5>
        raid_id {{ entry.raidId }}
      </div>
    </div>
    <div v-if="raids.length === 0" text-13px text-neutral-4>
      尚未錄到任何場次
    </div>

    <!-- 索引是空的時也能清除：中途被關掉可能留下沒被索引指到的紀錄 -->
    <div w-300px flex items-center justify-between text-12px text-neutral-4>
      共 {{ raids.length }} 場・{{ formatBytes(totalBytes) }}
      <el-popconfirm
        title="確定清除全部錄製資料？" confirm-button-text="清除" cancel-button-text="取消" width="220"
        @confirm="handleClear"
      >
        <template #reference>
          <el-button size="small" type="danger" plain>
            全部清除
          </el-button>
        </template>
      </el-popconfirm>
    </div>
  </div>
</template>
