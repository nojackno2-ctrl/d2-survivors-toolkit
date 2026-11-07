# 遊戲分析資料（D2 Survivors 反編譯整理）

本目錄整合遊戲前端程式（d2survivors.lol）的反編譯與分析結果，供輔助器（`autobot.js`）與存檔修改器開發、以及遊戲更新後重新驗證使用。

- 分析版本：遊戲 build **20261101.1**（主程式 `Game-CP0n0PpN.js`、物品 `itemArt-BTVnyuWi.js`）。遊戲更新後，依 `AI_HANDOFF.md` 的長期規則全部重新驗證，並重新產生本目錄。
- 位置標記如 `G新:310228`、`I新:247967` 是原始壓縮檔的 0 起算 UTF-16 字元偏移；用下方排版工具產生的檔案每行開頭有 `/*@偏移*/` 可對照。
- 本目錄只放我們自己寫的分析、虛擬碼與整理資料。**不放遊戲原始碼**（排版後的完整程式），需要時在本機用 `formatter.js` 產生，輸出資料夾已列入 `.gitignore`。
- 標示「推測」的內容尚未在遊戲中實測確認。

## 文件

| 檔案 | 內容 |
|---|---|
| [systems/game-core.md](systems/game-core.md) | Game 類別方法清單、狀態機（select／camp／town／playing／paused／levelUp／dead…）、tick 流程、存檔結構（heroes／kept／unlocked／baalSlain…） |
| [systems/combat.md](systems/combat.md) | 怪物階級、攻擊距離、**新版防禦命中率公式**、玩家受傷計算、減傷與抗性、藥水與腰帶（含魔力藥水） |
| [systems/items.md](systems/items.md) | 掉落觸發、品質判定、MF 遞減、詞綴等級、底材、收藏、符文之語與新版差異 |
| [systems/progression.md](systems/progression.md) | 經驗與等級、難度、任務與任務物品、恐懼層獎勵、Charsi 升級價格、天梯驗證 |
| [systems/ui-hooks.md](systems/ui-hooks.md) | HUD 與介面回呼（技能變體 `hud.d2.mods`、城鎮交易、技能樹、傳送點、選角） |
| [quests.md](quests.md) | 任務：存檔狀態值（o 待領、g 已領）、24 項任務條件與獎勵、尋找凱恩完整流程（卷軸、阿卡拉翻譯、鑰匙、石塊陣、傳送門、牢籠、戒指）、向誰交任務 |
| [drop-rules.md](drop-rules.md) | 裝備掉落規則（誰掉什麼、物品等級、品質與 MF 公式、詞綴、法典、經驗懲罰） |
| [skills.md](skills.md)／[skills.json](skills.json) | 全職業 154 技能、66 被動；與排行榜（LADDER）、攻擊距離表（REACH）比對 |
| [modules.md](modules.md) | 45 個程式模組的大小、用途與匯出對照 |
| [verify-20261101.1.md](verify-20261101.1.md) | 遊戲 20261030.2 → 20261101.1 的相容性驗證（輔助器用到的原版方法、修改器特徵碼、藥水、防禦、Charsi） |
| [verify-20261102.1.md](verify-20261102.1.md) | 遊戲 20261102.1 更新、工具調整與未完成驗證 |
| [verify-older-builds.md](verify-older-builds.md) | 舊版遊戲辨識、封鎖與有限對照測試 |
| [news-analysis.md](news-analysis.md) | 官方最新消息（`/changelog.json`）對輔助器的影響、99 級相關機制 |
| [editor-analysis.md](editor-analysis.md) | 官方最新消息對存檔修改器（合法性、排行榜資格、存檔欄位）的影響 |
| [bundle-20261105.3-recording-report.md](bundle-20261105.3-recording-report.md) | build 20261105.3 補分析：`record`（排行榜識別與爬層紀錄雜湊鏈）、`report`（錯誤回報）、`whatsNew`（更新日誌） |
| [bundle-20261105.3-choice-chains.md](bundle-20261105.3-choice-chains.md) | build 20261105.3 補分析：`choice`（檔案來源）、`chains`（等級與數字格式）、`moved`（版面與 service worker）、`Cache`（記憶體資產快取） |
| [bundle-20261105.3-lang-unique-url.md](bundle-20261105.3-lang-unique-url.md) | build 20261105.3 補分析：語言系統（字典鍵格式與插值）、收藏頁 `uniquesTab`（與修改器解鎖相關）、`d2url`（網址雜湊） |
| [bundle-20261105.3-infra.md](bundle-20261105.3-infra.md) | build 20261105.3 補分析：初始化與預載（`init`、`preload-helper`、`previewStorage`）、資料打包（`pack`）、DOM 與 surface 層級 |

## 工具

```bash
# 下載遊戲程式包到 gamejs/ 後，排版到 pretty/（兩者都不進倉庫）
node web/docs/game-analysis/formatter.js web/docs/game-analysis/gamejs web/docs/game-analysis/pretty
```

排行榜學習腳本在 `editor/ladder-learn.js`（各職業前 50 位不同玩家，同一玩家只取最高恐懼層紀錄）。
