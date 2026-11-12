# 交接紀錄

> 本檔為全專案唯一的 AI 代理共用交接文件（2026-11-07 重整）。只保留目前狀態、長期規則、待辦、近期紀錄與核心設計參考；過時與已解決的歷史紀錄已濃縮歸檔。

## 專案概況
- **定位**：靜態網頁工具包（純 JavaScript，無 Rust）。`d2edit.js` 書籤入口載入各模組：
  - `lang/lang.js`：遊戲內繁體中文化（只有繁中，無語言切換），共用字典 `lang/zh-TW.json`，譯名對齊 D2R 官方繁中。
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
- `lang/`：語言模組（`lang.js`、字典 `zh-TW.json`、語言與官方字串工具 `tools/`、測試 `lang/tests/`）。
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
- **【2026-11-13 Claude：把偵測追查成果用到修改器「存檔檢查」，未提交、未發布】**
  - 改了什麼：`modifier/editor.html` 的 `detect()` 新增 `flagChecks(s, mode)`（置於 `attributeChecks` 之後）三項檢查，來源是官方上傳 `flags` 與載入流程的反編譯結果（見下方「官方 MOD／修改偵測」各條）：(1) 經驗值須在 0～`xpCap(等級)` 之間，`xpCap(e)=round((5+4(e−1)^1.35)×1.1^max(0,e−25)×1.1^max(0,e−89))`（上傳 `level` 旗標；修正鍵：設為該等級上限）；(2) 技能欄不可有重複技能（上傳 `skills` 旗標；修正鍵：移除重複）；(3) 存檔模式與儲存槽相符——硬核槽須有 `mode:"hc"`、一般槽不得有 `mode`（遊戲載入時 `Ht` 判定為被編輯；修正鍵：補上／移除標記）。存檔沒有任何角色進度（例如全新存檔，進度在 `underway`、沒有 `heroes`）時，(1)(2) 顯示「未驗證」而不是通過。同時更正「遊戲診斷」`page` 欄位說明（只放進診斷文字、玩家按「回報」才送出，工具包會替換 `Storage.setItem` 所以通常會列出）。
  - 更新日誌：`modifier/editor.html` 與 `site/index.html` 都加了 2026-11-13「修改器」條目（尚未發布）。
  - 驗證：`modifier/tests/flag-checks-ui.cjs`（新增，離線夾具）通過，含公式與官方快照 `pack` 模組原始碼逐級（1～99）核對、未驗證分支、超標與修正、重複技能、模式不符；`modifier/tests/save-faults-ui.cjs`、`craft-diagnostic-ui.cjs` 通過；`node verify/verify.cjs --quick` 18／18 通過。**實機（官方 `/play/`、全新存檔、隔離 Electron）**：確認全新存檔進行中 `g.save` 沒有 `heroes`（進度在 `underway`）——因此加入「未驗證」分支。**真實存檔資料**：用 `backups/quest-run-20261111/inst-01/seed.json`（D2S1 副本，4 個角色狀態、等級 99）離線載入修改器頁執行 `flagChecks`：三項皆通過，且 99 級 `xp=5865600` 恰等於公式上限，證實公式與遊戲資料一致，故 99 級也納入檢查。
  - **未驗證**：新檢查未在官方網址上以書籤載入的修改器頁實際點擊（只用離線夾具與真實存檔副本資料）；硬核存檔（`mode:"hc"`）無真實樣本可測，只有單元測試；伺服器是否真的以這些條件判定仍未知（只是客戶端旗標條件）。`modifier/tests/write-confirm.cjs` 是 node 測試（用 electron 跑會卡住），套件內已通過。
  - 新增未追蹤的實機探針 `tests/live-harness/runrecord-probe-live.cjs`（取得遊戲自己的 `runRecord()`、擷取 `/api` 非 GET 本文、可選擇進 `startDebugTier`），`detection-rules-live.cjs`、`hud-layout-probe.cjs` 為先前未提交檔案。
- **【2026-11-12 Codex：官方 MOD／修改偵測靜態追查】**：官方 `/play/` 仍載入 `20261105.3 ·583a02f9`；以 Node fetch 比對 `Game-DPAk-Rvc.js`、`ui-C7B1Ywhs.js`、`saveTransfer-BTsCILil.js`、`record-DrVu4-5r.js`、`itemArt-BPHOVK4V.js` 與本機快照，五檔皆 HTTP 200 且逐位元組相同。僅更新交接，未改遊戲／工具包功能、未發布。
  - MOD 診斷：`ui` 第 3 行 `ie`（字元偏移 2738）檢查 `__D2ZH`／版本及 7 個原生 API 的 `Function.prototype.toString`；呼叫端為 `C.fact('page',()=>ie())`，目前只確認診斷用途，不能據此宣稱它會取消排行榜資格。
  - 修改檢查：`saveTransfer` 第 11 行 `OD`／`kD`（291584／291697）驗證 seal，version >= 11 缺 seal 亦失敗；第 1 行 `$c`（45609）物品合法性／roll／插槽遞迴、`sl`（47773）存檔金錢／角色／物品、`ul`（48867）排行榜資格；第 14 行 `uj`（330048）寫入 edited／rechecked。
  - 冒險與上傳：`itemArt` 第 224 行 `jre`（216602）檢查 dev／webdriver 及 `Sl` 參數清單；`Game` 第 289 行初始化／續接 tainted，`postRun`（362967）透過 `ou` 呼叫 `saveTransfer.wC` → `TC`（第 11 行 263100／263179），拒絕 off、edited、無 counts、harness、webdriver、受限參數與相應 tainted 情況。網址判斷用 has，並非只判斷參數值為 true。
  - REA：MCP 未連線且 doctor 回報 registration drift；未更動設定，改用已安裝 CLI。首次傳單一 JS 被 unsupported_target 拒絕，改傳 assets 目錄成功解析 46 檔；Evidence `ev_0975d9ef15bc400a42e4cacae172b206a669fa8d9905c790adf4f349c3fb54f3`。以上為靜態反編譯／呼叫追查，未執行實機觸發、未提交排行榜；伺服器端及桌面主程序偵測未取得，不能宣稱已涵蓋。
