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
000000000000. **【已發布 2026-11-10】效能實測：語言模組記憶體洩漏（已修並實機驗證）＋四個優化開關的同場對照**（`lang/lang.js`、新腳本 `tests/live-harness/perf-ab-live.cjs`）。
   - **量測方法**：官方 `/play/`、隔離設定檔、使用者 D2S1 存檔副本（法師 99 級）、視窗 1600×900、Intel UHD 770。同一局內「基準 → 條件 → 基準 → 條件…」輪流（每段 15 秒、2 輪、第二輪順序反轉），條件只跟緊鄰前後兩段基準平均比；開關走真實效能頁介面，量測時效能頁關閉。`H_SCENE=normal`（只開無敵）／`dense`（怪物數量最大化＋全部精英）／`heavy`。`H_NOSET=1` 為不碰開關的對照組，`H_ONLYBOT=1` 只載入輔助器，`H_AB` 可自訂對照。CPU% 已換算為單一核心百分比。
   - **洩漏**：`lang/lang.js` 的 `liveCanvases` 用 `Set` 直接存遊戲每次畫字產生的畫布，只有換語言時才清，戰鬥中永遠不釋放。修前對照組（不碰開關，normal）約 4 分鐘 GPU 行程 971 → 2020 MB、分頁行程 1077 → 1602 MB；dense 約 9 分鐘 GPU 行程到 5.5 GB；JS 堆積不變（所以先前只看 JS 堆積沒發現）。只載入輔助器時 GPU 維持 760～940 MB。**修正**：改存 `WeakRef`（`trackLiveCanvas`，每 500 次新增清一次已回收項目），`window.__d2langLiveCount()` 供診斷。**修後**：normal 4 分鐘 GPU 763～929 MB、dense 9 分鐘 745～1046 MB，不再成長；追蹤數量在 140～640 間起伏。dense 基準段跨次比較：GPU 行程 CPU 45 → 30、分頁 CPU 100 → 81、FPS 47 → 53（跨次執行，僅供參考）。
   - **開關結論（修後 dense 兩輪；修前 dense、normal 各兩輪方向一致）**：
     - 「掛機時略過主畫面繪製」**有效**：dense 分頁 CPU −27%／−30%、GPU 行程 CPU −46%／−48%、render 耗時 −96%；normal（修前）分頁 −40%、GPU −45%。掛機但不略過＝無差異，效果確實來自略過繪製。
     - 「減少特效」：dense 的 render 耗時約 −11%～−18%（4 次同向），但分頁／GPU CPU 差在 ±5% 內，低於雜訊，**沒有可感的效益**。
     - 「記憶體整理」（TDZ 錯誤修正後首次有效量測）：受管貼圖數 −16%～−33%（6 次同向），但 GPU 行程記憶體只差 −1%～−4%（雜訊 ±13%）、CPU 無差，**沒有實際省到記憶體**。
     - 「降低解析度」：CPU、GPU、影格都在雜訊內，**無效益**。另發現遊戲本身有動態解析度（基準段自己在 1.5／1.25／1 間變動）；工具包以首次看到的值 ×0.75 並每 2 秒強制套用，會與遊戲的自動調整互相覆蓋（未修）。
   - **後續處理（同日，使用者同意）**：效能頁移除「減少特效」「記憶體整理」「降低解析度」三個開關與其程式（`d2edit.js` 的 `tidyEffects`、`applyResolution` 及兩個計時器），只保留「掛機時略過主畫面繪製」；`perfOpts` 只剩 `afkSkipMain`，舊設定的其他欄位忽略；載入時仍清掉舊版留在 `window.__d2perfTimers` 的計時器。降低解析度與遊戲動態解析度互相覆蓋的問題隨之消失。`tests/live-harness/perf-lowres-live.cjs` 已刪除，`perf-ab-live.cjs` 條件改為基準／掛機略過／掛機不略過。本檔較早項目（掛機與效能優化、效能頁）中關於這三個開關的描述已過時。
   - **移除後實機（官方 `/play/`，同上環境）**：localStorage 預先寫入舊格式（三項皆開、`afkSkipMain:false`）後載入，`__d2perfOpts` 只有 `afkSkipMain:false`、效能頁只有一個開關、解析度維持 1.5、勾選後存回 `{"afkSkipMain":true}`。normal 場景掛機對照兩輪：略過繪製分頁 CPU −42%／−37%、GPU 行程 −42%／−46%；不略過 −4%／−14%、−6%／−7%；GPU 記憶體全程 740～923 MB。**語言切換**：暫停時畫面上 34 個含英文原文的文字畫布，切到 English 34 個全部改變，切回繁中後仍在的 32 個與原本完全相同，無錯誤（先前列為未驗證的 `redrawLiveCanvases` 已驗證）。`verify --quick` 15／15、`live-smoke` 通過。
   - **發布**：2026-11-10 公告寫入 `site/index.html` 與 `modifier/editor.html`（記憶體洩漏修正、載入加速、移除三個開關等 6 項），依先例以 git 直接推送 main（`publish.cjs --confirm` 需要遊戲更新的正式測試紀錄，工具包改動不適用）。使用者表示其餘項目自行測試。
   - **雜訊**：場景負載（敵人數 54～465）波動大，基準段彼此的 CPU 差可達 ±17%，小於此幅度的差異一律不下結論。
   - **未驗證**：手機與獨立顯示卡；大於 1600×900 的視窗；安裝自訂 D2R 字型時才會套用的畫布 CSS 濾鏡（`contrast／brightness`）負擔；修後工具包相對「只載入輔助器」仍略高的 CPU（分頁約 55 對 50、GPU 約 24 對 19，跨次比較）。
00000000000. **【已發布 2026-11-10】工具包全面測試找到的 5 項問題**（`d2edit.js`、`modifier/editor.html`、`modifier/tests/craft-affix-ui.cjs`、`craft-companion-ui.cjs`、`verify/suite.cjs`）。
   - **效能頁「記憶體整理」持續報錯**：`tidyEffects` 在宣告前使用 `gc`（暫時性死區），開關一開每 0.5 秒丟一次 `ReferenceError`，後半段回收邏輯從未執行。已把 `const gc` 移到使用前。先前「記憶體整理無可證實效益」的量測是在這個錯誤存在時做的，結論需重測。
   - **`modifier/overrides/game-overrides.js` 已刪除**（原待決事項 4，使用者 2026-11-10 同意）：`d2edit.js` 結尾每次載入都注入該檔，第 2 行中文未加註解，執行時丟 `ReferenceError`，從未生效但主控台印「已載入」。該檔若被修好會擋掉遊戲對存檔鍵的所有寫入（玩家進度無法存檔），故連同載入段一併移除。
   - **重新點書籤後效能開關被舊計時器改回**：舊版模組的 `setInterval`（解析度 2 秒、特效整理 0.5 秒）沒被清掉，拿著舊的 `perfOpts` 繼續跑。計時器代號改記在 `window.__d2perfTimers`，載入時先清上一版；繪製掛接改讀 `window.__d2perfOpts`。
   - **自檢殘留過期提示**：25 秒補查改為以補查結果取代原本的「輔助器／語言」提示。
   - **修改器 `load()`**：先發出的讀檔請求加上空的 `catch`，避免素材或字典先失敗時變成未處理的拒絕。
   - **兩個過時測試**：`craft-affix-ui`、`craft-companion-ui` 沒跟上逐步選單（未先選類型／品質／底材），已補上並登記進 `verify/suite.cjs`（快速套件由 13 項變 15 項）。
   - **已驗證**：`node verify/verify.cjs --quick` 15／15。**官方 `/play/` 實機（隔離設定檔、使用者 D2S1 存檔副本、法師 99 級）**：修前開記憶體整理 3.2 秒內 7 次錯誤、`gc.maxUnusedTime` 維持 60000；修後 0 次錯誤、開啟時 3000、關閉後還原 60000。修前重新點書籤後關閉降低解析度，5 秒內由 1.5 被改回 1.125；修後維持 1.5。載入時主控台不再有覆蓋腳本的錯誤；自檢補查後提示清空；修改器開啟 6 個後端呼叫全部成功；掛機遮罩與擊殺數正常。
   - **未驗證**：「減少特效」在重新點書籤後的行為（與解析度同一組計時器，未單獨實機跑）；從「已部署的舊版」重新點書籤載入新版時，舊版計時器沒有記在 `window`，這一次清不到（重新整理頁面即可）；手機版面；`load()` 的失敗路徑未實際觸發。
   - 實機記錄中的 `startRun … reading 'id'` 是測試框架按 hosted 按鈕造成（`tests/live-harness/boot.js` 已註明），非玩家路徑。
