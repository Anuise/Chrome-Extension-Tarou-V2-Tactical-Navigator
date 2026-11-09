# 08: tn-battle-script skill 讀取匯出的戰鬥紀錄

**What to build:** 使用者把 07 匯出的戰鬥紀錄檔（`tn-battle-record-*.json`）交給 `tn-battle-script` skill，請它分析腳本準不準時，skill 先讀 07 的「限制」並查看檔案大小，再決定分析方式。檔案約 1.5～2 MB（縮排 2 格），不能整份讀進對話。這張票只開不做，等 triage 後再決定做法。

**Blocked by:** 07

**Status:** needs-triage

- [ ] `SKILL.md` 有讀戰鬥紀錄檔的流程：先讀 07 的「限制」並查看檔案大小，再決定分析方式
- [ ] 不整份讀進對話：先依 `quest_id`、`raid_id`、`startTimestamp` 挑出要看的場次，只取需要的欄位（例如 `actionQueue`）
- [ ] 分析時照 07 的「限制」解讀資料：沒有 boss buff 與計量條；預兆與 HP% 是每回合開始時的值；技能只有 id；各角色 `condition` 的時間點不一定相同
- [ ] 以下載資料夾裡的完整路徑讀檔，不把檔案複製進 repo

## Comments

- 來源：07 的第二輪審查 B-L2、第三輪審查 A-M1。
- 現況：
  - 分析前必須知道的事只寫在 07 的「限制」，skill 對話中的 Claude 不會自己去讀 `.scratch` 的票。
  - `SKILL.md` 目前沒有提到戰鬥紀錄檔。
- 在這張票完成前，07 的「用法」請使用者交檔時，請 Claude 先讀 07 的「限制」。
- 待 triage 決定：
  - 挑場次的方式：在對話中用 node／jq 指令，或做成 `scripts/tn/` 的小工具。
  - 流程放在 `SKILL.md` 的哪一段，例如「修改既有腳本」的第 1 步。