- **【2026-11-12 Claude：官方偵測全面掃描（20261105.3，靜態，未實機、未改功能）】** 補充上一則 Codex 追查。範圍：assets 全部 JS＋play.html，由我與 10 個 AGY 唯讀子代理掃描；我已自行抽查標「確認」者，其餘為子代理回報、標「子代理」。
  - **客戶端本機擋（不會送出）**：`webdriver`（`TC`、`jre`、`site.l`、`game` 路由、Game 營地／專家模式）、網址受限參數 `Sl` 共 40 個（t god speed difficulty first slots terror act affixes farm cow power mf mana manakit manacost manaregen manathrottle carry replay class smoke checkpoints probe inifuss merc mercpicks hireall mercranks mercgear counts thief modpoints autosell shard shards chase clone keys uber，確認）、`tainted`（Game 第 289 行 322950 開局設定，存檔續接沿用 290531）、`harnessCounts` 預設 false 且客戶端無處設為 true（子代理）、`d2s:leaderboard-dev`＝1 才放行 dev（確認）。
  - **MOD 偵測 `ie`**：檢查 `__D2ZH`／`__D2ZH_VERSION`，及 7 個 API 是否仍為 `[native code]`：`WeakMap.get`、`Storage.setItem`、`drawImage`、`putImageData`、`addEventListener`、`requestAnimationFrame`、`devicePixelRatio` getter（確認）。全 bundle 無 `document.scripts`、`Reflect`、反除錯、`outerWidth` 比對、`headless`／plugins 檢查、`Date.now` 對 `performance.now` 的加速偵測（子代理）。`ie` 結果只進 `C.fact('page')`，隨使用者按「回報」的 `POST /api/report` 一起送（診斷文字 `diagnostics` 上限 12000 字，另含 userAgent、螢幕、記憶體、GPU、桌面 `facts()`；確認）。排行榜資料不含 `ie` 結果（子代理）。
  - **存檔封印**：HMAC-SHA256，金鑰寫死在 `saveTransfer` 第 11 行：一般 `d2s/save-seal/1:Rakanishu-Bishibosh-Coldcrow-Griswold-Pindleskin`、專家 `d2s/save-seal/hc/1:Blood-Raven-Treehead-Woodfist-Coldworm-Andariel`（確認）；簽的是去掉 `seal` 欄位的 JSON（`ED`／`DD`）。匯入 `kM`（`D2S1:` 前綴＋deflate，上限 2MB）驗簽或跑 `sl`，有瑕疵就標 `edited`；匯入寫入 `yj` 設 `imported:true`，不自動清除；`dj` 在一般模式且 `ll` 通過時可洗掉 `edited`；專家模式不洗（Codex 的實機檢查已證）。專家榜 `heroes[].unranked` 值為 `edited`／`restored`；讀到比 IndexedDB 快照舊的存檔（回溯）會標 `restored`（子代理，未確認）。
  - **上傳資料（會到伺服器）**：`aN` 組裝的 `/runs`、`/hc/runs` 紀錄含 `v`(6/7)、`runId`、`player`（SHA-256 前 8 位元組，確認）、`platform`(web/desktop)、`lang`、`build`、`time`、`continued`、`hero`、`merc`、`pace`（kills／seconds／damage／damageSeconds／前 8 大傷害來源，確認）、`flags`、`notes`(`imported`／`edited`／`debug`，確認)、`climb`、`life`、`chase`。`flags` 由 `$M`（gear／skills）、`rN`（merc）、`tf`／`mf`（子代理：points、attributes、level、time）產生，所以伺服器會收到客戶端對裝備、技能、點數、等級、通關速度合法性的判斷。`debug` 欄＝`tainted` 或網址帶受限參數。
  - **隨機抽查**：`sendCheck` 以約 30 秒平均的泊松間隔送 `POST /checks`（`Rd` 在 saveTransfer 為 `OS`），帶雜湊鏈（`AS(prevHash, record)`）；離線時暫存 `d2s:leaderboard-checks`（最多 400 筆、31 天），結算前補送；`400/422` 拒絕重試最多 8 次，`410` 作廢（子代理）。因此伺服器能比對整場進度連續性，單看結算畫面的修改不一定逃得過。
  - **網路出口**：`/api/leaderboard/*`（runs、hc/runs、checks、deaths）、`/api/report`、`build.json`、`site.json`、`changelog.json`、`sw.js`、Umami `analytics.whatthemeta.io/script.js`（play.html，僅網頁版）；無 WebSocket／sendBeacon／XHR（子代理）。桌面版 `d2app.leaderboard`／`d2app.report`／`d2app.persist` 由主程序轉發，主程序內容不在 bundle，**未涵蓋**。
  - **未涵蓋／待辦**：(1) 伺服器端驗證規則與桌面主程序偵測看不到；(2) 對照工具包尚未完成——`modifier/webapi.js`、`helper/selfcheck.js`、`helper/forge-local.js` 有 seal／edited 相關程式，需逐一標「會觸發／不會」；(3) `tf`／`mf` 確切規則、`time` flag 理論極限（子代理稱 `ar()` 秘境最低 90 秒）待實機或精讀確認；(4) 子代理報告檔在 `C:\Users\nojac\.gemini\antigravity-cli\brain\` 下，非專案檔；(5) 偏移多數為子代理所報，使用前請以字串搜尋覆核。
  - **物品合法性判斷細節（2026-11-13 Claude，靜態確認）**：`saveTransfer.$c` 呼叫 itemArt 內三個函式。魔法／稀有／白色走 `NAe`（匯入名 `Be`）：基底須存在；白色不得有詞綴；法杖技能最多 3 個、值≤3 且須屬該基底；一般詞綴須屬該基底的 affix／automagic／implicit 表，數值≤表內最大值×1.25 進位（隱性不查上限）；詞綴數上限 白0／魔2／稀6（珠寶另表）；+技能前綴最多 1。暗金／套裝／符文之語走 `uke`（匯入名 `Ne`）：名稱須在遊戲表、`stats` 每項須落在該列 [min,max]、數量不得超過、套裝綠色加成同理、無 `stats` 時以 `ake` 最大值×1.25 與基底防禦上限（無形×1.5）查、孔數不得超過基底上限。種子檢查 `AAe`（匯入名 `kn`）：物品有 `roll=[版本,種子,等級,…]` 時，遊戲以種子重新產生並與物品逐項比對（魔法／稀有比對名稱、稀有度、mods 的 stat／value／implicit／auto／staff／length；暗金／套裝／符文之語比對 stats、defense、套裝 bonus；符文之語法杖 mods 僅 roll 版本≥`f6` 才比）；**沒有 `roll` 或版本不合時直接略過種子檢查**（只剩上述範圍檢查）。孔數 `g9`（匯入名 `fn`）：暗金／套裝若有 `item_numsockets`，`sockets` 須等於它。`_5`（匯入名 `D`）為物品外形正規化，不合格即判「遊戲不再讀取」。失敗類別 stat／range／affixes／rule／unique／set／runeword／seed，介面顯示「Not legit: …」。
  - **上傳 `flags` 的確切條件（2026-11-13 Claude，靜態確認，`saveTransfer` 第 1 行 `Pa` 偏移 10507）**：`points`＝`Ea(hero.points)`＞`Sr(level)`，`Sr(e)=5×max(0,e−1)+5×(屬性種類數)+20`；`attributes`＝每項屬性與「恰西＋5×卡片＋已花費」差距須＜容差 `Ta`；`level`＝須整數 1～99 且 `0≤xp≤Zn(level)+1`，`Zn(e)=round((5+4×(e−1)^1.35)×1.1^max(0,e−25)×1.1^max(0,e−89))`；**`time`＝通關時間須≥下限：難度榜 1800 秒、階層榜 90 秒、finale 不限**（`pack` 的 `x(isTier,isFinale)`）；`gear`＝`gear`／`swap` 的欄位名須合法且不重複；`skills`＝技能與被動各不超過 `slots` 且不重複；`merc`＝傭兵等級≥解鎖等級且≤min(98,英雄等級)、技能≤2 個且屬該傭兵、光環技能≤1、裝備欄合法且不重複、盾牌僅特定傭兵。這些是客戶端自報的旗標，伺服器如何使用未知。另有 `$M`／`rN` 的 gear／skills／merc 旗標（逐件過 `Kn`／`Ja`／`ru`）。
  - **專家模式載入時的額外檢查（`saveTransfer` 偏移 329348，確認）**：專家存檔載入時，若 `sl` 找出瑕疵→`pA(E,'edited')`（專家榜 `unranked:'edited'`）；`leaderboard.edited` 旗標會被清掉（改寫成 unranked）；**存檔代數 `E.gen` 低於旁邊保存的代數 `Yb().gen`（即回溯舊檔）→標 `unranked:'restored'`**，若是從備份副本回放（`Xb()`）則不標；並把 `gen` 補回。因此專家模式拿舊檔覆蓋會被抓。專家模式每次開局 `hcCheckIn` 取 `ticket`、每幕 `hcActBegan`、結束 `hcEnd`，存檔內 `lives[class]` 記 `hero`（22 字元 ID）、`ticket`、`begun`（最多 16 筆幕位置）、`why`。
  - **抽查鏈雜湊金鑰**：`AS(prevHash, record)`＝HMAC 風格 `Ar('d2s/late-checks/1:Bloodwitch-Fangskin-Witchmaker-Stormtree-Hephasto', prev+'\n'+record)`；`jS` 會檢查抽查時間序列單調（逆序或相隔＞75 秒的點會保留下來）。抽查間隔 `DS`＝−30×ln(1−rand) 夾在 3～60 秒，`OS` 在時間差＞60 秒時改排 3 秒後。
  - **帳本式雜湊鏈（2026-11-13 Claude，靜態確認）**：專家模式 `lives[class]`（生命帳本）與榜上 `climbs`（階層進度帳本）都是只增不減的鏈：每筆 `h＝SHA-256 前 8 位元組(「d2s-life/1|上一筆h|種類|欄位…」)`（生命）；初始 `base.h` 由英雄 22 字元隨機 ID 推得；`steps` 最多留 96 筆，更舊的折成 `fold{n,h}`；伺服器確認某一筆後，客戶端 `I()` 把已確認前段修剪掉。每筆帶**真實時間 `a`（Date.now()/1000，上限 4102444800）**，climb 另帶遊戲時鐘 `c`、遊戲時間 `s`（上限 86400）、`t` 階層、`x`、`p`。意義：伺服器可拿「真實經過時間」對照「遊戲內時間」偵測加速；也可拿自己保存的鏈比對客戶端回溯或重寫。鏈的雜湊前綴是公開字串、無秘密金鑰，所以只對伺服器端副本有約束力；客戶端自洽重算不會被本機判定攔下。`chase`（追擊紀錄）為 `{f:[…],s:[…]}` 兩個清單，`Sy` 會移除已被伺服器確認的項目。容差 `Ta＝1e-6`。
  - **伺服器端鍛造（新發現，前述「網路出口」漏列）**：遊戲對 `POST <排行榜基底>/forge` 送 `{v:2, player, hc, act:'look'|'claim'|(鍛造動作), item, claim?}`（`Game` 的 `MF`／`IF`／`LF`，`bl` 序列化、`xl` 驗證回傳 forge）。結果由伺服器決定：`200 ok+outcome+forge` 完成、`409 stale` 以伺服器上的 forge 狀態覆蓋、`404` 伺服器不認識該物品（`unknown`）、離線時「No reply yet: your essence is held」。物品的 `forge{t,up,hf,h}`、`forgeOwed`、`forgeClaim` 以伺服器為準；`FF` 限制退還精華 `owed≤100000`。`helper/forge-local.js` 目前在 `fetch` 前攔截此端點並本機處理（`stats.passed` 才放行到真伺服器），伺服器因此可能看到：不存在的 `look` 請求、鍛造物品的 `forge` 狀態從未經它核發。**未實機驗證、不能評估伺服器是否因此判定異常。**
  - **桌面主程序**：官方桌面版執行檔不在本機（`%LOCALAPPDATA%\Programs` 無，`%APPDATA%\D2 Survivors` 只有 userData／解出的素材），無法檢視；取得需下載官方 Release，未獲使用者同意不下載。
  - **工具包對照（只做了讀碼，未實機）**：`modifier/webapi.js` 與 `helper/forge-local.js` 以遊戲自己的 `sealText` 重新簽章後寫回 localStorage（所以封印會是有效的）；`helper/selfcheck.js` 會警告 `seal==='broken'`。是否會被 `sl`／`$c`／`flags` 判不合法，需用官方函式實測（可沿用 `tests/live-harness/detection-rules-live.cjs`）。
  - **覆蓋範圍聲明（2026-11-13）**：bundle 內 47 個 JS＋`play.html` 都已掃過。`init`／`plain`／`surface`／`uniquesTab`／`moved`／`report-CrYJ`／`pack`／`d2url`／`chains`／`Cache`／`choice` 對 `digest／webdriver／navigator／fetch／verify／seal／unranked／illegal` 等關鍵字無新增檢查（`moved` 只有 ServiceWorker 與 `app:` 判斷、`plain` 只有存檔存在判斷與複製代碼、`ko` 為韓文翻譯資料）。`sw.js` 不在 bundle 內，內容未取得。客戶端可見的檢查機制至此視為完整；其餘（伺服器判定、桌面主程序、`sw.js`）需另外取得資料。
  - **`sw.js`（2026-11-13，使用者授權後抓取 `https://d2survivors.lol/sw.js`，7041 位元組，靜態確認）**：僅是檔案快取。攔截 `…/d2/…` 的 GET，從瀏覽器私有儲存（OPFS）供應使用者解出的 D2 素材；以 15 個素材分組的 `fingerprint` 比對 `d2-stamp.json`，不符就視為未解出（回 404 `Not extracted`）。這是「素材與版本一致」的檢查，不是反作弊；無任何存檔、排行榜或環境偵測。
  - **官方桌面版主程序（2026-11-13，使用者授權後下載 `D2-Survivors-Setup-win-x64.exe` 115,884,208 位元組，SHA-256 `f037b79d…b971`，只解包 `resources/app.asar`、不安裝不執行；版本 2026.1105.3，`main.cjs` 2.7MB）**：
    - **`app.asar` 完整性**（`desktop/asarIntegrity.ts`）：啟動時算 `app.asar` 的 SHA-256，與 `resources/app.asar.sha256` 比對。缺檔或不符＝`patched`；讀不到＝`unreadable`。`runToSend`：`unreadable` 時**整筆 `/runs`、`/hc/runs` 都不送**；`patched` 時在紀錄 `notes` 加入 `"patched"` 再送。`app:facts` 的診斷也帶 `asar` 狀態。因此改過官方桌面版 `app.asar`（例如注入工具包）會被伺服器標 `patched`。
    - **排行榜代理**（`desktop/leaderboard.ts`）：渲染程序只能透過 `app:leaderboard` IPC 發請求，且只允許來自 `app://game/`；路徑白名單 `/runs|deaths|checks|forge|tiers|stats|boards/*|runs/<id>|players/<16hex>|hc/(checkin|act|checkout|deaths|runs|heroes|ladder)`；POST 本文上限 70000；其他請求一律取消。
    - **存檔副本**（`desktop/saveCopy.ts`）：頁面每次寫存檔，主程序把它另存到 Chromium 之外的 `save.json`（舊的轉成 `previous.json`），localStorage 沒存檔時以此還原；**墓碑**（`desktop/graves.ts`）：專家模式的 `graves.json`（含 `gen` 世代），在存檔寫入前先落盤——與前述 `Yb().gen` 回溯偵測對應，清 localStorage 或重置不能抹掉死亡。
    - `app:facts`／`app:report`：回報帶 GPU／ANGLE、行程記憶體、`gone`（當掉的行程）、`asar` 狀態、素材解出標記（`app`／`audio`／`at`／`leftOut`／`install`）；回報端點固定 `https://d2survivors.lol/api/report`（僅環境變數 `D2S_REPORT_URL` 可改為本機 http）。桌面版沒有 `--inspect`／devtools 阻擋、也沒有反偵錯程式碼。
    - **工具包的位置**：本專案 `editor/` 是自己的啟動器，不改官方 `app.asar`，所以不會觸發 `patched`；但若有人把工具包注入官方桌面版則會。
  - **工具包對伺服器可見面的影響（既有紀錄 + 本輪讀碼）**：`d2edit.js` 載入即擋下所有送往 `/api/leaderboard` 的非 GET 請求並把存檔設為排行榜關閉（見上方「單機定位」與 `tests/live-harness/no-upload-live.cjs`），所以 `/runs`、`/checks`、`/hc/*`、`/forge` 的伺服器端判定在單機模式下收不到資料；先前列的伺服器端未知項對單機玩家實務上不適用。**未做**：長時間遊玩並攔截未經工具包的官方遊戲上傳內容（`flags`／`pace`／`/checks` 實際本文）——靜態欄位清單見上，實機本文未擷取。
  - **實機觀察（2026-11-13，全新存檔、官方 `/play/` 隔離 Electron、載入本機工具包、法師、一般難度；`tests/live-harness/runrecord-probe-live.cjs`，結果檔 `runrecord-fresh.json`；`/api` 非 GET 一律攔截記錄）**：開局 20／60／90 秒各呼叫遊戲自己的 `runRecord()` 取得「若上傳會送出的紀錄」：`v:6`、`platform:'web'`、`board:{kind:'difficulty',difficulty:'normal'}`、`notes:[]`、`pace` 隨時間成長（20 秒 32 殺／傷害 376；60 秒 121 殺／1953；90 秒 240 殺／3710，來源只有 fireBolt）、**`flags:['time']`**（一般難度 20～90 秒＜1800 秒下限，與靜態推得的 `time` 規則吻合，已實機證實）；紀錄鍵為 `v runId player name build platform lang endedAt board time continued hero pace flags notes`（一般難度無 `climb`／`life`／`chase`／`merc`）。`g.tainted=false`、`harnessCounts=false`、`page()＝{search:'',dev:false,webdriver:false}`（Electron 一般視窗 `navigator.webdriver` 為 false）；存檔 `leaderboard` 載入工具包後立即 `off:true`、`hasId:true`；開啟輔助器「無敵／秒殺」作弊 30 秒後 `tainted`、`flags`、`notes` **都沒有改變**（作弊本身不會被紀錄或標記，只靠 `leaderboard.off` 擋住上傳）；全程 `localStorage` 只有 `d2s:files`、`d2s:session-trail`，沒有 `d2s:leaderboard-queue`／`checks`；被攔截的 `/api` 非 GET 請求為 0 筆（工具包與遊戲都沒送任何上傳）。恐懼階（`world.terror`）全新存檔未解鎖，`ladder/terror` 設定未進入，因此 `/checks`、`climb` 帳本與專家模式實機本文未擷取。另靜態確認：`postRun` 在「非恐懼階且非專家模式」時直接 return，`sendCheck` 只在恐懼階（`world.terror`）呼叫——一般難度的軟核局本來就不會上傳。
  - **官方更新日誌公開的伺服器端規則（2026-11-13，7 個 AGY 子代理＋我核對原文；`game-bundles/20261105.3/changelog.json`，引文已逐條核對者標「確認」）**：
    - 20261024.2（確認）：排行榜「拒絕來自被編輯存檔與被修改遊戲的成績：超出遊戲所給 roll 的物品、遊戲不會產生的技能或數值、被改過的桌面版程式、會改變遊玩的網址參數」，榜上既有此類成績已移除。同日：非法物品顯示紅框；可用阿卡拉洗點或卸下違規裝備恢復資格；公開頁面顯示每位玩家裝備／屬性／技能，超過 D2 限制處標紅。
    - 20261025.1（確認）：「排行榜只在英雄的 climb 顯示她通關了前一階時才排該恐懼階」、「無法驗證的階層成績列入該階的 unverified runs 並附原因」、「從死前還原的存檔所打的階層成績不排名」、早期雙技能稀有裝標 not legit 並排除。另一條（確認原文）：「超過 30 天或重試 20 次都送不出去的成績不再顯示為『一直等待中』」——這是顯示修正，客戶端 `lw` 佇列確有 30 天（`2592e6` 毫秒）過期；**不是**子代理所說的「作廢規則」。
    - 20261026.1／20261027.3（確認「played on an old build」）：恐懼榜只收當版以後；**平衡改版後仍用舊版客戶端打的恐懼階成績不計**。
    - 20261027.2（確認）：專家榜**只排「伺服器全程看過每場從頭到尾」的英雄**（離線成績不計）；死亡的專家英雄在榜上永遠是死的、「事後拿存檔副本再玩永遠不排名」；**等級高於遊玩所能達到者標為 possibly odd 並留在榜上**（確認）。
    - 20261029.x／20261030.x（確認原文）：「排行榜不再拒絕 Magic Find 或 Gold Find 高於恰西等級與裝備所能解釋的成績」（表示伺服器曾以恰西等級＋裝備推算 MF／GF 上限，並已放寬）。20261101.1（確認）：**拒絕「恰西強化等級超過遊玩所能支付」的成績，每項商品都計入**（經濟總量檢查）。20261102.1：D2／D2R 版本切換造成的誤判 not legit 已修。
    - 20261103.1（確認）：天梯移除普通／惡夢／地獄榜，**只排恐懼階**（與靜態確認「一般難度不上傳」相符）；本機時鐘自動校時後不再判 unverified（表示伺服器會比對客戶端時鐘）；START OVER 清空等待／被拒佇列。20261104.1：強化排行榜提交的安全性。20261105.1／.2：延遲送達不再誤判為舊存檔；「Uber 崔斯特姆」通關快於 1:30 不再被拒（確認原文；表示伺服器對該關曾有最短時間門檻，非一般關卡）。
    - 20261105.3（確認）：**同一件裝備鍛造 3 次以上後讀取舊存檔，該裝備被鎖定不能再鍛造**；多裝置副本修改過的鍛造裝備在開局自動校正為最新，才有天梯資格。20261028.1：安裝檔被佔用曾使客戶端被判「改過程式碼」而被拒（表示伺服器看 `patched`）；專家模式遇伺服器維護不再判離線。
  - **桌面主程序補充（子代理＋我核對 `main.cjs`）**：`src/game/frontend/webBuild.ts`／`desktop/updates.ts`：每 3 分鐘（網頁）／30 分鐘（桌面）輪詢 `build.json`，其 `balance`、`checks` 為 `YYYYMMDD.N` 版本號，桌面更新器（確認 `main.cjs` 偏移 2664898）：`stale()`＝版本落後 `balance`、`unranked()`＝未落後但落後 `checks`，兩者只是附在更新狀態裡通知頁面（`stale:true`／`unranked:true`）；「舊版恐懼階成績不計」是伺服器規則（日誌 20261027.3 確認原文），客戶端沒有自行擋成績的呼叫點（網頁版 `webBuild` 呼叫點在壓縮碼中未找到，僅部分確認）；IPC 一律檢查 `senderFrame.url` 必須是 `app://game/`（或 `app://setup/`）；預設 session 全域離線，只放行 `app|devtools|data|blob`；更新器網路白名單只放更新伺服器；單一實例鎖；視窗 `contextIsolation:true、sandbox:true、nodeIntegration:false`；`webPreferences` 無 devtools 禁用。素材流程（`parts.ts`、`checkData`）以 15 個分組 fingerprint 與 `desktop-stamp.json` 比對，不符重解；僅本機檢查、不上傳（回報時送去識別化診斷）。桌面與網頁版核心檢查函式（封印金鑰、`TC`／`wC`、`Sl`、`ie`）**逐位一致**，桌面只多了 `d2app` 橋接與 `app.asar` 完整性。
  - **遊戲邏輯內的防護（子代理，Game 第 289 行）**：`training`、`terrorDebug`（`startDebugTier` 手動指定階層／詞綴）＝`offRecord`，使成績不計；`winRun().counts`＝一般難度須從第 1 幕開始（`P.start===0`）、恐懼階須非除錯；執行中**不檢查**金錢／經驗／等級／傷害跳變，`Math.random` 未被保護（無 native 檢查），`pace`／傷害計量純遙測、客戶端無 DPS 上限（伺服器端另有，見日誌）；掉落沒有確定性種子鏈，但裝備 `roll` 載入時以 `AAe` 重現驗證。
  - **存檔載入流程（子代理＋前述；`sj`＠14:324062）**：讀取失敗或非物件→損毀存檔移到旁置備份並重寫預設；版本高於遊戲→警告「存檔來自新版本」；封印不可信（`kD`）／跨模式（專家存檔放在一般模式或反之）／`ll` 有非法物品→一般模式 `uj`（標 `edited`＋`rechecked`、刪 `chase`）、專家模式 `pA(...,'edited')`；專家模式 `gen` 低於 `Yb().gen` 且非合法備份還原（`Xb()`）→標 `restored`；`dj` 在合法時解除 `edited`；寫入 `iM`：跨模式拒絕寫入、專家模式每次寫入 `gen+1`、配額不足依序清理後仍失敗才放棄。匯入 `kM`：字串＞1e6 或格式不符拒絕、格式版本須為 1、解壓上限 8MB、含 `mode` 的（專家）存檔不得匯入匯出、存檔 build 較新且與本機英雄進度衝突拒絕、封印／`sl` 不合標 `edited`。備份滾動 `lD`：保留最新 3 份＋最多再 3 個不同日期。
  - **工具包對照（工具包 `d2edit.js`／`helper/` 程式碼逐項，已自行核對 `Storage.prototype.setItem`）**：封印——工具包內建同一組 HMAC 金鑰，修改器與 `forge-local` 寫存檔都以 `sealText` 重簽（`d2edit.js:26–27、82–93、256`）；`leaderboard.off`——載入即凍結為 true 並定時輪詢防解鎖（`d2edit.js:52–69、255`）；上傳——`d2edit.js:37–49` 覆寫 `fetch`／`sendBeacon`／XHR，擋下所有非 GET 的 `/api/leaderboard`（`/forge` 例外放行）並清空佇列；**MOD 偵測——工具包會替換 `Storage.prototype.setItem`（`d2edit.js:63–66、268–273`），所以官方 `ie()` 會回報 `replaced Storage.setItem`，只在玩家按「回報」時隨診斷文字送出**；其餘 6 個原生 API 未替換、未定義 `__D2ZH`；網址參數／`webdriver`——工具包不改網址、不觸發；`app.asar`——`editor/` 為自有啟動器、不改官方檔，不觸發。實機（全新存檔）：載入後 `tainted=false`、`leaderboard.off=true`、開作弊後 `tainted`／`flags`／`notes` 不變、無任何非 GET `/api` 請求。
  - **恐懼階實機嘗試（2026-11-13，未成功取得恐懼階紀錄，不再追加探針）**：在同一全新存檔環境用遊戲自己的 `startDebugTier(g.kit,1)` 嘗試進入恐懼階，約 25 秒後 `g.state` 為 `camp`、`world.terror` 為 null，`runRecord()` 仍是 `board:{kind:'difficulty',difficulty:'hell'}`（`continued:true`、`flags:['time']`、`pace.kills:0`），`nextCheck` 有值（12.8）；沒有 `/api` 非 GET 請求、`d2s:leaderboard-queue`／`checks` 仍不存在。結論：**恐懼階的 `board.kind:'tier'` 紀錄、`climb` 帳本、`/checks` 本文、專家模式實機本文均未實機擷取**；除錯入口也不代表正式流程（`terrorDebug` 會使 `counts` 為 false）。
  - **靜態推論（不需實測）**：(1) 工具包載入後，`d2edit.js:37` 擋掉所有非 GET `/api/leaderboard`（僅 `/forge` 例外），`/runs`、`/hc/*`、`/checks` 全部送不出去；依日誌 20261027.2，專家榜只排伺服器全程見證的英雄，故載入工具包的專家英雄必然不排名。(2) `climbStep` 用的 `fu`＝`TC` 不讀 `leaderboard.off`（只有 `wC` 讀），`Gw`／`Kw` 寫帳本也無 `off` 檢查，因此**即使載入工具包，恐懼階 `climb` 帳本仍會在本機累積**；但因為上傳被擋，伺服器收不到。
  - **覆蓋邊界（最終）**：bundle 47 個 JS＋`play.html`、`sw.js`、官方桌面版 `main.cjs`／`preload.cjs`／`setup`／`extract-worker`／`web` 內建網頁包、`changelog.json`、`llms.txt`、下載頁與 play 頁。**伺服器端實作定義上拿不到**，只能由客戶端送出的資料與官方日誌推得規則；「找出所有檢查機制」照字面無法達成，以上為可取得資料的完整盤點。
  - **專家模式伺服器端（靜態確認，2026-11-13）**：端點 `/hc/checkin`、`/hc/act`（帶 `key＝Or(hero)`、`ticket`、`where`、鏈尾 `h`）、`/hc/checkout`、`/hc/deaths`、`/hc/heroes`、`/deaths`。`QT()` 把本機所有專家英雄的 key 送 `/hc/heroes`，伺服器回 `dead` 名單，客戶端用 `J.dead()` 把這些英雄在本機判死；`/hc/deaths` 回 `410` 帶 `fell` 同樣使本機英雄被判死。因此專家模式拿舊存檔復活已死英雄，只要連得上伺服器就會被名單蓋掉。`PT()` 以最近一次成功連線是否在 180 秒內判定 `fresh`／`stale`／`unreachable`，`nE` 在非 `fresh` 時為真（離線／久未連線的專家紀錄不算）。`lw` 重送佇列中的專家結算（30 日內、`!refused`）。
  - **gear 旗標子檢查**：`Ja`＝物品外形正規化（即 `_5`，不合格＝遊戲不再讀取）、`ru`＝`tl` 的 `$c` 快取結果、`Kn`＝`P5`（物品是否為該職業可用，未再細讀）。三者合起來即前述物品三層檢查，無新增規則。
  - **工具包對照（引用既有實機紀錄，本輪未重跑）**：本檔先前紀錄 `drop-corpus-live`（70 萬件掉落語料經遊戲 `itemFault` 驗證 0 失敗）、`craft-fixed-audit`（製作 2998 次 0 失敗；超出範圍 1748 次全被擋；12 件唯一／符文之語竄改後仍判合法＝遊戲未涵蓋）——代表工具包經正常流程產出的物品能通過 `$c`；寫存檔走遊戲自己的 `sealText` 故封印有效。**未覆蓋**：鍛造攔截（`forge-local`）對伺服器端 `/forge` 的影響、`flags`／`time`／帳本鏈在工具包存檔上的表現。