0000000000a. **【已發布 2026-11-10】Antigravity：專案載入速度最佳化**（`d2edit.js`、`helper/selfcheck.js`、`helper/autobot.js`、`lang/lang.js`、`modifier/editor.html`）。
   - **物品引擎目標分塊快速通道（`d2edit.js`）**：歷版遊戲所有 21 個特徵碼（`modifier/signatures.json`）皆位於 `itemArt-*.js`（17 個）與 `saveTransfer-*.js`（4 個）。`startEngine` 改為先抓這兩個目標分塊比對特徵碼，若 21 個特徵全部命中即略過其餘 44 個 Pixi／UI／韓文分塊（省下約 2 MB 下載與多輪波段正則掃描）；若未來改版有缺漏則自動退回完整波段掃描。同時引擎 iframe 內將修補後模組與 `modifier/engine-page.js` 改為 `Promise.all` 並行匯入。
   - **相容性自檢並行化與輪詢加速（`helper/selfcheck.js`）**：`runSelfCheck` 將「遊戲版本」「字典／遊戲資料」「物品引擎＋存檔」「掛接」改為 `Promise.all` 並行執行（存檔讀取與引擎啟動並行，讀完後再跑 `saveFaults`）；`checkGameHook` 輪詢間隔由 `250ms` 縮短為 `50ms`，且 `withTimeout` 結束後清除計時器避免阻擋程序結束。
   - **消除跨模組重複網路請求（`d2edit.js`、`helper/autobot.js`、`lang/lang.js`、`modifier/editor.html`）**：
     - `autobot.js` 的 `connect()` 將已抓到的 `Game-*.js` 原始碼直接傳給 `loadSkillTables(url, source)`，消除同一檔案重複抓取 3 次的問題，並將 `itemArt-*.js` 與 `saveTransfer-*.js` 改為並行 `import()`。
     - `d2edit.js` 建立共用的 `window.__d2changelogPromise`，供 `selfcheck.js`、`autobot.js`、`d2edit.js`（`gameBuild`）共用，且 `editor.html` 在 `window.api.gameBuild()` 已取得版本時不再重複跨網域抓 `/changelog.json`（由 4 次降至 1 次）。
     - `d2edit.js` 記憶化 `backend.assets()`（並在工具包載入進度條預熱 `items.json`），`backend.i18n()` 移除多餘的 `structuredClone` 與淺拷貝（`postMessage` 本身已做結構化複製），`editor.html` 的 `load()` 改為並行執行 `assets()`、`i18n()` 與 `load(mode)`。
     - `lang/lang.js` 的 `assetUrl` 優先處理 `translate-*.js`／`lang-*.js`／`Game-*.js`，點陣字型掛接前 3 秒輪詢間隔由 `500ms` 縮短為 `100ms`。
   - **已驗證**：
     - 單元與整合測試：`node verify/verify.cjs --quick` **13／13 項全數通過**（含 `selfcheck`、`lang`、`build-web`、`item-db`、`weapon-sets`、`autoforge`、`autobot` 208 項等）。
     - **官方網址實機驗證（`https://d2survivors.lol/play/`，隔離 Electron 設定檔）**：
       1. `node verify/live-smoke.cjs`：實機煙霧測試通過（`20261105.3`，amazon，進入戰局 `playing`、輔助器 `connected: true`、語言 `gameHooked: true`、`lang.assets: 0`、自檢 `ok: true`）。
       2. 實機載入測速對照（點書籤載入 `d2edit.js` 至自檢完成，再從選單點開修改器至顯示「已讀取」）：
          - 對 `d2survivors.lol` 發出的請求數：**53～60 個 → 7～9 個**（減少約 85%）。
          - 物品引擎掃描分塊數：**46 個（約 3.3 MB）→ 2 個**。
          - 物品引擎啟動耗時（`engine.ms.完成`）：**351～356 ms → 160～165 ms**（加快約 54%，其中「抓取程式＋比對特徵碼」由 **263～269 ms 降至 74～76 ms**）。
          - 修改器點擊開啟至「已讀取」耗時：**122 ms → 75～99 ms**。
   - **未驗證**：真實 iPhone Safari／行動網路高延遲環境下的實際秒數（理論上因省去 44 個分塊請求與多輪波段往返，高延遲環境改善幅度更大）；正式部署至 GitHub Pages 後的快取行為。
000000000. **【2026-11-09，未提交】遊戲 20261105.3 官方更新 25 項分析完成**（`verify/reports/impact.json` 待分析 0）。
   - 分析以 Codex／AGY 子代理平行執行（每項一個），再對「無法確認」項目深入一輪；結論須附新版程式位置，關鍵項由主代理以 grep 複核。
   - **需修改 2 項（已修正）**：#6 拾取過濾新動作 `hidesell`，`helper/autobot.js:406` 撿寶判斷補上；#10 魔法裝備不可淬鍊且會被還原，`helper/autoforge-ui.js:395、480` 熔爐失敗自動售出前加 `eligible()`。
   - **驗證**：單元測試 `node helper/tests/toolkit-1105.cjs` 14 項通過（含移除 hidesell 的舊版對照會失敗）；官方網址實機載入通過（選單出現、輔助器 connected、無 console 錯誤）。兩項行為因函式未對外暴露，未在實機直接觸發。
   - **原則（使用者 2026-11-09 指示）**：只驗證工具包是否符合官方新規則，不去驗證官方功能本身（例如牛叫是否停止、熔爐砍回 20 的遷移）。
   - 另新增實機腳本 `tests/live-harness/cow-moo-live.cjs`（複製牛約 1 秒死亡並移出 `world.enemies`）、`hf-once-live.cjs`（直接寫入存檔的 forge 不被遊戲保留）。
