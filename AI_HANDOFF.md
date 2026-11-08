# 交接紀錄

> 本檔為全專案唯一的 AI 代理共用交接文件（2026-11-07 重整）。只保留目前狀態、長期規則、待辦、近期紀錄與核心設計參考；過時與已解決的歷史紀錄已濃縮歸檔。

## 專案概況
- **定位**：靜態網頁工具包（純 JavaScript，無 Rust）。`d2edit.js` 書籤入口載入各模組：
  - `lang/lang.js`：遊戲內繁體中文化，共用字典 `lang/zh-TW.json`。
  - `helper/autobot.js`：遊戲輔助器（自動戰鬥、走位、喝水、選卡、換裝、作弊輔助）。
  - `modifier/engine-page.js`：存檔物品引擎（讀寫、合法性驗證、詞綴產生）。
  - `modifier/editor.html`：存檔修改器介面。
- **桌面版**：位於 `editor/`，已改為固定啟動器架構，介面與引擎線上載入，桌面端僅負責存檔本機讀寫。
- **發布環境**：GitHub Pages（main 分支託管網頁版）；公告站 `site/` 由 Cloudflare 自動連動 GitHub 部署（`wrangler.jsonc`），無須 API Token。
- **單機定位（2026-11-08 起）**：工具包讓玩家單機爽玩。`d2edit.js` 載入即擋下所有送往 `/api/leaderboard` 的非 GET 請求（fetch／XHR／sendBeacon），並把遊戲記憶體存檔（`__d2autobot.game.save`）的 `leaderboard.off` 鎖成不可改、不可刪的 `true`（遊戲選項按「上傳」時 `delete` 會失敗，維持關閉）；修改器寫入的存檔也一律 `off: true`；載入時刪除等待上傳佇列 `localStorage["d2s:leaderboard-queue"]`，之後攔下對該鍵的寫入。修改器「關閉排行榜上傳」按鈕已隱藏。文件不再說明「如何讓成績上榜」，只說明上傳強制關閉。
- **最新相容版本**：`TESTED_GAME_BUILD = "20261105.3"`（`helper/autobot.js`、`modifier/editor.html`、`helper/selfcheck.js` 同步）。

## 反覆發生的問題（必讀）
使用者多次糾正的事項，接手前必須遵守：
1. **一律繁體中文**：回覆、交接、更新日誌、程式內介面均使用繁體中文。
2. **「完成」前必須實機驗證**：單元測試與模擬不算完成。實機一律指官方網址 `https://d2survivors.lol/play/`。回報時清楚列出「實機驗證了什麼、哪些未驗證」，未經驗證不可宣稱修好。
3. **用使用者回報的原始輸入重現**：依使用者貼出的字串、截圖或存檔為驗收基準。
4. **自己測完、修完，不要一直發問**：除非發布前確認、刪除使用者資料或規則衝突，否則自主完成測試與修復。
5. **發布日誌給玩家看**：日誌寫在公告站（`site/index.html`）與修改器，說明工具包更新內容；同一天的更新合併為同一則（標註日期，不標小版號）。工具包支援熱重載，平時不升版號；發布 GitHub Release 桌面版時才加 `--bump`。
6. **合法性以本遊戲為準**：以這款遊戲自身的資料庫與 `itemFault` 為標準，正常掉落裝備不得判為不合法。
7. **修改器一鍵解鎖收藏庫**：數量需與遊戲內一致，有職業技能的物品（如地獄火炬）依當前職業給予。
8. **輔助器行為優先序**：追王／撿裝／任務目標優先於閃避；傷害不痛不閃避；升級必須選卡；腰帶全放生命藥水；回營地優先交付任務。
9. **開關狀態一致**：介面顯示狀態必須嚴格等於記憶體實際生效狀態。
10. **裝備製作介面**：使用下拉選單挑選屬性，不要求手動輸入代碼；新增屬性預設為最大值；數值範圍全域統一。
11. **背景任務清理**：測試或背景程序結束後主動清理並通知使用者。
12. **額度調配**：額度不足時改派子代理，子代理產出需整合進倉庫並由主代理核實。
13. **AI 文件單一原則**：所有 AI 代理紀錄統一於本檔，不另開零散交接檔或分析報告。