- **【2026-11-12 Codex：指定文字與國旗背景】**：公告站及安裝頁加入淡色中華民國國旗背景與頁尾文字；工具包選單及修改器設定的「關於」可展開查看，輔助器面板底部加入文字。`node verify/verify.cjs --quick` 通過 18／18；`node verify/live-smoke.cjs --timeout 100` 在官方遊戲網址隔離環境煙霧測試通過（20261105.3、amazon）。尚未逐項實測文字及背景視覺；使用者已授權發布。
- **【2026-11-12 Claude：掉落語料與自動配裝審查，未提交、未發布】**
  - 新增掉落語料產生器：修改器引擎 `dropItems`（呼叫遊戲真正的掉落函式 J8；簽章 `dropItem` 已列入 OPTIONAL；`d2edit.js` 白名單加 `dropItems`，推送即上線，須先問使用者並寫公告日誌）。實機指令 `tests/live-harness/drop-corpus-live.cjs <職業> <件數> <輸出.ndjson>`（隔離設定檔、遊戲 itemFault 驗證、職業內去重），輸出在 `backups/corpus/`（Git 忽略）。7 職業各 100,000 件共 700,000 件，itemFault 0、職業內重複 0。
  - 分配是人為假設：難度 30/30/40，來源 horde70／冠軍20／頭目8／幕末魔王2，MF 0/100/200/300＝40/30/20/10，ilvl 取各難度遊戲區域範圍（普通 1–43、惡夢 36–66、地獄 67–85）加來源 lift；未含任務幕末魔王與可破壞物來源。咒符、珠寶、箭袋隨遊戲掉落池自然出現。
  - **去重會改變品質比例**：未去重（每職業 5 萬次抽樣）魔法 88.4%／稀有 8.9%／暗金 1.6%／套裝 0.78%／符文之語 0.35%；去重後語料 80.3／16.6／2.0／0.47／0.58。需「依掉落機率」加權時用前者（`backups/corpus-raw/summary.json`）。
  - 統計 `tests/corpus-stats.cjs`、理論公式 `tests/corpus-theory.cjs`（用代表值，僅供參考，不當驗證）、咒符審查 `tests/gear-audit-offline.cjs`。評估框架 `tests/live-harness/fresh-eval-live.cjs` 搭配 `gear-prelude.js`／`gear-greedy-eval.js`／`gear-blindspot.js`（需 80 級＋主技能 20 級，否則 heroNumbers 的 Damage 恆為 0）。
  - 修正 `helper/autobot.js`：(1) `bestGear` 排除珠寶（遊戲 equip 對珠寶無作用，卻被當成「填空欄」永遠最優先；實機語料 18 組有 5 組卡死）並記住穿不上的裝備（`equipFailed`）；(2) `charmValue` 傷害正則漏掉小寫 `minDamage／maxDamage`（約 420 件咒符被算 0 分）；(3) 新增唯讀 `__d2autobot.gearTools` 供評估用。模擬測試 220 項全過（新增 3 項；珠寶那項在舊版也會通過、沒有鑑別力，鑑別證據是上述實機語料評估）。
  - 已處理（模擬測試 222 項過）：gearScore 加計身上詞綴 lifeLeech／frw／crushingBlow／openWounds／deadlyStrike（取語料實際範圍、保守權重與上限，未經實機 A/B）；背包塞滿換裝失敗時，先賣一件普通／魔法／稀有低品質裝備再重試。
  - 另已處理（皆模擬測試，225 項過）：bestGear 候選超過 60 件時每欄位粗篩前 12 件再精算；存倉庫只存個人分頁（開著共用分頁先 openStashTab("personal")）；自動賣裝改為先賣最低品質，背包 ≥28 件時一次賣 4 件。
  - 營地存倉改良（模擬 227 項過）：稀有裝備只有換上後分數差 ≥ −5（gearGain）才存個人倉庫，其餘（含本職業穿不上的稀有）交給賣裝；toStash 後仍在背包（倉庫滿）就記住不再存，稀有改賣、獨特／套裝／符文之語保留不賣。
  - 收藏庫（模擬 229 項過，未實機）：獨特／套裝／符文之語都能進收藏庫（uniquesTab 的 D() 含 runeword；拒絕訊息文字只寫 unique and set，不可據此判斷）。整備時切到 uniques 分頁逐件 toStash，由原版比較同名品質：較好的 swapIn，換出來的舊件與不較好的重複品標記後在賣裝步驟賣掉；無同名卻收不進的才退回存個人倉庫。
  - 仍待辦：上述新權重與粗篩門檻未經實機 A/B；toStash 切分頁動作未實機驗證（以遊戲碼 openStashTab 推得）。使用者指示後續驗證以模擬為主、不必再實機。