0000000000. **【已實作並實機驗證 2026-11-09，未提交】遊戲修改「關卡內持續召喚頭目」與「恐懼階自動召喚分身」**（`helper/autobot.js`，`summonAllBosses`、`autoSummonClone`）。
   - **輪序（一次一隻，每隻死後間隔約 3 秒）**：女伯爵、召喚師、尼拉塞克（補上 `boss.key` = pk1/pk2/pk3）、安達莉爾、都瑞爾、墨菲斯托、分身、巴爾，以及 Uber 首領 Lilith（dhn）、Duriel（bey）、Izual（mbr）、Mephisto（mbr）、Diablo（dhn）、Baal（bey）。
   - **鑰匙**：直接呼叫 `director.boss` 不會帶入 `key`，必須自行補上，否則不會掉鑰匙。遊戲規則：鑰匙只在 `world.terror` 存在時掉落（`itemArt-BPHOVK4V.js` 的 `bossSlain`）。
   - **器官**：器官只由 `actBoss` 階級且帶 `organ` 的首領掉落。做法是生成後把 `rank` 改為 `actBoss`、補上 `organ`；`actBoss` 死亡會推入 `actCleared`（會結束關卡），所以用 `guardActCleared` 攔截 `world.events.push`：召喚輪序開啟時攔截所有 actCleared（見下方「修正（同日）」），關閉輪序後恢復原版流程。
   - **Uber Mephisto／Diablo／Baal 的器官對應**依遊戲終局說明文字（Mephisto's Brain、Diablo's Horn、Baal's Eye）推定；`qt` 資料沒有 `organ` 欄位，終局流程（`finale`）的器官是整局結束時發放，與這裡的掉落是不同機制，未測。
   - **分身**：`cloneComes` 每局一次，名稱固定為「Diablo」，體型跟隨當前幕首領。第一幕時是安達莉爾大小。
   - **恐懼階自動分身修正**：場上仍有首領時不再把機會標記為用掉（`autoSummonClone` 只在結果不是「場上已有首領」時才設為 done）。
   - **無敵時不回營地**：`deathReason` 在遊戲修改總開關與無敵都開啟時直接回傳空字串（原本因預估致死傷害會 `returnToSafety` 回營地）。
   - **實機（官方 `/play/`，隔離存檔）**：
     - `clone-after-boss-live.cjs`：場上首領存活期間分身未召喚；首領死亡後約 0.5 秒召喚。
     - `summon-bosses-live.cjs`（120 秒）：無回營地、狀態一直 `playing`，34 次召喚，名單各種頭目皆出現。
     - `summon-drops-live.cjs`（200 秒）：鑰匙掉 2 次（憎恨、毀滅）；女伯爵 12 次未掉鑰匙（機率約 10%，樣本不足，未下定論）。
     - `summon-drops-live.cjs`（200 秒，輸出 `backups/summon-uber-live.json`）與同腳本 240 秒（`backups/summon-uber-live-240.json`）：Uber Lilith、Duriel、Izual 各 5 次擊殺，器官各 5～6 次掉落，全程第 0 幕、`clearing` 未出現，狀態 `playing`。
     - `summon-drops-live.cjs`（240 秒，六個 Uber 全部加入）：六個 Uber 各約 5 次擊殺，器官共 30 次（每種器官 10 次，含兩個 Uber 的同種器官），關卡未結束，狀態 `playing`；`backups/summon-uber-all.json`。
   - **真實恐懼階實測（2026-11-09，`tests/live-harness/real-terror-live.cjs`，使用者 D2S1 存檔解碼副本，職業 sorceress，輔助器自動「天梯→推關」，非手動設定）**：
     - **掉落確實進入存檔**：鑰匙、器官不在背包，而是存於 `save.pandemonium`（以物品 id 陣列記錄，`itemArt-BPHOVK4V.js` 的 `Kv`）。實測 150 秒後 `pandemonium` 內 pk1 2、pk3 1、dhn／bey／mbr 各 3，且與 localStorage（`d2-survivors/save/v1`）內容相同。**已驗證重新載入保留**（`real-persist-live.cjs`，重新載入頁面後記憶體與 localStorage 的 pandemonium 一致：pk2 1、pk3 1、dhn／bey／mbr 各 4）。
     - 真實推進：恐懼層 50 → 51 → 52，`world.terror` 為遊戲原生物件（tier 50、level 135）。
     - 精華也會在真實恐懼階掉落（1–2 次／150 秒，來源 `essence`，非召喚來源）。
     - **pauseStageTime 在真實恐懼階無效**：`director` 的波次邏輯每幀以擊殺數重寫 `actStart`（`report-qBYpdFlM.js`，`e.actStart=e.time-ps(t,e.kills)`），所以 `actTime` 隨擊殺增加。實測 actTime 約 334 時關卡清場、進入下一層（51）。目前這表示恐懼階仍會依擊殺推進，**不能用時間暫停來無限停留**。
     - 一次「暫停」測試中角色曾進入 `dead`（約 131 秒，無敵開啟）；原因未確認。
   - **修正後（同日）**：
     - **時間暫停**：改為在原版 tick 結束後再對齊一次 `actStart`（`helper/autobot.js` 的 tick 包裝）。實測恐懼層 50 的 actTime 全程 0，擊殺數從 367 增至 4349，期間沒有因時間清場。
     - **精華輪序**：恐懼階中，幕首領（安達莉爾、都瑞爾、墨菲斯托、巴爾）以 `actBoss` 生成（非恐懼階維持 `boss`）；實測精華掉落 24 次（`essence` 來源），來自召喚的幕首領。
     - **清場來源（已查明）**：`actCleared` 事件由 `bossSlain` 的 actBoss 分支推入；`Game` 處理事件時，凡非 banner／chest／act／cloneCame／cloneSlain／primeSlain 的事件都會觸發清場（`Game-DPAk-Rvc.js` 的事件迴圈）。實測第一次清場來自 actCleared，當時攔截計數為 41 次看到、40 次攔截，有 1 次未攔截（原因未確認，可能是攔截配對與死亡旗標的時序問題）。
     - **修正（同日）**：召喚輪序開啟時，`guardActCleared` 改為攔截所有 actCleared（不再依死亡配對），並清除已死亡的待配對項目。實測 240 秒（法師、恐懼層 50、時間暫停開啟）：擊殺 7180、清場取樣 0 次、無 tierVictory、層數不變；攔截計數 56 看到、56 攔截。器官 31、精華 34、鑰匙 3，存檔 pandemonium 內 dhn／bey／mbr 各約 10。
     - **「town」記錄（已查明）**：`tierVictory()`（經 `waitForPortal` 呼叫）會把狀態設為 `dead` 並顯示通關畫面，之後進入城鎮整備，再推進下一層。所以先前的 `town`／`dead` 紀錄是恐懼層通關流程，不是角色死亡，也不是離開關卡。
     - **「town」記錄的解釋（推測）**：清場後遊戲會進入城鎮整備（自動輔助器的「整備」動作），所以先前「清場→town→playing」的紀錄很可能是正常的恐懼層推進流程，而不是離開關卡。需要實機確認，目前仍視為推測。
     - **關閉後恢復原版流程（已驗證，`backups/restore-original.json`）**：60 秒後關閉「持續召喚頭目」與「關卡時間暫停」，actTime 恢復前進，約 109 秒進入清場、116 秒 tierVictory、進入第 51 層，之後正常推進至 52 層。
     - **死亡（已查明）**：`g.die`、`dieForGood` 在測試中都沒有被呼叫，所以先前的 `dead` 是 `tierVictory`（通關），不是陣亡；沒有實際的角色死亡紀錄。
   - **未驗證**：
     - 攔截 `actCleared` 的長時間對照：對照組（`H_NOGUARD=1`，只移除攔截呼叫，150 秒）：`clearing` 出現在 116/150 次取樣，擊殺僅 473、Uber 擊殺 18 次（器官 18 次照常掉落）；狀態仍為 `playing`，第 0 幕未換關，因此「會結束關卡」在 150 秒內未觀察到。同時間攔截版（`control-guard.json`）：`clearing` 0 次、擊殺 8081、Uber 擊殺 17 次。**結論：攔截對持續輪序的吞吐量有實際影響（沒有攔截時關卡進入清場狀態，怪物與召喚明顯變少）；是否會最終離開關卡，需要更長時間或清場後的傳送門流程才能確認。**
     - `backups/control-noguard.json`、`backups/control-guard.json` 為對照結果。
     - **長時間對照（不攔截，421 秒，`backups/control-noguard-long.json`）**：`clearing` 出現在 380/420 次取樣；擊殺 527；Uber 擊殺 54 次，器官 54 次照常掉落；第 0 幕、`worldSwaps` 0（世界物件未更換）。狀態在約 83 秒時出現一次 `town`，約 2 秒後回到 `playing`（第 0 幕未變）。**這是目前唯一看到狀態離開 `playing` 的紀錄，但原因未確認**（是否為清場後的傳送門流程，或是其他流程）；需要另外確認這次 `town` 的觸發原因。攔截版在 240 秒內未出現 `town`（既有紀錄）。
     - `uberPending` 若有首領死亡但遊戲未推入 `actCleared`，之後一次真正的 `actCleared` 會被誤攔（程式上存在，未觸發）。
     - 恐懼階以程式手動設定 `world.terror = { tier: 1, level: 86, affixes: [] }`，不是正式的恐懼階／Uber 路線。
     - Uber Mephisto／Diablo／Baal 的器官對應與終局流程。
     - 使用者 D2S1 存檔未測（只用隔離存檔）。
     - 完整的遊戲流程（正式關卡推進、死亡後存檔）；死亡路徑本身未在實機觸發過。
   - 測試腳本：`tests/live-harness/clone-after-boss-live.cjs`、`summon-bosses-live.cjs`、`summon-bosses-trace-live.cjs`、`summon-drops-live.cjs`、`larzuk-pause-live.cjs`（皆為未追蹤檔案，尚未 commit）。
000000000. **【已實作並實機驗證 2026-11-09，未提交】遊戲修改新增「拉蘇克精華數量 99」與「關卡時間暫停」**（`helper/autobot.js`）。
   - **拉蘇克精華**：沿用恐怖燃燒精華的做法，寫入背包 `type: "essence"`、`base: "Larzuk's Essence"`、`count: 99`（遊戲字典與 `d2d` 規則皆用此名稱）。
   - **關卡時間暫停**：遊戲以 `world.time - world.actStart` 計算本關經過時間；開啟時每幀把 `actStart` 對齊 `time`，經過時間恆為 0。
   - **已驗證**：`node --check`；`electron helper/tests/autobot.cjs` 208 項通過。
   - **實機（官方 `/play/`，隔離設定檔，`tests/live-harness/larzuk-pause-live.cjs`）**：拉蘇克精華 0 → 1 堆疊、數量 99；關卡時間暫停開啟 8 秒期間 world.time 前進 7.77、actTime 僅前進 0.02，擊殺 3 → 12（持續戰鬥）；關閉後 actTime 恢復前進（3 秒後 +3.0）。
   - **未驗證**：Boss 出場與恐懼階計時在暫停期間的行為；較長時間（數分鐘）的暫停；手機版面（選單項目為既有 field 格式，未另做排版）。