## 長期規則（以最新版為主）
- **實機測試規範**：一律以官方網址 `https://d2survivors.lol/play/` 進行實測，禁止使用本地快照伺服器（快照缺少 setup.html 會轉址失敗）。測試使用 `tests/live-harness`（Electron）獨立設定檔，不碰使用者真實存檔。
- **存檔隔離原則**：多個存檔同時測試必須在獨立環境與設定檔。一般實機測試使用 D2S1 存檔副本；測試「自動配裝」時開全新存檔並以修改器解鎖全裝備庫，由輔助器自行挑選穿戴。
- **遊戲更新流程（全自動）**：使用者說「遊戲更新了」即授權執行 `node verify/auto.cjs`：偵測新版 → `verify.cjs --update` 比對與回歸 → `verify/live-smoke.cjs` 實機煙霧測試 → `publish.cjs --confirm --auto --no-desktop`。失敗即停；工作目錄有未提交修改時不發布。新遊戲內容由使用者決定是否加入。
- **名稱翻譯與顯示規則**：對齊原版暗黑 2 繁中。
  - 魔法字尾（of ...）移到最前（`八目鰻之戒指`）；怪物稱號與稀有名稱直接相接（`石塊蛆蟲巫異`）；屬性詞綴列每項之間以不換行空格（U+00A0）分隔。
  - 遊戲傳入字串包含「 - 」分段與「空白相接」兩種形式，均需在官方頁面以真實 `__d2lang.translate` 驗證。
- **遊戲更新全面重驗**：遊戲更新後，修改器特徵碼（`signatures.json`）、物品規則、存檔簽章、輔助器掛接函式（`Game` 內部方法）均需重驗，不可沿用舊結論。

## 資料夾結構
- **根目錄**：共用進入點與設定（`d2edit.js`、`index.html`、`version.json`、`AGENTS.md`、`AI_HANDOFF.md`、`wrangler.jsonc`）。
- `helper/`：輔助器模組（`autobot.js`、`selfcheck.js`、測試 `helper/tests/`）。
- `lang/`：語言模組（`lang.js`、字典 `zh-TW.json`、`locales/`、語言工具 `tools/`、測試 `lang/tests/`）。
- `modifier/`：修改器模組（`editor.html`、`engine-page.js`、`patch.mjs`、`signatures.json`、`i18n.js`、測試 `modifier/tests/`）。
- `site/`：網站與公告站（`index.html`、`install.template.html`）。
- `editor/`：桌面啟動器（`main.js`、`preload.js`、`core.js`、`remote.js` 等）。
- `tests/live-harness/`：實機測試框架與端到端腳本。
- `verify/`：自動更新、驗證與發布工具套件。
- `backups/`（Git 忽略）：歷史備份、執行檔與測試存檔。

## 常用測試指令
- **Node 單元測試**：
  - `node lang/tests/test_lang.cjs`（語言與字典）
  - `node modifier/tests/craft-limits.cjs`、`node modifier/tests/weapon-sets.cjs`（修改器規則）
  - `node helper/tests/selfcheck.cjs`（版本與環境自檢）
  - `node tools/tests/build-web.cjs`（建置回歸測試）
- **Electron 測試（隔離設定檔）**：
  - `electron helper/tests/autobot.cjs`（輔助器回歸測試，約 208 項）
  - `electron modifier/tests/save-faults-ui.cjs`、`electron modifier/tests/weapon-sets-ui.cjs`
- **實機驗證（官方網址 /play/）**：
  - `node verify/live-smoke.cjs`（實機煙霧測試）
  - `electron tests/live-harness/cheat-restore-live.cjs out.json`（作弊開關還原驗證）
  - `electron tests/live-harness/invincible-live.cjs out.json`（無敵功能實機驗證）
- **完整驗證套件**：
  - `node verify/verify.cjs --quick`（本機快速回歸）
  - `node verify/auto.cjs`（全自動更新流程）