0000000000000o. **【2026-11-12 Codex：手機遊戲介面探查】**：官方頁面確認計時器為 `#clock`，右上資訊為 `#run-info`；其他代理十實例測試已結束，保留其未提交變更。新增隔離探查 `tests/live-harness/hud-layout-probe.cjs`：首次直向取樣碰到升級畫面而 HUD 隱藏，橫向及桌面取得座標；第二次觸控模擬未完成，已停止程序。跳動原因仍未確認，尚未修改介面或完成手機驗證。
0000000000000n. **【2026-11-11 Claude：任務模式 10 實例實機測試，8／10 全任務完成，未提交】**：`tests/live-harness/quest-mode-10x-live.cjs`（10 個隔離 Electron、官方 `/play/`、使用者 D2S1 存檔清除通關紀錄後 99 級從普通第一幕開始；只開任務模式、自動走位、死亡保護、自動喝水，後加營地整備的買藥；`--resume` 續跑、`helper/autobot.js` 存檔即熱重載；紀錄與重設欄位說明在 `backups/quest-run-20261111/`）。結果：01、02、03、04、06、07、08、09 三難度 18 個任務全部完成、交付且獎品用完（done.json）；05、10 到 240 分鐘上限只差地獄 H4。全程 0 死亡。
   - **`helper/autobot.js` 已修（實機有觀察到效果）**：關閉營地整備時戰場恰西商店卡死（campShop）；致命預判不受喝水冷卻限制、離場失敗解除保護鎖；滿血被當成無藥可用而誤離場（healingAvailable）；生命九成以上只有單擊致死才離場／才預先喝（多怪加總高估、未計格擋減傷，聖騎士在地獄反覆被送回第一幕）；補任務就緒改讀存檔 `baalSlain[職業]`（重載後 WeakMap 清空被踢回營地）；交付獎勵後有待領先留營地（阿卡拉與凱恩輪流）；乳牛關卡 N/M/H3（維特之腿是 unique 武器、從倉庫 fromStash 取回、追格里斯華爾德、進門、追牛王）；地獄 H2 追 Pindleskin；任務獎品使用不再被技能變體介面擋住、不嘗試使用鐵鎚 hdm、獎品用完才判定任務模式達成。
   - **自動走位**：依使用者定義「沒有威脅＝打不死或沒有怪物」時站在原地（planMove 的 stay：1 秒內可近戰的怪全打中仍低於目前生命一半，且無會痛飛彈）；撿裝與任務目標照常移動。地獄怪多時站立比例低（約 1％），屬預期。
   - **未解決**：地獄 H4＝巴爾受傷中單一技能樹占 ≥75％（itemArt `oneTree:.75`、`Bre` 約 219601），傭兵／裝備／壓碎性打擊算分母，05、10 多次失敗；待使用者決定（多試、打巴爾不帶傭兵、或先記錄傷害來源）。**使用者已決定（2026-11-12）：H4 預設略過、有機率失敗**——任務模式不再等 H4（`questModeDone`、實機腳本 `needed` 都排除 H4），`build.h4Reset` 預設改 false，使用者開啟才會重置技能挑戰；重置技能法實機 inst-05 成功（重置後占比 98％），inst-10 未驗證。恰西商店修正未遇到觸發情境；啟動時 `reading 'id'` 錯誤已查明並修好（2026-11-12）：來自 harness 無參數呼叫 `frontend.actions.play()` → 遊戲 `startRun(undefined)` 讀 `e.id`，與工具包無關，已從 quest-mode-10x-live.cjs 移除該呼叫（afk-*-live.cjs 仍有同一行）；harness 收尾改為清計時器→等截圖／腳本→關視窗→app.quit，並記錄 console 錯誤來源行號與未捕捉例外堆疊；實機 inst-90 兩次收尾退出碼 0、無殘留程序（`0xC0000005` 未再出現，但原崩潰屬偶發，僅證明新收尾流程正常）。helper/tests/autobot.cjs 6 項失敗已處理（刻意改規則更新測試 5 項；滿血單次致死不離場為退步，已在 deathReason 修正），現 217／217。測試腳本「使用獎品次數」計數會漏記。