00000000. **【部分實作 2026-11-09，未提交】掛機與效能優化（工具包選單「掛機」＋效能頁「優化開關」）**
   - **分兩類**（使用者定義）：一般遊玩＝保留畫面的優化；掛機＝只要能跑、可以沒有畫面。
   - **掛機**（`d2edit.js`，選單項目「掛機」）：先恢復遊戲（若暫停），再以黑幕遮罩，遊戲與輔助器照常執行。掛機時略過 Pixi 主畫面繪製（`renderer.render` 的 container 為 `app.stage` 且無 `target`），離屏貼圖照常。喚醒後 `__d2autoforgeUI.redraw()` 重畫面板。自動淬鍊面板的「掛機」按鈕已移除。
     - **實機（官方 `/play/`，`tests/live-harness/afk-perf-live.cjs`）**：淬鍊中掛機時 renderer 呼叫次數降為 0（攔截 5130 次主畫面繪製）；步數照常增加；喚醒後遮罩移除、面板可見。CPU 絕對值很低（renderer 約 0.4%→0.2%），單次量測誤差可能接近差距，尚未作為結論。
     - **未驗證（打怪）**：`tests/live-harness/afk-combat-live.cjs` 使用使用者 D2S1 存檔副本（99 級），A 段 kills 仍為 0，角色沒有穩定在戰鬥中，無法證明掛機不影響打怪。需要可升級的角色（副本或全新存檔）才能驗收。
   - **優化開關**（效能頁，`perfOpts` 存在 localStorage `d2toolkit.perfopts.v1`）：
     - 一般遊玩（保留畫面）：「降低解析度」（Pixi resolution × 0.75）。**實機（`tests/live-harness/perf-lowres-live.cjs`）**：1.5→1.125，畫布寬 1629→1222，切回還原，畫面仍在。`resize` 取整造成螢幕寬高有小數誤差。
     - 掛機（不需畫面）：「掛機時略過主畫面繪製」（預設開）。
   - **減少特效**（已實作，效果未量化）：只隱藏 `flashes`／`rings`／`zones` 的 `gfx`（`visible=false`），不改判定陣列（`rings`、`zones` 參與傷害）。實機（`afk-combat-live.cjs`，`H_OPTS`）：開啟時 fxMax 1/1 被隱藏；但此情境效果很少，對 GPU 的影響未量到。
   - **記憶體整理**（已實作，效果未量化）：每 0.5 秒移除 `dead` 的效果項目並呼叫 `renderer.textureGC.run()`。實機 JS 堆積在 80–90 MB 之間波動，無法證明確實省下記憶體。
   - **打怪驗收**（全新角色，`afk-combat-live.cjs` 不設 `H_SEED`）：A 段擊殺 +75，B 段（掛機）+137，C 段（喚醒後）+95，等級 2→6→9→10。使用者 D2S1 存檔（99 級）擊殺仍為 0，該存檔不適合驗收。
   - **CPU（`afk-perf-live.cjs`，淬鍊中）**：A（未掛機）GPU 0.403、renderer 0.392；B（掛機，淬鍊 99 步）GPU 0.214、renderer 0.233。單次量測，單位為 Electron `percentCPUUsage`。
   - **舊實機腳本**（`afk-live`、`afk-fresh-live`、`afk-bg-live`）已改為選單「掛機」。
   - **手機版排版（390px，`tests/live-harness/perf-mobile-live.cjs`）**：修正前數值欄被擠成單字一行（標籤 `auto` 欄過寬）；改為兩欄等寬、標籤可換行後無重疊、無水平溢出，開關列高 59px。選單項目高度未量到（量測時選單收起）。
   - **afk-bg-live（改動後重跑）**：掛機前補充精華並重新開始淬鍊後，掛機中步數 102→120、running=true，遮罩覆蓋、點擊喚醒後面板恢復。精華在進入最小化前已耗盡，所以「最小化」那一段沒有實際淬鍊，背景淬鍊仍未在改動後驗證。
   - **減少特效／記憶體整理量測（`afk-combat-live.cjs`，全新角色，三段各 60 秒，節點端每秒取樣 CPU%，`H_OPTS` 開與關各跑一次）**：
     - **CPU（開 vs 關）**：一般段 GPU 0.406 vs 0.395、renderer 0.574 vs 0.581；掛機段 GPU 0.372 vs 0.351、renderer 0.579 vs 0.604；喚醒段 GPU 0.624 vs 0.475、renderer 0.847 vs 0.724（喚醒段等級與物件數不同，差異不可直接歸因）。**結論：此情境下減少特效沒有可量到的 CPU/GPU 差異**，因為效果物件數量很少（最大 2 個，其中 1 個被隱藏）。
     - **記憶體**：JS 堆積兩組都在 80–95 MB 之間，無明顯差異。受管貼圖數在喚醒段 關閉 289 vs 開啟 163，方向符合記憶體整理的作用，但只有一次量測。
     - **高密度場景（使用者要求：怪物數量最大化＋一般怪物全部精英，`H_CHEAT=1`，全新角色，三段各 60 秒）**：擊殺約 1000、場景物件最多 2338。開與關對照：一般段 GPU 0.606 對 0.631、掛機段 0.550 對 0.531、喚醒段 1.245 對 1.140（開啟較高）；renderer 無改善。效果陣列（flashes／rings／zones）總數僅 2，開啟時隱藏 1；貼圖數喚醒段 1396 對 1292，**記憶體整理未重現先前的下降**。
     - **貼圖診斷（修正先前結論）**：先前「約 347 張閒置殘留貼圖」的推論有誤，當時把貼圖「物件」與貼圖「來源」混為一談。正確計數：管理中的貼圖來源約 327 個，其中閒置超過 3 秒的只有 42 個；其餘在最近仍被每幀觸碰。Pixi 的自動 GC 對這些貼圖沒有作用（`autoGarbageCollect=false`），手動卸載閒置來源（`unload()`）也只能減少約 42 個，效益可忽略。**貼圖堆積的主因是大量貼圖在場景中持續被使用（每隻怪可能各自產生貼圖），要降低需找出建立貼圖的遊戲程式碼並重用貼圖，不是閒置回收能解決。**
     - **貼圖重用調查（20261105.3 bundle）**：`itemArt` 的物品圖示走 Pixi Assets 載入（SVG → canvas → texture），依 URL 快取，未發現「每隻怪或每件物品各自重新建立貼圖」的程式碼；`Game` 的 `generateTexture` 只在載入時呼叫。結論：受管貼圖數（約 600）主要是遊戲載入的素材本身，不是重複建立。要降低記憶體，需要的是卸載用不到的素材（例如其他職業的圖示），而不是重用，這需要對素材使用範圍做更完整的追蹤，尚未實作。
     - **降低解析度的效能量測（高密度場景，同一次工作階段對照，視窗 1086×737）**：開啟 vs 關閉：一般段 GPU 0.589 vs 0.581、renderer 0.853 vs 0.863；掛機段 GPU 0.444 vs 0.411、renderer 0.733 vs 0.711；喚醒段 GPU 0.855 vs 0.869、renderer 1.206 vs 1.234。**結論：在此視窗大小下，降低解析度沒有可量到的 CPU/GPU 改善。** 較早的一組對照差距是跨執行比較造成的假象，不採用。瓶頸推測在 CPU 端（物件數與遊戲邏輯），而非填充率；大視窗（如 1920×1080）下解析度的影響可能較大，尚未測試。
     - **記憶體整理開關**目前只剩 Pixi GC 參數與手動卸載，實測無可證實效益；建議保留為實驗性（預設關閉），或拿掉。
     - **結論**：兩個開關目前沒有可證實的效益，且鎖定的物件（效果陣列）不是高密度下負載的主要來源（增加的是怪物精靈與場景物件）。要真正降低負載，需針對怪物精靈、場景物件或貼圖本身另做探測與實作；目前開關保留為實驗性，預設關閉。
     - **背景最小化淬鍊（改動後，`afk-bg-live.cjs`，開始前補充精華，H_BG_MS=150000）**：最小化 150 秒期間步數 6→99，精華用完後正常停止；隨後掛機步數 103→122、running=true，遮罩覆蓋、喚醒後面板恢復。