## 進行中與待確認事項
1. **【待使用者決定】繁中怪物同名衝突**：`translate("Horror")` 翻為恐骨骷髏、`Slayer` 殺戮僕魔，但字典基礎譯名為驚駭、屠殺者（用於技能或稱號）。待決定：A. 怪物名僅在明確怪物欄位使用；B. 維持現狀。
2. **【待使用者決定】`cleanCJK` 空白與標點處理**：`cleanCJK` 會吃掉逗號，約 2,434 條譯文逗號受影響。待決定：A. 維持現狀；B. 加入長句逗號保護；C. 採用點陣字型映射。
3. **【待使用者決定】字典 165 條韓文對齊**：依韓文官方資料修正 `Fiend` 為惡魔、`Rule` 為統御，需使用者確認是否接受此批詞條變更。
4. **【待使用者決定】`modifier/overrides/game-overrides.js`**：第 2 行中文字語法錯誤致該檔從未生效。該檔用途為繞過存檔檢查，修復將使防修改失效，待使用者確認是否啟用或刪除。
5. **手機版比較框排版**：`lang/lang.js` 已新增 `planTipLayout`（避免裝備框蓋住操作按鈕），純函式單元測試已過，尚待真實觸控手機或官方實機驗證。
6. **鍛造精華作弊與實機接受度**：`cheat.forgeMax` 已改為遊戲真實格式（`type: "essence"`、`base: "Burning Essence of Terror"`、`count` 99）；官方 /play/ 實機（`tests/live-harness/forge-essence-live.cjs`）確認存檔內出現精華堆疊且 count=99。尚未驗證：鍛造面板顯示數量、實際鍛造是否被遊戲接受、重新整理後是否保留。
7. **桌面版封裝**：網頁端修改已同步至啟動器程式碼，但尚未執行正式桌面 exe 重新打包（`publish.cjs --desktop`）。

## 已解決摘要
- **2026-10-31～11-04**：建立修改器原版規則檢查、中英切換、手機響應版面；建立輔助器自動戰鬥、走位規劃、天梯學習與死亡保護；完成 20261101～20261104.2 各版適配；完成資料夾結構解耦與 Cloudflare 自動部署。
- **2026-11-05**：桌面版改為固定啟動器消除重複程式碼；相容 20261105.1～20261105.3；修改器對接原生 `saveFaults` 檢查；全圖撿寶改用裝備座標瞬移（克服原版 magnet 限制）；作弊功能關閉與還原機制完備；開放固定品質（暗金／套裝／符文之語）合規調整製作。
- **2026-11-06～11-07**：
  - **恐懼階與識別碼重設**：修復 `resetTerror`，完整清理恐懼階紀錄與角色爬塔 ID。
  - **修改器安全性**：物品座標加入整數、越界與重疊檢查；金幣等數值欄位限制非負整數；一鍵解鎖失敗自動快照還原；固定品質倍率寫入丟失已修復（拒絕製作並明確提示）。
  - **Insight 隨機製作故障**：查明帶 roll 符文之語會被遊戲重算導致 seed 判定不符，改為隨機路徑去除 roll 並通過 `__itemFault` 檢查，`saveFaults` 歸零。
  - **恐怖燃燒精華作弊失效**：查明 `forgeMax` 使用錯誤的 `base: "bet"`（`bet` 是內部代碼），遊戲實際以名稱 `Burning Essence of Terror` 且 `type: "essence"` 儲存；已改寫並於官方網址實機確認存檔 count=99。
  - **Ormus' Robes 換裝查證**：查明防具評分機制重視四系抗性，非程式錯誤。
  - **Jack 查證**：查明 Jack 為稀有軀幹（torso）後綴與冠軍怪名稱，非獨立裝備。
  - **翻譯與排版全面核對**：字典大規模審查，修正閃電（Lightning）、女巫（the Witch）、上衣（Jack）、嘔吐（Puke）等譯名；技能樹多段協同加成（synergyList）分段翻譯與標點修復。