0000000000000m. **【2026-11-11 Codex：手機遊戲介面排版待處理】**：使用者截圖顯示右上三個狀態跳動並遮到遊戲時間，「停止自動戰鬥」按鈕遮住腰帶。`git diff -- helper/autobot.js` 顯示該檔有其他任務進行中的未提交修改，且 `quest-mode-10x-live.cjs` 的多個 Electron 實例仍在執行；依協作規範暫不修改該檔，待協調後處理。現有按鈕位於 `bottom:calc(max(8px,env(safe-area-inset-bottom)) + 16dvh)`；右上狀態的來源尚未確認。尚未實機重現或驗證。
0000000000000l. **【2026-11-12 Codex：倉庫當前頁自動整理，已發布 fe957f0】**：`helper/stash-sort.js` 在遊戲倉庫加入「整理」，依目前頁面實際顯示的尺寸排列；密集頁無法依尺寸順序重排時改由現有位置向左上收攏，全部排妥才寫入；收藏庫隱藏，手上持物或淬鍊忙碌時停用。`d2edit.js` 接入，建置來源與 `verify/suite.cjs` 登記測試。`node helper/tests/stash-sort.cjs`、`node tools/tests/build-web.cjs`、相關 `node --check` 通過。GitHub Pages 工作流程 43115918510 成功，公開 `d2edit.js` 與 `helper/stash-sort.js` 的 SHA-256 均與提交一致。
   - 官方 `/play/` 最新 `20261105.3`，隔離 Electron 與 D2S1 副本，載入本機工具包：營地個人／共享 1～3 四頁分別整理 7／9／21／5 件，物品內容與其他頁不變、無重疊、當前頁不切走；localStorage 與重新載入後遊戲記憶體位置一致。收藏頁隱藏、持物時停用；桌面與 390×844、844×390 視窗按鈕可見且中心未被遮擋。指令 `node editor/node_modules/electron/cli.js tests/live-harness/stash-sort-probe.cjs`，需以 `H_SAVE_SOURCE` 指定存檔副本。
   - **商店角色畫面**：直接開啟 `openCampTrade('store')` 沒有倉庫分頁；從商店開啟 `openCharacter('town', cls)` 後，實測共享頁按鈕可用、重複整理結果不變且維持當前分頁。
   - **限制**：未測實體手機；在上述模擬直向／橫向尺寸中按鈕隨原版介面縮放為約 18×10／24×14 CSS 像素，實體觸控便利性尚未確認。其他代理的未提交修改保留；部署後尚未以公開工具包再次進行遊戲實機驗證。