0000000. **【已實作 2026-11-09，未提交】工具包選單新增「效能」全螢幕頁面**（`d2edit.js`）。以 `registerToolkitFeature({ id: "perf", order: 40 })` 登錄，點開後顯示即時指標：畫面更新率（FPS）、影格間隔（平均／最慢）、長任務（>50ms，自開啟後；不支援的瀏覽器會標示）、JS 記憶體（Chrome 系；其他瀏覽器標示不提供）、DOM 節點數、已載入資源數量與約略大小、頁面載入時間、視窗與裝置資訊。數據每 0.5 秒更新；關閉即停止動畫迴圈與長任務觀察。重新點書籤時會關閉舊的效能頁（`window.__d2perfClose`）。純讀取，不改遊戲與存檔。
   - **實機（官方 `https://d2survivors.lol/play/`，隔離設定檔，工具包經本機攔截載入，`tests/live-harness/perf-page-live.cjs`）**：選單出現「效能」；點開後頁面顯示且各欄位有數值（FPS 57、影格約 17.7ms、DOM 530、資源 250 個）；約 1.6 秒後 FPS 仍有更新；「關閉」可收回；再開一次正常；無錯誤。
   - **未驗證**：手機寬度版面（標籤欄與數值欄在 375px 寬度下的排版）；已發布的 GitHub Pages 版本（本次為本機待測檔）；真實 iPhone Safari 與 Chrome 隱藏分頁的量測值；玩家公告日誌尚未加入（若要發布需另補）。
000000. **【已實作 2026-11-09，未提交、未實機驗證】自動淬鍊「伺服器無回應」改為暫停 5 分鐘後繼續**（`helper/autoforge-ui.js`）。
   - **改動**：原本以 3→6→12→24 秒重試、連續 4 次後整串停止；改為每次無回應暫停 5 分鐘（`RETRY_PAUSE_MS`）後自動繼續，不再因連續無回應而停止。暫停採每秒檢查，按「停止」可立即中斷。面板顯示「剩餘 mm:ss」倒數（每秒只更新倒數文字，不重畫面板）。
   - **已驗證**：`node --check` 語法通過；`node helper/tests/autoforge.cjs` 全部通過（僅決策邏輯，不涵蓋此 UI 流程）。
   - **未驗證**：官方 `/play/` 實機觸發「無回應」並等待 5 分鐘後續跑的流程。
00000. **【已發布 2026-11-09，PR #29】自動淬鍊：用過地獄熔爐的裝備不再列出；熔爐失敗自動售出修正**（`helper/autoforge-ui.js`）。
   - **改動**：背包／倉庫可淬鍊清單排除所有 `forge.hf`（成功倍增或失敗清空皆排除，遊戲每件只能熔爐一次）；放上鐵砧時同樣不載入面板（tick 直接跳過），熔爐失敗且開啟自動售出者仍會售出；序列遇到則標示「已用過地獄熔爐，略過」。`sellItem` 改以 id 重新找到目前物件（熔爐後舊參照會賣不掉）、倉庫裝備先 `fromStash` 移回背包再賣，並以 id 確認真的離開背包／倉庫才回報成功（修前倉庫會假成功）。
   - **實機（官方 `/play/`，隔離存檔）**：`tests/live-harness/autoforge-sell-stash-live.cjs`。修前：清單仍列出熔爐失敗裝備；倉庫售出失敗（金幣不變）但面板顯示「已自動售出」。修後：清單排除、背包與倉庫皆售出（金幣 398→796）。
   - **未驗證**：真實熔爐「失敗」後由 `loop()` 呼叫售出的路徑（使用者回報的背包「沒作用」可能就在這條路徑，參照過期推測，尚未在實機重現）；需要能穩定觸發熔爐失敗的測試流程。
0000. **【已實作 2026-11-09，未提交】修改器「製作裝備」改為逐步選單**（`modifier/editor.html`）：順序為「裝備類型 → 品質 → 武器種類（僅武器）→ 底材」，每一步選完才顯示下一步（未選完前屬性區塊與製作按鈕皆隱藏）。品質與底材只列出該組合真的有的項目（暗金／套裝依原版目錄、符文之語依原版允許底材、魔法／稀有／普通為該類型全部底材）；（2026-11-09 更正：未解除限制時暗金、套裝、符文之語也列出，依 `editor.html` 更新日誌「未解除修改限制也能製作」，屬性種類與數量固定為原版，走 `renderCraftFixed`／`makeCustom` 的固定品質分支。）改動任一上游選擇會清空其後的選擇。實作：`refreshCraftChain`、`craftBaseNames`（`modifier/editor.html`）。**已驗證**：`electron modifier/tests/craft-weapon-kind-ui.cjs`（夾具：未解除限制與解除限制兩種情境）通過；craft-diagnostic／socket／save-faults／weapon-sets UI 測試與 craft-limits、item-db 皆通過。**未驗證**：官方 `/play/` 實機（`tests/live-harness/craft-weapon-kind-live.js` 已更新為新流程，但 `craft-live.cjs` 的 H_IN=editor 仍找不到修改器 iframe）；手機版排版。
000. **【已實作 2026-11-09，未提交】修改器「製作裝備」武器種類選單**（`modifier/editor.html`）：分類選「武器」時出現「武器種類」下拉（全部武器／劍／斧／弓…），依底材 `itype` 篩選底材清單；其他分類隱藏。`WEAPON_KIND_ZH` 為中文對照，`modifier/i18n.js` 補英文。**已驗證**：`electron modifier/tests/craft-weapon-kind-ui.cjs`（本機 editor.html 夾具）通過，既有 craft-diagnostic／socket／save-faults UI 測試與 craft-limits、item-db 皆通過。**未驗證**：官方 `/play/` 實機（`tests/live-harness/craft-weapon-kind-live.js` 已寫好，但 `craft-live.cjs` 的 H_IN=editor 找不到修改器 iframe，需先解決開啟修改器的前置步驟）；手機版排版。
00. **【已發布 2026-11-09】自動淬鍊：背景執行、序列、來源、同名加入、未升級警告**（`helper/autoforge-ui.js`）。發布方式：`verify/publish.cjs --confirm` 因需要遊戲更新的正式測試紀錄而被擋，改以 git 直接推送 main（工具包改動不涉及遊戲版本）。
   - **改動**：「開始」併入序列（有序列就依序淬鍊，否則淬鍊鐵砧上這件）；控制列（開始／停止／掛機）置於面板最上方；「加入同名（N）」一次加入同名同底材裝備；來源可選「角色背包」或「個人倉庫」（`stashTabs[角色]`）；被選為目標（數值 > 0）的屬性，連續 200 次成功淬鍊未升級時在面板跳出警告（每件重置，不停止淬鍊）。
   - **實機（官方 `/play/`，全新存檔，`tests/live-harness/afk-fresh-live.cjs`、`queue-source-live.cjs`、`afk-bg-live.cjs`）**：掛機遮罩蓋滿且點遮罩可喚醒；掛機期間步數持續增加；同名加入產生 2 件序列；倉庫裝備放上鐵砧後遊戲接受並實際淬鍊（13 步）。
   - **背景**：Electron 最小化 6 分鐘，步數 6 → 99，因精華不足正常停止（`afk-bg-live.cjs`，`H_TARGET=3 H_BG_MS=360000`）。**未驗證**：真實 Chrome 隱藏分頁（超過約 5 分鐘的 intensive throttling）、手機 Safari／Chrome 背景行為。
   - **警告功能**：使用者決定「200 次上限不用實機測試」。`warn-live.cjs` 曾把計數預設為 199 跑一次，警告有實際跳出（未作為正式驗收）。
   - **完成判準（使用者決定 2026-11-09）**：以 Electron 最小化 6 分鐘實測為準，視為「背景自動淬鍊完成」。手機與真實 Chrome 隱藏分頁不納入本次判準，若日後需要再另行驗證。
