# 戰鬥狀態偵測（tn-battle-state）

Status: ready-for-agent

名詞依 `CONTEXT.md`（關卡、戰鬥腳本、規則、操作建議、預兆）。fork 路徑、掛鉤點與禁止事項依 `docs/fork/RULES.md`。前一個功能是 `.scratch/battle-script/`（戰鬥腳本側欄頁與引擎）。

## Problem Statement

戰鬥腳本的條件目前只看得到回合、boss HP、破壞之力計量條、預兆與 boss buff。攻略裡大部分的判斷要玩家自己看畫面，例如：某角色的技能冷卻好了沒、身上疊了幾層 buff、召喚石能不能用、連鎖條（DC）幾 %、上一回合有沒有放 FC。玩家要一邊看遊戲、一邊對照側欄的建議，自己補上這些判斷。

## 目標

讓戰鬥腳本自己判斷狀況，少靠玩家看畫面：

1. tn 自己解析遊戲的 API 回應，整理成戰鬥狀態（`tn:battle-state`）。
2. 引擎加上新條件，讓腳本能寫「狗 3 冷卻好了才放」這類規則。
3. 側欄顯示偵測到的狀態，玩家能對照遊戲畫面，確認資料讀得對。

## 使用者鐵則（2026-11-09）

tn 一律**不可以主動向遊戲伺服器發送任何請求**，只能被動接收遊戲自己收發的資料。完整的禁止範圍與允許的被動來源寫在 `docs/fork/RULES.md` §5 的最後一列，摘要：

- 不能用 `fetch`、XHR、jQuery ajax，不能注入頁面觸發遊戲 API，不能經遊戲的 WebSocket 送訊息，不能重送、修改、攔截或延遲遊戲的請求，也不能用程式重新整理或導覽遊戲分頁。
- 不能呼叫 `chrome.debugger` 的 `attach`、`detach`、`sendCommand`（唯讀指令也不行）。debugger 由 upstream 掛上，tn 只監聽事件。
- 遊戲頁面的 DOM 一律只讀。
- 例如狀態詳情的 condition API，只能等玩家自己點開時被動錄到，絕不主動去打。

## 資料來源分工

| 資料 | 來源 |
|---|---|
| 角色存活與在不在前排、角色 buff、每回合的 HP／預兆／防禦／行動、召喚石用過幾次、本場有沒有放過連鎖技能 | upstream 的 `battleRecord`（只讀，經 `src/tn/core/upstream.ts`） |
| `battle.count`（多段戰第幾場）、技能 ID 對到角色與格位、每回合的 boss buff 歷史、自己的 `user_id`、DC 技能分左右 | `tnUnpack` 解析 start.json 與行動回應，存 `tn:battle-state`（T4a） |
| 技能冷卻（`ability-recast`）、召喚石冷卻、`summon_enable`、HP | 同上；欄位名稱已知，現行格式要等 T3 實戰確認（T4b） |
| DC%、FC 槽、buff 剩餘回合 | 看 T3 的結果，可能只有部分時機有值（T4b） |

- 所有原始 AJAX 回應都經 `tnUnpack`（01）取得；WebSocket 訊框經 `chrome.debugger.onEvent` 被動接收（02）。
- upstream 的 `battleRecord.player[].condition` 重新整理後不會刷新。`tn:battle-state` 要在每個 start.json 用 `player.param[].condition` 整份重建。
- 公開資料只到 2021 年的舊制戰鬥，V2 之後的欄位沒有人公開解析過。欄位盤點裡標「讀得到＊」（欄位在，但現行格式沒在實戰看過）的有 18 項，「不確定」的有 3 項，都要靠錄製器（02）錄一場實戰來確認（T3）。
- 詳細的欄位盤點見 `.claude-team/research/battle-data/inventory.md`（本機，不在 repo）；提案原文見同資料夾的 `proposal.md`。

## 引擎要加的條件（T5）

全部是 `when` 的選填欄位，不升 schema 版號，舊腳本照常通過；snapshot 沒有值時條件不成立。

| 條件 | 意思 |
|---|---|
| `omenNum` | 含 `omen` 子字串的那一段預兆，裡面的數字落在區間內 |
| `not` | 裡面的條件不成立 |
| `ally` | 指定角色的 buff、層數、剩餘回合、死亡、在不在前排 |
| `ability` | 指定角色第幾個技能：可不可以用、剩幾回合、本場用過幾次 |
| `summon` | 召喚石：可不可以用、剩幾回合、用過幾次 |
| `chain`、`chainUsed` | 連鎖條百分比；本場有沒有發動過連鎖技能 |
| `lastTurn` | 上一回合放過 FC、某角色防禦或攻擊、預兆含某字串 |
| `seenOmen` | 本場之前任一回合的預兆含這個字串 |
| `turnStartHp` | 回合開始時的 boss HP% |

## 票與波次

| T 編號 | `.scratch` 票 | 內容 | 依賴 |
|---|---|---|---|
| T0 | （不開票，使用者操作） | 實戰時按「複製目前關卡資訊」，確認 boss buff 字串格式 | 無 |
| T1 | `issues/01-hook-unpack.md` | 掛上 `tnUnpack` 與 `setupTnBackground`，建立 `src/tn/core/dispatch.ts` | 無 |
| T2 | `issues/02-recorder.md` | 原始回應錄製器 | T1 |
| T3 | （未開票：使用者＋研究） | 開錄製器實戰 1～2 場光 solo，研究者用錄檔確認不確定的欄位、補 status ID | T2 |
| T4a | （未開票） | `tn:battle-state` 解析已確認的欄位，純函式＋ node:test | T1 |
| T4b | （未開票） | 加上 T3 確認的欄位：冷卻、召喚石冷卻、HP、DC%、FC 槽、buff 剩餘回合 | T3、T4a |
| T5 | （未開票） | 引擎新條件與 snapshot 介面 | 無 |
| T6 | （未開票） | 「戰鬥腳本」頁加「偵測到的狀態」區塊與「複製診斷資料」 | T4a |
| T7 | （未開票） | 光 solo 腳本改用新條件；更新 `tn-battle-script` skill | T3、T4b、T5、T6 |

之後開的票從 03 往下編號，並把這張表的「`.scratch` 票」欄補上。

| 波次 | 票 | 開始條件 |
|---|---|---|
| 1 | T0（使用者）、T1、T5 | 立刻 |
| 2 | T2、T4a | T1 完成 |
| 3 | T3（使用者實戰＋研究）、T6 | T3 等 T2；T6 等 T4a |
| 4 | T4b | T3、T4a 完成 |
| 5 | T7 | T3、T4b、T5、T6 完成 |

## 審查分組

- 組 A：T1＋T2（01、02）。三輪審查，每輪 3 位審查員，最後再一次修正確認。
- 組 B：T5、T4a、T6。
- 審查報告與處理紀錄放在 `.claude-team/research/battle-data/reviews/`（本機）。各票的 Comments 只摘要結論。

## Out of Scope

- 任何主動向遊戲伺服器發送的請求（見上方鐵則）。
- 「DC 判斷式」這類算式條件：先用 `chain` ＋ `hp` 拆成幾條區間規則，真的需要時再另開票。
- 隊伍的高配／低配讀不到，維持文字建議。
- 錄製資料壓縮：一場約 5～10 MB，manifest 有 `unlimitedStorage`，不夠時再加。