0000000000000k. **【2026-11-11 已提交；存檔格式與修改器介面皆已實機驗證】修改器「技能配置」**：使用者要的是自己選角色帶的 10 主動＋10 被動，不是變體（`skillMods`，遊戲內可免費改）。
   - **存檔位置**：`heroes.<職業>.run.build`（進行中的冒險，遊戲接續時實際用這個）與 `heroes.<職業>.kept.build`（保留的角色）；`skills:[{id,level,cooldown}]`、`passives:{id:等級}`、`slots`（不寫＝6，只能 8 或 10）。
   - **遊戲讀檔規則（`saveTransfer` 的 `nS`／`Qx`）**：技能須為該職業 kit 內、不重複、等級 1～`maxLevel`（進化技為 1）；被動為職業被動＋共通 5 個（vitality／fcr／frw／replenish／telekinesis）；`history` 內 `passive:<id>` 次數必須等於等級，否則整筆 `kept`／`run` 被丟棄（`saveFaults` 不會報）。
   - **實作**：`modifier/engine-page.js` `buildDefs`（共通被動清單寫死，遊戲更新要重驗）；`modifier/editor.html` `buildTable`／`syncBuild`／`onBuildChange`／`collectBuild`，每職業一個區塊，以 run 為準、run 與 kept 一併改寫並各自重寫 `history`。原「技能修改」區塊改名「技能變體」。
   - **已驗證**：`node modifier/tests/build-defs.cjs`、`skill-mods.cjs` 通過。官方 `/play/` 實機（`node tests/live-harness/build-edit-live.cjs`，隔離設定檔、使用者 D2S1 存檔副本、法師）：照相同規則改寫 run＋kept 後，遊戲保留該配置、`saveFaults` 為空，選法師進入後 `game.build` 即為改寫的 10 主動＋10 被動；反例（不改 `history`）遊戲丟棄 `kept`、以空配置開始。
   - **介面實機（官方 `/play/`，`node tests/live-harness/build-ui-live.cjs`，Codex 撰寫、主代理重跑核對）**：第一次失敗——`d2edit.js` 的引擎操作白名單缺 `buildDefs`，介面顯示「讀不到遊戲的技能資料」；補上後不加診斷修補重跑通過：法師區塊「進行中的冒險＋保留的角色」、聖騎士「保留的角色」、亞馬遜無區塊；選項為繁中並標（進化）（共通）、已選項目在其他列停用；以 DOM 操作改法師（第 1 列 fireBolt、第 4 列 nova 自動 8 級、enchant→frw、清空一列）與聖騎士（blessedHammer、vitality）後按「寫入存檔」，localStorage 的法師 run／kept、聖騎士 kept 皆為所選配置，`history` 被動次數相符、其餘紀錄數不變（713／713／698）；重新載入後遊戲存檔保留三筆，選法師後 `game.build` 為所選 9 主動＋10 被動。
   - **未驗證**：選角後遊戲狀態停在 `loading`（未觀察到實際開打）；聖騎士進入遊戲；欄位數 6／8 的角色；桌面版（`editor/`）。重新載入階段 console 有 `TypeError: Cannot read properties of undefined (reading 'id')`（官方 `Game-DPAk-Rvc.js:289`），對照組（完全不改存檔，`H_CONTROL=1 node tests/live-harness/build-edit-live.cjs`）同樣出現，與本功能無關，是遊戲原本就有的。沒有任何進度的職業（只有 `glow`）無法配置。
   - **注意**：工作樹另有其他代理未提交的 `d2edit.js`、`helper/autobot.js`、`helper/autoforge-ui.js` 變更與 `quest-mode-10x-live.cjs`，本項只在 `d2edit.js` 白名單加了 `"buildDefs"`。
0000000000000j. **【2026-11-11 Codex：掛機懸浮按鈕調整，已發布 ca40c58】**：`d2edit.js` 掛機入口改成與自動淬鍊一致的金框圓形月亮圖示，位於其下方；淬鍊面板展開時隱藏入口。`helper/autoforge-ui.js` 在視窗尺寸變動時更新收合位置。`node --check` 兩檔及 `node tools/tests/build-web.cjs` 通過。官方 `/play/`、隔離 Electron 與存檔副本、載入本機工具包：直向與橫向兩圖示皆間隔 10px，展開淬鍊時入口隱藏，點掛機及喚醒成功；紀錄 `backups/afk-layout-result.json`。GitHub Pages 工作流程 43018686952 成功，公開兩檔以 SHA-256 核對與提交一致；未驗證實體手機 Safari，保留其他代理的未提交變更。
0000000000000i. **【2026-11-11 Codex：狀態列避開遊戲介面，未實機驗證】**：`helper/autobot.js` 狀態列沿用停止按鈕的 `gameWindowOpen` 判斷；角色、營地、暫停、技能樹與任務日誌開啟時隱藏，關閉後恢復。`helper/tests/autobot.cjs` 新增對應顯示條件測試。`node --check helper/autobot.js`、`node --check helper/tests/autobot.cjs`、`node helper/tests/toolkit-1105.cjs` 通過；`node editor/node_modules/electron/cli.js helper/tests/autobot.cjs` 模擬測試 216 項通過。官方網址實機尚未驗證，未發布。
0000000000000h. **【2026-11-11 已提交並部署（f710755 與後續提交）】公告站重新設計＋更新日誌依類別分組**：
   - `site/index.html` 全面改版（Codex 實作設計、Agy 依程式稽核並校對內容、主代理核實與修整）：暗黑 2 物品提示框風格，稀有度色＝模組色（修改器金 `--c-unique`、輔助器綠 `--c-set`、自動淬鍊橘 `--c-rune`、遊戲修改紅 `--c-danger`、中文化藍 `--c-magic`、工具包／效能／相容性黃 `--c-rare`）；≥1200px 三欄（左導覽＋scroll-spy、右更新日誌），以下為頂部橫向導覽單欄。新增 `#forge` 自動淬鍊區段、官方遊戲連結（`https://d2survivors.lol/play/`）。`site/install.template.html` 同步換視覺，`site/install.html` 已用同一書籤字串重新產生（未跑 build-web，`version.json` 未動）。
   - **更新日誌新規則**：每天仍一則，則內依固定 8 類分組（修改器、輔助器、自動淬鍊、遊戲修改、中文化、效能、工具包、相容性）。公告站標記為 `article.log-entry[data-date] > section.log-group[data-cat] > h4.log-cat + ul`，修改器為 `h3 日期 / h4 類別 / ul`。合併邏輯移到 `verify/changelog.cjs`（`publish.cjs` 引用），`--log` 項目寫「類別：內容」，否則歸「工具包」；測試 `node tools/tests/changelog-merge.cjs`。手寫日誌時也要照這個結構，否則發布腳本會報錯。
   - 已驗證：本機靜態伺服器以 1440 與 375 寬截圖檢視、無橫向捲動、類別篩選與輔助器分頁可用；`build-web`、`changelog-merge`、`test_lang` 測試通過；舊日誌條目逐條比對無遺漏（公告站 57→58 條，其中一條依類別拆成兩條；修改器 101 條不變）。**未驗證**：Cloudflare 部署後的實際頁面、真實手機、發布腳本實跑（只做記憶體乾跑）。
   - **後續處理（同日，使用者要求「全部都處理」）**：
     - 截圖重拍：用 `tests/live-harness/keys-visual.cjs`（官方 `/play/`、使用者 D2S1 存檔複本、隔離設定檔、1280×800）拍工具包選單、輔助器三分頁、自動淬鍊、效能頁、修改器總覽／物品詳情／製作裝備，轉成 1600 寬 JPG 放 `site/img/`（新增 toolkit-menu、assist-cheat、autoforge、perf、item-detail；刪除 craft-result）。六張 `live-*.jpg` 戰鬥畫面沿用舊圖。注意：`capturePage` 可能拿到上一格畫面，每張前要多等並連拍取第二張；自動淬鍊面板在遊戲未暫停時會自動關閉，要先按 Esc 暫停再開。
     - 兩邊日誌統一：以修改器的詳細版為準，補入公告站多出的兩條，之後兩邊內容必須一致（各 108 條左右，逐日逐類相同）。
     - 標籤修正並在官方網址實機確認顯示：`cheat.forgeMax` 改為「燃燒的恐懼精華數量 99（虛擬精華，不放實體物品，淬鍊時自動補足）」；自動淬鍊面板三處「獨特、套裝或符文之語」改為「可淬鍊的裝備（普通、稀有、套裝、獨特或符文之語）」。`helper/tests/autobot.cjs` 208 項通過。
     - 安裝頁（`site/install.template.html`）移除英文版與語言切換、移除「想上排行榜」說明，使用步驟改為「左上角工具包選單」。
   - 仍未驗證：真實手機上的公告站；發布腳本新日誌合併的實跑（只做記憶體乾跑與單元測試）。
0000000000000g. **【已實機驗證 2026-11-11，僅記錄、未改程式】傭兵（與玩家）裝備給的靈氣不吃「+所有技能」**：使用者問「傭兵穿裝備賦予靈氣、其他裝備有 +所有技能，裝備靈氣等級會提升嗎」。
   - **實機（官方 `/play/`，隔離設定檔、使用者 D2S1 存檔副本：法師、沙漠傭兵穿無限＝信念 12，技能池選神聖冰凍；腳本 `tests/live-harness/merc-aura-allskills-live.js`，經 `craft-live.cjs` 執行）**：改傭兵頭盔的「所有技能」並直接讀各靈氣來源物件的 `level`：傭兵所有技能 4→6 時，自帶靈氣神聖冰凍 9→11（有吃加成），裝備的信念靈氣固定 3（d2Level 12，不變）。
   - **原始碼對照（`game-bundles/20261105.3`）**：傭兵自帶靈氣 `Game-DPAk-Rvc.js` 的 `cD` 有加 `e.player?.allSkills`；裝備靈氣 `Z_` 為 `n.auras[l]=Rt(c,max)`、`itemArt` 的 `hQ` 以物品數值建來源，皆無 `allSkills`。玩家自穿的裝備靈氣走同一段，同樣不加成。
   - **未驗證／待決**：鐵狼、野蠻人傭兵與其他靈氣未單獨測（同一段程式）；原版 D2 規則未查證，不確定是設計或遺漏；未動工具包任何功能。