0. **【已發布 2026-11-09】工具包單一選單＋自動淬鍊免鐵砧**：暫停時左上角只剩「工具包」按鈕（`d2edit.js`），點開選擇自動淬鍊、輔助器、語言、修改器；舊的輔助器／語言按鈕以 CSS 隱藏，功能仍由各模組處理。功能登錄表 `window.__d2toolkit.register({ id, label, open, order })` 供之後新增功能使用。自動淬鍊（`helper/autoforge-ui.js`）改為可由工具包開啟（`__d2autoforgeUI.open()`），背包可淬鍊清單新增「選取」按鈕；遊戲 `forgeTry` 不需鐵砧選單開著。**實機（官方 `/play/`，隔離設定檔，`tests/live-harness/toolkit-menu-live.cjs`，測試存檔注入一件暗金戒指）**：暫停後工具包按鈕出現、舊按鈕隱藏、選單四項齊全；從選單開自動淬鍊時 `forgeUp=false` 面板仍顯示；背包「選取」後裝備載入（4 條屬性列、開始可用）；收合即關閉；從選單開輔助器正常；恢復遊戲後按鈕隱藏。**未驗證**：實際淬鍊流程在工具包內開啟後是否跑完（只測到選取與載入，未啟動）；手機寬度版面；選單截圖（測試截圖為恢復遊戲後的畫面）。
0a. **【已發布 2026-11-09】自動淬鍊機率精確化**：`helper/autoforge.js` 新增 `exactOdds`（多項式係數精確計算，取代蒙地卡羅）；面板改用它，改下拉選單後同步重繪約 0.5–1.8 ms。**實機（官方 `/play/`，隔離設定檔，`tests/live-harness/autoforge-latency-live.cjs`，使用者存檔副本的 Nature's Peace）**：6 次改選單的同步重繪 0.5–1.8 ms，兩幀約 20 ms。**未驗證**：舊版實機對照（舊版耗時為 Node 量測，非遊戲內量測）；手機寬度；其他職業與裝備；熔爐實際執行結果。
1. **【待使用者決定】繁中怪物同名衝突**：`translate("Horror")` 翻為恐骨骷髏、`Slayer` 殺戮僕魔，但字典基礎譯名為驚駭、屠殺者（用於技能或稱號）。待決定：A. 怪物名僅在明確怪物欄位使用；B. 維持現狀。
2. **【待使用者決定】`cleanCJK` 空白與標點處理**：`cleanCJK` 會吃掉逗號，約 2,434 條譯文逗號受影響。待決定：A. 維持現狀；B. 加入長句逗號保護；C. 採用點陣字型映射。
3. **【待使用者決定】字典 165 條韓文對齊**：依韓文官方資料修正 `Fiend` 為惡魔、`Rule` 為統御，需使用者確認是否接受此批詞條變更。
4. **【已刪除 2026-11-10】`modifier/overrides/game-overrides.js`**：使用者同意刪除，連同 `d2edit.js` 的載入段移除（詳見本節最上方 2026-11-10 項目）。
5. **手機版比較框排版**：`lang/lang.js` 已新增 `planTipLayout`（避免裝備框蓋住操作按鈕），純函式單元測試已過，尚待真實觸控手機或官方實機驗證。
6. **鍛造精華作弊與實機接受度**：`cheat.forgeMax` 已改為遊戲真實格式（`type: "essence"`、`base: "Burning Essence of Terror"`、`count` 99）；官方 /play/ 實機（`tests/live-harness/forge-essence-live.cjs`）確認存檔內出現精華堆疊且 count=99。尚未驗證：鍛造面板顯示數量、實際鍛造是否被遊戲接受、重新整理後是否保留。
7. **桌面版封裝**：網頁端修改已同步至啟動器程式碼，但尚未執行正式桌面 exe 重新打包（`publish.cjs --desktop`）。
8. **淬鍊機率實測（單次，2026-11-08）**：暗金 The Stone of Jordan（5 條屬性，由修改器引擎產生），官方 /play/ 隔離存檔，`H_PLAN=hellforge` 連續淬鍊 25 次（成功 11、失敗 14，精華 98→74）。
   - 成功淬鍊的分布：s1（最大魔力 %）4 次、s3（+技能）2 次、s2（閃電傷害）1 次、s0（+魔力）3 次；s4 從未被選中。
   - 失敗率隨總次數上升（total 9 之後連續失敗）。失敗同樣扣精華。
   - 總數達 10 後執行熔爐：結果 `All tempers lost`，全部淬鍊清空，寫入 `hf: 1`，精華扣 1。本次未見倍增。
   - **批次實測（10 個平行隔離存檔，同款裝備，各跑至總數 10 再熔爐）**：淬鍊 228 次，成功 100、失敗 128（約 56%）。成功分布：s2 28、s1 27、s0 25、s3 20；s4 在 100 次成功中從未出現，推測為不可淬鍊。熔爐 10 次：「All tempers doubled」2 次（約 20%）、「All tempers lost」8 次。
   - **未確認**：s4 不可淬鍊的推論需確認；失敗率是否隨總次數上升尚未分析；倍增與清空的條件未知。
   - **第二批（8 件，皆由收藏庫解鎖流程生成，隔離存檔）**：暗金 Nagelring（4 條）、Tarnhelm（4）、Biggin's Bonnet（6）、Treads of Cthon（6）；套裝 Civerb's Ward（3）、Hsarus' Iron Heel（3）、Hsarus' Iron Fist（3）、Civerb's Icon（2）。淬鍊 14～36 次，失敗率約 25%～60%（依件而異）。熔爐：倍增 3 件（Biggin's Bonnet、Treads of Cthon、Hsarus' Iron Heel），其餘 5 件清空。6 條屬性的裝備淬鍊到 s4、s5，4 條以下的裝備只見 s0～s2，故可淬鍊屬性不是單純依序號決定，須以實際屬性種類判斷。
   - **需求更新**：使用者要求屬性等級可設為 X（禁止淬鍊）。X 的命中視為失敗，須清除；0 為不限，命中不算失敗。
   - 測試腳本：`tests/live-harness/temper-game-flow-live.cjs`（`H_ITEM` 指定裝備 JSON、`H_PLAN=hellforge`，已記錄每次淬鍊的 `forge.t`）。
9. **恰西自動淬鍊（開發中，2026-11-08）**：決策 `helper/autoforge.js`（X／0／數字目標、補足 10 次淬鍊後才熔爐、熔爐一次性）與迴圈面板 `helper/autoforge-ui.js`（精華 99 且恰西商店開著時顯示；載入後由遊戲 `forgeTry` 執行）。單元測試 `helper/tests/autoforge.cjs` 全部通過。實機（官方 /play/，隔離存檔，The Stone of Jordan，目標 s0≥2、s1≥1）：完整跑通一次，淬鍊 19 次、熔爐「All tempers doubled」、結束，精華 99→79。
   - **未驗證**：恰西商店面板的實際畫面與位置；X 命中後清除的實機流程；熔爐清空後停止的實機流程；精華不足的停止條件。
   - **已知限制**：無備份機制，熔爐清空後裝備無法再熔爐，自動模式只能停止。
   - 測試腳本：`tests/live-harness/autoforge-live.cjs`（H_ITEM 指定裝備 JSON）。
   - **地獄熔爐失敗自動售出（2026-11-08，已實作、待實機）**：`helper/autoforge.js` 新增 `hellforgeFailed(forge)`（hf 且淬鍊清空）；面板顯示「⚠ 地獄熔爐已失敗」，新增「地獄熔爐失敗就自動售出」開關（記在 localStorage）。售出走遊戲 `gearActions.sell`，暫時關閉 `forgeUp` 以免被改成放上鐵砧，失敗則還原鐵砧。單元測試已過。**實機（官方 /play/，隔離存檔，`tests/live-harness/autoforge-hf-sell-live.cjs`，測試裝備為 hf:1 空淬鍊的仿製暗金）**：開關關閉時顯示「⚠ 地獄熔爐已失敗」且物品保留；真實點擊勾選後物品售出、金幣 0→210、開關值寫入 localStorage。**未驗證**：真實遊戲產生的熔爐失敗裝備、穿戴中裝備能否售出、自動淬鍊跑完熔爐失敗後的自動售出路徑。

10. **自動淬鍊：熔爐成功排除＋模擬機率（2026-11-08，單元測試通過，待實機）**：
   - 規則：熔爐成功（`hf` 且淬鍊總數 > 0）的裝備不進入背包可淬鍊清單，序列遇到時標「熔爐已成功，略過」，單件模式停用開始；`decideNext` 對此類裝備直接回 `done`，不會 `clean` 洗掉倍增結果。實作 `hellforgeSucceeded`（`helper/autoforge.js`）與 `bagItems`／`runQueue`／`render`（`helper/autoforge-ui.js`）。
   - 機率：面板依目前目標以 `exactOdds`（精確計算，毫秒級，無亂數）估算每回合走到熔爐機率 h、期望精華 E 與期望每成功一件精華 E/q。成功率即熔爐倍增率 q（達標後必定走到熔爐）。`simulateOdds`（蒙地卡羅）僅保留作為測試對照，面板不再使用（舊版 2000 步上限會把困難目標截斷成 0%，且每次點選卡數十秒）。參數來自實測：淬鍊成功率 100/228、熔爐倍增率 5/18；屬性分布假設均勻，實際依裝備而異。
   - **未驗證**：實機確認倍增裝備不在清單內；面板數字隨設定變動。缺一件真實暗金／套裝（存檔內沒有可用的），需先用收藏庫解鎖流程產生。
   - **熔爐實機樣本（2026-11-08，官方 /play/，10 個隔離存檔同時跑，The Stone of Jordan，`tests/live-harness/hf-stats-live.cjs`）**：有效 49 件，倍增 26、清空 23，倍增率 53.1%（Wilson 95%：39.4%～66.3%）。無效 16 件（伺服器限流 No reply／No connection，另有舊判定把 "not lost" 誤認為清空，已排除）。目標 1000 件未達成，降速重跑（2 存檔、間隔 1 秒）仍在第一次淬鍊就被限流，沒有新增有效樣本。
   - **與先前批次不一致**：先前兩批不同裝備共 18 件，倍增 5 次（約 28%）。兩者信賴區間幾乎不重疊，倍增率可能與裝備有關。目前只用單一裝備，不能合併；面板的 28% 暫不更換。