- **2026-11-08**：淬鍊屬性句未翻譯。原因：遊戲以不換行空白接上 `×N`（`saveTransfer` 的 `va`），整句查不到字典。修法：`lang/lang.js` 的 `translateString` 先剝掉尾端 `×N` 只翻核心句再接回；補 `+# to Fire / Lightning Mastery (Sorceress Only)` 字典。官方 `/play/` 實機（`tests/live-harness/temper-translate-live.cjs`）7 條樣本全譯出；再以使用者提供的存檔（法師 `Tal Rasha's Lidless Eye`，`forge.t` 有淬鍊）在隔離設定檔實機開角色畫面、移滑鼠看提示框（`tests/live-harness/temper-tooltip-live.cjs`），淬鍊行全數譯出並保留 `×N`。`[1-2]` 為數字範圍（`e.range`）不含英文，無需處理。尚未驗證：其他職業的淬鍊行、手機版提示框。

---

# 附錄：核心設計參考

## A. 輔助器架構與核心常數
- **遊戲掛接**：沿用同來源動態匯入遊戲 `Game` 模組，包裝 `tick` 與 `steer`。每 50ms 判斷一次，背景分頁或選單開啟時暫停操作。
- **操作邏輯**：
  - 喝水：依血量比例與致死預判呼叫 `drinkFrom`，遵守腰帶規則。
  - 走位：分析全圖怪物、敵方飛彈與牆面向量；多敵包圍時採 16 方向滑動取樣脫困。
  - 優先順序：生命安全時，推進目標／頭目／精英怪／寶箱優先於躲避小怪。
  - 升級選卡：包裝升級回呼，依排行榜學習資料庫（`LADDER`）自動選取技能或被動卡。
  - 自動換裝：每 3 秒呼叫 `heroNumbers` 評估背包裝備，空欄位或分數提升達門檻即換裝。
  - 死亡保護：預估致命且無法補血、或低血圍困無通路時，觸發 `pause()` → `leaveRun()` 安全離場。
- **技能攻擊距離參考（REACH，邊緣距離）**：
  - 亞馬遜近戰：Jab / Power Strike 58、Fend 84。
  - 刺客近戰：Tiger / Cobra 46、Dragon Talon 90、Phoenix Strike 128。
  - 野蠻人：Double Swing 48、Bash 54、Frenzy 66、Whirlwind 200、Leap Attack 340。
  - 聖騎士：Zeal 46、Smite / Vengeance 54、Charge 90。
  - 遠程／法術：大多索敵 450（Nova 140+15/級、Static Field 160+10/級、Blizzard 450）。已學攻擊技能最遠距離 < 150 視為近戰，站位於約六成攻擊距離處。

## B. 自動更新與驗證架構
- **流程（`verify/auto.cjs`）**：
  1. `lib/game.cjs`：抓取 `/changelog.json` 與 `/play/` 最新前端模組快照。
  2. `lib/compare.cjs`：比對模組雜湊，篩選受影響範圍。
  3. `lib/adapt.cjs`：自動比對掛接點特徵碼，更新 `TESTED_GAME_BUILD` 與模組檔名引用。
  4. `verify/live-smoke.cjs`：使用隔離 Electron 設定檔開啟官方網址，驗證遊戲與工具包載入成功。
  5. `publish.cjs --confirm --auto --no-desktop`：自動更新公告與發布網頁版。

## C. 實機測試 Harness 腳本索引
| 檔案 | 用途 |
|---|---|
| `main.js`、`boot.js` | Electron 測試主程式與遊戲啟動建檔器 |
| `launch.ps1` | 多存檔並行啟動腳本（支援多職業、獨立設定檔） |
| `craft-live.cjs` | 修改器實機測試執行器（支援攔截本機修改與官方 /play 載入） |
| `craft-fixed-e2e.js` | 固定品質製作端到端測試腳本 |
| `cheat-restore-live.cjs` | 作弊開關關閉後數值還原實機驗證腳本 |
| `invincible-live.cjs` | 無敵功能實機行為驗證腳本 |