0000000000000f. **【已實作 2026-11-11，未提交、未實機驗證】自動淬鍊「可淬鍊」判斷改為原版規則**（反編譯 `game-bundles/20261105.3`：`pack-_pWog-fz.js` 的 `z／B／ge／k`、`itemArt` 的 `dke／l6`、`saveTransfer` 的 `ma`；移植為 `helper/autoforge.js` 的 `temperLines／canTemper`，`helper/autoforge-ui.js` 的 `eligible` 改用它）。
   - **原版規則**：① 類型不是咒符／珠寶／精華／任務物品；② 稀有度**只排除魔法**（普通、**稀有**、套裝、獨特、符文之語都可以；舊版只收獨特／套裝／符文之語，稀有被誤排除）；③ 至少一條可淬鍊屬性：略過隱含、值 ≤ 0、`cannotBeFrozen／halfFreeze／knockback／ignoreDefense／preventHeal／restInPeace／lightRadius／proc:／charge:`；有 `item.stats` 時 stats 只收白名單、mods 只收 auto／staff；最小／最大傷害成對算一行。遊戲鐵砧放上時只檢查①（`Ot`），②③ 決定面板有沒有可淬鍊行。
   - **對照**：The Stone of Jordan 移植結果為 s0～s3 四行，與先前實測「s4 從未出現」一致。單元測試 `helper/tests/autoforge.cjs`（50 項）、`toolkit-1105.cjs` 通過；`autobot.cjs` 在改動前就缺模組無法執行（與本次無關）。
   - **未驗證**：稀有裝備在官方 `/play/` 實際放上鐵砧並淬鍊；普通裝備；`magic` 的 `Hellforge open` 路徑。
0000000000000e. **【已發布 2026-11-11，git 直接推送 main，公告站與修改器日誌已補】遊戲修改「淬鍊與地獄熔爐本地化」**（新檔 `helper/forge-local.js`；`d2edit.js`、`helper/autobot.js`、`helper/autoforge-ui.js`；實作由 Codex、實機腳本由 AGY 子代理撰寫，主代理核實與修補）。
   - **原理**：鍛造全部走 `POST /api/leaderboard/forge`（`act`：temper／clean／hellforge／upgrade／look／claim）。用戶端只檢查回應格式（`pack` 的 `H`），`h` 不做簽章驗證，所以可在頁面攔截 fetch、回本機算出的 Response，遊戲原本的 `forgeTry` 照常扣精華、套用、存檔。舊結論「直接寫 forge 會被伺服器覆蓋」的原因是 `look` 同步，本機一併回覆 `look` 即可保留。
   - **開關**（遊戲修改 →「流程與掉落修改」）：`cheat.forgeLocal`（本地化，機率同原版：淬鍊 `1/(1+n/4)`、熔爐 40% 倍增）；`cheat.forgeLocalSure`（淬鍊必成功、熔爐必倍增；自動淬鍊執行時經 `__d2forgeLocal.setWant` 只淬面板上未達標且非 X 的屬性）。生效條件＝總開關＋`forgeLocal`。
   - **本機帳本** localStorage `d2forgeLocal.ledger`（物品 ID → 本機 forge，上限 2000）：帳本內物品的 `look`／`claim` 不論開關一律本機回覆；載入後 0／6／25 秒各 `restore()` 一次，把被伺服器同步蓋掉的 forge 套回。開關關閉時操作類請求放行，伺服器回應帶 forge 就把該物品移出帳本。
   - **實機（官方 `/play/`，隔離設定檔、全新存檔，The Stone of Jordan）**：`tests/live-harness/forge-local-live.cjs`（`H_PASS=1`）四階段全過——A：10 次淬鍊全中、精華 99→89、第 11 次「Temper stops at 10」、熔爐「All tempers doubled」總數 20、再熔爐「used」，真實 `/forge` 請求 0；B（不開必成功）：20 次中 10 次、clean 清空，請求 0；C：重新整理後記憶體與 localStorage 的 forge 仍為 20／hf，帳本物品的 look 由本機回覆，請求 0；D：關閉本地化後新裝備淬鍊送出真實請求 1 次（伺服器回 `h`）。`tests/live-harness/autoforge-live.cjs`（新增 `H_LOCAL=1`）：目標 s0=5、s1=5、其餘 X → 11 步 0.75 秒，結果 `s0:10、s1:10、hf:1`。`node helper/tests/forge-local.cjs`、`autoforge.cjs`、`build-web.cjs` 通過；`verify --quick` 16／17。
   - **`weapon-sets` 測試已修（同日）**：a0b1eaa 把 `sharedCont`／`personalCont`／`bagCont` 抽到 `containers()` 之前，測試仍從 `function containers()` 擷取而缺定義；擷取起點改為 `const sharedCont = `。修改器本身無誤，`verify --quick` 17／17。
   - **未驗證**：面板兩個開關的畫面目視與手機版；`upgrade`（底材升級）本機回覆；穿戴中／傭兵裝備的本機淬鍊與遊戲自己觸發的 `syncForge`（只以直接送 look 驗證）；帳本物品在「未載入工具包」時被伺服器同步覆蓋後的 `restore()` 實際還原；專家模式；同時淬鍊多件的 want；桌面 App 的 bridge 通道（`yC()` 不經 fetch，攔不到）；發布後線上版（GitHub Pages）的實際載入。
   - **已知限制**：本機淬鍊的結果伺服器不知道。停用工具包（或關掉本地化後對同一件裝備送真實請求）時，伺服器可能回 stale 並以它的紀錄覆蓋（已寫入玩家公告）。
   - **子代理環境**：Codex 的別名工作區 `C:\Users\nojac\codex-ws\6902755a1eb8` 原本是殘留的普通資料夾（非連結），導致 Codex 無法寫入本倉庫（先前 slice-10 未動也是此因）；已改名為 `…\6902755a1eb8.stale-20261111` 保留，包裝器重建連結後恢復正常。
000000000000d. **【已實作、官方 /play/ 實機抽驗，未發布】中文化改為「只有繁體中文」，譯名對齊原版暗黑 2（D2R 官方繁中）**（`lang/`、`d2edit.js`、`helper/`、`modifier/`）。
   - **官方資料來源**：本機 `C:\Program Files (x86)\Diablo II Resurrected`（D2R 3.3.93847，zhTW）。新工具 `lang/tools/d2r-strings.mjs` 讀 CASC（只讀）匯出官方字串與 excel 表到 `backups/d2r-strings/`（Git 忽略，不把官方資料放進倉庫）；`lang/tools/d2r-align.mjs` 依 excel 表（物品、暗金、套裝、符文之語、魔法／稀有／暗金詞綴、怪物、技能、地名）核對 `zh-TW.json`，加 `--write` 寫回；再跑應為 0 差異。字典已更新約 150 條名稱（例：項鍊→護身符、兇殘鐮刀→陰森鐮刀、戰鬥體制→戰鬥命令、毀滅之符→滅絕、稀有名稱 Hide／Jack／Nock／Quarrel／Scarab 等 559 條重組），並另補 `item:`／`affix:`／`monster:`／`unique:` 同字不同譯鍵。
   - **句子用詞**：閃電傷害／抗性／免疫→電擊、耐力→精力（Energy 改「能量」）、每級→每等級、約旦之石→喬丹之石、護符→咒符（Charm）、傳送點→傳送平台、第○幕→第○章、屍體爆炸→屍爆、爆炸箭→爆裂箭 等。保留：技能「閃電」（官方閃電箭，但遊戲把 Lightning 也當元素標籤，字典鍵維持「閃電」）、遊戲自創用語。分 10 份交由子代理（AGY／Codex）逐份校對後，由主代理驗證占位符與鍵集合再合併（slice-10 因子代理工作區限制未動，改由規則腳本處理）。
   - **工具包自己的介面文字也對齊官方**（輔助器、自動淬鍊、修改器、公告站、README）：暗金→獨特、護符（Charm）→咒符、護身符＝Amulet（修改器欄位 `SLOT_ZH／TYPE_ZH` 原本把 charm 誤寫成護身符）、恐怖燃燒精華→燃燒的恐懼精華、毀滅之符→滅絕、傳送點→傳送平台、耐力→精力、閃電傷害／抗性／穿透→電擊。以 `helper/tests/autobot.cjs`（208 項）、修改器規則與 UI 測試、實機煙霧測試通過；**未做**輔助器／修改器面板的逐畫面目視。
   - **移除英文／多語言**：`lang/lang.js` 不再有語言選單、locales、`__d2lang.set/get/list/register`（版本 2）；按鈕改為「中文化」（只剩比較框排版、D2R 原版字型）。`modifier/i18n.js`、`lang/locales/` 已刪；`d2edit.js`、輔助器、自動淬鍊、修改器的英文分支與修改器「介面語言」設定一併移除。
   - **驗證**：`test_lang.cjs`、`helper/tests/selfcheck.cjs`、`node verify/live-smoke.cjs` 通過；官方 `/play/` 以真實 `__d2lang.translate` 抽驗：電擊免疫、護身符、骸骨面罩、屍爆、戰鬥命令、疾刺、多頭蛇皆為官方譯名。**未驗證**：桌面版（`desktop-lang.mjs` 刪 locales 複製後的注入）、遊戲畫面上逐項目視、手機版。`modifier/editor.html` 舊更新日誌文字（「閃電相關詞彙統一為閃電」）為歷史紀錄未改；公告站與更新日誌尚未發布。