## 修改器淬鍊／地獄熔爐：已撤回（2026-11-08）
- **決定**：使用者表示遊戲本身就能淬鍊與清除，修改器版本沒有實際用途，因此撤回修改器的淬鍊功能（editor.html、d2edit.js、webapi.js 還原；temper.js 與其測試刪除）。
- **保留的研究結論**（若日後要重做）：直接寫入 forge 會被伺服器紀錄覆蓋（不可行）；唯一的合法路徑是遊戲自己的 `Game.forgeTry`（需 `game.anvil` 設為物品 ID）。實機測試腳本保留在 `tests/live-harness/temper-game-flow-live.cjs` 與 `temper-editor-ui-live.cjs`。熔爐 UI 點擊未測。
- **正確路徑（已實機驗證）**：不直接寫 forge，改呼叫遊戲自己的鍛造流程 `Game.forgeTry(cls, level, act, refresh)`（`window.__d2autobot.game`），前提是 `game.anvil` 設為物品 ID。遊戲自己扣精華、呼叫 `/forge`、套用伺服器回傳的 forge（含伺服器發的 `h`）。
- **實機結果（官方 /play/，全新隔離存檔＋你的存檔之副本，已換新 ID、去掉舊淬鍊）**：
  - 淬鍊：正常，每次扣 1 顆精華；可能失敗（「The temper failed」），失敗也扣精華。
  - 連續淬鍊到 10 次後，熔爐可用；結果隨機（本次測試一次「All tempers doubled」總數 10→20，另一次「清空」）。兩者都寫入 `hf: 1`。
  - 重新整理後：熔爐結果保留，無「存檔在遊戲外被修改」紅字。
- **先前失敗的原因**：直接改 JSON 的 forge 會被伺服器紀錄覆蓋（`syncForgeNow`→`settleForge`→`zF`），這條路不可行。
- **已實作（待 UI 實機驗證）**：`d2edit.js` 後端 `backend.forgeItem(mode, itemId, act)` 呼叫 `game.forgeTry`（已驗證：淬鍊、熔爐經後端路徑回傳遊戲結果、精華扣除、forge 寫回）；`modifier/webapi.js` 加入 `forgeItem` 包裝；`modifier/editor.html` 物品修改的淬鍊／清除／熔爐按鈕改為呼叫後端，啟用狀態依 `temper.js` 規則；製作裝備頁已移除淬鍊設定，改為提示到物品修改處理。
- **修改器 UI 實機點擊（已驗證）**：`tests/live-harness/temper-editor-ui-live.cjs`，官方 /play/、全新隔離存檔。開啟修改器、選到物品，點「淬鍊」兩次（forge 寫入、狀態列顯示遊戲文字、精華扣除），點「清除淬鍊」（狀態列「All tempers removed」，forge 剩 `h`，為遊戲回傳格式；按鈕啟用狀態正確）。遊戲 localStorage 與介面一致。
- **尚未驗證**：熔爐按鈕的 UI 點擊（後端路徑已驗證，UI 路徑只差按鈕呼叫同一函式）；生命 68→67 的原因未明（可能是點陣字判讀）。
- **測試工具**：`tests/live-harness/temper-game-flow-live.cjs`（H_PLAN=hellforge、H_ITEM、H_RELOAD 參數）。
- **未確認**：清除淬鍊（`clean`）是否由遊戲接受；生命 68→67 的原因仍未明（可能是點陣字判讀）。

## 已解決摘要
- **2026-11-09（製作裝備與存檔檢查稽核，未提交）**：
  - **`affixApplies` 特徵碼失效**（20261105.3 起）：遊戲的 `t8` 函式開頭改為 `if(...)return!1;` 形式，舊特徵碼不再命中（`patch` 將其列為選用，失敗時靜默）。結果：`G.__affixApplies` 不存在，魔法／稀有的原版規則檢查全部拋錯，自訂詞綴的可選屬性列表也會失效。已改為同時相容舊寫法與新寫法（`modifier/signatures.json`），各版 bundle 皆命中。
  - **魔法／稀有詞綴的 roll 版本錯誤**：`generateAffix` 寫死 `roll[0]=1`，遊戲 `Y8` 在 `staffMods` 與 `classSkills` 存在時寫 `2`（`m3()`）。含法杖技能（`staff:true`）的詞綴讀檔時被判定「not what its roll makes」。改為與遊戲相同（`modifier/engine-page.js`）。
  - **規則檢查把法杖技能當成詞綴**：`validate` 的 `free` 列表含 `staff` 項，造成遊戲自己產生的物品被判為 `affixStat`/`affixCombo`。改為法杖技能另行檢查（數量 ≤ 3、`skill:` 名稱、數值 1～3）。
  - **實機結果**（官方 `/play/`，`tests/live-harness/craft-random-audit.js`，4244 件）：修正前遊戲判定 475 件不合規；修正後 **0 件**。規則檢查 471 件誤判，修正後剩 12 件皆為「Larzuk's Essence」（非裝備底材，稽核範圍過寬，遊戲接受）。
  - **固定品質稽核**（`tests/live-harness/craft-fixed-audit.js`）：製作 2998 次、失敗 0、超出範圍 1748 次全部被擋。另有 12 件（唯一與符文之語）竄改數值後遊戲仍判定合法（遊戲檢查本身未涵蓋；修改器寫入前已先擋下），記為「遊戲檢查限制」。
  - **既有失敗（非本次造成）**：`modifier/tests/craft-affix-ui.cjs` 在乾淨 HEAD 也失敗（`enabled`／`found` 斷言），待另行處理。
  - 詳見附錄 D。
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
- **2026-11-08（符文之語存檔檢查紅字）**：修改器一鍵解鎖後，存檔檢查出現「not what its roll makes」（遊戲 saveFaults）。修正：`modifier/engine-page.js` 最高數值路徑產生的符文之語不再附 roll（stats 保留）。實機（官方 `/play/`，隔離設定檔，11-04 存檔副本，`tests/live-harness/craft-live.cjs` 攔截本機修改）：修正前遊戲判定 10 項、修正後 0 項，符文之語 roll 數 79→0。
  - **未驗證**：存檔檢查頁按鈕的實機點擊。
- **2026-11-08（手機載入「Load failed」）**：使用者 iPhone 截圖：字典、遊戲資料、修改器頁面、物品引擎全部「載入失敗」，同次的 import() 腳本成功；重新整理即正常（暫時性網路錯誤，伺服器與部署正常）。修法：`d2edit.js` 新增 `hostFetch`（失敗重試 3 次、第 2 次起 `cache: reload`，JSON 最後以 `import(…, {with:{type:"json"}})` 備援），字典、遊戲資料、修改器頁面、`signatures.json` 改用之，並掛在 `window.__d2hostFetch` 供 `lang/lang.js` 字典讀取使用。實機（官方 `/play/`，隔離設定檔，使用者 11-04 存檔副本，`tests/live-harness/fetch-retry-live.cjs`）：注入各檔前 2 次 fetch 失敗、字典 fetch 永遠失敗，結果字典 14367 筆（import 備援）、遊戲資料、物品引擎皆載入，自檢通過。未驗證：真實 iPhone Safari 上 JSON import 備援（需 Safari 17.2+）。
- **2026-11-08（Antigravity：專案最佳化與存檔檢查物品原文顯示）**：
  - **物品引擎快取與取樣最佳化**（`modifier/engine-page.js`）：`fixedInfo` 加入記憶快取（`fixedCache`），並對無隨機 `param` 與法杖技能的非符文之語略過 500 次重複取樣；`affixInfo` 加入快取（`affixInfoCache`）。官方 `/play/` 實機驗證（`craft-live.cjs`）：Harlequin Crest 首次 `fixedInfo` 降至 1.5ms、快取 0.5ms；Ormus' Robes 首次 5.2ms（保留隨機技能 `params`）、快取 0.5ms；`affixInfo` 快取 0.3ms。
  - **存檔檢查顯示單件物品遊戲判定原文**（`modifier/editor.html`）：`renderGuard` 保留 `faults` 回傳的 `why`／`fault` 原文至 `faultyReasons`，`renderDetails` 改顯示 `遊戲判定：<原文>`（僅在近似檢查時退回缺少 `roll` 提示）。已通過 `modifier/tests/save-faults-ui.cjs` 與官方 `/play/` 實機驗證。
  - **啟動、排版與走位最佳化**（`d2edit.js`、`lang/lang.js`、`helper/autobot.js`）：`startEngine` 提前並行抓取 `itemstats.json` 且位於 `/play/` 時省去重複抓取主頁 HTML；`applyTipLayout` 快取 `env(safe-area-inset-top)` 避免每影格建立與移除 DOM 探針；`planMove` 預先計算飛彈平方距離並外提迴圈不變量。
  - **建置與測試套件補齊**（`verify/suite.cjs`、`tools/build-web.js`、`tools/tests/build-web.cjs`、`.gitignore`）：將 `autoforge` 納入 `verify/suite.cjs`，`helper/autoforge.js` 與 `helper/autoforge-ui.js` 納入建置來源檢查。執行 `node verify/verify.cjs --quick` 通過 13／13 項測試，`node verify/live-smoke.cjs --build 20261105.3` 官方實機煙霧測試通過。

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
| `craft-random-audit.js` | 隨機品質製作稽核（每底材魔法／稀有、各暗金／套裝／符文之語的隨機與最高值；遊戲 faults＋validateItems 全檢） |

---

# 附錄 D：珠寶掉落與製作／存檔檢查稽核（2026-11-09）

依據：`game-bundles/20261105.3`（靜態反編譯，主要在 `itemArt-BPHOVK4V.js`、`saveTransfer-BTsCILil.js`）；實機稽核於官方 `/play/`。

## D.1 怪物掉落鏈路
- 擊殺：`AT(e,t)` 只處理 `rank === "normal"`；閘門 `Math.random() < jC.normal(0.03) × RC(qu(e,t))`，`RC = 34 / max(14, 34 − lvl/3)`（lvl 0 為 1，lvl ≥ 60 約 2.43）。成功後同一世界 180 秒內冷卻（只有成功才設冷卻）。
- 其他來源：菁英 `jC.champion × IC`（普通難度 1/3 × 0.4）、Boss `jC.boss`、碎裂物件 `jC.breakable`（0.01）、寶箱、任務首領（`actBoss`、`actBossQuest`）。
- 掉落物件：`Ay(e,x,y,opts)` → `J8(itemLevel, magicFind, opts)` → `Py` 放到地面。`Ay` 的物品等級 `min(99, G6(act, 關卡時間, 難度) + 偏移)`。
- 註：`Game-DPAk` 只有寶箱路徑呼叫 `Ay`（別名 `ye`）；怪物擊殺路徑在 `itemArt` 內部的 `AT`，此處已確認。

## D.2 種類抽取與珠寶
- `B6 = [...z6, ["charm",0.06], ["jewel",0.08], ["quiver",0.2]]`，`z6` 權重合計 8.0，總權重 8.34。`A9(lvl, cls, B6)` 以 `M9` 加權抽取種類；抽到 `jewel` 直接回傳 `Y.get("Jewel")`（不做等級或職業過濾）。
- 珠寶種類占比 0.08 / 8.34 ≈ **0.96%**。這是「抽到珠寶種類」的比例，不是最終拿到珠寶的比例（見 D.4）。
- 商店（`bestBases: true`）走 `z6`，不含 `charm`、`jewel`、`quiver`，所以商店不賣珠寶。
- 底材 `H("jew","jewl",1)`，type `jewel`，1×1。

## D.3 珠寶稀有度與屬性
- `oMe` 依序判斷 unique → runeword → set → rare → magic → normal（門檻由 `sMe`／`nMe` 決定，未逐項算出）。
- `X8`：normal 珠寶強制改為 magic。
- 魔法珠寶：`z9` 前綴、後綴各一次（至少一個）→ **1～2 條**。
- 稀有珠寶：`TAe(c, Q8)`，`Q8 = [3,4]`，每側上限 `wAe = 3` → **3～4 條**（實際可能少於目標，見 `TAe` 的 `i[n]=true` 分支）。
- 屬性池：`d8` 經 `t8`（`rows.on` 含 `jewl`）與 `uNe`（等級、`magicOnly`）篩選；群組互斥用 `I9`。
- 驗證 `i6`：數值不超過 `oke[magic|rare]`；屬性須能由 `r6` 以 `n6.magic`（前後綴各 1、總數 2）或 `n6.rare`（前後綴各 3、總數 4）覆蓋。`r6` 只檢查「可覆蓋」，不檢查最少條數。
- 珠寶不能裝在沒有插槽的物品上（`ske`）。

## D.4 未解決與限制
- **unique／set／runeword 回退**：`J8` 在 `oMe` 回傳這些稀有度時，呼叫 `M7`／`CMe`／`fMe`，這些函式不接受底材，會回傳**非珠寶**的物品；只有查無結果才退為稀有或魔法珠寶。因此真正拿到珠寶的機率低於 D.2 的理論值（未量化）。
- **寶石神壇「四分之一機率掉珠寶」**：更新日誌有此規則，但程式碼中找不到對應位置（`gem` 字樣只出現在字典與經驗寶石）。
- **稀有珠寶條數**：修改器的 `AFFIX_LIMIT.rareJewel` 最少 2 條，遊戲產生器最少 3 條；但遊戲驗證 `i6` 接受 2 條，故不判為錯誤，僅與產生規則不同。
- 以上為靜態分析；機率為理論值，未實機統計。

## D.5 製作與存檔檢查稽核結果
- **存檔檢查**：`renderGuard` 的 `faults` 與 `saveFaults` 直接呼叫遊戲內部的 `__itemFault`／`__saveFaults`（`patch.mjs` 的 `OPTIONAL` 列表）。引擎無法使用時，UI 會標示「未驗證」並退回近似檢查；`regenRunewords` 在檢查不可用時不替換物品（安全）。
- **`affixApplies` 特徵碼**：20261105.3 的 `t8` 改寫後舊特徵碼 MISS，已修正（D.5 第一項）。其他 hooks（`setData`、`makeUnique`、`makeSet`、`makeRuneword`、`seeded`、`isType`、`uniques`、`sets`、`runewords`、`bases`、`runewordKinds`）在 20261105.3 皆命中。
- **roll 版本**：遊戲 `Y8` 寫 `roll[0] = m3() ? 2 : 1`，`m3() = !!(R.staffMods && R.classSkills)`；本版 itemstats 兩者皆有，故為 2。`generateAffix` 已改為相同判斷。固定品質（uniques／sets）沿用 1，稽核無誤判；符文之語不附 roll（既有做法）。
- **稽核數據**（修正後，`craft-random-audit.js`，官方 `/play/`，修改器本機檔案經 `craft-live.cjs` 提供）：
  - 魔法 1518 件、稀有 1500 件（每底材 3 件，含 Jewel）；固定品質隨機 613 件、最高 613 件。
  - 遊戲 `faults`：0 件不合規（修正前 475 件，全為含法杖技能的魔法／稀有）。
  - 規則 `validateItems`：12 件，皆為 Larzuk's Essence（非裝備，稽核範圍過寬）。
  - 製作失敗 0 件。
- **固定品質稽核**（`craft-fixed-audit.js`）：843 件、製作 2998 次、失敗 0；超出範圍 1748 次全部被擋；竄改數值 12 件遊戲仍判定合法（唯一與符文之語，遊戲檢查未涵蓋，記為限制）。
- **既有失敗**：`modifier/tests/craft-affix-ui.cjs` 在乾淨 HEAD 即失敗（非本次修改造成），待另行處理。
- **未提交**：本次修改（`modifier/signatures.json`、`modifier/engine-page.js`、`tests/live-harness/craft-random-audit.js`、本檔）皆未提交。發布前需更新 `site/index.html` 與修改器更新日誌（規則 5）。