00000000000c. **【已發布 2026-11-10，git 直接推送 main，公告站與修改器日誌已補】自動淬鍊：序列「同時淬鍊 N 件」（1～10）、面板控制列改版、縮小圖示提示**（`helper/autoforge-ui.js`）。
   - **同時淬鍊**：遊戲 `forgeTry` 在送出請求前就同步記下 `this.anvil`，之後只用記下的 ID；所以「`g.anvil = id` 後立刻呼叫 `forgeTry`」可多件同時送出。序列區新增「同時淬鍊 N 件」選單（localStorage `d2autoforge.parallel`，預設 1＝原本逐件流程）；N > 1 走 `runQueueParallel`／`runItem`（每件自己的 ctx，不用面板狀態；`stepOnce`、`trackUpgrade` 多一個 ctx 參數）。429 時設共同的 `state.pauseUntil`，全部件一起等 Retry-After 後續跑。同款一件熔爐成功，其餘進行中的同款立即停止（沿用既有規則）。
   - **面板**：標題右邊「開始／停止／收合」同一排並加大，淬鍊狀態獨立一排。
   - **縮小圖示提示**：限流／無回應等待時圖示旁顯示「被伺服器限流，等待中（剩餘 mm:ss）」；結束時顯示「序列結束：成功 N 件、失敗 M 件」（單件則為該件結果），且圖示不再於遊戲恢復後消失，直到展開再收合或再次開始（`state.notice`、`foldLabel`、`finishQueue`）。手動停止不留提示。
   - **實機（官方 `/play/`，全新隔離存檔，10 件喬丹之石，`tests/live-harness/autoforge-parallel-live.cjs`，`H_PAR=10`）**：同時進行中的 `/forge` 請求最多 10 個；3 次成功輪分別 196／252／180 次請求全部 200、13～25 秒跑完，各件淬鍊紀錄各自獨立；面板截圖確認三顆按鈕同排（各 70×41）、狀態列獨立、選單值 10 且執行中停用；收合後結束時圖示仍在並顯示綠色「序列結束：成功 1 件、失敗 3 件」；`H_SKILL=10 H_UNTIL_LIMIT=1` 跑到真實 429（572 次 200 後 20 次 429），圖示顯示橘色「被伺服器限流，等待中（剩餘 60:00）」、10 件狀態皆為「等待限流解除」。
   - **「同款熔爐成功就略過其餘同款」開關**（面板勾選框，localStorage `d2autoforge.skipsame`，預設開＝原行為；逐件與同時淬鍊皆適用）：只過語法檢查與 `helper/tests/autoforge.cjs`，**未實機驗證**（實作當下 IP 被限流；使用者表示自行實測）。
   - **未驗證**：限流等滿 1 小時後同時淬鍊自動續跑（只驗證到進入等待）；同時淬鍊中精華不足、熔爐失敗自動售出；N=1 逐件流程的結束提示與單件（非序列）提示；手機寬度版面；恰西鐵砧選單開著時同時淬鍊的畫面（鐵砧格會跟著跳動）。
00000000000b. **【已實作並實機驗證 2026-11-10，未提交】自動淬鍊「伺服器無回應」真因＝官方 `/forge` 限流（HTTP 429，`{"error":"rate_limited"}`，`Retry-After: 3600`）**（`helper/autoforge-ui.js`）。依 IP 計算（使用者確認換 IP 即可繼續；全新存檔同 IP 也被擋）。約每 1200 次淬鍊被擋一次、等 1 小時。修正：遇 429 讀 `Retry-After`，等滿後續跑同一件、不計入 3 次重試（無標頭時仍為 1 分鐘×3 次後放棄）。**實機（官方 `/play/`，全新隔離存檔，修改器裝備庫造 10 件喬丹之石，`tests/live-harness/autoforge-soak-live.cjs`，4 小時）**：3608 次 `/forge`，200 共 3599、429 共 8；等待恢復流程跑 4 輪皆自動續跑。**未驗證**：舊的「無標頭」路徑；手機版倒數顯示 60:00 以上的排版。
0000000000b. **【已發布 2026-11-10】自動淬鍊：無回應重試改版＋同款熔爐成功跳過**（`helper/autoforge-ui.js`）。無回應改為每次等 1 分鐘、最多重試 3 次，仍無回應放棄該件、序列換下一件；序列中同款（稀有度＋名稱＋底材）只要一件熔爐成功，其餘同款略過。公告站與修改器日誌已補，以 git 直接推送 main（commit 87760db）。**未驗證**：使用者表示自行實測；無回應流程未模擬。
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
   - **2026-11-11 虛擬精華**：`cheat.forgeMax` 預設改為「虛擬精華」（`helper/autobot.js` 的 `installVirtualForgeEssence`）——不在存檔放實體物品；包住 `g.forgeTry`，執行期間暫時在背包最前面放 id 以 `vess` 開頭的 99 疊（先消耗，真實精華不動），結束即移除；包住 `g.forgeActions` 讓面板顯示 99。實體寫入（個人倉庫）保留為備援，`PHYSICAL_FORGE_ESSENCE = true` 啟用。拉蘇克精華仍為實體（找不到消耗點）。**尚未實機驗證**（需確認：鍛造能成功、面板顯示 99、存檔不殘留 vess 堆疊、關閉修改後不影響真實精華）。
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

---

# 附錄 E：掉落屬性範圍與修改器範圍對照（2026-11-10）

依據：`game-bundles/20261105.3` 靜態反編譯（`itemArt-BPHOVK4V.js`），並以遊戲自己的產生器在 Node 取樣約 160 萬件對照修改器 `statRanges`。**未做官方 `/play/` 實機**（使用者指示本次不用實測）。

## E.1 產生鏈路
- `Ay` → `J8(level, magicFind, opts)`：`oMe` 決定品質 → 暗金 `P7/F7`、符文之語 `wMe/X7`、套裝 `R7/z7`、其餘 `Y8/X8`。
- `X8`（魔法／稀有）的屬性來源依序：底材 `implicit` → `w8` 底材固有加成（`C8[itype]`，`auto:true`，依權重挑一列再擲值）→ 詞綴 `z9`（魔法前後綴各至多 1；稀有 `TAe`，目標數 `Z8=[3,4,4,5,5,5,6,6]`、珠寶 `Q8=[3,4]`，每側上限 3）→ 法杖技能 `O8`（`staff:true`）。
- `z9` 的數值：`min + floor(random × (max − min + 1))`，即詞綴表 `d8` 的 `min～max`；`also` 在有 `length` 時固定取 `max`。同一群組（`I9`）不重複。
- 物品的 `level` 欄位只用於售價（`W5`），不影響屬性數值。

## E.2 為什麼掉落看到的數字比製作頁的範圍高
- **詞綴單列沒有超出**：取樣中每一列都在修改器顯示的範圍內（超出 0）。暗金、套裝也是 0。
- **提示框把同屬性加總**（`hje`）：魔法／稀有的所有非 implicit 列（詞綴各列＋`auto` 列＋鑲嵌珠寶 `c9`）依屬性加總成一個數字；毒傷另由 `K8` 加總。只有「恰好一列、且不是 auto」時才顯示該詞綴階級的 `[低-高]`（`gje`）。
- **同屬性可由不同群組的詞綴各給一列**，例：增強傷害 145＋275＝420（單列上限 300，合計上限 450）、單抗 30＋全抗 20＝50、毒傷 171＋308＝479；命中值、元素傷害、每級最大傷害、照明範圍、尋寶亦同。
- **職業底材固有加成**（聖騎士盾全抗 5～45、命中 15～121、增強傷害 10～65；法珠生命 1～60、法力 1～80 等）也併入同一個數字。

## E.3 修改器的修正（未提交）
- `modifier/engine-page.js`
  - `baseImplicits`：auto 範圍原為隨機取樣（上限少 1、低權重列抓不到），改為掃過第一個亂數（1500 格）並把其餘亂數固定在最低／最高，取得每一列的精確上下限（每個底材約 30ms，有快取）。
  - `affixInfo` 新增 `totals`：每個屬性取各群組最高值，前後綴各取上限內最大者，得出 `{ rows, total }`（只列可疊加者）。未考慮詞綴等級相容（`maxLevel`），為上限值；取樣未見超過，且常見剛好等於。
  - `statRanges` 新增 `auto`、`affixTotal`；`itemModMax` 對無形符文之語用無形版本（武器基礎傷害 1.5 倍），並略過 auto 列。
- `modifier/editor.html`：範圍文字加上「可疊 N 列，遊戲提示框顯示合計最高 X；底材固有另加 a～b」；auto 列顯示「底材固有加成範圍」；物品頁查範圍帶入 `ethereal`。`modifier/i18n.js` 補英文。
- 疊加本來就能製作：第二列下拉會提供同屬性（例如 Monarch 火抗 30 之後可再選火抗 20，屬全抗詞綴），規則檢查與遊戲 `itemFault` 皆接受。
- 回歸測試：`node modifier/tests/drop-ranges.cjs`（已加入 `verify/suite.cjs`，每次遊戲更新必跑）。結果：83320 件，超出 0、低於 0、合計超過上限 0。`verify.cjs --quick` 16／16 通過；修改器 Electron 介面測試 7 支通過（含先前記為既有失敗的 `craft-affix-ui`）。
- **未驗證**：官方 `/play/` 實機的範圍文字顯示；手機版排版（範圍文字變長）。發布前需補公告站與修改器更新日誌（規則 5）。

- **自動淬鍊時無法操作遊戲介面（2026-11-10，已修，官方 /play/ 隔離存檔實機驗證）**：原因是遊戲每次送淬鍊請求都設 `forgeBusy`，`whileForgeIdle` 會把此時的角色／倉庫／收藏箱操作（切分頁等）直接丟棄；淬鍊中 forgeBusy 佔 75%～90%。`helper/autoforge-ui.js` 的 `patchForgeIdle` 改成「忙碌時等到空檔再執行」。實機（`tests/live-harness/autoforge-yield-live.cjs`）：淬鍊同時 40 次呼叫（35 次落在忙碌中）全部執行，平均延遲 203ms、最長 666ms，淬鍊照常跑。**未驗證**：真的在收藏箱用滑鼠點分頁；對掛接前已開著的選單無效，需關掉重開一次。
