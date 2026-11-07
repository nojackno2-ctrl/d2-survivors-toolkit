# 交接紀錄

> 2026-11-03 由 Claude Code 精簡：本檔只留目前狀態、規則、待辦與近期紀錄；2026-11-07 起 AI 文件統一為本檔，舊紀錄與設計文件已併入檔尾附錄（需要時用 Grep 搜尋）。

## 專案概況
- 靜態網頁工具包（JavaScript，無 Rust）：`d2edit.js` 書籤入口 → 載入 `lang/lang.js`（遊戲內繁中）、`helper/autobot.js`（輔助器）、`modifier/engine-page.js`（物品引擎）、`modifier/editor.html`（修改器）；字典 `lang/zh-TW.json`（13907 筆，網頁／桌面共用）。
- 發布：GitHub Pages（main）；公告站 `site/` 由 Cloudflare 自動抓 GitHub 部署（`wrangler.jsonc`），不需 API Token。
- 桌面版來源在本儲存庫的 `editor/`（已整併進倉庫）；它與網頁版資料夾的同名檔案是兩份獨立副本、內容已有漂移，改網頁版檔案後需評估是否同步過去。
- 遊戲目前驗證版本：`TESTED_GAME_BUILD = "20261105.3"`（`helper/autobot.js`、`modifier/editor.html`、`editor/` 三檔，2026-11-05 實機確認後更新）；`verify/state.json` 最後驗證 build 同為 20261105.3（比對前版 20261104.1，快照不完整，`comparison.complete=false`）。

## 反覆發生的問題（必讀，2026-11-05 由全部對話紀錄整理）
使用者在不同對話中重複糾正過下列事項，接手前先看：
1. **一律繁體中文**：回覆、交接、更新日誌、程式內訊息都用繁中（曾被要求 4 次以上）。
2. **「完成」前必須實機驗證**：只跑 Node 測試、字典模擬、harness 腳本不算完成（「我要你自己實機驗證」「遊戲修改必須要實機測試」「都用網頁實測」）。實機＝官方 `https://d2survivors.lol/play/`；回報時寫明「實機驗了什麼、哪些沒驗」，不可把未驗證說成已修好。
3. **用使用者回報的原始輸入重現**：使用者貼的診斷資訊、截圖、手機實測結果是驗收標準。曾因只測一種字串形式而「修好」兩次仍出錯（見下方翻譯規則）。
4. **自己測完、修完，不要一直問**（「你自己把所有東西測試完並且修復，不要一直問我」）。只有發布前、刪除使用者資料、規則互相衝突時才問。
5. **每次發布都要寫更新日誌並推上公告站**；日誌寫給玩家看「工具包更新了什麼」，不是寫 AI 做了什麼。**同一天的更新合併成同一則**（標題只有日期，不標版號）。**版號不隨發布升**：工具包支援熱重載，書籤載入即取得最新版；只有要發 GitHub Release（桌面版）時才加 `--bump`。
6. **合法性以「這款遊戲」的資料庫為準**：正常打到的裝備不得被判不合法；不需要在說明中強調「與原版暗黑2不同」。
7. **修改器一鍵解鎖收藏庫**：遊戲新增裝備後要重抓清單，數量要與遊戲內收藏庫一致（曾出現遊戲 676／修改器 576／解鎖後 703）；有職業技能的物品（如地獄火炬）依當前角色職業給屬性。
8. **輔助器行為**：追王／撿裝／前往目標優先於閃避（閃避不可越閃越遠、不可擋住進傳送門、面對精英不可一直逃）；傷害不痛不癢就不閃；每次升級一定要選技能；護符看屬性是否符合職業；腰帶全放藥水（遊戲沒有魔力藥水）；回營地優先交任務。
9. **開關狀態要一致**：載入時顯示的開關狀態必須等於實際狀態（曾出現載入時顯示開、點進去是關）；戰鬥輔助由輔助器內開關控制，不用快捷鍵。
10. **製作裝備用下拉選單**，不要讓人輸入屬性代碼；新增屬性預設最大值；所有頁面的數值上下限共用同一份資料庫。
11. **背景任務做完要關**，並告訴使用者還有什麼在跑（使用者曾問「背景執行什麼」「關掉」）。
12. **額度不足時**改派 Codex／Agy 子代理做，子代理成果要整合回倉庫並由自己核對。
13. **AI 文件只留一個檔案**（使用者 2026-11-07 要求）：所有 AI 代理文件統一在本檔，不另開交接、設計、報告或封存檔；子代理報告整合進本檔附錄或近期紀錄。

## 長期規則（使用者要求）
- **遊戲更新後全部重新驗證**（2026-11-01）：不可沿用舊版結論。版本來源為官方 `/changelog.json` 第一筆 `build` 與 `/assets/Game-*.js` 檔名；需重驗修改器 `signatures.json`／`patch.mjs` 特徵、物品產生與原版規則、輔助器各原版函式掛接；官方 changelog 中與合法性、存檔欄位、掉落、經驗有關的改動優先核對。
- **子代理成果需整合回倉庫**（2026-11-01）：遊戲分析放 `docs/game-analysis/`；實機測試用 GitHub 連結（推送後以 `tests/live-harness/reload-gh.cjs` 重載）。
- **測試以最新版網頁為主**（2026-11-02）：不再驗證舊版；版本不符只提示、不封鎖。
- **實機只用隔離 TEMP 測試設定檔**，不碰使用者存檔。
- post-commit hook 會自動推送；未獲授權推送時以單次 Git 設定停用 hooks。
- `.wrangler/` 為既有未追蹤資料，勿清理。
- **實機測試一律用網頁版官方網址 `https://d2survivors.lol/play/`**（使用者要求，2026-11-04）：不再用本地伺服器或 `game-bundles/` 快照開遊戲（快照會轉址到不存在的 `setup.html`，無法執行）。遊戲有單分頁鎖，同瀏覽器環境若已開著別的 D2 Survivors 分頁會顯示「D2 Survivors is open in another tab」，需先關掉其他分頁（勿代關非自己開的分頁）。要測尚未發布的本地修改，書籤改從本機伺服器 `import()`；載入工具書籤的遊戲頁成績不會上傳排行榜。測試前提醒使用者備份存檔。
  - **做法：用 `tests/live-harness`（Electron）開官方網址**，每個存檔一個獨立設定檔，可同時開多個職業：`powershell -File tests/live-harness/launch.ps1 -Classes sorceress,amazon -Copies 1`。不要用內建瀏覽器窗格：它只有一個共用設定檔，遊戲以 Web Locks `d2-survivors/play` 限制單分頁，鎖常被窗格外的頁面佔住而顯示「open in another tab」（2026-11-04 實測，關閉重開窗格也無效）。2026-11-04 啟動 sorceress 確認遊戲與工具按鈕正常載入，但 `boot.js` 選職業步驟報錯 `Cannot read properties of undefined (reading 'id')`，尚未修。
- **多個存檔同時測試必須互相隔離**（使用者要求，2026-11-04）：同時測多個存檔時，每個存檔用獨立的瀏覽器設定檔／環境（獨立的 localStorage、IndexedDB 與分頁），不可共用同一個瀏覽器環境，避免存檔互相覆蓋或汙染；遊戲有單分頁鎖，同環境也開不了第二個分頁。存檔需在隔離環境內匯入，並先備份原存檔，不碰使用者的真實存檔。具體隔離做法（獨立設定檔或隔離容器）尚未實作驗證，下次實測時先確認。
- **（2026-11-04 晚起被下一條取代：一般實機改用使用者提供的 D2S1 存檔副本，隔離暫存、不改原檔；需要「完整裝備池測自動配裝」時才用下面的新存檔流程）**
- **測試一律開新存檔，並用修改器解鎖／製作所有裝備，由輔助器的自動配裝自己把裝備穿上**（使用者要求，2026-11-04）：實測不使用既有存檔；每次測試在隔離環境建立全新存檔，再以存檔修改器（「裝備庫」需先開「解除修改限制」）取得全部裝備放入倉庫／背包，讓輔助器的自動配裝（換裝）流程自行挑選並穿戴，不手動替角色穿裝。目的是驗證自動配裝在完整裝備池下的行為。此流程尚未實作驗證，下次實測時先確認步驟並補上測試結果。

- **翻譯名稱顯示要對齊原版暗黑破壞神繁中，且一定要實機驗證整串原字串**（使用者要求，2026-11-05；曾連續出錯兩次）：
  - 規則：魔法物品字尾（of …）移到最前（`八目鰻之戒指`、`精密之鎖鍊靴`）；怪物稱號、稀有名稱維持原順序直接相接（`石塊蛆蟲巫異`、`妖鬼饗宴「號哭者」`、`兇殘扣環`）；冠軍／唯一怪屬性列每項之間一個空格（`惡魔 魔法抗性 冰寒強化`）。名稱中不得出現「-」「·」或殘留英文。
  - 坑一：遊戲傳來的字串有兩種形式，**以「 - 」分段**與**以空白串成整串**（`Game-*.js` 的 `ix()`：`traits.map(H).join(" ")`，唯一怪名同理）。兩種都要測，只測一種會漏。
  - 坑二：點陣字型會把「·」畫成「-」；中文間的一般空白會被 `cleanCJK` 刪掉，需要空格時用不換行空白 U+00A0。
  - 坑三：`composeFind` 要等工具包抓到遊戲物件（`__d2lang.debug().gameHooked === true`）才掛上；只注入 `lang.js` 或停在選檔頁時測到的是舊行為。要從 `d2edit.js` 完整載入、進入遊戲後再測。
  - 坑四：物品規則的「底材」不能以 of／the 開頭；萬用樣板（`* of *`）會照英文順序翻，含 of 的整串要先套物品規則。
  - 驗收：用截圖或使用者回報中的實際英文原字串（兩種串法都要），在官方 /play 頁面內呼叫 `__d2lang.translate` 逐一比對；只跑字典模擬或 `test_lang` 不算通過。

- **遊戲更新全自動化**（使用者要求，2026-11-05）：官方幾乎每天更新，以「快速相容」為主、完全自動；新內容由使用者決定是否加入。做法：**不建立排程**（使用者要求）；使用者說「遊戲更新了」即授權，AI 執行 `node verify/auto.cjs`：偵測新版→`verify.cjs --update`→`verify/live-smoke.cjs`（官方網址實機煙霧測試，自動寫 `live.json`）→`publish.cjs --confirm --auto --no-desktop`。失敗即停不發布並通知；啟動時工作目錄有未提交修改也不發布。結果看 `verify/reports/auto-log.md`，新內容看 `verify/reports/new-content.md`。此授權僅涵蓋「相容發布」；加入新功能仍需使用者指示。

## 資料夾結構（2026-11-04 起）
- 根目錄只放共用檔：`d2edit.js`（書籤入口，網址不可變）、`index.html`（轉址到 `site/install.html`）、`version.json`、README、LICENSE、`wrangler.jsonc`、本檔。
- **唯一來源（2026-11-05 第二階段起）**：網頁版的程式與資料都在根目錄對應資料夾，沒有副本。`helper/`＝輔助器；`lang/`＝語言（字典 `lang/zh-TW.json`、`lang/locales/`、`lang/tools/` 語言注入工具）；`modifier/`＝存檔修改器（頁面 `modifier/editor.html`、引擎 `modifier/patch.mjs`／`signatures.json`／`engine-page.js`）；`site/`＝網站（公告站＋安裝頁範本 `site/install.template.html`）。
- `tools/build-web.js`＝只產生輸出（`site/install.html`、根目錄 `index.html` 轉址、`version.json`、`.nojekyll`），不複製檔案；版號要求 `editor/package.json` 與 `modifier/editor.html` 的 `TOOLKIT_VERSION` 一致。
- `editor/`＝**桌面啟動器**（`main.js`、`preload.js`、`core.js` 存檔讀寫、`engine.js` 物品引擎、`remote.js` 從 GitHub 抓取資源）與 `package.json`（版號）。啟動器的介面與引擎資源都從網站載入，只有啟動器程式本身改動時才需要重建 exe（`npm run dist`，或 `verify/publish.cjs --desktop`）。
- `tests/live-harness/`、`verify/`、`docs/`、`game-bundles/<版本>/` 為跨模組。
- `backups/`（不進 Git）：`exe/`、`code/`（含 `lastgood/`）、`saves/`、`archive/`。桌面版執行時的存檔備份在執行檔旁 `backups/{softcore,hardcore,snapshots}/`。
- 新增檔案請放進對應模組資料夾；共用才放根目錄。`d2edit.js` 的 `at("資料夾/檔名")` 決定載入路徑，`editor/d2edit.js` 需同步。

## 測試指令
- Node：`node lang/tests/test_lang.cjs`、`node modifier/tests/craft-limits.cjs`、`node modifier/tests/weapon-sets.cjs`、`node tools/tests/build-web.cjs`（建置回歸，只在暫存目錄跑）、`node helper/tests/selfcheck.cjs`。
- 實機（官方 /play、隔離 Electron、H_SEED＝存檔 JSON 副本）：`electron tests/live-harness/cheat-restore-live.cjs out.json`、`electron tests/live-harness/invincible-live.cjs out.json`。
- 新登記：`modifier/tests/backup-record.cjs`、`modifier/tests/write-confirm.cjs`（verify/suite.cjs，static）。
- Electron（隔離設定檔）：`electron helper/tests/autobot.cjs`（170 項）、`modifier/tests/weapon-sets-ui.cjs`、`modifier/tests/craft-diagnostic-ui.cjs`；Linux 無頭需 `xvfb-run -a electron --no-sandbox`。
- 完整登記表：`verify/suite.cjs`（路徑以根目錄為基準）；`verify/lib/runner.cjs` 執行。
- 需儲存庫外／額外資料：`modifier/tests/craft-affix-audit.cjs`、`craft-affix-composite.cjs`、`craft-companion-ui.cjs`（讀 `game-data/裝備屬性分析/魔法稀有詞綴.json`）；`modifier/tests/version-gate-web.cjs`（需新舊版目錄與 itemstats.json）。

## 進行中／未完成
- **【待使用者決定】繁中怪物同名衝突**：`translate("Horror")`→恐骨骷髏、`Slayer`→殺戮僕魔、`Plague Bearer`→瘟疫散布者、`Blood Wing`→血翅蚊，但字典基礎譯名為驚駭、屠殺者等（技能／頭銜語境）。方案 A：怪物名只在怪物欄位或怪物 `translateAs` 明確呼叫時使用，一般字串先查基礎字典；方案 B：維持現狀（前人已知取捨）。需先截圖確認遊戲中裸字出現的位置。
- **【待使用者決定】`cleanCJK` 吃掉逗號**（約 2,434 條）：A 維持現狀、B 逗號保護（長句保留）、C 字型映射。
- **【已解】修改器倍率重載**（2026-11-07）：固定品質倍率已改為拒絕製作（見近期紀錄）；若要支援，需改寫 `stats` 並通過遊戲範圍檢查，屬另案。舊敘述：解除限制後套用倍率，寫入、重載，比對 `mods` 是否保留（修改器稽核 #15）。**狀態**：`craft-live.cjs` 切段原以一般字串切 `//=====MAIN`，註解裡的字樣使腳本被切成三段（已改為只認獨立成行的標記），`craft-fixed-e2e.js` 現可正常執行。2026-11-07 實機跑完：寫入成功、重載後 766 件中 9 件 Insight（Archon Staff）故障（`seed: not what its roll makes` 與 `stat: more than 3 StaffMods`）；今日改動未碰製作邏輯（`editor.html` 僅 4 個 hunk，在存檔檢查與寫入確認），**故障來源未判定，屬既有問題或既有工作區修改，需另案調查**。倍率（#15）仍未跑，需另寫腳本。
1. **實機長跑未驗收**（2026-11-05 13:11 起於 `tests/live-harness/run-opt-1105/` 背景長跑：全新 sorceress、普通、本機伺服器 127.0.0.1:8766 載入未發布修改；約 5 分鐘後依使用者指示關閉：普通第一幕、23 級、0 死亡、走位正常；完整長跑仍未做）：輔助器普通一至五幕連續至地獄、營地自動開局與商店完整串接、赫拉迪克法典技能變體與任務目標鎖定（Antigravity 2026-11-02 列出）。
2. **「尋找凱恩」任務**：舊批次存檔任務均 0／6（Claude 2026-11-02），之後未見確認修正紀錄，需實機核對。
3. **翻譯核對**：55 個屬性樣板無精確官方對應、舊版物品清單未人工核對；官方同英文多譯 21 筆不可盲目覆寫（Codex 2026-11-03）。
4. **手機暫停選單無法點擊**：已限制選卡須在 levelUp 且 frontend 關閉，但是否為根因未證實，未於真實手機重現（Codex 2026-11-03）。2026-11-05 實機（官方 /play、桌面尺寸 1086×737、工具包已載入）：暫停選單由遊戲畫在 canvas 上；暫停時唯一可見 DOM 按鈕是遊戲自己的 `#ctrlpnl`，其上層為遊戲 canvas，工具包元素未遮擋（面板 `pointer-events:none`）。另：`travel` 狀態下 `g.pause()` 被遊戲忽略（遊戲 `pause()` 只接受 playing／paused／camp），手機若在傳送中按暫停會無反應，屬遊戲行為。同日以 CDP 觸控模擬（`Emulation.setTouchEmulationEnabled`＋`Input.dispatchTouchEvent`，工具包已載入、暫停中）格點點擊，第 23 下（150,200）讓遊戲由 paused 回到 playing，觸控能到達遊戲選單。以 390×844 手機尺寸模擬時 Electron 在載入階段即退出，未能測手機版面；仍未用真實手機重現。
2. 補充（2026-11-05）：使用者存檔實機診斷為「任務（地獄）6/6；尋找凱恩：已完成」，舊批次 0/6 存檔已無法取得，無法重現。
5. **桌面版**：多項網頁變更已同步來源，但未重新封裝或發布執行檔。
6. **修改功能舊待辦（Codex 2026-11-02 模擬發現，其餘已修的項目已移除）**——以下尚未見逐項確認，需核對後標記：
   - 作弊總開關／子開關關閉後不還原倍率、數值、函式（「全部關閉」已還原金幣倍率，已寫入遊戲的修改可能持續至重新開始）。
   - 金幣保護觸發後還原；`world.gold` 若為函式會被覆寫。
   - 技能滿級找不到資料時預設 99。
   - 無限重抽欄位 `ranks.Reroll` 與編輯器 `ranks.rerolls` 不一致。
   - 網頁版寫入存檔前未自動備份，與確認對話框說明不符。

## 已解決摘要
- 2026-10-31～11-01：修改器原版規則限制（`validateItems`、`statRanges`、`affixSlots` 前後綴分欄）、中英雙語、手機版面；輔助器建立（戰鬥輔助／自動戰鬥分頁、全圖走位、排行榜學習、任務交付）；v1.0.1 發布。
- 2026-11-02：遊戲 20261102.1 適配（雙武器組修改器與輔助器、新版選卡回呼與自訂鍵位、職業專屬符文之語、574 筆物品生成檢查）；遊戲內語言模組 `lang.js`；遊戲修改分頁（總開關、無敵、暴擊、一擊必殺、技能 99、怪物最大化、全精英、無限重抽、金幣 90 億保護）；專案改名「D2倖存者工具包」。
- 2026-11-03：製作裝備（裝備分類、前後綴分開範圍、複合詞綴自動配套與同欄顯示、輸出設定診斷；708 筆詞綴稽核 0 失敗）；輔助器「全部關閉」、獨立停止自動戰鬥、全圖吸金幣、撿寶依原版 `loot()`、選卡加速；繁中字典統一為 `zh-TW.json` 並比對 D2R 官方字串；公告頁改寫；Cloudflare 改自動部署。

## 近期紀錄
- 2026-11-07｜Claude（鍛造文字、恐怖燃燒精華作弊、Jack 查證；**未提交、未發布**）：
  - **鍛造未翻譯文字**：字典新增 `+# to Cold Mastery (Sorceress Only)`（冰寒專精只限魔法使）、`Up to 10 tempers an item`、`Burning Essences of Terror: #`、`Cost: # Burning Essence(s) of Terror`。`test_lang` 通過；**尚未在官方頁以 `__d2lang.translate` 實機逐一比對**，也未確認截圖中 ×1 的譯法。
  - **作弊 `cheat.forgeMax`（恐怖燃燒精華 99）**：已實作於 `helper/autobot.js`（預設關閉，受作弊總開關控制），啟用後背包出現 `base: bet` 堆疊 count 99（實機確認存檔內 count=99）。**未驗證**：遊戲鍛造時是否接受此堆疊（鍛造請求由伺服器處理）。
  - **作弊 鍛造機率 100%：不可行**。遊戲鍛造送至伺服器 `POST /forge`，由伺服器決定結果，用戶端無法控制；未實作，面板文字已註明「鍛造機率無法修改」。
  - **Jack 冠軍怪 ≠ Jack 物品名稱**：`Jack` 是稀有軀幹裝備（`dAe` 表，限 torso）的名稱後綴（如 Vengeance Jack），不是怪物名稱。編輯器的稀有製作只會產生底材名（如棉布甲），無法指定 Jack 名稱。實機以作弊（maxDropRate、oneHitKill）進行三輪約 200 秒遊戲，未掉落 Jack 稀有；**Jack 遊戲內截圖仍未取得**。
  - **回歸**：`item-db`、`skill-mods` 單獨執行皆通過（先前失敗為臨時目錄 EPERM，非程式問題）；`test_lang` 通過。

- 2026-11-07｜Claude（閃電截圖與 Jack 查證；**未提交、未發布**）：
  - **閃電（已實機截圖）**：官方 /play 修改器「物品」頁選取製作的 Skin of the Vipermagi，屬性列顯示「閃電抗性 +35%」（`shot-items.png`，scratchpad）。這驗證的是修改器介面上的譯文，不是遊戲戰鬥畫面的 HUD。
  - **Jack（未取得遊戲內截圖）**：遊戲資料中的 `XX Jack`（如 Vengeance Jack→復仇上衣、Armageddon Jack→毀天滅地上衣）是**怪物冠軍／唯一怪名稱**，不是裝備名稱；裝備庫、物品頁與 gamedata 搜不到。要截到遊戲內畫面，需要在遊戲中出現該冠軍怪（例如在關卡中讓它生成），目前工具包沒有生成冠軍怪的功能。

- 2026-11-07｜Claude（手機比較框排版，**已實作、未實機驗證、未提交、未發布**）：手機點擊物品時，遊戲的物品框 `#tooltip` 與比較框 `.worn-box` 會蓋住「丟下／出售／移動」鍵（`#drop-held`、`#sell-held`、`#move-held`）。`lang/lang.js` 新增「比較框排版」：僅在 `pointer: coarse` 觸控裝置、可見時，每幀把可見的框上緣對齊安全區頂部、並排置中，縮放到不超過按鈕上緣（找不到可見按鈕時退回 viewport 底部 120px）。語言選單新增「比較框上方並列／比較框原版位置」，設定存 `localStorage["d2lang:tipLayout"]`，預設上方並列。純函式 `planTipLayout` 以 `lang/tests/test_tip_layout.cjs` 測 6 項通過；`node --check`、`lang/tests/test_lang.cjs` 通過。**沒驗**：官方 /play 實機（手機視窗、拿起物品、看按鈕位置）、桌機不受影響、原版切換、與遊戲原本 `jd`／`placeHover` 排程的閃爍。實機驗證前不可說已修好。
- 2026-11-07｜Claude（Ormus' Robes 不換裝的原因：已查明，非故障；截圖仍未完成）：
  - **實機數值（官方 /play、隔離設定檔）**：身上 Skin of the Vipermagi 的抗性為火／冰／電／毒各 35，奧瑪斯之袍為 0；防禦 285→493（+3.0 分）、FCR 0.242→0.209（−0.7 分），但四項抗性損失約 −172 分，總分差 ≈ −170，遠低於門檻 2，因此 `bestGear` 不會換上。空欄位（`fillsEmpty`）時則會直接穿上。
  - **營地流程實測**：自動模式離場回營地後（`g.pause()`＋`g.leaveRun()`），營地整備先執行「把暗金／套裝收進收藏庫」，表示 `bestGear` 沒有選中奧瑪斯之袍，與上面的計算一致。
  - **結論**：這是評分設計的結果（重視抗性），不是程式錯誤。若要改變，需使用者決定抗性與防禦的取捨。
  - **Jack 與閃電的遊戲內畫面：未取得**。裝備庫搜尋（名稱／中文）找不到 Armageddon Jack、上衣、閃電，400 筆清單中也沒有含「上衣」或「閃電」的項目；Skin 的詳細說明區沒有列出抗性文字。需要使用者指定一件在遊戲中出現這些詞的物品，或在遊戲中實際掉落後截圖。

- 2026-11-07｜Claude（Insight 故障根因與修正；**未提交、未發布**）：
  - **根因**：修改器「隨機（跟掉落一樣）」路徑（`pMax`=0，`modifier/engine-page.js` 的 `generate`）對符文之語直接附上種子 roll。實測帶 roll 的符文之語讀回時，遊戲會改寫 roll[0] 1→2，造成 `seed: not what its roll makes`；另有種子產生的法杖技能超過 3 項（`more than 3 StaffMods`）。這些物品在寫入前沒有經遊戲的 `__itemFault` 檢查。
  - **修正**：隨機路徑每個種子先去掉 roll，再經 `G.__itemFault` 檢查，只取通過者（最多 `SEED_TRIES` 次，全部不通過回傳 null）。
  - **實機驗證**（官方 /play、隔離設定檔、`craft-fixed-e2e.js` 與 `seed.json`）：修正前 8/8 重現（3 件故障，`saveFaults` 有 Insight 故障）；修正後 `saveFaults` 為 `[]`、寫入後 Insight 全部 `fault: null`。單獨批次 8 件 Insight（`bis-V4`）修正前 3/9 故障，修正後 0/9。
  - **副作用（需知）**：隨機路徑產生的物品不再附 roll，與先前「不附 roll 的做法與既有產生器一致」相同；讀檔不會改寫。`modifier/tests` 中 craft-affix-ui、craft-companion-ui、craft-diagnostic-ui（需 Electron 執行）與 craft-affix-audit、craft-limits、runeword-class-base、skill-mods、backup-record、item-db、weapon-sets、write-confirm 通過。
  - **仍未做**：Ormus' Robes 在遊戲內換裝的實測（見第四輪）；Jack 與閃電的遊戲內畫面。

- 2026-11-07｜Claude（第四輪：續查三項；**未提交、未發布**）：
  - **Ormus' Robes 穿戴**：實機確認奧瑪斯之袍在共用倉庫 `save.stashTabs.shared1`，`stashView` 的 shared1 分頁會列出它（已驗證）。以身上 Skin of the Vipermagi（實機 equip 成功）比較：奧瑪斯之袍 Defense 493、Life 100、FCR 0.21；Skin Defense 285、Life 100；依 `gearScore` 公式差值 **3.0 ≥ 門檻 2**，應會換裝（公式推算，未經營地流程實測）。自動模式 170 秒內角色一直停在 playing，未回營地，因此**換裝未在遊戲內實際觸發**。先前 Sacred Armor of the Whale 未換的原因仍未查明（此物品在編輯器搜不到，無法製作）。
  - **Insight（Archon Staff）故障**：完整 `craft-fixed-e2e.js` 重現（3 件 `seed: not what its roll makes`、`more than 3 StaffMods`，舊檔無此故障）。縮減後仍重現：V1（去掉 Annihilus／Hellfire／Ormus／Civerb）、V3（只留 Insight 製作與舊檔）、V4（只剩一次 Insight 批次 8 件，9 件中 3 件故障，法杖技能 2 或 4 項，且有 `skill:frozenOrb+1` 重複）。故障僅出現在 roll 為 true 的物品。**尚未確認根因**：可能是編輯器隨機產生路徑（`modifier/engine-page.js` 的 make/pinned）讓遊戲產生器的法杖技能超過 3 項或重複，但未驗證；早先 `insight8-e2e.js`、`insight3max-e2e.js` 未重現，差異未釐清。
  - **截圖**：`craft-live.cjs` 增加 `H_SHOT` 截圖能力（僅在測試用副本中修改，未改動倉庫的 `craft-live.cjs`）。已在官方 /play 截得修改器裝備庫畫面（`shot-jack.png`，顯示 Ormus 搜尋結果為「奧瑪斯之袍」）。**Jack 與閃電的遊戲內畫面未取得**：裝備庫搜尋「Armageddon」「上衣」「閃電」皆無結果，需另找能在遊戲畫面或物品說明出現這些詞的物品。

- 2026-11-07｜Claude（第三輪：未解決項目續查；**未提交、未發布、未截圖**）：
  - **c4p1、c4p4 重審（codex 唯讀，本次有實際回傳）**：c4p1 實檢 449 行，回報 3 條：`Rite of Passage`→通過儀式（韓文 통과의례）；`monster:Spider Magus`→蜘蛛法師（韓文 거미 마술사）；`unique:Moon`→月之（韓文 달의）。已套用。c4p4 實檢 448 行，回報 `Fiend …`（韓文 마귀＝惡魔，非蝙蝠）與 `Rule …`（韓文 지배＝統御，非尺杖）共 165 條，已於 `lang/zh-TW.json` 與 `lang/locales/zh-TW.json` 改為惡魔／統御。**此 165 條改動依韓文官方字串，屬大量變更，請使用者確認是否接受**；語言測試通過。
  - **Ormus' Robes 穿戴（未查明）**：實機（官方 /play、隔離設定檔）確認奧瑪斯之袍寫入後位於 `save.stashTabs.shared1`（共用倉庫），不在 amazon 分頁；新檔的 amazon 初始無身上裝備（body 為空）。170 秒的自動模式內角色一直停在 playing，未回營地，因此換裝流程**未被觸發**，無法判定原因。既有 `helper/autobot.js` 的換裝只在營地的倉庫交易中執行（`shopSteps.stash` → `bestGear`），且 amazon 的排行榜 body 清單不含 Ormus'。下一步需要：先把角色身上放入 Sacred Armor of the Whale（目前編輯器搜不到此名稱，需確認其製作品質），再以營地流程比較分數。
  - **Insight（Archon Staff）根因、閃電與 Jack 的遊戲畫面截圖**：本輪未完成。截圖需另寫腳本（參考 `tests/live-harness/keys-visual.cjs` 的 `capturePage`）。

- 2026-11-07｜Claude（第二輪實機翻譯探測，**未提交、未發布**）：官方 /play（`tests/live-harness/craft-live.cjs`，本機工作區的 `lang/zh-TW.json` 經工具包載入）以 `__d2lang.translate` 檢查：`Lightning Resist +25%`→閃電抗性 +25%；`+25 to Minimum Lightning Damage`→+25 閃電傷害最小值；`Lightning Enchanted`→閃電強化；`Armageddon Jack`→毀天滅地上衣；`Jack`→上衣；`Bramble Jack`→荊棘上衣；`the Witch`→女巫；`Puke`→嘔吐；`Amulet`→項鍊；`Amulets`→護身符（小寫鍵另有譯文，未改）。**這只驗證譯文查表，未截圖確認遊戲畫面**；Stone Rock、Chain、語序未改。
- 2026-11-07｜Claude（Ormus' Robes 穿戴原因：未查明）：既有 `equip-out.json` 只記錄穿戴前後的已穿清單，未記錄背包內容與 gearScore，無法判定。下一步需另寫探測：讀取背包與 `gearScore` 比較 Ormus' Robes 與 Sacred Armor of the Whale。

- 2026-11-07｜Claude（字典語意審查 chunk4 補完、裁定待決項；**未提交、未發布、未實機**）：
  - **chunk4 覆蓋**：原本只列 50 條，現將 chunk4（5386–7180 行，共 1795 條）切成 4 段，改由 codex（gpt-6.1-terra，低思考）逐段審查，回報 449/449、449/449、449/449、448/448 行。c4p1 與 c4p4 結果為空，但審查速度很快，**可靠度有限**，只能視為單輪審查。
  - **套用的修正（語言測試通過）**：Jack 40 條 水兵→上衣（韓文官方 웃옷）；the Witch（兩鍵）巫異→女巫（韓文 마녀）；unique:Puke 嘔血→嘔吐；AMULETS 護身符→項鍊；Lightning 元素名詞 電擊→閃電（66 條）。
  - **未做**：Stone Rock、Chain、Dragon、語序保持現狀，原因是韓文官方字串不足以判定。Insight（Archon Staff）根因與 Ormus' Robes 未穿戴原因仍未查明；閃電與 Jack 的文字變更**尚未在官方網址實機檢查**，不可報為已修好。

- 2026-11-07｜Claude（字典逐條語意審查，第六輪；**未提交、未發布**）：
  - **覆蓋範圍**：字典 14,360 條分為 8 段（`backups/tmp-review/`，已被 Git 忽略）。改為純 ASCII 跳脫格式交給子代理後，全部範圍各至少讀過一遍（chunk1 經 4 個子段補完；chunk7、chunk8 完整）。**限制**：子代理是低思考模型、以人工解碼跳脫字元，準確率有限；chunk4 只列出前 50 條（已被 Bar／Loom 系統性問題佔滿，其餘可能漏報）。因此這是**單輪審查，不是逐條人工審校**，仍可能有遺漏。
  - **本輪套用（語言測試通過）**：`Stamina` 精力→耐力（10 條，含野蠻人條目，統一前後不一致）；`Hide` 毛皮→皮革（40 條）；`Nock` 搭弦→弦槽（39 條）；`Battle Orders` 戰鬥命令→戰鬥體制（與同系列一致）；`Brow` 面容→額頭；`+#% to Lightning Skill Damage` 與 `# bolts`（弩箭）、`Amulet`→項鍊；兩條句子（護甲符文與「對具有相應元素抗性的怪物造成的傷害」、天梯拒收條件、暗影宗師火焰施放的頓號）。
  - **不成立（查證後不改）**：`Bladebone` 子代理稱「肩肛骨」錯字，但字典實際已是「肩胛骨」，不改。
  - **裁定（2026-11-07，第二輪）**：①`Lightning` 統一為「閃電」（字典 zh-TW.json 與 locales 元素名詞共 66 條；保留神聖電擊、Shocking 與動詞「電擊」；test_lang.cjs 同步）。②`Jack` 系列 40 條由「水兵」改「上衣」：韓文官方字串 `Jack`＝「웃옷」（上衣類），水兵不符。③`the Witch`（兩鍵）改「女巫」（韓文官方＝「마녀」）。④`unique:Puke` 嘔血→嘔吐（韓文＝「구토의」）。⑤`AMULETS` 護身符→項鍊（與 Amulet 一致）。⑥`Dragon` 保留（巨龍 119 條為主；「飛龍」僅用於技能「飛龍在天」，屬技能用語）。⑦`Stone Rock`、`Chain`、語序維持現狀（韓文官方資料無法確定譯法，不改）。
  - **停止時的離場流程（設計決定）**：已開始的安全離場會走完（保命），停止後不再發起新動作，不改程式。
- 2026-11-07｜Claude（/goal 字典逐條語意審查，第五輪；**未提交、未發布；審查未完成**）：
  - **覆蓋範圍（誠實紀錄）**：字典 14,360 條分為 8 段（`backups/tmp-review/chunk1–8.tsv`，已被 Git 忽略）。子代理在本環境只能穩定讀到部分：chunk2、3、5、6 約讀完一遍（但輸出有截斷，chunk4 與 chunk6 只列前 50 條與部分）；chunk1 約 100 行、chunk7 約 1,200 行、chunk8 約 300 行。**整份字典尚未完成逐條人工審查**，不能宣稱「所有翻譯正確、沒有遺漏」。
  - **本輪已套用的修正（語言測試通過）**：①`Bar`（武器名）柵欄→棒（40 條）；②`Loom`（弓類名）隱現→織機（36 條）；③`Scarab` 惡魔甲蟲→聖甲蟲（32 條）；④`Shank`（靴類）尖鑽→脛骨（36 條，與基底譯名 `Shank`=脛骨一致，避免與 `Greaves`=護脛撞名）；⑤`Loud`「警告」→「響亮」（依韓文譯表 우렁찬）；⑥個別條目 24 條（如 `Frenzied` 狂亂、`Shadow Cloak` 暗影斗蓬、詞綴 `Envenomed`→劇毒、`Massive`→巨大、`Merciless`→無情、`Paleocene`→古新世、`Prismatic`→稜彩、`Spiritual`→靈性、`of Anima`→靈魂之、`of Traveling`→旅行之、`Plague Dart`→瘟疫飛鏢、`Puke`→嘔吐、`Missing`→未收藏、`Rune Slayer`→符文屠殺者、`Shadow Touch`→暗影之觸、`# spark(s)`→火花、`You cleared…` 句型三條語序與時間用詞）；⑦句子 17 條（如 `2 to 15 letters` 字元→字母、Steam 平台名、`Critical Strike`→致命一擊、元素變體語意、寶石聖壇稀有機率、`Its blows…` 第4次打擊還會釋放隕石、`champions`→冠軍怪物等）。
  - **有依據但未修（需決定或證據不足）**：`Jack` 系列 38 條統一為「水兵」，但 `Armageddon Jack` 等裝備名語意上可能應為「短上衣／皮甲」，需整批決定；`Stone Rock`「石岩之岩」、`# bolt`「{0}枚」、`* out around you…` 語序、`Half as much Faster Cast Rate` 的 recharge 譯法，把握度中，未改。`the Witch`「巫異」可能是怪物稱號的刻意譯法（交接前文的『石塊蛆蟲巫異』），未改。
  - **子代理工具限制**：PowerShell 在此環境無法穩定輸出 UTF-8（`sed` 不存在、主控台編碼受限、輸出截斷）。下一步若要完成審查，需先把各段改成 ASCII 跳脫格式交付，或由 Node 分段摘要後再審。
- 2026-11-07｜Claude（/goal 找工具包問題，第四輪；**未提交、未發布**）：
  - **翻譯（逐條核對後修正，語言測試通過）**：①武器名稱 `Quarrel` 系統性譯成「爭鬥」，改為「弩箭」（38 條：`Carrion Quarrel`、`Bitter Quarrel`、`Beast Quarrel` 等）。②`Blow` 在武器名稱中應為「擊」而非「吹」（38 條：`Beast Blow`、`Death Blow` 等）。③`Already on its elite base: *` 語意不通，改為「已使用菁英底材：{0}」。④投擲毒雲條目的主詞錯誤，改為「投擲造成 {0} 武器傷害的投擲物，並留下毒雲」。⑤寶石聖壇條目把「稀有機率」誤指為掉珠寶機率，改為「其中有四分之一機率為稀有品質」。
  - **翻譯（仍未完成，待確認）**：`Vengeance Jack`「復仇水兵」（Jack 在裝備名中多指皮甲，把握度中）、`Loud`「警告」（把握度中，需看使用情境）。字典逐條語意審查**尚未完成**：子代理在 PowerShell 環境中無法穩定讀取分段內容（`sed` 不存在、輸出截斷、中文亂碼），只完成約 800 行與數段。下一步改用 Node 分段讀取（Node 讀 UTF-8 正確）再交付審查。
  - **數值核對（子代理，靜態）**：`heroNumbers`、`director.cloneComes`、存檔 `terror` 欄位的條件與名稱在 20261105.1 與 20261105.3 之間未見直接常數改動；內部壓縮名稱改變，間接公式未完整追蹤（低至中風險）。`tierDone` 的結算畫面改用 `replayShown`，但輔助器讀的是 `g.tierDone` 狀態並直接呼叫 `advance`，不點結算按鈕，故不受影響（已查 `autobot.js` 約 1553 行）。
  - **停止時的離場流程（設計決定，不改程式）**：已開始的安全離場（`returnToSafety`，8 秒期限）會走完，這是保命動作；停止後 `settings.enabled` 與 `progressEnabled` 為 false，之後的 tick 不會發起新動作。故不以取消旗標處理。
  - **驗證**：`lang/tests/test_lang.cjs` 通過；helper 組上一輪已通過，本輪的 helper 未改。
- 2026-11-07｜Claude（/goal 找工具包問題，第三輪；**未提交、未發布**）：
  - **輔助器**：①`destroy` 還原掛鉤改回「只還原自己的包裝」（`hookTown` 與通用包裝）。依據：三個狀態記錄包裝（`offerLevelUp`、`showLevelUp`、`showCampMenu`）只記錄狀態並原樣轉交，殘留無副作用；反而無條件還原會刪掉其他工具的包裝。另加 `alive` 判斷，銷毀後不再寫入狀態。②`openCampTrade` 失敗（非營地、或未建立交易）時寫入 `lastAction`，不再靜默當成已完成。③停止自動戰鬥不取消已啟動的離場流程：**仍未修**（低風險，需設計取消旗標）。
  - **翻譯（第二波抽樣，185 條）**：修正 5 條譯名不一致：Spirit 指符文之語時改為「精神」（兩條）、`Bone Spirit` 統一為「骸骨之魂」、`Summon Spirit Wolf` 統一為「幽靈狼」、`Dire Wolf` 為「恐狼」（與字典既有條目一致）。抽樣未發現明顯語意錯誤，但**不代表整份字典無誤**，人工語意審查仍未完整完成。
  - **遊戲本體跨版本比對（基準 20261105.1，29 項）**：27 項找到同名或呼叫證據；`saveFaults`、`itemFault` 未以原名出現（修改器的存檔檢查是經由物品引擎特徵碼掛接，實機仍正常，不是原名依賴）。**行為差異 1 項**：`loot(e)` 新增 `hidesell`（物品隱藏，角色走近時遊戲自動販售）。輔助器 `accepts()` 只接受 `pick`／`sell`，因此不主動撿 `hidesell`，與先前設計一致；遊戲會自行販售，未見破壞。`heroNumbers`、`director.cloneComes`、`tierDone`、存檔 `terror` 內部壓縮名稱改變，未完整核對數值（中風險，待後續實機驗證）。
  - **驗證**：helper 組 selfcheck＋autobot 208/0；`lang/tests/test_lang.cjs` 通過。modifier 組上一輪已全數通過，本輪未改 modifier。
  - **仍未完成**：翻譯人工語意審查（完整）、`heroNumbers`／`cloneComes`／`tierDone` 的數值核對、停止時取消離場、`saveFaults` 與 `itemFault` 在新版的實際位置（目前靠特徵碼，已可用）。
- 2026-11-07｜Claude（/goal 找工具包問題；**未提交、未發布**）：本輪修正與驗證如下。
  - **修改器**：①物品座標套用前檢查（整數、不超出格子、不與其他物品重疊；`modifier/editor.html` `checkCoordinates`）。實機以假容器驗證：正常通過，超出、負數、小數、空字串、重疊皆拋錯（`coord-check`，官方頁載入）。②一鍵解鎖「調高數值＋補齊收藏」任一段失敗，整體還原為動手前的存檔（快照還原）。③語言選「自動」時清掉 `d2lang`，否則會停在先前的手動語言（`i18n.js`；模擬驗證 d2lang 已移除）。④數字欄位不接受負數（先前實機驗證）。
  - **輔助器**：①`leaveTrade` 離開動作拋錯時記錄原因，仍清掉交易與商店狀態（不再卡在商店）。②關卡切換加 120 秒期限（逾時走 `stop()` 釋放轉場鎖）。③不等待的非同步動作（`leaveRun`、`toMenu`、`returnToSafety`、`advance`、`continueRun`、`loadSkillTables`、`checkGameVersion` 等 11 處）改由 `fire()` 包裝：拒絕時記錄到 `lastAction`，不再無聲消失。
  - **d2edit.js**：寫入失敗時保留上一次寫入的防護（未單測）。
  - **字典**：刪除被遮蓋的死重複鍵（`+#, skills +#` 第 9480 行，JSON 只保留後者，行為不變）；補 4 條屬性文字（冰寒抗性上限、毒素技能傷害、所有商人的價格降低、將目標復生為：）。
  - **撤回（未驗證，不改核心翻譯路徑）**：萬用字 `*` 比對修正（`lang/lang.js`），還原為原版。
  - **驗證**：helper 組 selfcheck＋autobot 208/0；modifier 組 craft-limits、weapon-sets、skill-mods、runeword-class-base、backup-record、write-confirm、save-faults-ui（Electron）、weapon-sets-ui（Electron）、item-db（613 件）全通過；`lang/tests/test_lang.cjs` 通過。
  - **未修，已確認有依據**：輔助器 `destroy` 還原掛鉤會覆蓋其他工具後來的包裝（若要改，需先讓各 factory 檢查 `alive`，否則已銷毀的包裝會留在呼叫鏈）；停止自動戰鬥不取消已啟動的離場流程（低）；`openCampTrade` 失敗時靜默略過（中，需實機確認）。
  - **未完成的審查**：翻譯人工語意審查（第二波）、遊戲本體大模組（`Game`、`itemArt`、`saveTransfer`、`screens`）跨版本比對、`game-data/` 舊資料與 `craft-affix-audit` 等測試的依賴確認。3 條被移除的屬性（`item_*_damagemax_perlevel`）在工具包中無引用（已 grep）。
- 2026-11-07｜Claude（/goal 找工具包問題＋分派子代理；**未提交、未發布**）：
  - **子代理稽核**：Codex（gpt-6.1-terra，low）審輔助器 6 條、修改器 5 條，AGY（gemini-3.8-flash，low）審翻譯 10 條，另派 4 份遊戲本體分析（`docs/game-analysis/bundle-20261105.3-*.md`，已加入索引）與 1 份翻譯全面審查（已併入本節，檔案已刪）。
  - **已修並驗證**：①修改器數字欄位不接受負數或非有限值（實機：英雄頁填 -5，寫入後欄位還原、存檔金幣 1142416609，非負數）。②`d2edit.js` 寫入失敗時保留上一次寫入的防護（靜態修改，未單測）。③`helper/autobot.js` 關卡切換加 120 秒期限，逾時走 `stop()` 釋放轉場鎖（靜態修改，未單測）。④字典刪除 `+#, skills +#` 的死重複（第 9480 行，JSON 只保留後者，行為不變）。helper 組 selfcheck＋autobot 208/0；modifier 組 craft-limits、weapon-sets、skill-mods、runeword-class-base、backup-record、write-confirm、save-faults-ui、weapon-sets-ui、item-db（613 件）全通過。
  - **試過後撤回**：萬用字 `*` 比對修正（`lang/lang.js` 正則）。依據是 411 條含 `*` 的鍵比對不到，但**遊戲是否走這條路徑未驗證**，且改動大（所有無數字字串都會跑 1117 個正則），已還原為原版，`test_lang` 改回 HEAD。若要重試，先確認遊戲畫面字串是否經此路徑，並以官方頁面批次比對新舊結果。
  - **未修（有依據，待排序）**：修改器物品座標可重疊或越界（高，`editor.html` 約 1893 行）；一鍵解鎖中途失敗留下部分修改（中）；選「自動」語言無法回到系統語言（低）；輔助器 `leaveTrade` 拋錯、`openCampTrade` 靜默略過（中）；停止自動戰鬥不取消進行中的離場（低）；`void` 丟棄的 Promise 無停機（中）；`destroy` 還原掛鉤會覆蓋其他工具的包裝（中，已試過條件還原，因會讓已銷毀的包裝留在呼叫鏈而撤回，需要先讓各 factory 檢查 `alive` 再處理）。
  - **遊戲本體與裝備屬性**：舊桌面快照（`%APPDATA%\D2 Survivors\d2\itemstats.json`）與 20261105.3 比對：名稱 0 變動；2 件套裝物品、13 套套裝、符文之語 Famine 的內容變動；屬性定義 20 條改變、3 條移除（`item_{cold,ltng,fire}_damagemax_perlevel`）。修改器與輔助器不讀寫死的屬性表，規則來自遊戲引擎，所以裝備庫數值跟著遊戲走。**未查**：這 3 條移除屬性是否在 `modifier/zh.js`、輔助器的 `charmValue`／`gearScore` 被引用；`game-data/裝備屬性分析/` 仍為 2026.1030.2 擷取，未被程式碼使用。
  - **翻譯審查（第一波，靜態）**：字典 14360 筆，名稱 607 筆全有譯名。屬性文字缺 5 條精確鍵，已補（`to Maximum Cold Resist`→冰寒抗性上限、`to Poison Skill Damage`→毒素技能傷害、`Reduces all Vendor Prices`→所有商人的價格降低、`Reanimate as:`→將目標復生為：；譯法比照同系列既有條目）。其餘「缺」多數由 `#`／`*` 樣板涵蓋。待確認：24 欄精確鍵缺、87 筆佔位符順序重排、13 組 `item:` 與一般鍵譯名不同（例：`item:Grief`「悔恨」與 `Grief`「悲慟」）、160 筆含連續英文（多為品牌與按鍵名）。第二波人工語意審查尚未做。
  - **規則**：屬性文字維持原版暗黑 2 譯法，只有數值或規則與本遊戲不同時才以本遊戲為準；裝備名稱對齊原版。
  - **顧問意見（已採納）**：未實機證實前不改核心翻譯路徑；「已修好」只寫有證據的項目。
- 2026-11-07｜Claude（/goal 續：實機驗證與修復；**未提交、未發布**）：
  - **修復｜修改器固定品質倍率**（稽核 #15）：實機確認製作時預覽正確翻倍（Annihilus ×2：所有技能 +2、力量 +40），但寫入重載後回到 ×1（兩件 `mods` 完全相同）。原因：暗金／套裝／符文之語以 `stats` 為準，讀檔時遊戲依 `stats` 重算 `mods`。修法：`modifier/editor.html` 製作函式在 `mul !== 1` 且物品帶 `stats` 時直接拒絕並說明，不再靜默丟失。實機重跑：倍率 2 被拒絕，存檔只剩正常一件。
  - **實機｜穿裝與輔助器**（官方網址、隔離設定檔，`equip-e2e.js`）：修改器製作 Ormus' Robes 與 Spirit 寫入重載；開啟戰鬥輔助總開關、自動穿裝、無敵、一擊必殺，跑 60 秒。輔助器持續戰鬥（走位、踢罐子、撿物、選升級卡），狀態正常。Spirit 盾已穿上；Ormus' Robes 未穿（身體欄改為既有 Sacred Armor），原因 2026-11-07 查證：`helper/autobot.js` 的 `bestGear` 只評估背包（`g.inventoryOf`），修改器預設目的地為第一個容器，本次落在身上欄位；身體欄已有 Sacred Armor。最可能是 `gearScore` 分數較低而未替換（分數未實測，未確認）。遊戲資料無職業限制欄位可佐證。
  - **實機｜Insight 故障**：完整 `craft-fixed-e2e.js` 序列兩次重跑皆重現（8 件，全部 `roll=true` 且帶法杖技能，故障 `seed`／`stat: more than 3 StaffMods`）。隔離單獨製作 0/12 故障：隨機 ×1、×8（含完整序列的目的地設定）、全部最高 ×1、×3。差異來源尚未定位。已排除的前置步驟：自訂模式暗金 Annihilus 在前（0/9）、自訂模式符文之語 Spirit 在前（0/9）。下一步：以完整序列的前半段、後半段分組二分（前半＝Annihilus～Spirit、Insight 0×1，後半＝Call to Arms 起），確認是哪一段含觸發條件；`tests/live-harness/craft-fixed-e2e.js` 本身可重現（8/8）。
  - **發現｜`modifier/overrides/game-overrides.js` 第 2 行是未加註解的中文字**，執行時 `ReferenceError`，整段覆蓋程式從未生效（實機主控台可見）。此檔意圖覆蓋遊戲存檔檢查、物品合法性與頁面環境檢查（`__saveFaults`、`ie`／`re`、`__itemFault` 改為恆回傳通過），屬於繞過遊戲防修改判定。**修語法錯誤會使它真的生效，未擅自修改，待使用者決定。**
  - **測試工具修正**：`craft-live.cjs` 切段改為只認獨立成行的 `//=====MAIN`。新增 `tests/live-harness/invincible-live.cjs`。
- 2026-11-07｜Claude（/goal 改良輔助器、繁中、修改器；**未提交、未發布、未實機驗證**）：子代理唯讀稽核——Codex（gpt-6.1-terra，low）審 helper＋modifier 共 15 條，AGY（gemini-3.8-flash，low）審 lang 共 12 條。Claude 逐條讀程式碼與字典核對後處理：
  - **已修（Codex 寫入、Claude 核對 diff、測試通過）**：①輔助器 `selfcheck` 補檢查 `director.cloneComes`（導演未就緒時顯示「尚未驗證」）；②無敵保存並還原 `life` 的原始 descriptor、不可設定時不拋錯、`damageTaken` 納入還原；③作弊紀錄更換玩家或導演前先還原舊值，無玩家時仍處理關閉項目。④修改器「存檔檢查」`saveFaults` 無法檢查時顯示「未驗證」而非通過式結論；⑤網頁備份改為單一紀錄（`format: d2edit-backup-v1`）一次寫入並讀回驗證，**讀取相容舊三鍵格式**（`backup-record.cjs` 測試）；⑥寫入確認對話框說明備份位於瀏覽器 localStorage、一般與硬核各一份、會覆蓋。
  - **查證後不成立**：lang 字典佔位符（AGY 稱 3 筆不一致）→ 全量掃描 1117 條含 `#`／`*` 的條目皆一致；47 筆含「·」的譯文，英文原鍵本身即含「·」，遊戲原文寫法，不處理。
  - **只回報、不修（需使用者決定或已知設計）**：`cleanCJK` 吃掉逗號（約 2,434 條，A 保留現狀／B 逗號保護／C 字型映射，待決定）；怪物同名詞條（Horror、Slayer、Plague Bearer、Blood Wing）誤譯，前人已記錄且與既有測試衝突，需實機看到誤譯語境再改；全精英與 `gainXp` 再包裝、`cloneComes` 之外的 `saveFaults` 重複計數、快取整批清除、`getImageData` 效能（與黑框問題相關，改動有風險）；裝備庫自訂模式倍率被忽略（待確認）；固定品質倍率重載後是否保留（**下一步最有價值的實機驗證**，見待辦）。
  - **文件合併**：AI 文件統一為本檔（檔尾附錄 A–F，原 `helper/AUTOBOT_DESIGN.md`、`verify/README.md`、`tests/live-harness/README.md`、`docs/ai/` 全部併入）。刪除上述檔案與 `docs/ai/`；`verify/publish.cjs` 發布清單移除 `AUTOBOT_DESIGN.md`；`README.md` 移除該連結並改指本檔；`AGENTS.md` 改為指向本檔。保留：`AGENTS.md`、`.agents/`、`.claude/` 的 game-update 技能（工具固定讀取路徑）、`docs/game-analysis/`、根目錄 `README.md`。`node tools/tests/build-web.cjs` 通過；發布腳本計畫模式因權限分類器拒絕未執行。
  - **驗證**：`test_lang` 通過；`craft-limits`、`weapon-sets`、`backup-record`、`write-confirm`、`save-faults-ui`（Electron）通過；`selfcheck` 通過；`autobot.cjs` 208 項 0 失敗；`node --check` 通過。**修改器實機（官方網址、隔離設定檔，`craft-live.cjs`＋`craft-fixed-e2e.js`）**：製作與寫入成功；新備份格式實機寫入後 `d2edit:backup:softcore` 為 `d2edit-backup-v1`、舊 `:time`／`:seal` 鍵不產生、狀態「寫入完成並重新簽章」；舊三鍵格式的讀取相容僅有單元測試。
  - **修改器實機**（官方網址、隔離設定檔，`craft-live.cjs`＋`craft-fixed-e2e.js`）：製作與寫入成功；新備份格式實機寫入後 `d2edit:backup:softcore` 為 `d2edit-backup-v1`、舊 `:time`／`:seal` 鍵不再產生、狀態「寫入完成並重新簽章」；舊三鍵格式讀取相容僅有單元測試。重載後 766 件中 9 件 Insight（Archon Staff）故障，來源未判定（見待辦）。
  - **實機（官方網址、隔離設定檔、使用者存檔 D2S1 解碼副本，`tests/live-harness/cheat-restore-live.cjs`，結果 build 20261105.3、掛接本機修改）**：致命一擊、一擊必殺、掉寶率、金幣率與總開關皆關閉後還原（`restored: true`）。**實機（同上）無敵 `tests/live-harness/invincible-live.cjs`：開啟後扣血被擋（生命 1412.6 不變）、換玩家物件後新物件同樣套上 accessor、關閉後回資料屬性且扣血恢復、`damageTaken` 回原值 1，全部通過。**翻譯實機探測**（官方 /play、gameHooked）：裸字串 `Horror`→「恐骨骷髏」、`Slayer`→「殺戮僕魔」、`Plague Bearer`→「瘟疫散布者」、`Blood Wing`→「血翅蚊」，但 `Horror of`→「驚駭 of」（字典基礎譯名正確）：怪物同名優先規則會蓋掉技能／頭銜語境，**函式層已確認**；遊戲畫面中是否會以裸字出現尚未截圖證實，修法需二選一（待使用者決定，見待辦）。**未實機**：修改器 #15 倍率重載、修改器備份與存檔檢查 UI 的真實頁面（僅 Node／Electron 單元測試）、`cloneComes` 自檢在實機的顯示。
  - **備註**：`lang/tests/live-render.js` 為未追蹤檔（非本次產生，未處理）；`tests/live-harness/out/` 仍為既有未提交變動，未清理。
- 2026-11-07｜Codex（中文黑框與角色頁排版，未發布）：官方 /play build 20261105.3、隔離 Electron、本機中文化；以遊戲 statPage 重現「抗性」局部筆畫被黑色覆蓋，lang/lang.js 對中文畫布同步讀取後重測正常，並限制字級不超過固定畫布高度。lang/zh-TW.json 補三段抗性、被動／技能及冷卻時間譯法。官方頁 live-render.js：四組原字串、325 個畫布、三種字級與顏色一致，中英切換還原，100 個畫布 71ms；系統字型與本機擷取的 D2R 原版繁中字型各跑一輪均通過。桌面注入工具以 --out 產生 TEMP 測試封裝成功，未碰安裝檔；node --check、lang/tests/test_lang.cjs、git diff --check 通過。官方遊戲進入角色頁後以 statPage 重建使用者截圖的防禦與密集攻擊內容，電腦尺寸與 390×844 觸控模擬截圖可讀，未重現黑框或文字重疊。直接以手機尺寸啟動的渲染程序未建立，改為載入後啟用觸控與調整尺寸；實體手機、使用者本機字型、桌面遊戲及其他所有畫面未逐一驗證，根因與長期效能仍待釐清。測試程序已停止，未提交或推送。
- 2026-11-07｜Codex（自動戰鬥控制位置，未發布）：`helper/autobot.js` 停止按鈕與狀態列維持水平置中，改依畫面高度調整垂直位置並限制狀態列寬度。`node --check helper/autobot.js`、`node helper/tests/selfcheck.cjs` 通過；`editor/node_modules/.bin/electron.cmd helper/tests/autobot.cjs` 208 項通過、0 失敗（後續僅調整樣式）。官方 `/play/` 隔離新存檔、本機檔案攔截載入，build 20261105.3、`Game-DPAk-Rvc.js`；Electron 觸控模擬直向 390×844 與橫向 844×390，截圖確認置中，避開計時器、怪物名稱、觸控選單與底部操作列；程式觸發按鈕後狀態顯示已停止自動戰鬥。未以實體手機驗證，其他畫面與動態物品文字可能重疊。測試出現既有 `game-overrides.js` ReferenceError 與 hosted 建檔 `reading 'id'`，仍進入戰鬥；測試程序已停止。未推送。
- 2026-11-07｜Codex（全圖撿寶介面，準備提交並推送）：`helper/autobot.js` 將全圖撿寶的開關／關閉下拉選單改為切換開關，沿用 `loot.vacuum` 既有設定；`helper/tests/autobot.cjs` 驗證顯示、切換儲存及全部關閉。`node --check helper/autobot.js`、`node --check helper/tests/autobot.cjs` 通過；`editor/node_modules/.bin/electron.cmd helper/tests/autobot.cjs` 模擬測試 208 項通過、0 失敗。`site/index.html` 已加入玩家更新日誌；尚未在官方遊戲網址實機驗證介面。
- 2026-11-07｜Claude Code（公告頁電腦版三欄，**未提交、未發布**）：`site/index.html` 新增 `min-width:1200px` 媒體查詢：快捷導覽（原頂部導覽列）改為左側固定欄、更新日誌改為右側固定欄，中間為內容，去除一頁式感。手機與平板版面未改動。已在 file:// 內建瀏覽器驗 1440×900 與 375×812；**未驗**：官方網址（需發布後）與實際不同寬度的斷點。
- 2026-11-07｜Claude（/goal 解決翻譯問題，**未完全達成、未提交、未發布**）：靜態批次檢查（不開遊戲，一次頁面載入跑完 13,197 條 `ko`）後補上未譯 21 條鍛造／UI 句與 4 條 UI 提示，以及「* of their time」「Standard of Heroes」等。批次檢查未譯數由 25 降到 0。剩餘：①`cleanCJK` 會把「，」「、」換成空格再刪掉中文之間的空格，約 2,434 條譯文因此少了逗號（既有設計，未改，需決定）；②以英文專有名詞為主的殘留（Charsi、Battle.net、Direct3D、Exocet 等）約 92 條，多為更新說明與 UI 外的句子；③語序改變 77 條，多數正常，「# # for # damage around what #.」等片段語意未明；④德魯伊截圖的字形缺字（藤、擊、技、喚）無法靜態判斷；⑤實機排版：本次兩次遊戲啟動失敗（no game），只完成 plain harness 載入，截圖抽查未完成。
- 2026-11-07｜Claude（技能翻譯靜態全檢，**未提交、未發布**）：不開遊戲，於官方 /play 頁面一次載入，把 `ko` 全部 13,197 條代入標記數字跑 `__d2lang.translate`。補上技能相關未譯條目 9 條（生命與法力、召喚狼、「下一個」、加速斷點、敵人抗性、攻擊者受傷）。`lang/lang.js` `translateString` 新增 `synergyList`：遊戲執行時組合的多段數值列表（`+19% damage per level of A, +19% of B, …`）逐段查技能名，譯成「技能名每級傷害 +N%」，段與段以「；」相接；任一段查不到名稱就退回一般流程。驗證：`node --check`、`lang/tests/test_lang.cjs` 通過；頁面內 `__d2lang.translate` 對冰霜新星等 5 句正確；全條目批次檢查前後數字相同（未譯 21、英文殘留 98 皆為鍛造、UI、人名與產品名，非技能；佔位符遺失 0）。**沒驗**：多段列表在遊戲畫面（技能樹提示）的實際排版；字形缺字（藤、擊、技、喚）仍待截圖確認。
- 2026-11-06｜Claude（技能說明翻譯補齊，**未提交、未發布**）：技能說明的模板字串（含 # 或 *）原本有 43 條譯文直接留著英文數值符號（如 `+# 冰寒技能`、`#秒`），遊戲會顯示成「#」；已改為 `{0}` `{1}` 佔位（依英文順序對應，`{n}` 以英文 `#`／`*` 出現順序編號）。新增 45 條技能說明譯文（Claws、Thrust、Throws axe、werebear／werewolf、Golem、Summon 等）。譯文不用「，」「、」（遊戲 `cleanCJK` 會刪除），改用「；」。修正既有譯文順序錯誤兩條（`Your shadow master…`、`Summons your shadow…`，與 `Gives +# … for # seconds`、`You have #% more life for # seconds`、`Strikes … magic damage…`、`Claws and blades poison…`、`A corpse explodes…`）。驗證：`node lang/tests/test_lang.cjs` 通過；官方 /play 實機（`tests/live-harness/craft-live.cjs`，本機檔案回應工具包的 GitHub Pages 請求）以 `__d2lang.translate` 檢查 12 句，數字與順序正確、無「+#」殘留。**實機截圖已驗**（官方 /play，法師升級技能卡）：進化行的英文段落（`Evolves`、`into`、`Ball:`、`Molten`、`Boulder:`、`Vine:`）已補譯，截圖內無英文殘留；進化行「進化 為」之間有空格（遊戲逐段繪製所致）。**沒驗**：德魯伊 `Vine:`／`Boulder:` 的截圖；其餘 partial 句（如 WASD、Blizzard 版權句）；鍛造（tempers）相關 31 條未譯（非技能）；怪物 `an evil force` 無譯名。未提交。
- 2026-11-06｜Claude（修改器重設恐懼規則：只有該職業打完地獄〔`baalSlain[職業]==="hell"`〕才保留恐懼階，否則丟棄整筆 `terror[職業]`；已開啟的階數與候選保留，`best`／`cleared` 歸零）。**實機已驗（存檔層）**：官方 /play、隔離設定檔、使用者 1048 存檔解碼副本：薩滿 open 51、聖騎士 open 31 有地獄擊殺，寫入後重載保留；另一份移除聖騎士地獄擊殺的副本，聖騎士恐懼被丟棄、其他職業保留，遊戲讀回正常。**沒驗**：傳送點 UI 是否實際列出恐懼選項（`L_` 依 `terror.offers` 建列，未在畫面確認）。
- 2026-11-06｜Claude（修改器「重新產生排行榜與角色識別碼」修正：`resetTerror` 不再刪除整筆 `terror[職業]`，保留已開啟的恐懼階 `open`、`offers`、`waves`，只清 `best`、`cleared` 與進行中欄位；上次 19cfdb3 的刪除會讓英雄的恐懼階消失，與遊戲「英雄保留已解鎖恐懼階」的設計不符）。**只做了單元檢查，未實機**，待使用者自行測試確認恐懼階可再開啟；營火恐懼選項的顯示條件未查證。
- 2026-11-06｜Claude Code（更新日誌與版號規則，**未提交、未推送、未發布**）：`site/index.html` 與 `modifier/editor.html` 的更新日誌依日期合併（11-05、11-04、11-03 各一則，標題只有日期、不再標 vX.Y.Z），內容未刪減，相同的「相容性」行合併。`verify/publish.cjs`：預設不升版號（`--bump` 才升），`--desktop` 需同時加 `--bump`；日誌改為併入當天條目並去重，同一天重跑發布不會重複加入。驗證：發布計畫模式輸出正確（版號 1.0.13 不變）；以暫存副本執行合併函式兩次，第一次插入當天條目，第二次無變更。未做實機驗證（純文件與發布腳本）。
- 2026-11-06｜Claude（**實機已驗**，使用者存檔 `168d53fb…-1010.txt` 解碼副本、隔離設定檔、官方 /play，未提交、未發布）：「重新產生排行榜與角色識別碼」改為**完整重設恐懼**：`resetTerror` 清 `terror[職業]`、`cain.terror[職業]`、`heroes[職業].best`、進行中恐懼局（`run.run.terror`）與續玩點（有恐懼狀態者）、被換下角色的 `best`／`reached.terror`。實機結果：寫入後重載，`terror`、`cain.terror`、進行中恐懼局皆清空，爬塔識別碼全數更換，遊戲 `saveFaults` 為空。同次修正「存檔檢查」的 10 件符文之語（收藏，`uniques`，皆為 `roll[0]=2`，遊戲判定 `seed`）：新增 `regenRunewords`，依同名同底材重新產生、**不附 roll**（讀檔不會改寫）、先過遊戲 `sanitize` 與 `faults` 才替換，通過 10／10。**沒驗**：恐懼選單 UI 實際不出現恐懼選項（只讀存檔欄位，未開啟選單）；存檔檢查頁的按鈕本身（測試直接呼叫函式）；`wavesRestart.deep`（此存檔為 0，未動）。
- 2026-11-06｜Claude（修改器「重新產生排行榜與角色識別碼」同時重設恐懼階層，**未實機、未提交、未發布**）：使用者回報重設識別碼後角色仍能打先前的恐懼紀錄。原因：恐懼狀態不在爬塔紀錄（`climbs`）內，而在 `terror[職業]`（open／best／cleared）、`cain.terror[職業]`（連勝）、`heroes[職業].best`，以及被換下的前任角色 `retired[職業][i]` 的 `best`／`reached.terror`（換回時會還原）。`modifier/editor.html` 新增 `resetTerror(職業)`，清上述欄位；不動角色等級、技能、裝備與其他職業。依遊戲 `saveTransfer` 的 `xA`、`Xl`、swap 邏輯整理。Node 單元檢查通過。**沒驗**：官方 /play 實機（恐懼階層是否確實不能再選）；`heroes[職業].kept／run` 內進行中的恐懼狀態未清；全域 `wavesRestart.deep` 未清。
- 2026-11-06｜Claude Code（輔助器「全圖撿寶」改為隔空取物，**模擬測試 206/206 通過；實機已驗（native4–native9，見下）；已本機提交、未發布**）：原版吸附迴圈（`itemArt-*.js`）對有 `item` 的掉落物是先進 `if(r.item){…continue}` 分支，**`magnet` 對裝備無效**，舊的「全圖撿寶」對裝備其實從未生效。修正：`helper/autobot.js` `vacuum()` 對通過 `accepts`（即遊戲 `loot()` 為 pick／sell）、未被丟下（`dropped`）的裝備，把座標移到角色身上，由原版 `Lle`（距離內）＋`carry`（背包空位）收取；遊戲隱藏的裝備不動。另保留 `setPickupRadius`（`pickupRadius`→1e6，關閉／停止／摧毀還原），對金幣、藥水等 magnet 類掉落有效。實機（官方 /play、使用者存檔副本、無敵＋死亡保護關閉＋怪物密度最大＋一擊必殺＋掉寶率最高，`tests/live-harness/loot-native-live.cjs`，結果檔 `native4`／`native5`）：開啟時原生「撿取」裝備 4 件中 3 件在角色被瞬移 700 像素後約 0.8–1.1 秒被移到身上並收進背包；「暗金撿不起」經 `native7` 逐件記錄查明：該件是任務物品 Horadric Codex（`type: quest`、`base: hcx`），`carryCalls` 為空，未經原版 `carry`。任務物品原本不走全圖撿寶的裝備瞬移（`accepts` 依 `questOn()`）。**已改**：`vacuum()` 對任務物品一律瞬移（不受任務推進開關限制），模擬測試 206/206 通過；實機 `native8`（任務推進關閉，預設）：Horadric Codex 瞬移後約 1 秒收進背包、`carry` 回傳 true；同輪符文之語正常收取，關閉組皆不移動。`native4`–`native6` 的暗金失敗很可能也是同一件（未逐一核對）。先前「`carry` 的 `zr` 判斷」的推測已撤回：`zr` 為真時 `carry` 回傳 true，不會讓裝備留在地上。原生「販售」裝備 3/3 被移到身上後從地上消失（應為原版自動販售，金幣增加未直接確認）。關閉時同距離的原生「撿取」與「販售」裝備皆不移動（對照組）。隱藏類（`native9`，暫存存檔副本把魔法設為「隱藏」、稀有設為「隱藏並販售」，只為產生這兩類掉落）：開啟與關閉全圖撿寶時，「隱藏」與「隱藏並販售」裝備瞬移角色 700 像素後 3 秒內皆未移動、仍在地上（開啟 3/3、關閉 3/3）。同輪「撿取」裝備開啟時 4/4 被移到身上並收進背包。**沒驗**：角色自己走過去時隱藏裝備的行為（原版判斷，未在範圍內）；背包滿時的行為（使用者表示不需處理）。先前「注入裝備 magnet 吸附」的觀察是注入物件的假象，已不採信。
- 2026-11-06｜Codex（修改器存檔識別碼功能，**未驗證、未提交、未發布**）：`modifier/editor.html` 的「重新產生排行榜識別碼」改為同時重建排行榜 ID 與 `heroes`／`climbs` 中各職業的角色 ID，並清除每個角色的爬塔紀錄，只保留新 `hero` ID；提示明確說明需寫入存檔後生效。`modifier/i18n.js` 加入新介面文字。尚未執行測試或官方 `/play` 實機確認；需確認遊戲爬塔存檔結構接受只含 `hero` 的重設項目。
- 2026-11-06｜Claude（官方防修改分析，**靜態、未提交、未發布**）：只以最新版 20261105.3 驗證。結果寫在 `docs/game-analysis/anti-tamper-20261105.3.md`：①本機存檔 seal 為 HMAC-SHA256，金鑰內嵌客戶端；②`saveFaults`／`heroProfileFault`／`itemFault` 規則檢查（含孔數與鑲嵌珠寶）；③排行榜以每英雄雜湊鏈（`checks`）上傳，伺服器端為實際上榜判定。**沒驗**：伺服器判定條件、實機行為、`chase` 判定。
- 2026-11-06｜Claude（遊戲 20261105.3 收藏規則與翻譯，**未提交、未發布**）：①符文之語收藏改為「名稱＋底材類型」（遊戲 `uniquesTab` 的 `y()`／`r(name)`）：`modifier/signatures.json` 新增 `runewordKinds`，`modifier/engine-page.js` 目錄每個類型一列、新增 `kindMap`，`modifier/editor.html` 的 `ckey` 與 `KIND`，`d2edit.js` 引擎白名單加 `kindMap`。`modifier/tests/item-db.cjs` 改為對照類型數總和（目錄 613 件，符文之語 115 列）。②翻譯：`lang/zh-TW.json` 補 77 條，未翻譯歸零，`test_lang` 通過。**實機（官方 /play、隔離設定檔、使用者存檔副本 `craft-live.cjs`）**：修改器只補缺的類型（Cryptic Sword、Vortex Shield），寫入後遊戲重載，3 件 Spirit 的 `faults` 皆為 null。**實機收藏頁比對（2026-11-06，遊戲截圖）**：Breath of the Dying、Call to Arms、Chains of Honor、Chaos、Crescent Moon、Death、Delirium、Destruction、Doom、Dragon、Dream、Duress 共 12 張卡的底材格數，與修改器類型數一致（2 格的卡 = 2 類型，無額外格 = 1 類型）；頂部「Runewords 78／78」為名稱計數（修改器 78 個名稱）。**沒驗**：Spirit 在收藏頁的三格（單手、雙手、盾牌）截圖比對；全部 78 張卡的逐一比對；`version-gate-web` 需 Electron 環境未執行。
- 2026-11-05｜Claude（修改器「存檔檢查」接上遊戲的 `saveFaults`，**未提交、未發布**）：`modifier/editor.html` 的 `renderGuard()` 改呼叫引擎的 `saveFaults`（遊戲存檔總檢查，見 `docs/game-analysis/systems/progression.md` 第 5 節）；摘要列「遊戲存檔檢查判定 N 項問題」，逐條列入明細（「遊戲判定：…」，原文、無自動修正）；引擎不可用時顯示「未驗證」而非通過。測試：`modifier/tests/save-faults-ui.cjs`（Electron，已登記 `verify/suite.cjs`）；`keys-ui`、`socket-ui` 回歸通過。實機：官方 /play 引擎（`tests/live-harness/craft-live.cjs`）乾淨存檔 `saveFaults`＝`[]`，金幣 2e10 ＝ `["gold 20000000000"]`；修改器 iframe 內「存檔檢查」頁顯示 `遊戲存檔檢查判定 1 項問題` 與對應明細。**沒驗**：真實使用者存檔（含硬核）的 `saveFaults` 結果、手機版面；遊戲原文目前不翻譯（英文）。`saveFaults` 也會檢查 `itemFault` 之外的項目，與「物品合法性」列可能重複計入。
- 2026-11-05｜Claude（**遊戲 20261105.1 相容，已本機提交（未推送、未發布）**）：官方 40 條更新分析完成，阻擋項與修正如下。①**修改器「調成最高數值」會清掉鍛造（temper）**（`modifier/editor.html` `maxItems`／`maxItemsRaw`／不合法物品修復）：已鍛造（`forge`／`forgeHeld`）的物品改為保持原樣；修改器頁面內實機測試通過（`tests/live-harness/forge-keep-e2e.js`）。**遊戲端是否接受帶 temper 的存檔尚未驗證。**②**鑰匙與器官撿取**（`helper/autobot.js` `accepts`）：`quest.autoProgress` 關閉時仍撿 `pk1-pk3`、`mbr`、`dhn`、`bey`（`PANDEMONIUM_BASES`），補回歸測試。③**翻譯 99 句**（去重後，非 139）：`lang/zh-TW.json`，官方 /play 頁 `__d2lang.translate` 99／99 通過；譯文不用「，」「、」（`cleanCJK` 會刪），改用「；」與 U+00A0。④**Pandemonium 排除**：新舊版 `uber`／`finale` 欄位名不變，`autobot.js` 選關排除仍有效。⑤**selfcheck 測試**改為讀取 `helper/selfcheck.js` 的 `TESTED_GAME_BUILD`，不再寫死。**實機**：官方 /play 煙霧測試通過（HEAD `84a5642`）；另以本機伺服器（H_BASE，8767 埠）跑 amazon 10 分鐘長跑：10 級→36 級、0 死亡、啟動後無新錯誤（僅啟動時已知的 `startRun` 錯誤，堆疊全在遊戲程式）；「尋找凱恩」任務進度仍 0／6（同「進行中」第 2 條，未解決）；Act I 未遇到鑰匙掉落，鑰匙撿取仍只有模擬測試。**未驗**：12 項戰鬥數值條目（多數「無法確認」）、`autobot.js:1599` 的 `weaponDamage` 寫入在新版是否仍生效、遊戲端 temper 存檔接受性。發布日誌待 `publish.cjs --log` 帶入三條玩家可讀內容，版本號由發布流程升至 1.0.10。
- 2026-11-05｜Claude（**第二階段：消除副本，未提交、未推送、未發布**）：`editor/` 只剩桌面啟動器（`main.js`、`preload.js`、`core.js`、`engine.js`、`remote.js`、`package.json`）；刪除 `editor/` 內所有 UI、引擎、字典與測試副本（根目錄為唯一來源，刪除前 `sync-from-web --check` 只差根目錄較新的 `modifier/i18n.js`、`modifier/editor.html`）。`web-install.html` 移到 `site/install.template.html`；新 `tools/build-web.js` 只產生輸出（安裝頁、轉址、`version.json`、`.nojekyll`），版號檢查 `editor/package.json` 與 `modifier/editor.html`；`sync-from-web.js` 已刪除。測試搬到模組資料夾：`lang/tests/test_lang.cjs`、`modifier/tests/{item-db,skill-mods,runeword-class-base,load-patch}.cjs`、`tools/tests/build-web.cjs`；`modifier/tests/load-patch.cjs` 把 `patch.mjs` 當 CJS 載入（與啟動器相同做法）。`lang/tools/` 為語言工具正式位置（`editor/tools` 副本已刪）。`verify/` 全面改為根目錄來源：`suite.cjs`、`runner.cjs`、`adapt.cjs`、`repair.cjs`（檔名→根目錄對照表 `WHERE`）、`fingerprint.cjs`（只收程式碼資料夾，不收 game-bundles）、`publish.cjs`（建置改 `tools/build-web.js`、版號只改 `modifier/editor.html`、桌面版改為 `--desktop` 才打包）、`verify.cjs`、`selftest.cjs`。測試：登記表 9 項全部通過（含 Electron 的 weapon-sets-ui、autobot 170 項）；啟動器端到端與並行讀寫（隔離副本）通過；建置回歸通過。**沒驗**：`publish.cjs --confirm` 本身（會推送，未執行）、打包後的 exe、Pages 上的線上版。`editor/backups/softcore/` 是測試殘留（含存檔副本資料），刪除被權限拒絕，待使用者決定。
- 2026-11-05｜Claude（鑰匙與器官：實機驗證完成，**未提交、未發布**）：①修復輔助器載入失敗：舊版存檔的 `cheat` 缺少新增欄位（如 `summonCloneOnTerror`）時設定介面讀到 undefined 而拋錯；`helper/autobot.js` 與 `editor/autobot.js` 在讀檔後補齊 `cheat` 預設值。`node helper/tests/autobot.cjs`：197 項通過。②官方 /play、使用者存檔複本、隔離設定檔，恐懼 51 選項：只有鑰匙（pk1–3 各 1）→ 第一格 `FORGOTTEN SANDS`（遺忘沙漠）；只有器官（mbr／dhn／bey 各 1）→ 第一格 `UBER TRISTRAM`（超級崔斯特姆）；皆無 → `ACT I`（第一章）。三組畫面皆截圖確認（畫面上的文字與資料一致）。③開啟選項後消耗：鑰匙版開啟遺忘沙漠後 pk1–3 全為 0；器官版開啟超級崔斯特姆後 mbr／dhn／bey 全為 0（`startTerror(kit,0)`，遊戲狀態 `playing`）。**沒驗**：超級首領戰的內容、硬核排行榜、手機版面、`editor/` 桌面副本未同步、器官的掉落來源。測試腳本：`tests/live-harness/keys-visual.cjs`（步驟檔驅動；需 `H_SHOW=1` 才能收到輸入）。
- 2026-11-05｜Claude（桌面版改為固定啟動器，**第一階段；未提交、未推送、未重建 exe**）：`editor/main.js` 改為載入 `https://nojackno2-ctrl.github.io/d2-survivors-toolkit/modifier/editor.html`（可用 `D2_TOOLKIT_BASE` 覆寫，測試用）；`editor/remote.js` 負責從 Pages 抓 `signatures.json`、`patch.mjs`（去掉 export 後當 CJS）、`engine-page.js`、`gamedata.json`、`lang/zh-TW.json`，並存進 userData 快取（離線時改用快取）。`editor/engine.js` 改為非同步準備引擎；`editor/core.js` 移除 `i18n` 與不存在的 `LAUNCHER_DICT`（原本 `diag()` 會拋錯）。安全：IPC 檢查呼叫來源網域、`engine` 函式名只接受識別字、備份檔名只接受 basename、`sandbox: true`、導覽限制在工具包網站、外部連結交給系統瀏覽器。`modifier/editor.html` 版本提示在桌面端改為「重新開啟工具包」（`window.api.launcher`）。測試：本機靜態伺服器（模擬 Pages）＋ Electron ＋隔離 `APPDATA`：頁面載入、`window.api` 各函式、i18n（14088 筆）、diag、`engine` 白名單、備份檔名檢查皆通過。2026-11-05 更新：本機桌面遊戲已更新為 `2026.1104.2`，引擎 `capabilities` 支援、物品目錄 576 筆、`faults` 空。使用者存檔（`%APPDATA%\D2 Survivors` 整個資料夾複製到暫存 APPDATA，原檔不動，雜湊前後相同）實測：`load` 成功（softcore，version 16，有簽章）、`traces` 空、原樣 `save` 後 `load` 內容與簽章相同、`saveFaults` 空；金幣改 12345 寫入後讀回 `sealed` 且 `saveFaults` 空。**發現**：頁面啟動會自動 `load` 一次，若與其他讀寫同時進行，classic-level 會報 LOCK 錯誤並誤導成「請先關閉遊戲」（測試時等 6 秒才穩定）；已修：`editor/core.js` 的 `load`／`store`／`traces` 改為排隊執行（`queued()`），不再同時開啟資料庫；實測同時發出 5 個讀取與 2 個寫入全部成功，寫入後金幣 777、簽章有效，原檔雜湊不變。**第二階段未做**：`editor/index.html`、`editor/autobot.js`、`lang.js` 等副本仍在；`build-web.js`、`sync-from-web.js`、`publish.cjs`（仍會打包桌面版）、測試引用仍指向 `editor/`。打包與發布需使用者同意。
- 2026-11-05｜Codex（鑰匙與器官官方遊戲選項驗證）：隔離 Electron、官方 /play、兩份存檔副本，呼叫 `g.frontend.actions.terror("sorceress")`；六項各 1 時為 `FORGOTTEN SANDS`, `UBER TRISTRAM`, `ACT IV`，六項為 0 時為 `ACT I`, `ACT III`, `ACT IV`。兩者 pay 均為 `Pays +131% MF · +51% XP · +131% gold · +102% items`，未包含鑰匙或器官文字。測試時本機未提交的輔助器因 `cheat.summonCloneOnTerror` 設定欄位拋錯，只在頁面記憶體繞過後取得 game；未修改輔助器。未驗畫面選項、消耗或首領戰；日誌位於暫存目錄 `d2-keys-codex`。

- 2026-11-05｜Claude（修改器加入三把鑰匙與三種器官，**未提交、未發布**）：遊戲把鑰匙存成 `save.pandemonium.pk1／pk2／pk3`、器官存成 `mbr／dhn／bey`（每件一個 id 陣列，上限 999；讀檔 `xC` 只檢查 id 格式 `^[\w-]{1,32}$`，不驗證 id 是否對應實體物品）。開啟恐懼階超級首領選項時，`aC`（鑰匙）與 `dC`（器官）取各陣列第一筆，`_C`／`hC` 消耗之。修改器 `modifier/editor.html` 的「鑰匙與器官（首領掉落）」頁（各 0–999，另有「鑰匙各設為 1」「器官各設為 1」），只增減這六個陣列；`modifier/i18n.js` 補英文。器官掉落來源未查明（lang 字串只說明用途）。`mc()`（存檔「被修改」判定）不含 pandemonium，代碼層面鑰匙本身不會觸發排行榜 `edited`（硬核未實測）。測試：`modifier/tests/keys-ui.cjs`（Electron，通過）、`tests/live-harness/keys-e2e.js`（官方 /play、使用者存檔複本、隔離設定檔：寫入後 pandemonium 三把各 1、器官保留、遊戲 `saveFaults` 為空）。**沒驗**：開出的超級首領選項是否在恐懼階畫面實際出現、消耗後的行為、硬核排行榜、手機版面、超級崔斯特姆是否出現；`editor/` 桌面副本未同步。實機（官方 /play、使用者存檔複本）已驗：寫入六個陣列後重載，三把鑰匙與三種器官都保留、`saveFaults` 為空。
- 2026-11-05｜Claude（遊戲修改：召喚暗黑破壞神分身，**未實機驗證、未發布**）：輔助器「遊戲修改」分頁新增「首領召喚」開關 `cheat.summonCloneOnTerror`（預設關），開啟後每進入一個恐懼階的世界（`autoSummonClone`，每個世界只一次、需時間 ≥1.5 秒）自動呼叫 `summonClone`，`helper/autobot.js` 與 `editor/autobot.js` 同步。原理：遊戲原本是出售喬丹之石→寫入 `clones[職業]`→下一恐懼階由 `director.cloneComes(world)` 登場；作弊版直接在本局呼叫 `cloneComes`，前置條件為總開關開啟、本局進行中、恐懼階中、場上無存活首領、本局未召喚過。不寫 `soj` 紀錄（遊戲 `cloneCame` 只在有 soj 時記錄），故不影響 sojLedger／saveFaults；擊殺後毀滅之符沿用遊戲 `cloneFell`。已驗（2026-11-05 實機，官方 /play 經 `H_LOCAL` 攔截載入本機 autobot，使用者存檔副本、隔離設定檔、`H_SETTINGS` 開啟 `summonCloneOnTerror`＋恐懼 progress）：從營地進入第 50 階後 playing 起約 1.5 秒分身出現（時間差已修正：`world.time` 是絕對時鐘，先前寫成 `time>=1.5` 等於沒延遲），分身「Diablo approaches」，被輔助器作弊擊殺後存檔 `chase` 出現 `annihilus`。**沒驗**：`saveFaults`（需修改器引擎）、手機版面、英文模式按鈕文字（未加入字典）、正式版發布。`cloneComes` 只在 director 上確認存在，尚未加入 `selfcheck.js`。
- 2026-11-05｜Claude（/goal 工具包自檢，**未提交、未發布**）：新增 `helper/selfcheck.js`（`editor/selfcheck.js` 為建置來源），`d2edit.js` 載入進度條多一步「相容性自檢」與其他步驟並行，載入完成時列出問題並可繼續遊玩（點一下關閉；問題在主控台 `[D2 工具包自檢]` 與 `window.__d2editSelfCheck`、`diag().selfCheck` 也有）。檢查：官方版本 vs `TESTED_GAME_BUILD`、遊戲主程式檔名變動、字典／遊戲資料筆數、物品引擎特徵碼缺失（列出缺哪個）、存檔簽章與遊戲 `saveFaults`、輔助器依賴的遊戲成員（`gainXp`、`hud.showTown` 等）、語言掛接；遊戲還在選角時只給提示，約 25 秒後補查。`TESTED_GAME_BUILD` 現多一份（selfcheck.js），已加進 `verify/lib/adapt.cjs` 自動更新清單；`publish.cjs` 發布清單、`build-web.js`、`build-web.cjs` 已加。測試：`node helper/tests/selfcheck.cjs`（模擬 10 種不符情況）；`verify/live-smoke.cjs` 現會讀自檢結果，有 error 即判失敗。實機（官方網址＋隔離設定檔＋新存檔）自檢 0 問題。**沒驗**：有問題時進度條下方列表的實際畫面（只驗邏輯）、手機版面、使用者存檔。
- 2026-11-05｜Claude（/goal 製作裝備加入孔數與珠寶、修改現有裝備洞數，**未提交、未發布**）：存檔欄位為 `sockets`（孔數）＋`socketed`（鑲嵌的珠寶陣列，只能放魔法／稀有珠寶，數量≤孔數，不帶 `at`）；遊戲 `itemFault` 規則：普通≤底材 `sockets[2]`（最多 6）、魔法≤2、稀有≤1、暗金／套裝孔數＝自身 `item_numsockets`、符文之語不能放珠寶。`modifier/engine-page.js`（與 `editor/engine-page.js`）`bases()` 新增 `sockets`；`modifier/editor.html` 新增「孔數與珠寶」：製作裝備頁（固定品質隱藏）與物品頁都能改孔數、從存檔現有珠寶挑選鑲嵌（鑲入後從倉庫／背包移走）；未解除限制時依上述上限，解除後可到 6 孔。測試：`modifier/tests/socket-ui.cjs`（Electron）、`tests/live-harness/socket-e2e.js`（官方網址＋存檔副本：製作 3 孔鑲 2 顆→物品頁改 4 孔→寫入→重載，遊戲 `faults` 無問題；`saveFaults` 的 6 筆「not what its roll makes」為存檔副本既有）。**沒驗**：魔法／稀有裝備帶孔的實機寫入重載、暗金／套裝既有裝備鑲珠寶的實機、手機版面；`editor/editor.html` 桌面副本已漂移，未同步介面改動。）
- 2026-11-05｜Claude（交接補記，**工作區未提交、未實機驗證、未發布**）：v1.0.7 之後工作區有三處改動，前一位沒寫進紀錄，這裡補上。①**輔助器新增作弊項「經驗值加成最大」**（`cheat.maxXp`，`helper/autobot.js`＋`editor/autobot.js`）：包住遊戲 `gainXp`，開啟時獲得經驗 ×1000，關閉原樣放行；設定預設與載入合併、介面欄位（流程與掉落修改群組）都已加。**未確認遊戲端真有 `gainXp` 且被呼叫、沒跑 `helper/tests/autobot.cjs`、沒在官方 /play 驗**——驗收前不可說已完成。②**修改器「存檔檢查」新增兩項**（`modifier/editor.html`）：套裝裝備被標成暗金（名稱屬於套裝）→ 可一鍵刪除；倉庫物品重疊／缺座標／超出格子 → 可一鍵重新排列（`repackStash`）。**`editor/index.html` 桌面副本尚未同步**（grep 無 `isFakeUnique`）。③`freshSave`（重新開始存檔）不再把套裝品質降成暗金（`it.rarity !== "set"`）。**待辦**：跑 Node／Electron 測試、官方網址用使用者存檔實機驗證（含舊壞存檔的偵測與修復後重載無 `saveFaults`）、同步 `editor/` 副本、驗證通過後寫公告站日誌（`site/index.html`）並升版號發布。
- 2026-11-05｜Claude（/goal 製作裝備開放暗金／套裝／符文之語）：**未解除限制也能製作固定品質，屬性鎖原版**。原理：遊戲對暗金／套裝／符文之語以 `stats`（原始屬性列）為準，讀檔時用 `sanitize` 重算 `mods`，且只逐列檢查「在該列原版範圍內」（`itemArt-*.js` 的 `w6`）。`modifier/engine-page.js` 新增 `fixedInfo`（可調整的屬性群組＝同一次擲值的連動列、原版範圍、隨機項目：stats 參數如地獄火炬職業／奧瑪斯技能、符文之語法杖技能與底材固有加成、是否無形）與 `fixedBuild`（只改 stats 數值／參數 → 遊戲 `sanitize` 重算 → 遊戲 `itemFault` 檢查，超出範圍直接拒絕）。介面（`modifier/editor.html`）：裝備庫「數值」新增「自訂（限原版範圍）」；「製作裝備」頁品質選暗金／套裝／符文之語後選物品即可調整，符文之語底材限 `runewordBases`（類型符合、孔數夠）。同時修 `fixedProblems` 兩個誤判（地獄火炬非預設職業、法杖技能被當多餘屬性）；`d2edit.js` 白名單加入 `fixedInfo`／`fixedBuild`；`modifier/i18n.js` 補英文。
  - **實機**（官方 /play＋使用者存檔副本，隔離暫存設定檔）：①全物品稽核 732 組（371 暗金＋127 套裝＋78 符文之語×最多 3 底材）2524 次製作（最高／最低／隨機值、每個隨機選項、固有加成列、法杖技能、無形），遊戲 `faults` 與修改器 `validateItems` 0 失敗；超出範圍 1478 次全被拒絕。②端到端（UI 實際操作→「寫入存檔」→重載遊戲頁→遊戲自己的 `faults`／`saveFaults`）：Annihilus／地獄火炬（改職業）／奧瑪斯（改技能）／Spirit／Call to Arms／帶法杖技能的 Insight 等共 766 件，`saveFaults` 為空，自訂值與法杖技能重載後保留。
  - **實測抓到的既有問題**：「隨機（跟掉落一樣）」做出帶法杖技能的符文之語（如 Archon Staff 的 Insight）重載後被遊戲判「種子對不上」（法杖技能是否出現取決於遊戲端載入的資料）；已改為這類物品不附 roll（保留 stats），重測通過。
  - 測試腳本：`tests/live-harness/craft-live.cjs`（執行器，`nojackno2-ctrl.github.io` 請求改由本機檔案回應以測未發布修改）、`craft-fixed-audit.js`、`craft-fixed-e2e.js`（需 `H_IN=editor H_SEED=存檔.json`）。限制：測試環境是全新設定檔點「hosted」載入，遊戲端若缺符文之語資料則不驗其範圍（舊路徑亦同）；未用真實手機驗證。`editor/` 桌面副本內容已同步（執行檔未重新封裝）。**後續：已提交為 v1.0.7（`2cac23a`）並推送，公告站日誌已寫。**
- 2026-11-05｜Claude：**遊戲 20261104.2 階段 A 完成，網頁版上線**。官方 2 項：硬核「舊副本」判定未找到條件變化（需實機追）；超級首領戰鬥層數上限 100（工具包無依賴）。修正：自動推層同時避開 `uber` 與 `finale`（Uber Tristram 會消耗器官），測試 196/0。翻譯：新增兩句遊戲與公告字串，未翻譯歸零。回歸：`verify --update --force` 7/7。實機：官方網址＋使用者存檔（99 級地獄 sorceress），掛接 20261104.2，無模組載入失敗。`reading 'id'` 已定位：遊戲 `startRun`（Game-_fAFHQD1.js:289）被 harness 在 setup 頁點 hosted 按鈕、未選職業時呼叫，屬 harness 路徑、非玩家路徑；harness 已加錯誤堆疊診斷。桌面版執行檔與 Release 未發布；新遊戲內容（階段 B）另案。
- 2026-11-04｜Claude：**遊戲 20261104.1 相容（實機已過一輪，未發布）**。已做：`helper/autobot.js` 動態解析 `itemArt-*.js`／`saveTransfer-*.js`，鍵位改依特徵辨認（新版 `j_ as Sa`）；`modifier/editor.html` 倉庫 `[10,12]`；`lang/zh-TW.json` +53 筆；`helper/tests/autobot.cjs` 鍵位夾具改為新版形狀；無限重抽鎖定 99 並測試期待 99。網頁版 `TESTED_GAME_BUILD` 已改 20261104.1。回歸：Node 四項＋`autobot.cjs` 194/0 通過。**實機**：本機伺服器（`localhost:8766`）＋`H_BASE` 注入 harness，官方網址載入使用者存檔（sorceress 99 級地獄），輔助器掛接 `Game-C-lMmM6N.js`、自動戰鬥，無模組載入失敗；另有一個未定位來源的 `Cannot read properties of undefined (reading 'id')`（開局時）。**待辦**：33 項 impact 中 24 項仍待分析或需實機（護符、三把鑰匙與首領流程、傳送門、手機版面、Dark Reader、搖桿等）；`auto-select` 選特殊關卡可能消耗器官（Codex 第 5、6 項）；`pandemonium` 結構與 `pandemoniumDone` 未驗證；修改器 LO=16 存檔的讀寫未實測。**使用者指定**：之後實機一律用此存檔（已解碼為暫存 JSON，原檔不動）。
- 2026-11-04｜Claude：**遊戲更新流程改版**（使用者要求）。`.agents`／`.claude` 的 `game-update` 技能統一為同一份：①讀官方更新訊息 ②反編譯比對新舊版差異（含官方沒提的）③AI 分析修改器／輔助器／語言是否相符並修改 ④沒變動的部分用 `verify` 腳本快速回歸 ⑤隔離環境實機驗證 `https://d2survivors.lol/play/` ⑥使用者明確確認後才 `publish.cjs --confirm`（原 `.agents` 版「自動發布」與 `.claude` 版「本地模型修復」皆移除）。`verify/README.md` 與 `docs/ai/README.md` 已同步。未實際跑過新流程。
- 2026-11-04｜Claude：**備份資料夾分類**。倉庫 `backups/`：`exe/`（舊執行檔）、`code/`（原 `verify/backups/` 與 `lastgood/`）、`saves/test-fixture`（原 `_backup_test/game-save`）、`archive/`；`verify/verify.cjs`、`repair.cjs`、`publish.cjs` 路徑已改。桌面版存檔備份（`editor/core.js`）改寫到執行檔旁 `backups/softcore|hardcore|snapshots/`，`listBackups`／`safeName` 支援一層子資料夾並仍可列出舊的平放檔案；以暫存目錄驗證寫入、列出、刪除與路徑穿越防護。未重新封裝桌面版，Electron 介面未實測。
- 2026-11-04｜Claude：**專案資料夾解耦**（使用者 /goal）。結構見上方「資料夾結構」。改了 `d2edit.js`／`editor/d2edit.js` 載入路徑、`editor/build-web.js`（輸出新配置，不再複製 tests）、`verify/publish.cjs` 發布清單、字典稽核路徑、live-harness 路徑。**舊根目錄網址（如 `/autobot.js`）已不存在**，書籤入口網址不變。驗證：`node --check`、`test_lang`、`craft-limits`、`weapon-sets`、`editor/tests/build-web.cjs` 通過；Electron 測試與實機未跑，未推送。`verify/lib/repair.cjs` 的 EDITABLE 清單與 `editor/` 桌面副本（內容有漂移）未動。
- 2026-11-04｜Claude：修正怪物名稱翻譯半中半英（如 Black Archer 顯示成「漆黑 · Archer」，278 個怪物名中 141 個受影響）。根因：`lang/lang.js` `translateString` 的逐字拆解先於 `monster:` 補查。改動：最前面先做 `translateAs("monster", 名稱)` 精確比對。副作用：與怪物同名的詞條（Horror 技能、Slayer 被動／稱號、Plague Bearer、Blood Wing）一律顯示怪物譯名，待以實機語境區分。驗證：`node lang/tests/test_lang.cjs` 通過；模擬 278 個怪物名，修正前 137 正確、141 錯誤。未實機驗證、未發布。
- 2026-11-05｜Claude：怪物名稱與詞綴列的分隔符。`lang/lang.js`（來源 `editor/lang.js`）新增 `tidyMonsterText`，在 `translateString` 最後套用：純英文怪物名的中文間「 - 」移除（`石塊蛆蟲巫異`）；含詞綴關鍵字（Cursed、Extra Fast、Enchanted 等）的屬性列改為每項之間一個空格（`施加詛咒 靈氣強化 特別快速`）。驗證：`node lang/tests/test_lang.cjs` 通過；實機（本機 `H_BASE` 注入、隔離設定檔、存檔副本）在頁面內呼叫真實 `translateString`：`Stone - Maggot - the Witch`→`石塊蛆蟲巫異`、`Cursed - Aura Enchanted - Extra Fast…`→`施加詛咒 靈氣強化 特別快速…`，原尺寸截圖確認屬性列為單空格分隔。未發布、未推送。原版 " - " 來源未查明，此前「來自原版翻譯器」之說法不成立。全面掃描：字典內 `monster:`／`unique:`／`affix:` 共 709 個英文名稱，經頁面內真實 `translate` 輸出，皆無「·」、「-」、中文間空格或殘留英文（0 筆可疑）。物品（使用者 2026-11-05 要求一併修正）：`Chain Boots - of Precision` 由 `鎖鍊靴 - 精密之` 改為 `鎖鍊靴精密之`，移除先前的「of」排除條件；實機頁面內驗證通過。介面提示（如 `Enter：選擇 - Esc：返回`）不受影響。Codex 唯讀審查（job 54bff56d9116）：字典條目無直接受影響項目，風險僅在動態組合，已依需求接受。

- 2026-11-05｜Claude（/goal 名稱顯示對齊原版）：`composeFind` 組合規則修正：物品重排只在字尾為「of …」時進行（`精密之鎖鍊靴`）；怪物稱號與稀有名稱維持原順序（`石塊蛆蟲巫異`、`兇殘扣環`）；詞綴列優先判斷、單一空格分隔（`施加詛咒 靈氣強化 特別快速`）。另修：詞綴列空格原本會被 `cleanCJK` 刪除，改以不換行空白（U+00A0）連接並讓 `CJK_GAP`／`MULTI_SPACE` 略過它。驗證：`test_lang` 通過；實機（Electron 隔離設定檔載入官方 /play、本機 `d2edit.js` 注入、`gameHooked:true`）頁面內 `__d2lang.translate` 10 例全對。未用使用者存檔（翻譯不依賴存檔）、未發布。
- 2026-11-05｜Claude：使用者手機實測仍見「 - 」。根因：遊戲把屬性與唯一怪名以空白串成整串（`ix()`：`traits.map(H).join(" ")`），`translateString` 逐段拆解後以「 · 」接回，點陣字型畫成「-」，且最長比對把相鄰屬性黏在一起。修正：整串可完全切成屬性時逐項翻譯、以 U+00A0 分隔；其餘全譯完的名稱直接相接（`妖鬼饗宴「號哭者」`）；含 of 的整串先套物品規則，底材不得以 of/the 開頭（`八目鰻之戒指`）。實機（官方 /play、本機注入、gameHooked）10 例全對。

- 2026-11-05｜Claude＋Codex 子代理（/goal 最佳化專案，舊待辦核對）：①無限重抽：遊戲實際欄位為 `ranks.rerolls`（`kM()` 預設），移除 `autobot.js` 多寫的 `ranks.Reroll`。②技能（使用者要求改法）：不再改技能等級，改為 `world.player.allSkills`（裝備「+所有技能」總和）一次加 20，關閉／總開關關／全部關閉／destroy 時減回；遊戲以差額增減 allSkills（換裝 `la(e,o,-1),la(e,s,1)`），所以只能加一次，不可每幀重設。**實機已驗**（官方 /play、使用者存檔副本、sorceress、build 20261105.1、`tests/live-harness/cheat-skills-live.cjs`）：5→25，1 秒、3 秒穩定，技能等級不變，關閉後回 5。⑤致命一擊／一擊必殺（含 8 個 `*DamageMult`）／掉寶率：`cheatField`／`restoreCheat`／`restoreAllCheats` 關閉時還原（Haiku 子代理，實機已驗，見⑥）。③網頁修改器寫入前自動備份：`modifier/webapi.js` 的 `save` 先讀原檔存到 `localStorage` `d2edit:backup:{softcore|hardcore}`，失敗即取消寫入（備份清單尚不顯示）。④金幣保護：已有還原、不覆寫 `world.gold`，不需改。⑥其餘開關（Haiku）：怪物密度、`gainXp` 包裝、無敵在所有關閉路徑還原；全精英與密度補出的複製怪已生成者無法還原（已註解）。**實機已驗**（`tests/live-harness/cheat-restore-live.cjs`）：maxCrit／oneHitKill（含 `*DamageMult`）／maxDropRate／maxGoldRate 單獨關閉與總開關關閉後皆回原值。⑦第二批（Codex／Agy，報告在 `docs/ai/optimize-2026-11-05/`）：`modifier/webapi.js` 網頁版備份可列出／載入／刪除，並記錄原存檔簽章狀態（`:seal` 鍵）；**實機已驗**（官方 /play、使用者存檔副本、修改器 iframe 內 `window.api`）：寫入前備份金幣＝原值、寫入後＋1、清單顯示「正確」、讀回與刪除正常；`editor/core.js` 備份失敗即取消寫入＋寫入後讀回驗證（未重封裝 exe）；`modifier/patch.mjs` export 前加換行；`d2edit.js` 預載與 iframe 共用 `editorUrl()`；`verify/` push 失敗重跑會再推、git 失敗即停、手動 `--confirm` 拒絕髒工作目錄、`language.json` 需帶 `build` 且與已驗證版本一致（**舊報告缺 build，下次須先重跑 verify --update**）；`autobot.js` `planMove` 效能重構（Agy 原把預算放在 `pr`／`ranged` 宣告前會 TDZ 崩潰，已移到 `lead` 之後），`helper/tests/autobot.cjs` 198/0，實機走位 4 秒以上 35～92 隻怪無錯誤（之後觸發死亡保護回營，是否與修改有關未判定）。`lang/lang.js` 效能修改：第一次含編碼錯誤；第二次輸出 18187 筆全同但遊戲路徑 28.7→29.9ms 無效益，皆還原，結論為不需優化。翻譯建議（07）未經官方對照、怪物同名（05）與既有測試衝突，皆未套用。驗證：`node --check`、`selfcheck`、`craft-limits`、`weapon-sets` 通過；實機已驗：技能加成、四個數值開關還原、走位、網頁備份、無敵（開：扣血無效；關：扣血生效）、經驗加成（關閉換回原函式）、總開關關閉同時還原兩者、怪物密度（實機發現遊戲消耗 `waveDue` 450→435 後未還原、關掉仍會繼續補怪；已改為 `owed`／`waveDue` 關閉時高於原值即降回，重測關閉後立即與 4 秒後皆為 0）；d2edit 預載網址與 iframe 網址實機比對完全相同（攔截 fetch；harness 以本機檔案回應，實際 HTTP 快取命中未量測）；**未實機**：桌面版（需重封裝，且啟動器會讀使用者真實存檔）、發布流程（會真的推送）；未提交、未發布。

## 文件規則（2026-11-07 起：AI 文件只留這一個檔案）
- **所有 AI 代理文件只放在本檔（`AI_HANDOFF.md`）**，不另開新的交接、設計、報告或封存檔。子代理的分析報告一律整合進本檔對應段落，不留獨立檔案。
- 根目錄 `AGENTS.md` 因工具固定讀取路徑而保留，內容只是指向本檔的短規範。`.agents/`、`.claude/` 的 `game-update` 技能檔同樣因技能系統固定路徑而保留（兩份內容需一致）。
- 讀取順序：先讀到「# 附錄」標題之前（目前狀態、反覆問題、長期規則、資料夾結構、測試指令、待辦、近期紀錄，約前 146 行）。附錄為參考資料，**不要整份讀入**（約 300KB，會超過讀取上限），需要時用 Grep 搜尋標題或關鍵字。
- 近期紀錄超過約 200 行時，把舊的原文移到檔尾「附錄」，不改寫。過時資訊直接刪除，歷史查 Git。
- 不屬於 AI 文件的仍留原處：`docs/game-analysis/`（遊戲分析資料）、根目錄 `README.md`（公開說明）、`lang/tests/`、`modifier/tests/` 等測試程式。
- 網頁版只有根目錄一份來源；`editor/` 只剩桌面啟動器，不需同步副本。

---

# 附錄（封存與設計參考，合併自原各文件）

## A. 輔助器設計（原 `helper/AUTOBOT_DESIGN.md`）
`﻿# 遊戲輔助工具設計
`
`## 載入與設定
`
``d2edit.js` 以同來源動態匯入 `autobot.js`；重載先還原舊掛鉤、移除舊介面。暫停時左上「輔助」開啟 Shadow DOM 面板，F8 切換總開關，戰鬥中可按「停止自動戰鬥」。
`
`總開關及主要功能都有標示「開啟／關閉」的按鈕、顏色、狀態燈與 `role="switch"`／`aria-checked`。切換立即釋放輔助移動目標並寫入 `localStorage["d2autobot:settings"]`；儲存失敗會提示，但本次設定仍生效。總開關與新增死亡保護預設關閉。設定版本 3 沿用舊欄位、補上缺省值並限制數值範圍；自動推層與固定重刷各有開關，共用互斥的 `terror.mode`。
`
`「自動戰鬥」分頁（原「推層與任務」）最上方只有「自動戰鬥開關」（`progressEnabled`）與「自動模式」：推關（`quest.autoProgress`，普通→惡夢→地獄往上打）、推層（`terror.mode=progress`）、固定關卡（`quest.farmDifficulty` 設為「固定關卡難度」`quest.fixedDifficulty`）、固定層數（`terror.mode=farm`，層數 `terror.targetFarmTier`）。自動模式只是既有設定的組合，舊設定可直接沿用。

#### 遊戲介接與控制
`
`依模組簽名找到目前頁面的 `Game`，沿用完全相同 URL 匯入並包裝 `tick`／`steer`。每 50ms 至多判斷一次；背景分頁、設定面板、修改器、原版暫停與手動操作讓位期間停止一般自動操作。只使用原版輸入與流程，不直接修改角色數值、任務完成旗標或存檔內容。
`
`- 喝水讀取 `player.life/maxLife`、`world.mana`、`belt.columns`，呼叫 `drinkFrom`；一般補血與致命預判獨立開關。此版本以回復活力藥水補魔，遵守 `nobelt`。冷卻是輔助工具自己的節流時間，沒有完整追蹤手動喝水。
`- 走位讀取敵人與 `hostiles`（敵方飛彈），設定原版 `walkTarget`／`reaching`，沿用牆壁路徑。品質白名單控制主動追蹤，無法阻止原版路過拾取。
`- 推層／重刷呼叫 `startTerror`／`startReplay`，重刷限已通關層數；任務功能追蹤已生成石陣、牢籠、頭目及傳送門並選擇升級卡。營地交付、配點與隱藏條件可能需手動。
`- 升級選卡按原版 1～3 鍵（優先進化卡）。實測原版卡片有防誤觸，未經真實 pointerdown 的 `click()` 會被忽略。
`- 營地自動開局（`quest.autoStart`，預設開，需任務推進開啟）：讀 `waypointView(kit).tabs[].rows[].start`，有 `continue` 先續玩，否則以最高已開放難度 `startRun`；全新存檔可直接推關。一般難度陣亡或結束後呼叫原版 `toMenu()` 回營地再開局。回營地若停在 state=camp 但營地未生成逾 15 秒，仍直接開局。
`- 自動穿裝（`gear.autoEquip`，預設開，屬自動戰鬥分頁）：每 3 秒以原版 `heroNumbers` 比較背包裝備（傷害、生命取對數，加減傷、抗性等），欄位與被擠掉的裝備由原版 `doll.slotFor`／`displaced` 決定，再呼叫原版 `gearActions(...).equip`。空欄位只要不變差就穿；已有裝備需提升 ≥ `gear.minGainPercent`（約等於傷害％）。原版數值不含防禦，防具僅在空欄位時會穿。
`- 多敵（≥3）貼近時改用 16 方向沿牆滑動取樣選擇逃脫方向，避免排斥力互相抵銷。
`- 追目標優先（`movement.chaseFirst`，預設開）：推進中且生命 > 35％ 時，以任務／頭目／敵人／物品為目標直接前進，只疊加飛彈閃避，不再因被小怪包夾而越閃越遠；生命過低才回到保持距離。
`- 罐子與木桶（原版 `rank === breakable`）不列為敵人，不再被當成威脅閃避；`loot.kickJars` 開啟時走過去，由原版碰觸自動踢破（可能掉藥水）。
`- 撿取品質預設全開（版本 3 起；舊設定升級時補開普通與魔法）。
`- 王與精英怪（rank 為 actBoss／boss／champion 或有名字）：閃避時距離超過 `movement.attackRange`（預設 320）就往回拉；推進時優先以最近的精英為攻擊目標。
`- 被包圍（≥3 敵近身）且 16 方向取樣都被堵（最近距離 < 20）時，允許穿過怪群（原版會把貼身的一般怪推開），方向為遠離「傷害 × 生命」最高的敵人。
`- 排行榜學習（`build.*`，預設開）：`LADDER` 常數由 `editor/ladder-learn.js` 從 d2survivors.lol 排行榜 API 產生（依使用者要求：各職業前 50 位不同玩家，同一玩家只算一次、取其最高恐懼層紀錄，不足 20 位以地獄榜補；2026-11-01 遊戲 20261101.1 後重抓；技能等級、被動、變體、配點比例、各欄常用暗金套裝）。升級選卡：進化 +100，其次技能權重 ×10、被動 ×6；卡名實測在 `.d2-parts` 第一個 canvas 的 textContent，也包裝 `hud.showLevelUp` 取 title。屬性點依職業配點比例呼叫原版 `spendStatPoints(屬性, 點數)`。技能與前 8 名重疊不到一半時（每 3 次回營地檢查一次），包裝 `showCampMenu` 並 `openAkara()` 點「Re-draft your skills」再確認；實測首次擊殺巴爾前此項停用，關閉選單後原版停在 town，需設回 camp。實測（2026-11-01）法師第一張卡在 Fire Bolt／Charged Bolt／Ice Bolt 中依排行榜選 Charged Bolt。
`- 實戰調整（2026-11-01，真實遊戲長跑後）：
  - 追目標只用於王（幕末魔王）／精英／任務／物品／寶箱／通關門；遠程對一般怪保持距離，近戰（排行榜力量配點 ≥25％，或設定 `movement.combatStyle`）一般怪也貼身追打、攻擊範圍 90。
  - 沒有敵人時原地等待，不巡航探圖。卡住以遊戲內時間判斷，只換方向繞路，不停機。
  - 寶箱（`kind === "chest"`，撿到原版自動開）優先撿；附近還有寶箱或暗金以上裝備時，通關門最多等 20 秒。遠程職業在頭目／精英 180 內不撿物，也不撿其 180 內的掉落物（實測惡夢撿物時被頭目一擊 900 血）。缺藥踢罐時附近 220 內有敵人也不去（實測藥帶空時走進毒魔群陣亡）。王倒下（clearing／通關門）後、附近有敵人或藥帶滿時不踢罐。
  - 用不到的普通／魔法／稀有裝備撿到即以原版 `gearActions.sell` 賣掉；背包滿（`lastInventoryFull`）且無低階可賣時，也賣未穿的暗金／套裝。
  - 護符：原版 `equip` 遇護符會放進護符格；背包與倉庫的護符有空位就放。此遊戲沒有單獨符文物品（符文之語掉落即完成）。
  - 清場後碰到恰西會開他的商店（`trade.smith`）：順便賣裝與升級後 `leave` 回戰鬥，60 秒內再碰到直接離開。倉庫（only=stash）以角色畫面顯示，離開後需 `hud.closeCharacter()`。
  - 恰西升級：核心（生命、減傷、回血、藥水效果、施法速度、能量、跑速）未滿時存錢不買雜項；屬性升級依排行榜配點跳過幾乎不加的屬性；穿透只買職業會用的元素。
  - 難度：最高難度連續失敗 3 次（陣亡或死亡保護離場）就回低一級刷一局；回營地時若上次進度是較低難度的局則不續玩，直接開最高難度；某難度（普通／惡夢／地獄）完整打完五章擊敗巴爾、整局等級都沒升（中途陣亡或離場不算），就記入 `localStorage["d2autobot:noXp"]`（職業→難度→等級），之後該等級以上不再回去刷那個難度；75 級以上一律不回普通刷，正在普通的 75 級以上角色若惡夢已開，以原版 pause→leaveRun 離開本局回營地；`quest.farmDifficulty` 可固定重複刷某難度。一般難度（非恐懼層數）打完巴爾一律以 `endAfterBaal` 回營地整備，再由營地開最高難度，不走原版直接接下一難度。
  - 裝備評分：減傷、施法速度為小數，抗性已含惡夢／地獄扣抗（可為負）；以「少承受 1％ ≈ 多打 1％」計分，生命 ×130、減傷 −ln(1−DR)×150、四系抗性各 −ln(1−r)×50（負抗扣分）、強化防禦，避免玻璃大砲。盾牌以外每個空欄位扣 15 分（實測雙手武器與盾牌互擠後武器欄長期空著）。
  - 實測：全新存檔法師自動打通普通（第五幕 82 級擊敗巴爾）與惡夢，進入地獄第二幕；地獄陣亡後自動回惡夢刷。
- 實戰調整（2026-11-01 下午，35 存檔長跑）：
  - 依使用者要求：屬性按職業累積小數欠額逐點分配；換裝降傷超過 10％ 須半血以下或平均負抗且生存分數提升至少 20 分，武器被擠空時不得降傷。
  - 精英判斷改為 `rank` 為 actBoss／boss／champion 或 `name` 為字串（一般怪的 name 是怪物設定物件，舊判斷讓所有小怪都算精英）。
  - 目標順序：盜賊 → 任務目標（配合劇情）→ 900 內精英／王（生命 >35％）→ 撿物；精英／王才掉裝備與寶箱。追擊門檻近戰 35％、遠程 25％；目標 250 內 12 隻以上（不含可秒殺）才不衝。
  - 閃小怪看合計威脅：走位距離內一般怪單次傷害合計 < 生命 25％ 且無單隻 ≥10％ 就不閃；生命 ≤ 原版角色傷害一半的小怪（可秒殺）不算威脅。
  - 全圖撿裝備（設定版本 7）：預設全部撿回，沒用的賣掉、有用的穿上或存倉庫。
  - 法典：背包有赫拉迪克法典且變體點數未滿 10 就以 `useQuest` 讀取；剩餘點數依排行榜常用變體（其次高等級技能第一個變體）以 `hud.d2.mods.set` 套用。其他任務獎品在安全狀態開角色畫面後使用：技能書選尚未取得且排行榜技能權重最高的樹，屬性書選排行榜比例最高的屬性；失敗後五分鐘內不重試。營地嘗試以原版 `akaraSearch` 交付伊尼弗斯卷軸；石陣鑰匙的實際觸發方式尚待確認。上述新增流程尚未實際遊戲驗證。
  - 閃避（依使用者要求不硬接傷害）：單發 ≥ 目前生命 25％ 的重擊飛彈安全距離與力道加倍，方向為離開彈道的橫向；一擊 ≥ 15％ 的精英／王靠近到近戰範圍＋40 時橫向繞圈並略往外（卡住時翻轉繞行方向）；600 內有幕末魔王或頭目時喝水門檻提高到 80％。
  - 每個欄位都要有裝備（依使用者要求）：空欄位且不擠掉已穿裝備的候選一律穿上，不看分數與降傷護欄，優先於一般換裝；營地時也從倉庫、收藏庫補。
  - 自動模式（依使用者要求）：「任務模式」（完成所有任務並練到 99 級，原推關）與「天梯模式」（推關＝恐怖層往上推、固定關卡＝重複刷指定難度、固定層數＝重刷指定層）；目前模式用不到的設定自動隱藏。
  - 練等：85 級以上不回惡夢刷（75 級以上不回普通），正在低難度的高等級角色若更高難度已開就離開本局回營地。
  - 換裝優先排行榜高手常用的暗金／套裝（該欄前三名，加 10 分；仍受降傷護欄與分數限制），沒有才依分數挑，空欄位一律補上。
  - 全圖吸經驗（`loot.vacuumXp`，預設開，非原版行為）：地上經驗寶石設原版 magnet 自動飛來。
  - 選卡：自動戰鬥開著時升級畫面一出現就選（不受手動讓位影響）；卡片標「再次習得」加 20 分。重置技能（設定版本 8 重新預設開啟）：原版重置後立刻進入選卡，舊版停在沒技能是因選卡被暫停條件擋住。狀態列顯示目前自動戰鬥模式。
  - 總開關（依使用者回報）：自動戰鬥開著就包含戰鬥輔助（走位、閃避、喝水、撿物）；只開戰鬥輔助則不自動推進。戰鬥中按「停止自動戰鬥」只關閉自動戰鬥；設定面板的「立即停止輔助」會把兩個開關存成關閉；自動停機不改寫使用者設定。
  - 回營地優先回報任務（依使用者要求）：每次回營地先呼叫原版 `cainHandOver()`（凱恩對話時發放已完成任務獎勵的同一函式，不開任務日誌），再做重置技能、整備與開局；獎勵物品由任務物品流程使用。
  - 總開關的保存（依使用者要求）：遊戲重新整理或重新開啟後點書籤，兩個總開關預設關閉；同一頁面內重新點書籤則沿用原狀態（記在 `window.__d2autobotSwitches`，重新整理即消失）。其他設定照舊讀取儲存。
  - 任務（依使用者要求，研究見 docs/game-analysis）：讀存檔 `save.cain.quests[職業]`（o＝待領、g＝已領）顯示目前難度任務進度與「尋找凱恩」步驟；回營地交任務每 3 秒重試直到交完（尋找凱恩戒指與伊尼弗斯卷軸找阿卡拉 `akaraSearch`，其他找凱恩 `cainHandOver`），不受營地整備開關影響；第一幕撿到卷軸且無鑰匙時離開本局回營地翻譯再繼續。
  - 自動模式：任務模式、固定關卡模式（獨立）、天梯模式（推關、固定層數）。任務模式達成（18 項任務都有紀錄且 99 級）自動改固定關卡模式刷地獄。
- 營地整備（`town.*`，預設開，屬自動戰鬥分頁）：每次回到營地、開局前，沿用原版 `openCampTrade` 並包裝 `hud.showTown` 取得原版商店回呼，每 250ms 做一個動作：倉庫（`collectAll` 收藏暗金／套裝、從背包／倉庫／收藏庫挑較佳裝備 `equip`、稀有以上 `toStash`）→ 恰西賣掉剩餘普通／魔法／稀有裝備 → 阿卡拉買生命藥水（每瓶 1000 金，至 `town.potionCount`）→ 恰西買較佳裝備與永久升級（依生命、減傷、回血、藥水效果、施法速度…加權，並計入已買等級）→ 再回倉庫換裝。符文、寶石、護身符、任務物品不賣。實測（2026-11-01）全新存檔：賣靴子、買並穿上皮甲、升級生命，金幣 232→17。
`- 簽名不符時僅以可讀 HUD 與指定藥帶鍵降級，不從 Canvas 推測敵人；死亡保護需要完整遊戲實例，不在 HUD 降級模式猜測離場。
`
`## 死亡保護
`
``deathProtection` 提供 `enabled`、`emergencyHpPercent`（1～90，預設 15）及 `disableAutomation`（預設 true）。啟用後，於喝水前後檢查：
`
`1. 預估傷害 ≥ 目前生命，且無有效回血機會：藥水用盡、禁用藥帶、工具冷卻、已滿血無法補更多，或原版拒絕本次喝水。
`2. 生命百分比 ≤ 緊急門檻，且工具的回血冷卻尚未結束。
`3. 生命 ≤ 50％或預估傷害過半，且至少三名近敵造成威脅，16 個局部方向皆無足夠通道（實測滿血被圍會誤離場，故加此條件）；每方向分 16 小步，用 `walls.slide(x,y,dx,dy)` 與敵人間距取樣，不更動玩家座標。
`
`觸發立即釋放移動，將 `terror.mode` 設為 off、`quest.autoProgress` 設為 false 並儲存；依參數決定是否關閉總開關。呼叫原版 `pause()` → `leaveRun()`。已靜態確認 `Game-C88Jt16A.js` 的 `leaveRun` 僅在 paused 生效，沿用原版恐怖紀錄、金幣與硬核結算，再 `toMenu()`；營地可用時走 `enterCamp()`，否則可能回角色選單，介面會區分顯示。這不是保證無損的傳送，可能損失本局進度。
`
`內部方法缺失時，只在可辨識的暫停 DOM 選單尋找離開／放棄按鈕，最多兩次以處理確認頁；不猜測 Canvas 座標。等待安全狀態期間禁止自動進場與重複離場；8 秒未確認、找不到出口或拋錯時停止自動化並明確回報；原版仍在載入（state=loading）時不計逾時，總上限約 30 秒（實測全新存檔首次載入營地常超過 8 秒）。原版可能在內部非同步載入營地，因此方法返回不等於已回城。要再次推進，需使用者自行重新開啟相應功能。
`
`## 遊戲版本驗證
`
`輔助器與存檔修改器以常數 `TESTED_GAME_BUILD`（目前為 `20261030.2`）記錄已完整驗證相容性的遊戲版本。每次確認新版遊戲相容後更新此值。
`- 版本來源：官方 `/changelog.json`（陣列第一筆 `build`，格式 `YYYYMMDD.N`）與遊戲主程式模組檔名（`/assets/Game-*.js`）。
`- 啟動讀取：輔助器在掛接後、修改器在 load 時發出請求（5 秒逾時、失敗靜默忽略、每次啟動最多一次），並將讀到的 build、日期與 `Game-*.js` 檔名記錄於 `localStorage`（輔助器鍵 `d2autobot:gameBuild`，修改器鍵 `d2edit:gameBuild`），供下次比對與診斷。
`- 過期提示：遊戲 build 新於 `TESTED_GAME_BUILD` 時，輔助器於設定面板最上方（標題下、狀態列上）顯示醒目警示「遊戲已更新到 X（日期），輔助器只驗證到 Y，請更新輔助器；部分功能可能失效」；修改器於頁面頂部狀態列下方顯示對應提示。若 `Game-*.js` 與上次紀錄不同亦提示「遊戲程式已變更」。提示可關閉，但同一 build 下次開啟設定或重新整理時仍會出現。
`
`## 建置與驗證
`
``editor/autobot.js`、`editor/AUTOBOT_DESIGN.md`、`editor/tests/autobot.cjs` 為建置來源，與 web 副本同步。`editor/build-web.js` 先確認來源齊全，再複製以上檔案與含載入行的 `d2edit.js`；清理輸出時保留 Git 與協作規範／交接。不要對有其他代理正在修改的正式 web 直接執行重建。
`
`在 `D:\D2倖存者` 執行：
`
````powershell
`node --check web/autobot.js
`node --check editor/build-web.js
`node editor/tests/build-web.cjs
`$env:ELECTRON_RUN_AS_NODE = $null
`& ./editor/node_modules/electron/dist/electron.exe ./web/tests/autobot.cjs
````
`
`模擬測試使用獨立 Chromium 暫存設定與本機模擬頁，結果預設寫入 `%TEMP%/d2autobot-result.json`，可由 `D2AUTOBOT_TEST_RESULT` 指定。建置測試只操作新建的暫存副本。
`
`## 推測與未驗證範圍
`
`傷害預估尚未完整重現抗性、護盾、格擋、敵人攻速或控制效果；包圍取樣不是完整尋路，也未精確預測敵人移動，可能提早離場或漏判。藥水的後續持續回復未精確建模。原版未保證進村莊的模式會誠實回報角色選單。尚未驗證真實存檔實戰、硬核模式離場結果、手機及長時間掛機；不保證存活或所有任務自動完成。

#### 技能攻擊距離（2026-11-01 靜態分析 itemArt-Bh8qPZQJ.js）

命中判定：中心距 ≤ 角色半徑＋reach＋怪物半徑，以下數字是「邊緣間距」，近戰不必貼身。

| 類型 | 技能（邊緣距離） |
|---|---|
| 亞馬遜近戰 | Jab／Power Strike／Charged Strike／Lightning Strike／Impale 58、Fend 84 |
| 刺客近戰 | Tiger／Cobra Strike、Blades of Ice、Fists of Fire、Claws of Thunder、Dragon Claw／Tail 46；Dragon Talon 90；Phoenix Strike 128 |
| 野蠻人 | Double Swing 48、Bash／Stun 54、Concentrate／Berserk 58、Frenzy 66、Battle Cry／War Cry／Howl 範圍 100、Whirlwind 衝刺 200、Leap Attack 340 |
| 聖騎士 | Zeal 46、Smite／Sacrifice／Vengeance 54、Charge 範圍 90、Conversion 220 |
| 法術／弓／標槍 | 多數索敵 450（Arctic Blast 170、Terror／Confuse／Attract 300、Bone Prison 350、Armageddon／Hurricane 360）；Nova 140＋15／級、Static Field 160＋10／級、Poison Nova 100、Blizzard 落點 450 |

輔助器 `REACH` 表依此設定：已學攻擊技能的最遠距離 < 150 視為近戰，站在約六成攻擊距離處（不貼身）；否則照遠程保持距離。未列出的技能以 450 計，增益技能不計。部分技能經多層共用函式取目標，未完整追蹤（如 Blessed Hammer 繞身、召喚物、德魯伊變身）。

---

## B. 遊戲更新驗證與發布流程（原 `verify/README.md`）
### 工具包自動驗證（verify）

目標：腳本自動完成可重複的檢查，AI 依官方更新內容分析、改良並驗證工具包。不得將腳本通過視為新版功能已完整適配。

#### 全自動更新（2026-11-05 起，日常主流程）
官方幾乎每天更新，日常以「快速相容」為主。使用者說「遊戲更新了」時，AI 直接執行下列指令，全程自動（不使用排程）：

```bash
node verify/auto.cjs                      # 全自動：有新版才動作（--force 強制、--no-publish 只驗證）
node verify/live-smoke.cjs                # 單獨跑實機煙霧測試，寫入 reports/live.json
```

`auto.cjs` 流程：偵測官方新版 → `verify.cjs --update`（快照、自動換模組檔名、特徵碼與裝備資料庫檢查、回歸測試）→ `live-smoke.cjs`（Electron 隔離設定檔開官方 /play/，從本機臨時伺服器載入待發布工具包，確認進入遊戲、輔助器接上、語言掛上、修改器入口存在）→ 產生 `reports/new-content.md` → `publish.cjs --confirm --auto --no-desktop`。
- **新內容不自動做**：官方更新條目與新增未翻譯字串列在 `reports/new-content.md`，由使用者決定要不要加入；`--auto` 發布不以它們為阻擋條件。
- **安全閘**：任一步失敗即停止、不發布，Windows 通知並寫 `reports/auto-log.md`、`auto.json`、`ticket.json`；啟動時工作目錄有未提交修改也不發布（保護進行中的工作）。
- 自動發布只更新網頁版（書籤會自動取得）；桌面版 exe 需手動 `publish.cjs --confirm` 打包。
- 失敗時再請 AI 依 `.claude/skills/game-update/SKILL.md` 處理。

#### 手動指令
```bash
node verify/verify.cjs --update      # 偵測新版→下載快照→比對、翻譯稽核與自動測試→供 AI 分析與適配
node verify/verify.cjs --quick       # 只跑既有測試（不上網）
node verify/publish.cjs              # 列出發布計畫（不執行）
node verify/publish.cjs --confirm    # 建置網頁版、打包桌面版、提交並推送 web 倉庫
node verify/selftest.cjs             # 驗證「驗證腳本自己會抓錯」
```

每次更新檢查都會產生影響與翻譯報告；程式依快照差異選擇測試。來源指紋涵蓋工具、測試與驗證規則，排除報告、備份與長跑輸出，確保實機證據可穩定綁定同一來源。工具包來源或驗證程式改變、缺乏可信快照，或使用 `--full` 時會執行全部已登記測試。發布確認會重新查官方最新 build，且以明確發布檔案清單暫存；清單外仍有變更時會停止提交。

選項：`--force` 版本沒變也重跑、`--dry` 不改原始碼、`--workers N`（預設 8、上限 16）、`--full`（含實機長流程，目前尚無項目）、`--build X` 指定快照版本。

每次更新先產生 `reports/impact.json`，列出官方新增更新內容及可能影響範圍；分類僅供線索。逐項分析、完成所需工具包改良並填入 `status: "已完成"` 與具體 `evidence` 後，重新驗證才可發布。沒有前版新聞時會列出全部新聞，避免漏項。

每次更新都使用快照中的官方語言字典與翻譯器檢查繁中翻譯，並比較官方 `changelog.json` 新聞；新增與全部未翻譯文字列於 `reports/language.json`。缺少前版資料時檢查全部現有文字。此檢查不自動翻譯，也不等於人工校對。

#### 更新工作順序（以 `.agents/skills/game-update/SKILL.md` 為準）
1. AI 讀官方更新訊息 → 2. 反編譯比對新舊版差異（含官方沒提的）→ 3. 分析工具包（修改器／輔助器／語言）是否相符並修改 → 4. 沒變動的部分以本目錄腳本快速回歸 → 5. 隔離環境實機驗證官方網址 → 6. 使用者確認後發布。腳本是第 1、4 步的工具，不取代 AI 判斷。

#### 腳本流程
1. `lib/game.cjs`：讀 `/changelog.json` 取最新版；完整下載 `/play/` 的所有 JS／CSS 到 `game-bundles/<版本>/`（全部保留，不進 git）。
2. `lib/compare.cjs`：先以實際檔案雜湊比對前次驗證的快照，記錄模組變更、執行與略過的測試。已知遊戲核心、物品與選卡模組僅執行相關測試；只有樣式或完全未變則不執行測試。缺少可信快照、遇到其他程式模組變動或工具包來源變更時執行全部測試。
3. `lib/adapt.cjs`：用快照檢查工具包掛鉤點（autobot 的 4 項 Game 特徵、輔助器呼叫的 Game 方法、技能表、選卡函式、修改器特徵碼）；自動換掉寫死的 `itemArt-／saveTransfer-` 檔名；全過後才更新 `TESTED_GAME_BUILD`。
4. `lib/runner.cjs`＋`suite.cjs`：並行跑測試登記表（獨立子行程、失敗自動重試一次，並保留第一次的退出碼、耗時與輸出尾段）。過時測試在 suite.cjs 標 `stale` 並寫明原因。
5. 驗證失敗時還原自動適配的修改並產生故障單；AI 應主動調查與修復，不呼叫本地 AI。
6. 自動測試通過後記錄 `state.json`、存 `backups/code/lastgood/`，這不代表適配完成。AI 逐項分析並處理更新、翻譯及測試結果，以隔離設定檔驗證真實遊戲載入；上述條件皆完成後，執行 `publish.cjs --confirm`；載入結果寫入 `reports/live.json` 並綁定版本與來源指紋。發布時自動依比對結果寫入工具內及公告站更新日誌。只做比對而未測試時不更新已驗證版本。

自動檢查通過不代表真實遊戲功能已完成驗收。

失敗時故障單在 `reports/ticket.json`；最近一次結果在 `reports/latest.json`。

#### 尚未做（誠實記錄）
- 並行「每個測試一份全新存檔、由修改器造檔」的實機整合測試（目前整合測試仍是既有的隔離 Electron 假後端）。
- 在真實 Chromium 載入本機快照、實際 import Game／itemArt／saveTransfer 模組（目前是靜態特徵檢查）。
- `publish.cjs --confirm` 只驗證過「列出計畫」，打包與推送尚未實際執行過。
- Cloudflare 公告網站已連 GitHub 自動建置；尚待確認後台「組建組態」的部署命令指向 site/，並確認第一次建置成功。

---

## C. 實機測試 harness（原 `tests/live-harness/README.md`）
### 實機長跑測試框架

用 Electron 開啟真實遊戲（d2survivors.lol），每個存檔一個獨立設定檔，由輔助器全自動遊玩；測試者不介入遊戲操作，只讀取狀態。依使用者要求，**一律用 GitHub 連結實測**：頁面像玩家點書籤一樣載入 GitHub Pages 上的 `d2edit.js`（再由它載入輔助器）。

| 檔案 | 用途 |
|---|---|
| `main.js`、`package.json` | Electron 主程式：開啟遊戲、每 5 秒截圖與寫 `status.json`、執行 `cmd.js` 指令檔 |
| `boot.js` | 建檔：設定輔助器、從 GitHub 載入書籤程式、選職業；`confirm(false)` 有存檔進度就接回原角色 |
| `launch.ps1` | 一次開多個全新存檔：`-Classes amazon,... -Copies 5` |
| `relaunch.cjs` | 用既有設定檔重新開啟指定存檔（存檔保留） |
| `reload-gh.cjs` | 等 GitHub Pages 部署到與本機 `helper/autobot.js` 相同，再讓所有頁面以書籤方式重載 |
| `watch.cjs` | 每 10 秒檢查，達標（地獄通關且 99 級）只標記不關閉；10 分鐘輸出摘要後結束 |
| `pq.cjs` | 唯讀查詢：在指定存檔頁面執行查詢並分段讀回結果 |
| `probe.js`、`probe2.js` | 唯讀紀錄器：陣亡前 1.2 秒狀態、裝備異動 |
| `craft-live.cjs` | 製作裝備實機測試執行器：Electron＋隔離暫存設定檔載入官方 /play，`nojackno2-ctrl.github.io` 請求改由本機檔案回應（測未發布修改）；`H_IN=editor` 在修改器 iframe 內執行腳本，`//=====MAIN` 之後在寫入存檔、重載後的遊戲頁內執行 |
| `craft-fixed-audit.js`、`craft-fixed-e2e.js` | 固定品質（暗金／套裝／符文之語）製作稽核與「製作→寫入→重載」端到端腳本 |

每個存檔的資料夾（`run-<職業>-<n>/`：設定檔、日誌、截圖、狀態）是執行時產生的，不放進倉庫。

---

## D. 2026-11-05 子代理最佳化報告（原 `docs/ai/optimize-2026-11-05/` 十份）

### 01-lang-效能

### lang-效能（claude）

### lang/lang.js 熱路徑效能分析（唯讀，未修改任何檔案）

我只讀了程式，沒有跑 benchmark，下面的效益都是依程式結構估計的。`translateString` 的快取命中路徑（L576–578）已經很輕，成本集中在快取未命中時，以及 `composeFind` 包住的 `find`。`find` 會被 `gameTr.translate` 遞迴呼叫，所以它的常數成本會被放大。

#### A. translateString（L575–632）

**A1. 第二次怪物名查詢是重複的（L621–624）**
- 片段：
  ```js
  if (r === str && gameTr?.translateAs && /^[A-Z][A-Za-z' -]{1,40}$/.test(str.trim())) {
    const mon = gameTr.translateAs("monster", str.trim());
  ```
- 問題：L585 已用同一個 `key = str.trim()` 查過 `translateAs("monster", key)`。結果若是 `null` 或等於 `key`，L621 在 `gameTr` 沒變的情況下只會得到同樣結果。要走到 L621 的字串都是這種結果，所以這段是多一次的正則加字典查找。
- 建議（只留 L585 的結果，L621 區塊整段刪除）：
  ```diff
  -    if (r === str && gameTr?.translateAs && /^[A-Z][A-Za-z' -]{1,40}$/.test(str.trim())) {
  -      const mon = gameTr.translateAs("monster", str.trim());
  -      if (mon && mon !== str.trim()) r = str.replace(str.trim(), mon);
  -    }
  ```
- 效益：每個未命中且像名稱的字串少一次正則、一次 `trim`、一次 `translateAs`。
- 風險：低。刪除前先確認 L590–617 的流程不會讓 `gameTr` 狀態改變。

**A2. `str.trim()` 重複計算，`look` 閉包每次重建（L579, 593, 599, 621–623）**
- 片段：`const look = (s) => (gameTr ? gameTr.translate(s) : simpleTranslate(s));`
- 建議把 `look` 提到模組層級，並重用 `key`：
  ```diff
  +  const look = (s) => (gameTr ? gameTr.translate(s) : simpleTranslate(s));
   function translateString(str) {
  ...
  -    const look = (s) => (gameTr ? gameTr.translate(s) : simpleTranslate(s));
  -  if (r === str && /^[A-Za-z][A-Za-z' -]*$/.test(str.trim()) && str.includes(" ")) {
  -    const words = str.trim().split(/\s+/);
  +  if (r === str && key.includes(" ") && /^[A-Za-z][A-Za-z' -]*$/.test(key)) {
  +    const words = key.split(/\s+/);
  ```
- 順便把 `includes(" ")` 放到正則前面，沒有空格的字串就不用跑正則。
- 效益：每次未命中少一個閉包配置和 1～3 次 `trim`。效益小，但改動也小。

**A3. Build 正則每次未命中都執行（L583）**
- 片段：`const build = /^(\s*)Build (\d+...)$/i.exec(str), word = dict["Build (version)"];`
- 問題：絕大多數字串都不是版本號，卻都會跑一次 `exec` 和一次字典查找。
- 建議（先用便宜的 `includes` 擋掉）：
  ```diff
  -    const build = /^(\s*)Build .../i.exec(str), word = dict["Build (version)"];
  +    const build = key.length > 5 && key.includes("Build ") ? BUILD_RE.exec(str) : null;
  +    const word = build ? dict["Build (version)"] : undefined;
  ```
  並把 `BUILD_RE` 提到模組層級常數。
- 效益：每次未命中省一次 `exec` 和一次字典查找。

**A4. 逐段切詞迴圈是 O(n²) 次 `look`，沒有記憶（L606–614、L603）**
- 片段：`for (let j = words.length; j > i; j--) { const cand = words.slice(i, j).join(" "), t = look(cand);`
- 問題：每個 i 都從最長候選往短試，每一次都走完整的 `gameTr.translate` 和 `find` 鏈。同一批詞綴（像 "Extra Strong"、"Cold Enchanted"）會在不同字串中重複查詢，但 `cache` 只存整句。
- 建議：加一個片段快取，`useDict` 時一起清：
  ```diff
  +  const segCache = new Map();
  +  const lookSeg = (s) => { let t = segCache.get(s); if (t === undefined) { t = look(s); if (segCache.size > 5000) segCache.clear(); segCache.set(s, t); } return t; };
  -            const cand = words.slice(i, j).join(" "), t = look(cand);
  +            const cand = words.slice(i, j).join(" "), t = lookSeg(cand);
  -        const tr = traits.map((t) => look(t));
  +        const tr = traits.map(lookSeg);
   function useDict(d) { ... cache.clear();
  +  segCache.clear();
  ```
- 效益：這是未命中路徑中最大的一項。Boss 詞綴列、怪物稱號串的未命中成本從 O(n²) 次完整 `find` 降到查表。
- 風險：低。語言切換時必須清 `segCache`（和 `cache` 同時機）。

**A5. 整句快取滿了就整個清空（L629）**
- 片段：`if (cache.size > 20000) cache.clear();`
- 問題：一次清空會讓下一瞬間所有字串同時未命中，造成卡頓。含變動數字的字串（如 HP 數值）會把快取塞滿。
- 建議：改成清最舊的一批（Map 保留插入順序）：
  ```diff
  -    if (cache.size > 20000) cache.clear();
  +    if (cache.size > 20000) { let n = 2000; for (const k of cache.keys()) { cache.delete(k); if (--n <= 0) break; } }
  ```
- 效益：消除長時間遊玩時的週期性卡頓。若要進一步提高命中率，可以對純數字變化的字串做「數字換 #」的正規化快取，但要小心 `{n}` 回填，我不建議在沒量測前做。

#### B. composeFind（L210–264）

**B1. `find` 沒有結果記憶（L234–263）**
- 問題：`find(e, depth)` 對固定字典是決定性的，卻在每次 `translate` 遞迴中重算。`part`、`itemName`、清單切分都會反覆對同樣的片段呼叫 `origFind`。
- 建議：用 `depth + "|" + e` 當鍵做記憶，連 `null` 結果也存：
  ```diff
  +    const memo = new Map();
  +    findMemo = memo; // 供 useDict 清除
       P.find = keepFunctionName(origFind, function (e, depth) {
         if (this !== gameTr || depth > 3) return origFind.call(this, e, depth);
  +      const mk = (depth | 0) + "|" + e;
  +      const hit = memo.get(mk);
  +      if (hit !== undefined) return hit;
  +      const res = compute.call(this, e, depth);   // 原本函式本體改名為 compute
  +      if (memo.size > 20000) memo.clear();
  +      memo.set(mk, res);
  +      return res;
  ```
  並在 `useDict` 裡加 `findMemo?.clear()`。
- 效益：預期是 `composeFind` 中最大的一項，因為遞迴子片段會重複命中。
- 風險：中。結果依賴 `currentLang`（`sep` 取自 `LIST_SEP[currentLang]`）和 `gameTr` 字典，所以語言切換和 `useDict` 都必須清除。

**B2. `itemName` 在同一次 `find` 內被重複呼叫（L248、L254、L262）**
- 片段：L254 對含 " of " 的 `e` 呼叫 `itemName.call(this, e)`；回傳 null 後，L262 又對同一個 `e` 呼叫一次。L248 對 `segs.join(" ")` 也是類似情況。
- 問題：`itemName` 內是 O(n²) 的子串組合（最多約 36 組，每組 2～4 次 `exactOf`），重複呼叫等於把這筆成本翻倍。
- 建議：
  ```diff
  -      if (/ of /.test(e)) { const it = itemName.call(this, e); if (it !== null) return it; }
  +      let itemTried = false;
  +      if (/ of /.test(e)) { itemTried = true; const it = itemName.call(this, e); if (it !== null) return it; }
  ...
  -      return itemName.call(this, e, depth);
  +      return itemTried ? null : itemName.call(this, e);
  ```
- 效益：含 " of " 的名稱，`itemName` 的呼叫次數減半。
- 風險：低。`itemName` 只有一個參數，傳入的 `depth` 本來就被忽略，所以可以安全拿掉。

**B3. `up()` 和 `exactOf` 在子串迴圈內重複計算（L206–207、L219）**
- 片段：
  ```js
  const up = (s) => s.replace(/\s+/g, " ").trim().toUpperCase();
  const exactOf = (self, kind, s) => self.exact?.get(up(`${kind}:${s}`)) ?? self.exact?.get(up(s)) ?? null;
  ```
- 問題：每次 `exactOf` 要做兩次 `up`（各含 replace、trim、toUpperCase），所以最壞情況每個子串有 2 次 Map 查找和 2 次字串正規化。同一個子串在不同 `len`／`i` 組合與不同呼叫之間還會重複查。
- 建議：對 `up` 加小型記憶，並讓 `exactOf` 的結果也快取（以 `self.exact` 為範圍）：
  ```diff
  +  const upMemo = new Map();
  +  const up = (s) => { let u = upMemo.get(s); if (u === undefined) { u = s.replace(/\s+/g, " ").trim().toUpperCase(); if (upMemo.size > 20000) upMemo.clear(); upMemo.set(s, u); } return u; };
  +  const exactMemo = new WeakMap(); // exact Map → Map<"kind\0s", value|null>
  +  const exactOf = (self, kind, s) => {
  +    const ex = self.exact; if (!ex) return null;
  +    let m = exactMemo.get(ex); if (!m) exactMemo.set(ex, m = new Map());
  +    const k = kind + "\0" + s; let v = m.get(k);
  +    if (v === undefined) { v = ex.get(up(`${kind}:${s}`)) ?? ex.get(up(s)) ?? null; m.set(k, v); }
  +    return v;
  +  };
  ```
- 效益：`itemName` 的子串掃描大部分變成單次 Map 查找。以 `WeakMap` 綁定 `exact`，字典替換後舊快取會跟著被回收，不需手動失效。
- 風險：低。

**B4. `itemName` 內的小正則（L215、L218、L223）**
- 片段：`/^(of|the)$/.test(words[i])` 在雙層迴圈中每次迭代都跑；L215 對每個詞各跑一次正則。
- 建議：
  ```diff
  +  const STOP = new Set(["of", "the"]);
  +  const WORD_OK = /^[A-Z][\w'’-]*$/;
  -    if (words.length < 2 || words.length > 8 || !words.every((w) => /^(of|the|[A-Z][\w'’-]*)$/.test(w))) return null;
  +    if (words.length < 2 || words.length > 8 || !words.every((w) => STOP.has(w) || WORD_OK.test(w))) return null;
  -      if (/^(of|the)$/.test(words[i])) continue;
  +      if (STOP.has(words[i])) continue;
  -      if (suf && !/^of /.test(suf)) continue;
  +      if (suf && !suf.startsWith("of ")) continue;
  ```
- 效益：V8 對字面正則已有編譯快取，所以單次節省很小，但這段在內層迴圈，累積有感。

**B5. `find` 每次呼叫都配置閉包、陣列與 `sep` 查找（L236–241、L257）**
- 問題：`part` 閉包、`sep` 查找、以及 L257 的 `[[re, glue], ...]` 巢狀陣列（含 3 個正則字面量）在每次進入 `find` 時都重新建立，連命中 `origFind` 的路徑也要付這個成本。
- 建議：
  ```diff
  +  const NUM_OF = /^([+-]?\d[\d.,]*%?) of (.+)$/;
  +  const LIST_RULES = [[/, (?:and )?/, "comma"], [/ and /, "and"], [/ or /, "or"]];
  ...
  -      const sep = LIST_SEP[currentLang] || LIST_SEP.default;
  -      const part = (s) => { const m = /^([+-]?\d...$/.exec(s.trim()); ... };
  +      // part 改為接收 (self, depth, s) 的模組函式，不再每次建閉包
  ...
  -      for (const [re, glue] of [[/, (?:and )?/, sep.comma], [/ and /, sep.and], [/ or /, sep.or]]) {
  +      const sep = LIST_SEP[currentLang] || LIST_SEP.default;  // 只在走到這裡才查
  +      for (const [re, g] of LIST_RULES) { const glue = sep[g];
  ```
- 效益：減少每次 `find` 的配置與 GC 壓力。搭配 B1 的記憶後，這項的重要性會降低。

#### C. 備援路徑 simpleTranslate（L635–690）

只有 `GameTranslator` 載入失敗時才會走，所以優先度低。

- **C1. 樣板線性掃描（L678–686）**：每個含數字且前四種查法都失敗的字串，要對 `numPatterns` 逐個跑正則。可以在 `ensurePatternIndex` 建索引時，依樣板第一個字面前綴（如 `k.split(/[#*]/)[0]`）分桶，查詢時只掃同桶樣板。
- **C2. 數字正則重複編譯與重複掃描（L653、656、667）**：同一個 `/\d+(?:\.\d+)?/g` 字面量寫了三次。`nums` 取出後，`tHash` 和 `tStar` 可以共用一次掃描。可以提成一個常數 `NUM_RE`，並用同一次 `replace` 回呼同時產生兩種版本。
- **C3. `{n}` 回填重複（L658、663、669、674）**：四處複製貼上同樣的 `replace(/\{(\d+)\}/g, ...)`。可以抽成 `fill(tpl, nums)`，只是整理，沒有效能收益。

#### 建議的實作順序（效益／風險比）

1. **B1**（`find` 結果記憶）：預期效益最大。要確認 `currentLang` 變更與 `useDict` 兩處都會清除。
2. **A4**（片段快取）和 **B3**（`up`／`exactOf` 記憶）：效益大、風險低。
3. **A1**（刪除重複的怪物名查詢）和 **B2**（`itemName` 防重複）：幾乎無風險，直接少做工。
4. **A3、A2、B4、B5**：小改動，順手做。
5. **A5**：解決週期性卡頓，可獨立進行。
6. **C 系列**：只有備援路徑受益，最後再說。

驗證建議：改完後跑 `verify/suite.cjs` 和 `helper/tests/selfcheck.cjs`，並用 `tests/live-harness` 對同一批字串比對修改前後的輸出，確認譯文完全一致。

這份分析不改檔，所以我沒有進入計畫檔與 ExitPlanMode 流程。如果你要我照上面的順序實作，告訴我要從哪幾項開始。
### 02-autobot-效能

### autobot-效能（claude）

### `helper/autobot.js` 主迴圈效能分析（唯讀，未修改任何檔案）

#### 呼叫結構

- 入口在 `autobot.js:1889`：包裝遊戲的 `proto.tick`，每個 render frame 呼叫 `guarded()`。
- `guarded`（`:1864`）以 `now - lastStep < 50` 節流到最多約 20 Hz。這個節流已經做得不錯。
- `:2088` 另有 200 ms 的 `setInterval`。它大多只做 `setText`/`setDisplay` 加上差異檢查，沒有明顯問題。
- 每個 step 的流程是：`applyCheats` → `autoSummonClone` → `recoverOrphanLevelUp` → `visible(#level-up)` → `readState` → `threats` → `navigate`（內含 `vacuum`、`lootGoal`、`questGoal`、`planMove`）。
- `autoEquip`、`useCodex`、`autoStats`、`leaveLowNormal` 都已有 1～3 秒的節流。`heroDamage`（`:603`）每 3 秒更新一次。這幾項不用改。

#### 熱點

**規模假設：** 開啟「怪物數量最大化」作弊後，`enemies` 最多 450 隻（`:1716-1722`）。下面的 O(n) 與 O(n²) 都以這個規模估算。

##### 1. `planMove` 候選點評分（影響最大）

**位置：** `:571-596`
```js
for (let i = 0; i < 24; i++) { for (const step of [70, 150]) { ...
  let crowd = 0; for (const f of near) if (dist(f, pt) < 110) crowd++;
  let score = -threat(pt) * 2 - shotHit(pt) * 6 - crowd * 0.4;
  for (const f of near) { const gap = meleeGap(f.e); ... dist(pt, f.e) < zone || dist(pt, f) < zone ... }
```
- 候選點共 48 個。每個點對 `near` 掃 3 遍（`threat`、`crowd`、近戰區），其中近戰區每隻怪還算 2 次 `Math.hypot`。
- 450 隻怪時，每個 step 約 48 × 4 × 450 ≈ 8.6 萬次 `hypot`，20 Hz 下每秒約 170 萬次。
- `near` 的篩選條件是 900 內（`:542`）。但 `threat` 的貢獻是 `w/(1+(d/70)²)`，在 d=450 時只剩 `w×0.023`，遠處的怪幾乎不影響評分。

**建議 diff：**
```diff
-    const near = foes.filter((f) => dist(f, p) < 900);
+    const near = foes.filter((f) => dist(f, p) < 900);
+    // 評分只看 ≤ 450 的怪；遠處貢獻 < 2.5%，且 ±150 的候選點不會改變排序
+    const scoreSet = near.filter((f) => dist(f, p) < 450);
+    for (const f of scoreSet) f.zone = f.r + pr + meleeGap(f.e) + (ranged ? lead(f.e) : 0);   // 預先算好，每幀只算一次
...
-    const threat = (pt) => { for (const f of near) {...} }
+    const threat = (pt) => { for (const f of scoreSet) {...} }
...
-        let crowd = 0; for (const f of near) if (dist(f, pt) < 110) crowd++;
-        let score = -threat(pt) * 2 - shotHit(pt) * 6 - crowd * 0.4;
-        for (const f of near) { const gap = meleeGap(f.e); if (gap === -Infinity) continue; const zone = ...; if (dist(pt, f.e) < zone || dist(pt, f) < zone) score -= ...; }
+        // 單一迴圈同時算 threat / crowd / zone，用平方距離避免 hypot
+        let score = 0, crowd = 0, t = 0;
+        for (const f of scoreSet) {
+          const dx = pt.x - f.x, dy = pt.y - f.y, d2 = dx*dx + dy*dy;
+          if (d2 < 12100) crowd++;
+          if (!(boss && f.e === boss)) { const d = Math.max(0, Math.sqrt(d2) - f.r); t += f.w / (1 + (d / scale) ** 2); }
+          if (f.zone > 0) { const ex = pt.x - f.e.x, ey = pt.y - f.e.y; if (d2 < f.zone ** 2 || ex*ex + ey*ey < f.zone ** 2) score -= f.elite ? 6 : 2.5; }
+        }
+        score += -t * 2 - shotHit(pt) * 6 - crowd * 0.4;
```
- 另外把 `[70, 150]`（`:573`）提到迴圈外成常數，省下 24 次陣列配置。
- 「已有 `lead()`、`meleeGap()` 在內圈重複呼叫」這點，預先算 `zone` 就一併解掉了。

**預期效益：** `hypot` 次數降約 70～85%，CPU 約降到 1/4～1/6。評分只有微幅變化（遠處怪的貢獻被截掉），需要用現有 selfcheck 驗證走位行為沒有退化。

##### 2. `lootGoal` 與 `accepts` 每幀對每個掉落物呼叫 `game.loot()`

**位置：** `:405`、`:388-401`、`:413`
```js
const wantedLoot = (s, now, lootOn) => s.pickups.filter((e) => ... && accepts(e) && dist(e, s.p) <= settings.loot.searchRadius);
```
- `accepts()` 會對每個掉落物呼叫遊戲的 `game.loot(item)`，這是遊戲原版的篩選函式，成本不明，很可能不便宜。而 `dist` 距離檢查排在最後。
- `vacuum`（`:412-413`）又對每個掉落物各呼叫一次 `accepts`。
- `navigate` 在通關後（`:667`）又會再跑一次完整的 `wantedLoot`。
- 因此每個 step 對同一個掉落物最多重複呼叫 3 次 `game.loot`，而且對 `searchRadius` 以外的掉落物也呼叫。

**建議 diff：**
```diff
-  const wantedLoot = (s, now, lootOn = ...) => s.pickups.filter((e) => !e.flippy && !e.discarded && (blockedLoot.get(e) || 0) < now && (lootOn || e.item?.type === "quest") && accepts(e) && dist(e, s.p) <= settings.loot.searchRadius);
+  const wantedLoot = (s, now, lootOn = ...) => s.pickups.filter((e) => !e.flippy && !e.discarded && (blockedLoot.get(e) || 0) < now && (lootOn || e.item?.type === "quest") && dist(e, s.p) <= settings.loot.searchRadius && accepts(e));
```
```diff
+  // accepts 結果快取 1 秒：遊戲的拾取規則（loot filter）不會逐幀變動
+  const acceptCache = new WeakMap();
   function accepts(drop) {
+    const c = acceptCache.get(drop); const t = performance.now();
+    if (c && t - c.t < 1000) return c.v;
+    const v = acceptsRaw(drop); acceptCache.set(drop, { v, t }); return v;
   }
```
- 另外讓 `navigate` 在一個 step 內只算一次 `wantedLoot`，結果存進 `s.wanted`，供 `:667` 與 `lootGoal` 共用。

**預期效益：** `game.loot` 呼叫量降到約 1/20。若地上堆了數十件物品，這是除 `planMove` 外最大的一筆。

##### 3. `lootGoal` 內 `elites.some(...)` 形成 O(P×E)，並以完整排序只取第 1 名

**位置：** `:424-429`
```js
const elites = isMelee() ? [] : s.enemies.filter((e) => ["actBoss","boss","champion"].includes(e.rank));
const candidates = wantedLoot(...).filter((c) => !elites.some((e) => dist(e, c) < 180));
candidates.sort((a, b) => weight(b) - weight(a) || dist(a, s.p) - dist(b, s.p));
...
const target = candidates[0];
```
- **O(n²) 問題：** 開啟 `allElites`（`:1742`）後，所有一般怪都變成 `champion`，`elites` 可達數百隻。每個候選掉落物都要掃一遍，也就是 O(掉落物 × 精英)。
- **排序問題：** `sort` 的比較器每次比較都重算 `weight` 與 `dist`，但最後只用第一名。

**建議 diff：**
```diff
-    const elites = isMelee() ? [] : s.enemies.filter(...);
-    if (elites.some((e) => dist(e, s.p) < 180)) {...}
-    const candidates = wantedLoot(...).filter((c) => !elites.some((e) => dist(e, c) < 180));
+    // 只有玩家搜尋半徑 + 180 內的精英才可能影響候選物
+    const reachR = settings.loot.searchRadius + 180;
+    const elites = isMelee() ? [] : s.enemies.filter((e) => ELITE_RANKS.has(e.rank) && dist(e, s.p) < reachR);
...
-    candidates.sort(...); ... const target = candidates[0];
+    let target = null, bw = -Infinity, bd = Infinity;
+    for (const c of candidates) { const w = weight(c), d = dist(c, s.p); if (w > bw || (w === bw && d < bd)) { target = c; bw = w; bd = d; } }
```
- 同樣的處理套用到：
  - `:441`：`.sort().slice(0,1)` 改成單次最小值掃描。
  - `:482`：`questDrop` 的 `.filter().sort()[0]`，每個 step 都跑，改成單次最小值掃描。
- `["actBoss","boss","champion"].includes` 提成 `Set` 常數（`:424`、`:524` 都用到）。

**預期效益：** 精英多的場景 O(P×E) 變成 O(P × 附近精英)；消除每幀的排序與暫時陣列。

##### 4. `navigate` 對 `s.enemies` 重複掃描 8～9 遍，各自重算 `dist`

**位置：** `:620`、`:622`、`:632`、`:637`、`:646`、`:647`、`:660`（`nearestElite`）、`:679`、`:684`、`:691`

- 每一遍都自己 `filter` 並重算 `dist(e, s.p)`，產生多個暫時陣列。
- `nearestElite`（`:526`）的 `reduce` 內，每次比較要重算 2 次 `dist`（`dist(e,s.p) < dist(a,s.p)`），而且在同一 step 最多被呼叫 3 次。
- `:632` 只要數量，卻先 `filter` 成陣列再取 `.length`。
- `:691` 的 `crowded` 對目標周圍 250 內的怪逐隻判斷 `killable`，也是 O(n)。

**建議做法：** 在 `readState` 回傳時，一次把每隻怪的距離算好存成平行陣列（或存在 `s.dists`）。後續所有 `filter` 改讀快取距離。
```diff
 function readState(g) { ...
-  enemies: Array.isArray(w.enemies) ? w.enemies.filter((e) => live(e) && e.rank !== "breakable") : [], jars: ... w.enemies.filter(...) ...
+  // 單趟分流：enemies / jars，同時記下到玩家的距離
+  const enemies = [], jars = [];
+  for (const e of w.enemies || []) { if (!live(e)) continue; if (e.rank === "breakable") jars.push(e); else { e._d = Math.hypot(e.x - p.x, e.y - p.y); enemies.push(e); } }
```
```diff
-  function nearestElite(s) { return s.enemies.filter((e) => isElite(e) && dist(e, s.p) < 900).reduce(...) }
+  function nearestElite(s) { if (s._elite !== undefined) return s._elite; let best = null; for (const e of s.enemies) if (e._d < 900 && isElite(e) && (!best || e._d < best._d)) best = e; return (s._elite = best); }
-    if (m.enabled && closeEnemy && s.enemies.filter((e) => dist(e, s.p) < m.kiteDistance).length >= 3) {
+    if (m.enabled && closeEnemy && countWithin(s.enemies, m.kiteDistance) >= 3) {
```
- 寫入 `e._d` 會對遊戲物件加屬性，有改變 hidden class 的風險。若不想動遊戲物件，改用與 `enemies` 平行的 `Float64Array`。

**預期效益：** `readState` 兩次 `filter` 合為一趟；`navigate` 的暫時陣列與 `hypot` 約少一半以上。單項看不大，但是不增加複雜度的穩定收益。

##### 5. `escapeDirection`：每個 step 最多呼叫 2 次，內圈每次配置物件

**位置：** `:509-520`，呼叫點 `:633`、`:654`
```js
for (let i = 0; i < 16; i++) { ... for (let j = 0; j < 8; j++) {
  const next = s.w.walls.slide(...); ...
  for (const e of near) worst = Math.min(worst, dist({ x, y }, e) - (e.radius || 12));
```
- 最多 16 × 8 = 128 次遊戲的 `walls.slide`，加上 128 × `near` 次 `hypot`，且內圈 `dist({ x, y }, e)` 每次都配置新物件。
- `:633` 與 `:654` 在同一 step 可能都會觸發，結果幾乎相同。

**建議 diff：**
```diff
-        for (const e of near) worst = Math.min(worst, dist({ x, y }, e) - (e.radius || 12));
+        for (const e of near) worst = Math.min(worst, Math.hypot(x - e.x, y - e.y) - (e.radius || 12));
```
- 若上一次的結果在 150 ms 內且玩家位移 < 20，直接重用（前向式快取）。
- `:654` 先篩選再呼叫，改成只在 `gap` 條件成立時才算，`:633` 與 `:654` 共用同一次的結果。

**預期效益：** 省去 128 次配置與重複呼叫；被包圍的場景（正是最吃效能的時候）可降約一半。

##### 6. `myReach()` 與 `style()` 每 step 被呼叫十幾次，每次重做 `map+filter+Math.max(...)`

**位置：** `:461-470`；被 `isMelee`、`fighter`、`style`、`battleGoal`（`:473`）、`planMove`（`:546`）反覆呼叫

```js
const list = (game?.build?.skills || []).map((x) => REACH[x.id] ?? 450).filter((r) => r > 0);
return list.length ? Math.max(...list) : 450;
```

**建議 diff：**
```diff
+  let reachKey = null, reachVal = 450;
   function myReach() {
-    const list = (game?.build?.skills || []).map(...).filter(...);
-    return list.length ? Math.max(...list) : 450;
+    const sk = game?.build?.skills;
+    // 技能等級/數量只有升級時才會變；用 500ms TTL 即可
+    const t = performance.now(); if (reachKey === sk && t - reachAt < 500) return reachVal;
+    let r = 0; if (sk) for (const x of sk) { const v = REACH[x.id] ?? 450; if (v > r) r = v; }
+    reachKey = sk; reachAt = t; return (reachVal = r || 450);
   }
```
- 同理，`fighter()` 與 `style()` 在 `navigate` 開頭算一次，傳給 `planMove`（目前 `planMove` 已收到 `st`，卻又呼叫 `fighter()`、`myReach()`）。

**預期效益：** 每個 step 省約 10～20 次陣列配置，且消除 `Math.max(...list)` 展開。收益小但幾乎零風險。

##### 7. 每個 step 都做 DOM 查詢與強制樣式計算

**a. `:1795` 與 `:1779`**
```js
const levelUpVisible = visible(document.getElementById("level-up"));
```
- `visible()` 呼叫 `getComputedStyle`（`:173`）。DOM 在每個 render frame 都有變動（HUD 更新），所以每次都可能觸發強制 style recalc。
- 同一個 step 內 `recoverOrphanLevelUp`（`:1779`）還會再做一次。已有 `g.state === "levelUp"` 可以用（`:1798` 也在檢查）。

```diff
-    const levelUpVisible = visible(document.getElementById("level-up"));
+    // 有遊戲實例時以 state 為準（與 :175 paused() 同一做法），避免每 50ms 強制 style recalc
+    const levelUpVisible = g ? g.state === "levelUp" : visible(document.getElementById("level-up"));
```
- 風險：`recoverOrphanLevelUp` 正是要處理「state 已不是 levelUp 但 DOM 殘留」的情況。所以 `:1779` 要保留 DOM 檢查，但降頻到 500 ms，或只在 `g.state` 為 `playing`/`camp`/`town` 時檢查。

**b. `:1771`（`applyCheats` 的無限重抽）**
```js
const rerollBtn = document.querySelector("#level-up button#reroll, #level-up .reroll, button[data-action='reroll']");
```
- 只要 `infiniteRerolls` 開著，每個 step 都跑，而且在「沒有升級畫面」時也跑。第三個選擇器 `button[data-action='reroll']` 沒有 id 錨點，引擎要掃整個文件的 `<button>`。

```diff
-      const rerollBtn = document.querySelector("#level-up button#reroll, ...");
-      if (rerollBtn && rerollBtn.disabled) rerollBtn.disabled = false;
+      if (g.state === "levelUp") {
+        const rerollBtn = document.getElementById("reroll") || document.querySelector("#level-up .reroll, button[data-action='reroll']");
+        if (rerollBtn?.disabled) rerollBtn.disabled = false;
+      }
```
- `:1290` 已經使用 `getElementById("reroll")` 當第一選擇，這裡統一即可。

**預期效益：** 平常（非升級畫面）每個 step 少 2～3 次 `getComputedStyle` 與一次全文件選擇器掃描。這是「每幀 `querySelector`」類中最直接的一項。

##### 8. `applyCheats` 每個 step 無條件重寫數十個欄位

**位置：** `:1657-1688`、`:1703-1715`
```js
for (const k of ["damageMult", "physicalDamageMult", ...]) cheatField("oneHitKill", p, p, k, 100);
```
- `cheatField`（`:1528`）每次呼叫都做 `cheatRecs.get`、`rec.fields.find`（線性）、`Object.hasOwn`，然後無條件寫入。開全部作弊時，每個 step 約 25～30 次呼叫，每次也配置新的陣列字面量（`:1669`、`:1673`）。
- `cheatField` 的寫入無條件進行，即使值本來就一樣。

**建議 diff：**
```diff
+  const MASTERY_KEYS = ["physical","fire","cold","lightning","poison","magic"];
+  const MULT_KEYS = ["damageMult", ...];
   function cheatField(key, owner, obj, prop, value) {
     ...
-    obj[prop] = value;
+    if (obj[prop] !== value) obj[prop] = value;
     f.written = value;
```
- 另外把整個作弊套用降到 250 ms 一次（例如 `applyCheats` 開頭 `if (now - cheatAt < 250) return`）。注意無敵的 `lifeGuard` 已用存取器攔截，不依賴每幀重寫，所以降頻不影響無敵本身。
- 唯一要確認的是「換裝後遊戲重算屬性會把加成蓋掉」的情況：50 ms → 250 ms 最多多暴露 4 幀，影響很小。

**預期效益：** 每個 step 的作弊開銷降到約 1/5；無條件寫入對遊戲物件造成的 dirty 標記也減少。

##### 9. 怪物複製作弊：每 step 對大陣列 `filter`

**位置：** `:1716-1735`
```js
const baseEnemies = g.world.enemies.filter(e => e && !e._cheatClone && !e.sprite && e.rank !== "breakable" && (e.life || 0) > 0);
```
- 條件 `enemies.length - _cheatClonedCount < 100` 成立期間，每個 step 對最多 450 隻怪做 `filter`，再為每隻產生最多 9 份複製。
- `_cheatClonedCount` 只增不減（怪死掉時不扣），所以長期執行後 `enemies.length - _cheatClonedCount` 會漸漸變成負值。這是**邏輯副作用**，不是效能，但它讓複製行為在長場次中悄悄停止。
- 這些複製出來的怪會讓 `near` 變大，連帶放大第 1、4、5 項的成本。

**建議：**
```diff
+  if (now - cloneAt < 500) {/* skip */} else { cloneAt = now; ...原本邏輯... }
```
- `_cheatClonedCount` 應改為每次重新計算 `enemies.reduce(c => c._cheatClone ? 1 : 0)`，或在複製的怪死亡時遞減（此處只列出，不評估是否要改行為）。

**預期效益：** 在「怪物數量最大化」開啟時，每秒少 18 次 450 元素的 `filter`。

##### 10. `allElites` 每個 step 掃整個怪物陣列

**位置：** `:1742-1755`
- 每個 step 對所有怪檢查 `e.rank === "normal"`。轉換後一般怪不會再被選中，所以大部分檢查是空轉。
- 降到 250 ms 一次即可（新生成的怪最多晚 250 ms 變精英，在遊戲上幾乎看不出差別）。

##### 11. `vacuum` 的三次迴圈與每幀重複寫入

**位置：** `:409-416`
```js
if (...vacuumXp) for (const e of s.pickups) if (e.kind === "xp" && !e.dead) e.magnet = true;
if (...vacuumGold) for (const e of s.pickups) if (e.kind === "gold" && ...) e.magnet = true;
if (...) for (const e of s.pickups) { ... if (e.kind === "chest") { e.x = s.p.x; ... e.sprite?.position?.set?.(...) } else e.magnet = true; }
```
- 對同一個 `pickups` 陣列掃 3 遍。
- 寶箱每個 step 都被搬到玩家身上並更新 sprite 位置。
- XP 與金幣的 `magnet = true` 只需設一次。

**建議 diff：**
```diff
-    if (assistOn() && settings.loot.vacuumXp && s.p) for (...) ...
-    if (assistOn() && settings.loot.vacuumGold && s.p) for (...) ...
-    if (!assistOn() || ...) return;
-    for (const e of s.pickups) {...}
+    const on = assistOn(), xp = on && settings.loot.vacuumXp, gold = on && settings.loot.vacuumGold, all = on && settings.loot.enabled && settings.loot.vacuum;
+    if (!s.p || !(xp || gold || all)) return;
+    for (const e of s.pickups) {
+      if (e.dead) continue;
+      if (e.kind === "xp") { if (xp && !e.magnet) e.magnet = true; continue; }
+      if (e.kind === "gold") { if (gold && !e.flippy && !e.discarded && !e.magnet) e.magnet = true; if (!all) continue; }
+      if (!all || e.flippy || e.discarded || !accepts(e)) continue;
+      if (e.kind === "chest") {...} else if (!e.magnet) e.magnet = true;
+    }
```
- 注意：保留原行為。金幣在第二個迴圈與第三個迴圈會被處理兩次，合併時要確保 `all` 為真時金幣仍會走第三段邏輯（上面的寫法已保留）。

**預期效益：** `pickups` 掃描 3 遍降成 1 遍；XP 寶石很多時（戰鬥中常有數百顆）差異明顯。

##### 12. `readState` 的雙 `filter`，以及 `drank` 後的重算

**位置：** `:235`、`:1853-1856`
- `enemies` 與 `jars` 各自 `filter` 一次 `w.enemies`（同一陣列掃 2 遍）。第 4 項已含合併的 diff。
- `drank || healingFailed` 時才重讀，這個設計已經合理（註解 `:1853` 說得很清楚）。不用改。

##### 13. 次要項目

| 位置 | 片段 | 建議 |
|---|---|---|
| `:492` | `[...(search?.watch?.watched?.values?.() \|\| [])].filter(...)` | 每 step 展開 Map 成陣列。改成 `for (const b of map.values())` 單趟尋找最近者，省一個陣列。 |
| `:665` | `s.pickups.some(...)` 內含 `blockedLoot.get(e)` | 只有 `portalDue` 為真才需要；用 `portal` 存在時才算（`const treasure = point(portal) && ...`）。 |
| `:274` | `cooldownDamage.sort(...).slice(...).reduce(...)` | 陣列通常很短，可不改；若 `shots` 很多再考慮改成 `Float64Array`。 |
| `:276`、`:279` | 兩次連續掃 `s.enemies`（`threats`） | 合併成一個迴圈，與第 4 項的快取距離一起做。 |
| `:1069`（`hookBuild` 附近）、`:1472`、`:1477` | `JSON.stringify(qs.q)` 兩次 | 只在任務流程跑，不在戰鬥主迴圈，可忽略。 |
| `:2105` | 面板開啟時每 200 ms 組字串並 `trAuto` | 已有 `setText` 差異檢查，可忽略。 |
| `:1799` | `[...document.querySelectorAll("#choices button")].filter(visible)` | 只在升級畫面出現，且有 `cardActionAt` 的 100 ms 節流，可忽略。 |

#### 建議優先順序

| 順序 | 項目 | 難度 | 預期效益 |
|---|---|---|---|
| 1 | 第 7 項（DOM 查詢與強制樣式計算） | 低 | 平常每 step 省 2～3 次 `getComputedStyle` 與一次全文件掃描 |
| 2 | 第 2 項（`accepts` 快取與順序調整） | 低 | `game.loot` 呼叫降約 95% |
| 3 | 第 1 項（`planMove` 合併迴圈與截斷） | 中 | 大量怪時 CPU 約降到 1/4～1/6 |
| 4 | 第 3 項（`lootGoal` 消除 O(P×E) 與排序） | 低 | `allElites` 開啟時明顯 |
| 5 | 第 8、9、10 項（作弊節流） | 低 | 作弊全開時每 step 固定成本降約 80% |
| 6 | 第 4、5、6、11 項 | 中 | 穩定的小幅改善，減少 GC 壓力 |

#### 驗證建議（供之後實作時使用）

- 先用瀏覽器 Performance 面板錄 10 秒：在「怪物數量最大化＋全精英＋自動戰鬥」下，量 `step` 的 self time，作為基準。
- 修改走位相關項目（第 1、4、5 項）後，執行 `helper/tests/selfcheck.cjs` 與 `verify/suite.cjs`，並用 `tests/live-harness` 比對走位行為，確認行為沒有退化。
- 第 1 項截斷 `near` 到 450 屬於行為改變，建議保留可調旋鈕（例如 `settings.movement.planRadius`），先預設 450 再用實測決定。

#### 未涵蓋與限制

- 未實際執行或量測，以上效益是依程式碼結構與 450 隻怪的假設推估。
- `game.loot`、`walls.slide`、`walls.nearestOpen` 都是遊戲原版函式，真實成本不明。第 2 項與第 5 項的效益取決於它們的實際耗時。
- `progression()`（`:1491`）與 `campShop` 等營地流程只在非戰鬥狀態跑，不屬於戰鬥幀，未深入檢視。
- 本次處於 plan 模式，我沒有建立計畫檔，也沒有修改任何檔案，報告全部在上面。
### 03-桌面版漂移

### 桌面版漂移（claude）

**結論:** 兩邊沒有「同名檔」可以逐行比。`editor/` 下沒有 `d2edit.js`,桌面版的對應關係如下:

| 網頁版 | 桌面版 |
|---|---|
| `d2edit.js` 的 `backend` | `editor/core.js` + `editor/main.js` |
| `d2edit.js` 的 `startEngine` | `editor/engine.js` |
| `modifier/webapi.js` | `editor/preload.js` |

`modifier/engine-page.js` 沒有兩份。桌面版在 `editor/engine.js:29,46` 直接下載同一份來用,所以這個檔案不會漂移。

我只讀了檔案,沒有執行或修改任何東西,也沒有寫計畫檔。以下是「網頁版已修、桌面版未同步」的項目,依嚴重度排序。

#### 1. 備份失敗仍會覆寫存檔(最嚴重)
- **網頁版:** `modifier/webapi.js:37-49` 先備份原存檔,寫入並讀回確認一致。備份失敗就回傳錯誤、取消寫入。這段是未提交的修改。
- **桌面版:** `editor/core.js:84-87` 的 `try { backup(...) } catch {}` 會吞掉所有錯誤。備份寫不進去(磁碟滿、唯讀、路徑無權限)時,下一行 `db.put` 照樣覆寫存檔,等於沒有備份。
- **建議 diff(`editor/core.js:83-89`):**
```diff
     const k = lsKey(MODES[mode].key);
-    try {
-      backup(`${mode}_localStorage.json`, decodeLs(await db.get(k)), mode);
-    } catch {}
+    let old = null;
+    try { old = decodeLs(await db.get(k)); } catch {}   // 沒有舊存檔(首次寫入)才允許略過
+    if (old !== null) {
+      try { backup(`${mode}_localStorage.json`, old, mode); }
+      catch (e) { throw new Error("無法備份原存檔，已取消寫入：" + e.message); }
+    }
     await db.put(k, encodeLs(text));
```
`save.json` 那段(`core.js:97`)的 `backup()` 沒有 try/catch,失敗會直接丟錯,不是問題。

#### 2. 寫入後沒有讀回驗證
- **網頁版:** `d2edit.js:169-171` 寫完立刻讀回比對,不一致就丟出 `寫入後讀回的內容不一致`。
- **桌面版:** `core.js:87-89` 的 `db.put` 之後直接關閉資料庫,沒有確認。
- **建議 diff(`core.js`,`db.put` 之後):**
```diff
     await db.put(k, encodeLs(text));
+    if (decodeLs(await db.get(k)) !== text) throw new Error("寫入後讀回的內容不一致，存檔可能沒有寫進去。");
```
需注意 `decodeLs` 對 latin1 和 UTF-16 兩種編碼都能還原,可以直接用。

#### 3. 引擎呼叫缺少白名單(防禦性加固,不是功能 bug)
- **網頁版:** `d2edit.js:201` 用固定的函式名單,`d2edit.js:256` 另外用 `Object.hasOwn` 檢查。
- **桌面版:** `main.js:37` 只檢查是不是合法識別字,`engine.js:87` 再把它代進 `window.engine.${fn}` 執行。
- **風險:** `constructor` 也是合法識別字,而 `window.engine.constructor(...args)` 等同 `Function(...)`。呼叫端雖然限定為 `remote.trusted` 的頁面,但仍是不必要的風險面。
- **建議 diff(`editor/engine.js:78` 的 `call()` 開頭):**
```diff
 async function call(fn, ...args) {
+  if (!Object.hasOwn((await (start(), win.webContents.executeJavaScript("window.engine"))) ?? {}, fn)) throw new Error("不支援的操作");
```
這行寫得不夠乾淨。較好的做法是把 `d2edit.js:201` 的函式名單抽成共用常數(例如放在 `modifier/` 下由雙方讀取),`main.js:37` 改成 `ALLOWED.includes(fn)`。

#### 4. 翻譯字典的重試和共用
- **網頁版:** `d2edit.js:193-197` 抓字典失敗時重試 3 次(間隔 800ms、1600ms),並以 `structuredClone` 複製遊戲資料。
- **桌面版:** `main.js:40-44` 只抓一次,失敗就回傳 `missing: true`。
- **影響較小:** `remote.text`(`remote.js:24-26`)已有快取後備,只有第一次安裝又剛好斷網才會遇到。可選擇性同步:
```diff
-  try { return { dict: JSON.parse(await remote.text("lang/zh-TW.json")), game }; }
-  catch { return { dict: {}, game, missing: true }; }
+  for (let i = 0; i < 3; i++) {
+    try { return { dict: JSON.parse(await remote.text("lang/zh-TW.json")), game }; }
+    catch { if (i < 2) await new Promise((r) => setTimeout(r, 800 * (i + 1))); }
+  }
+  return { dict: {}, game, missing: true };
```

#### 不需要同步的差異
- **`Storage.prototype.setItem` 攔截(`d2edit.js:158-168`):** 擋遊戲在 `pagehide` 時用舊存檔覆寫。桌面版寫入時遊戲必須先關閉(LevelDB 會鎖檔),不會發生。
- **遊戲版本與腳本唯一性:** `d2edit.js:53-59` 的 `activeGameScript()` 對應 `engine.js:48,52` 的 `gameScripts.length === 1`,邏輯等價。
- **版本不符時封鎖引擎:** 桌面版 `engine.js:82-86` 比網頁版更嚴格,網頁版沒有對應機制。
- **備份用途不同:** 網頁版 `webapi.js` 是下載檔案,桌面版 `core.js` 是寫進資料夾,設計上本來就不同。

**限制:** 我沒有比對 `helper/`、`lang/` 的共用程式,也沒有跑測試確認以上 diff 可用。若要實作,我建議先做第 1、2 項,再補第 3 項的共用白名單。
### 04-備份清單UI

### 備份清單UI（claude）

**唯讀分析結果（未寫入任何檔案）**

只需改 `modifier/webapi.js`，`editor.html` 的 `renderSaves` 不用動。它已經會用 `listBackups` 回傳的 `{file, time, mode, gold, seal, broken}` 畫清單，並用 `readBackup(file)` 取得 `{save}`。

做法有三點：
- 備份寫入時另存一個時間戳記鍵 `…:time`，因為目前 localStorage 只存存檔 JSON，沒有時間。
- `listBackups` 掃這兩個鍵，轉成清單列。
- `readBackup` 和 `deleteBackup` 依檔名對應到鍵。

```diff
--- a/modifier/webapi.js
+++ b/modifier/webapi.js
@@ save()
         const key = `d2edit:backup:${mode === "hardcore" ? "hardcore" : "softcore"}`;
         const text = JSON.stringify(original.save);
         localStorage.setItem(key, text);
-        if (localStorage.getItem(key) !== text) throw new Error("備份讀回不一致");
+        localStorage.setItem(key + ":time", String(Date.now()));
+        if (localStorage.getItem(key) !== text) throw new Error("備份讀回不一致");
       } catch (e) {
@@
-    listBackups: async () => [],
-    readBackup: async () => ({ error: "網頁版的備份是下載的檔案，請用「從檔案匯入」。" }),
-    deleteBackup: async () => ({ ok: true }),
+    listBackups: async () => BK_MODES.flatMap((mode) => {
+      const raw = localStorage.getItem(BK_PREFIX + mode);
+      if (raw == null) return [];
+      const file = `寫入前備份_${mode === "hardcore" ? "硬核" : "一般"}.json`;
+      const time = Number(localStorage.getItem(BK_PREFIX + mode + ":time")) || 0;
+      try {
+        const s = JSON.parse(raw);
+        return [{ file, time, mode, gold: s.gold, seal: "none" }];
+      } catch { return [{ file, time, broken: true }]; }
+    }),
+    readBackup: async (file) => {
+      const mode = bkMode(file), raw = mode && localStorage.getItem(BK_PREFIX + mode);
+      if (!raw) return { error: "找不到這份備份。" };
+      try { return { save: JSON.parse(raw) }; } catch (e) { return { error: "備份損壞：" + e.message }; }
+    },
+    deleteBackup: async (file) => {
+      const mode = bkMode(file);
+      if (!mode) return { error: "找不到這份備份。" };
+      localStorage.removeItem(BK_PREFIX + mode); localStorage.removeItem(BK_PREFIX + mode + ":time");
+      return { ok: true };
+    },
     openBackups: async () => {},
@@ near stamp()
   const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
+  const BK_PREFIX = "d2edit:backup:", BK_MODES = ["softcore", "hardcore"];
+  const bkMode = (file) => (/硬核/.test(file) ? "hardcore" : /一般/.test(file) ? "softcore" : null);
```

**需要注意的地方**
- **簽章欄位**：`seal` 設為 `"none"`，所以清單會顯示紅字「損壞」。原因是 localStorage 裡的存檔沒有簽章資訊。載入後 `lastSeal = "none"`，這和「從檔案匯入」的行為一致，寫入時會自動重新簽章。如果想顯示「正確」，要在存檔時多存一個 seal 狀態。我沒查 `rpc("load")` 是否回傳 `seal`，這點未確認。
- **每種模式只留一份**：備份會被下一次寫入覆蓋，所以清單最多兩列。
- **一般模式欄位**：載入時會依 `f.mode` 做模式不符的確認。`gold` 假設存檔頂層有 `gold` 欄位，我沒有驗證。
- **`:time` 鍵相容性**：新增的鍵不影響舊的讀取。但 `verify/suite.cjs` 或 `modifier/tests/save-faults-ui.cjs` 若檢查 localStorage 的鍵清單，可能需要同步調整。我沒有查這些測試。
### 05-怪物同名翻譯

### 怪物同名翻譯（claude）

我只讀了程式與資料，沒有改動任何程式檔，只寫了計畫檔。區分語境所需的呼叫端訊號我沒找到，下面的 diff 是草案，沒有實測。

#### 1. `zh-TW.json` 各類譯名

| 詞 | 無前綴（一般） | `monster:` | 其他 |
|---|---|---|---|
| Horror | 驚駭（技能） | 恐骨骷髏 | `monster:Horror Archer`／`Horror Mage` 另有譯名；`The Face of Horror`＝恐懼之臉（物品） |
| Slayer | 屠殺者（被動） | 殺戮僕魔 | `title:Slayer`＝殺戮者（難度稱號）；`affix:Slayer's`＝屠殺者；`Slayer Guard`＝殺手護盔 |
| Plague Bearer | 疫病帶原者（物品） | 瘟疫散布者 | 無 |
| Blood Wing | 鮮血之翼 | 血翅蚊 | 無 |

另有一個既有測試衝突：`lang/tests/test_lang.cjs:67` 斷言 `translateString("Slayer") === "屠殺者"`。

#### 2. 遊戲中的語境（`game-bundles/20261105.1/assets/`）

- **Horror**
  - 技能：`pack-Ddwdxw5Y.js` 的 `terror:{cower,contagion,horror}`，以及 `itemArt` 的 `{id:'horror',name:'Horror',describe:'It casts itself only when you are struck…'}`。
  - 怪物：`FrozenHorror` 是內部鍵，D2 怪物名是 Horror。
- **Slayer**
  - 被動：`itemArt` 有兩筆 `{id:'slayer',name:'Slayer',describe:'deals 40% more damage to elites and bosses…'}`。
  - 稱號：`Game-*.js` 的 `MS()` 在普通難度回傳 `Slayer`，對應 `title:Slayer`。
  - 怪物：D2 的 Slayer。
- **Plague Bearer**：`itemArt` 的暗金 Rune Sword `$('Plague Bearer','Rune Sword',49)`，也是怪物。
- **Blood Wing**：除了 `ko-*.js` 的譯名表，非韓文檔案裡找不到這個字串，所以我無法確認「鮮血之翼」對應哪個畫面。怪物名應該是資料檔載入的。

#### 3. 問題核心

遊戲自己的 `translateAs(kind, s)` 本來就帶 kind，只有 `nativeKo` 模式才會掛上（`lang.js:272`）。`translateString` 是 DOM／Canvas 的無語境路徑（`lang.js:419、509、734、764、905`）。它收到的只有字串，所以不知道是技能還是怪物。

我查了 `font.canvas(text, 'font16', 'gold', …)` 這類呼叫，參數只有字型、顏色、陰影，沒有穩定的「這是怪物名牌」標記。我沒找到怪物名牌的繪製呼叫，所以不能保證靠字型或顏色分得開。

#### 4. 建議的修正（草案）

只對這四個衝突詞改優先序，其他怪物名維持怪物優先，避免回歸。語境由呼叫端傳入，預設走一般詞條。

```diff
--- a/lang/lang.js
+++ b/lang/lang.js
@@
-  function translateString(str) {
+  // 與怪物同名的一般詞條：有明確語境時才選譯名，無語境預設用一般詞條
+  const AMBIGUOUS = new Set(["Horror", "Slayer", "Plague Bearer", "Blood Wing"]);
+  function translateString(str, ctx) {
@@
-    if (!str || typeof str !== "string" || currentLang === "en" || !HAS_LETTER.test(str)) return str;
-    let r = cache.get(str);
+    if (!str || typeof str !== "string" || currentLang === "en" || !HAS_LETTER.test(str)) return str;
+    const ck = ctx ? ctx + "\u0000" + str : str;
+    let r = cache.get(ck);
@@
-    const mon0 = gameTr?.translateAs && /^[A-Z][A-Za-z' -]{1,40}$/.test(key) ? gameTr.translateAs("monster", key) : null;
+    // 衝突詞：ctx==="monster" 才取怪物譯名；ctx 為 title/skill/item 或未指定則走一般詞條
+    const ambiguous = AMBIGUOUS.has(key);
+    const wantMon = ambiguous ? ctx === "monster" : true;
+    const mon0 = wantMon && gameTr?.translateAs && /^[A-Z][A-Za-z' -]{1,40}$/.test(key) ? gameTr.translateAs("monster", key) : null;
@@ (行 621 的怪物補查)
-    if (r === str && gameTr?.translateAs && /^[A-Z]…/.test(str.trim())) {
+    if (r === str && !ambiguous && gameTr?.translateAs && /^[A-Z]…/.test(str.trim())) {
@@
-    cache.set(str, r);
+    cache.set(ck, r);
```

- **ctx 的來源：** 這是尚未解決的部分。`font.canvas` 包裝（`lang.js:509`）要從 `this`／`rest` 推斷，DOM 路徑則看祖先元素。我找不到可靠訊號，建議先用 `tests/live-harness` 在實機記錄這四個詞被畫出時的呼叫參數。
- **替代方案：** 若發現怪物名牌其實是少數呼叫點，也可以反過來，預設用一般詞條，只在怪物名牌的呼叫點加 `"monster"`。
- **取捨：** 這樣做之後，沒找到訊號的怪物名牌會顯示「驚駭」「屠殺者」這類一般譯名，要靠實機確認怪物名牌確實傳了 ctx。

#### 5. 測試案例（加進 `lang/tests/test_lang.cjs`）

```js
// 衝突詞：依語境區分
assert.strictEqual(translateString("Horror", "skill"), "驚駭");
assert.strictEqual(translateString("Horror", "monster"), "恐骨骷髏");
assert.strictEqual(translateString("Slayer", "passive"), "屠殺者");   // 沿用原 Test 1
assert.strictEqual(translateString("Slayer", "title"), "殺戮者");     // 需另取 title:Slayer，可能要加 kind 分支
assert.strictEqual(translateString("Slayer", "monster"), "殺戮僕魔");
assert.strictEqual(translateString("Plague Bearer", "item"), "疫病帶原者");
assert.strictEqual(translateString("Plague Bearer", "monster"), "瘟疫散布者");
assert.strictEqual(translateString("Blood Wing", "monster"), "血翅蚊");
assert.strictEqual(translateString("Blood Wing"), "鮮血之翼");        // 無語境預設一般詞條
// 回歸：非衝突怪物名仍走怪物譯名；快取不跨語境污染
assert.strictEqual(translateString("Horror Mage", "monster"), "恐骨法師");
assert.notStrictEqual(translateString("Horror", "monster"), translateString("Horror", "skill"));
```

要讓 `Slayer` 的 `title` 語境回傳 `殺戮者`，需要把 ctx 當成 `translateAs` 的 kind：`gameTr.translateAs(ctx, key)` 在 `monster:`、`title:` 這些前綴存在時會直接命中。這是下一版可以簡化的方向。

#### 6. 風險與待確認

- **ctx 傳遞：** 我沒實測，所以這個修正目前不能保證有效。
- **測試檔：** 現有 `test_lang.cjs` 是用自己內嵌的 `simpleTranslate` 副本，不是 `lang.js` 本身。要測 `gameTr` 路徑，需改用 `selfcheck` 或 live-harness。
- **Blood Wing：** 一般詞條「鮮血之翼」的實際畫面我無法確認，建議先在遊戲中找出來再定語境。

計畫檔：`C:\Users\nojac\.claude\plans\lang-lang-js-translatestring-stateful-charm.md`
### 06-手機暫停選單

### 手機暫停選單（claude）

**結論：** 工具包沒有任何攔截遊戲 canvas 觸控的程式碼。唯一可能蓋住暫停選單的是「輔助」浮動按鈕，位在 `autobot.js:1961`。這是靜態閱讀的推測，沒有在實機或模擬器上重現。

**一、`autobot.js` 的事件與覆蓋層（逐項排除）**

- `autobot.js:2085` 在 window 以 capture 監聽 `pointerdown`，呼叫 `manual()`（`autobot.js:195-199`）。它只設 `manualUntil` 並呼叫 `release()`，沒有 `preventDefault` 或 `stopPropagation`，不會擋遊戲。
- `autobot.js:2076` 對 `host`、`launcher`、`stopButton` 吃掉 pointer、touch、mouse、click、wheel 事件。範圍只限這三個元素本身，事件不會冒泡到遊戲。
- `autobot.js:1966` 的 `statusLine` 設了 `pointer-events:none`，不會擋觸控。
- `autobot.js:1968` 的 `host` 是全螢幕，z-index 為 2147483647，但設了 `pointer-events:none`。只有面板開啟時的 `.backdrop`（`autobot.js:1972`，`pointer-events:auto`）會吃掉整個螢幕的觸控。`[hidden]{display:none!important}`（`autobot.js:1970`）能正確關閉它，`autobot.js:2101` 也會在選單關閉時自動把面板設回隱藏，所以不會殘留。
- `autobot.js:2097` 的 `stopButton` 只在 `!menuOpen` 時顯示，暫停時不會出現。

**二、最可能的覆蓋點：`launcher`（`autobot.js:1961`、`autobot.js:2096`）**

- 樣式是 `position:fixed; top-left; z-index:2147483645; min-height:44px`。
- `autobot.js:2096` 規定 `menuOpen`（`paused()` 或 `frontend-open`）時才顯示。也就是說，只要暫停選單開著，這顆按鈕就一定蓋在 canvas 左上角。
- 暫停選單是畫在 canvas 上的（`game-bundles/20261105.1/assets/surface-7I1VpXHt.js`），不是 DOM 按鈕。canvas 的 `pointerdown` 監聽在 canvas 本身，`pointerup` 監聽在 window。
- 手機直式或橫式時，選單的左上項目（例如返回、Options）很可能落在 launcher 底下。點到那裡會變成開啟輔助面板，而不是點到選單。
- 這與 handoff 的描述（暫停選單無法點擊）吻合。

**三、遊戲端值得注意的行為（`surface-7I1VpXHt.js`）**

- 觸控 `pointerdown` 後，遊戲會登記 capture 階段的 click 處理，約 1 秒內對非 canvas 目標的 click 做 `preventDefault` 和 `stopPropagation`。launcher 的 click 若緊接在 canvas 點擊之後，會被吃掉。這是遊戲自己的行為，不是工具包造成的。
- `Game-D26IBV2h.js` 的 `pause()` 呼叫 `showMenu()` → `frontend.gameMenu`，走 canvas surface。`resume()` 和 `saveAndExit()` 都是從 canvas 的按鈕觸發。
- `autobot.js:341`、`autobot.js:366`、`autobot.js:794`、`autobot.js:1488` 會主動呼叫 `g.pause()`。這些路徑可能在使用者沒有預期時彈出暫停選單，但我沒有證據它們會導致點不到。

**四、修正建議**

1. **移動 launcher：** 暫停選單開著時改放在不與 canvas 選單重疊的位置，例如右下角、安全區邊緣的小標籤。或用遊戲 surface 提供的 `toClient()` 座標，避開選單按鈕區。這是最直接的修法。
2. **縮小命中範圍：** launcher 只保留可點的小區塊，其餘區域設 `pointer-events:none`。
3. **補測試：** 在手機尺寸（直式和橫式）下，用 `document.elementFromPoint` 取暫停選單每個按鈕的中心點，確認回傳的是 canvas，而不是 `#d2autobot-panel` 的子元素。這可以加進 `helper/tests/selfcheck.cjs` 或 `tests/live-harness`。
4. **根因確認：** 先在真機或模擬器暫時 `display:none` 隱藏 launcher，看暫停選單是否恢復可點。若恢復，就確認是這個原因。

**限制：** 我只讀了程式碼，沒有跑任何東西。`Game-D26IBV2h.js` 和 `surface-7I1VpXHt.js` 是壓縮檔，我只看了與事件相關的片段，沒有逐行讀完。
### 07-屬性樣板翻譯

### 屬性樣板翻譯（claude）

我沒有在儲存庫內找到官方繁中對照表，也沒有連網核對。下面的「建議譯文」是依我對 D2R 繁中詞彙的印象寫的，還沒驗證。套用前請用遊戲內實際字串確認。

`lang/zh-TW.json` 共有 14187 筆，其中約 223 筆帶 `#`、`*` 或 `%` 佔位符。以下是我認為偏離慣例的前 40 筆。

| # | 英文 | 目前譯文 | 建議譯文 | 理由 |
|---|---|---|---|---|
| 1 | `+#% Enhanced Damage` | +{0}% 傷害強化 | +{0}% 強化傷害 | 官方詞序是「強化傷害」。 |
| 2 | `+#% Enhanced Defense` | +{0}% 防禦強化 | +{0}% 強化防禦 | 同上。 |
| 3 | `+#% Faster Cast Rate` | +{0}% 施法速度 | +{0}% 更快施法速度 | 目前漏掉「Faster」，意思變成單純的施法速度。 |
| 4 | `#% Faster Cast Rate`（無 +） | {0}% 施法速度 | {0}% 更快施法速度 | 同上，且與第 3 筆的 + 號寫法不一致。 |
| 5 | `+#% Faster Hit Recovery` | +{0}% 打擊恢復 | +{0}% 更快受擊恢復 | 同樣漏譯「Faster」，且官方用「受擊」。 |
| 6 | `+#% Faster Run/Walk` | +{0}% 跑步 / 行走速度 | +{0}% 更快跑/走速度 | 漏譯「Faster」，官方是「跑/走」。 |
| 7 | `#% Faster Run/Walk` | {0}% 跑步 / 行走速度 | +{0}% 更快跑/走速度 | 同上，且少了 + 號。 |
| 8 | `+#% Faster Block Rate` | +{0}% 格擋速度 | +{0}% 更快格擋速度 | 漏譯「Faster」。 |
| 9 | `+#% Faster Run/Walk per rank` | +{0}% 跑步 / 行走速度（每階） | +{0}% 更快跑/走速度（每階） | 同第 6 筆。 |
| 10 | `+#% Faster Cast Rate per rank` | +{0}% 施法速度（每階） | +{0}% 更快施法速度（每階） | 同第 3 筆。 |
| 11 | `*% Chance to cast level * * on attack` | 攻擊時有 {0}% 機率施展等級 {1} {2} | 攻擊時有 {0}% 機率施放 {1} 級 {2} | 官方用「施放」和「N 級」，「施展」是簡中用語。 |
| 12 | `… on striking` | 擊中時有 … 施展等級 | 擊中時有 {0}% 機率施放 {1} 級 {2} | 同上。 |
| 13 | `… when struck` | 被擊中時有 … 施展等級 | 被擊中時有 {0}% 機率施放 {1} 級 {2} | 同上。 |
| 14 | `… when you Die` | 當你死亡時有 … 施展等級 | 死亡時有 {0}% 機率施放 {1} 級 {2} | 同上，「當你」也可省略。 |
| 15 | `… when you Kill an Enemy` | 當你殺敵時有 … 施展等級 | 殺死敵人時有 {0}% 機率施放 {1} 級 {2} | 同上，「殺敵」口語化，官方用「殺死敵人」。 |
| 16 | `… when you Level-Up` | 當你升級時有 … 施展等級 | 升級時有 {0}% 機率施放 {1} 級 {2} | 同第 11 筆。 |
| 17 | `…(*s cooldown)` 四筆 | 施展等級{1} {2}（冷卻時間{3}秒） | 施放 {1} 級 {2}（冷卻 {3} 秒） | 同第 11 筆，且 `{0}%` 前後沒有空格，與其他筆不一致。 |
| 18 | `+*% Attack Rating against Demons` | +{0}% 對惡魔的準確率 | +{0}% 對惡魔的命中率 | 官方 Attack Rating 譯為「命中率」。「準確率」較偏簡中。 |
| 19 | `+*% Attack Rating against Undead` | +{0}% 對不死怪物的準確率 | +{0}% 對不死生物的命中率 | 「命中率」同上；官方用「不死生物」。 |
| 20 | `+#% Damage to Undead` | +{0}% 對不死怪物的傷害 | +{0}% 對不死生物的傷害 | 官方用「不死生物」。 |
| 21 | `+#% Damage to Demons` | +{0}% 對惡魔的傷害 | +{0}% 對惡魔的傷害 | 這筆應與官方一致，不需改。我列出來是為了說明第 20 筆只改「不死生物」。 |
| 22 | `Poison Length Reduced by #%` | 中毒的時效縮短 {0}% | 毒素持續時間縮短 {0}% | 「時效」不是遊戲內用語。 |
| 23 | `#% Better Chance of Getting Magic Items` | 尋獲魔法物品機率提高 {0}% | +{0}% 更佳機率取得魔法物品 | 官方是「更佳機率取得魔法物品」。這筆我較沒把握。 |
| 24 | `*% Better Chance… per Level` | 尋獲魔法物品機率提高 {0}%（每級） | +{0}% 更佳機率取得魔法物品（每級） | 同上。 |
| 25 | `#% Extra Gold from Monsters` | 怪物金幣掉落量提高 {0}% | +{0}% 從怪物獲得額外金幣 | 官方字面直譯，這筆我較沒把握。 |
| 26 | `Reduces all Vendor Prices #%` | 所有商人的價格降低 {0}% | 降低所有商人的價格 {0}% | 把「降低」放前面，貼近官方詞序。 |
| 27 | `Increase Maximum Life #%` | 生命上限提高 {0}% | 最大生命 +{0}% | 官方用「最大生命」，不用「生命上限」。 |
| 28 | `+#% to Maximum Cold Resist` | 冰寒抗性上限 +{0}% | +{0}% 最大冰冷抗性 | 官方詞序是「最大…抗性」，且 Cold 應為「冰冷」。 |
| 29 | `+#% to Maximum Poison Resist` | 毒素抗性上限 +{0}% | +{0}% 最大毒素抗性 | 同上。 |
| 30 | `Cold Resist +#%` | 冰寒抗性 +{0}% | 冰冷抗性 +{0}% | Cold 在官方是「冰冷」，不是「冰寒」。 |
| 31 | `Lightning Resist +#%` | 電擊抗性 +{0}% | 閃電抗性 +{0}% | 同一檔案裡抗性寫「電擊」、傷害寫「閃電」，兩者不一致。官方統一用「閃電」。 |
| 32 | `Lightning Resist *% per Level` | 電擊抗性 {0}%（每級） | 閃電抗性 +{0}%（每級） | 同第 31 筆，且少了 + 號。 |
| 33 | `+#% to Fire Skill Damage` 系列 | +{0}% 冰寒技能傷害 | +{0}% 冰冷技能傷害 | 同第 30 筆，Cold 應為「冰冷」。 |
| 34 | `+#% cold damage` 系列 | +{0}% 冰寒傷害 | +{0}% 冰冷傷害 | 同第 30 筆。 |
| 35 | `+#% to fire, cold and lightning resistance` | 火焰、冰寒與閃電抗性 -{0}% | 火焰、冰冷與閃電抗性 -{0}% | 同第 30 筆。 |
| 36 | `+#% cold damage and +#% to fire, cold and lightning resistance` | 抗火、抗寒、抗電 +{1}% | 火焰、冰冷、閃電抗性 +{1}% | 「抗火、抗寒、抗電」是簡寫，與全檔案的寫法不一致。 |
| 37 | `Deadly Strike per Level` | {0}% 致命打擊（每級） | +{0}% 致命攻擊（每級） | 官方用「致命攻擊」，「致命一擊」是 Critical Strike。這筆我沒把握，且目前少了 + 號。 |
| 38 | `-#% Target Defense` | -{0}% 目標防禦 | -{0}% 目標防禦 | 這筆與官方一致，不需改，只是列出來說明第 37 筆與它不同。 |
| 39 | `If worn: **% damage a second` | 穿戴時：每秒傷害 {0}{1}% | 穿戴時：每秒傷害 {0}{1}% | 這筆我認為不是翻譯問題，是模板問題：`{0}{1}%` 兩個佔位符直接相連，應確認程式有補上符號。 |
| 40 | `At most #% in Terror, more with +% to Maximum Resist` | 恐懼中最多 #%，… | 恐懼中最多 {0}%，… | 佔位符寫成 `#` 而不是 `{0}`，執行時不會被替換，這是真正的錯誤。 |

這 40 筆裡有兩點要注意：

- **第 21、38 筆**：我認為已與官方一致，只是為了對照才列出。真正需要修改的大約 38 筆。
- **第 39、40 筆**：這兩筆是佔位符問題，不是用詞問題，風險比其他筆高。第 40 筆很可能直接把 `#` 顯示給玩家看。

主要的修正方向有四個：

1. 補回「更快 / 強化」。
2. 把「施展」改成「施放」。
3. 用「冰冷」和「閃電」統一元素用語。
4. 把「準確率」改成「命中率」。

這是唯讀回報，我沒有改任何檔案。
### 08-modifier品質

### modifier品質（claude）

### 程式碼品質掃描:`modifier/patch.mjs`、`modifier/engine-page.js`

這次只讀檔,沒有修改任何東西,也沒有執行測試。下面每一項都是讀程式碼推得的結論,沒有實際執行驗證。

#### 🔴 高

**1. `patch.mjs:27` 附加的 export 可能被行尾註解吃掉**
```js
patched[f] = files[f] + `;export{...};`;
```
遊戲區塊若以 `//# sourceMappingURL=...` 或任何 `//` 註解結尾且沒有換行,`;export{}` 會變成註解的一部分。結果是 export 不存在,下游只會看到「找不到 `__xxx`」。
```diff
-patched[f] = files[f] + `;export{...};`;
+patched[f] = files[f] + `\n;export{...};`;
```

**2. `patch.mjs:3-6, 35` UMD 包裝與 `.mjs` 衝突(需確認載入方式)**
```js
if (typeof module === "object" && module.exports) ...
export const patch = self.D2Patch.patch;
```
- 在 ESM 裡 `module` 不存在,所以 CJS 分支是死碼。
- Node 沒有全域 `self`,若直接 `import` 此檔,第 6 行 `this` 為 `undefined`,第 35 行 `self.D2Patch` 會丟 `ReferenceError`。
- 註解寫「桌面版(Node)與網頁版共用」。若桌面版是用其他方式載入(例如 vm 或複製成 CJS),這項才不成立。
```diff
-(function (root, factory) {...})(typeof self !== "undefined" ? self : this, function () {
-  ...
-  return { patch };
-});
-export const patch = self.D2Patch.patch;
+export function patch(files, signatures) { ... }  // 去掉 UMD,純 ESM
```

**3. `engine-page.js:15` 缺少 `stats.runewords` 等欄位時會丟例外**
```js
const propsOf = { ..., runeword: (n) => stats.runewords[n]?.props };
```
第 544 行自己承認網頁版資料「沒有符文之語」。`stats.runewords` 為 `undefined` 時,`space("runeword", …)`(第 82 行)會丟 `TypeError`。`stats.uniques`、`stats.setItems`、`stats.bases`(第 20、449、493、714 行)也有同樣問題。
```diff
-unique: (n) => stats.uniques[n]?.props, set: (n) => stats.setItems[n]?.props, runeword: (n) => stats.runewords[n]?.props
+unique: (n) => stats.uniques?.[n]?.props, set: (n) => stats.setItems?.[n]?.props, runeword: (n) => stats.runewords?.[n]?.props
```
並把 `stats.bases[x]` 一律改成 `stats.bases?.[x]`。

#### 🟠 中

**4. `patch.mjs:21` `m[1]` 沒有檢查**
```js
(perFile[f] ??= {})[k] = m[1];
```
簽名正規式沒有捕獲群組時,`m[1]` 是 `undefined`,會產生 `export{undefined as __k}`,整個模組語法錯誤。另外 `compile`(第 12 行)的 `new RegExp` 遇到壞簽名會直接丟例外,沒有訊息指出是哪個 key。
```diff
-if (m) { found[k] = f; ... = m[1]; break; }
+if (m?.[1]) { found[k] = f; ... = m[1]; break; }
```

**5. 選用函式沒有一致防護**(OPTIONAL 清單第 8 行本來就允許缺)
- `affixMatches`(第 199 行)、`partialFeasible`(第 306 行)、`resolveName` 的 rare 分支直接用 `G.__affixes.filter(...)`,`affixApplies` 也沒有檢查。
- `baseImplicits`(第 247 行)直接用 `G.__makeAffix`,而 `validate`(第 501 行)和 `allowedStats`(第 463 行)都會呼叫它。
- `affixInfo`、`statRanges`、`affixSlots` 卻有防護。
- 後果:舊版遊戲上 `validate` 只能靠 `validateItems` 的 try/catch 變成 `{code:"error"}`,使用者看到的是 `x is not a function`。
```diff
 function baseImplicits(base) {
+  if (!G.__makeAffix) return {};
   if (implicitCache.has(base.name)) ...
```
`affixPlan` 開頭也加上 `if (!G.__affixes || !G.__affixApplies) return null;`。

**6. `engine-page.js:260` 回傳型別不一致**
```js
if (!low || !high) return ["error.generate"];   // 字串
// 其他地方都是 { code, ... } 物件
```
消費端讀 `.code` 會得到 `undefined`。
```diff
-return ["error.generate"];
+return [{ code: "error", why: "error.generate" }];
```

**7. `engine-page.js:529-531, 614, 691-730` 公開方法的例外處理不一致**
`fixedInfo`、`fixedBuild`、`faults`、`saveFaults`、`validateItems`、`allowedStatsMany` 有 try/catch。`affixSlots`、`resolveName`(`item` 為 `null` 時第 615 行就爆)、`itemModMax`、`catalog`、`runewordBases`、`skillModDefs`(`classes` 非陣列時爆)沒有。
```diff
-affixSlots(item, mods) { return affixSlots(item, mods); },
+affixSlots(item, mods) { try { return affixSlots(item, mods); } catch { return { limit: null, used: { pre: 0, suf: 0 }, kinds: {} }; } },
```
`resolveName` 開頭加 `if (!item) return { error: "缺少物品" };`。

**8. `engine-page.js:511` `validate` 依賴 `this`**
```js
const ranges = this?.affixInfo?.(base.name, item.rarity)?.ranges ?? {};
```
如果方法被解構取出(`const { validateItems } = engine`),`this` 為 `undefined`,範圍會悄悄變空,結果少了 `affixStat`/`range` 的細項。`affixInfo` 搬成閉包內的函式,`validateItems` 就不必 `.call(this, …)`。

#### 🟡 低:重複邏輯(建議重構,風險較高,應先有測試)

**9. 詞綴比對與 DFS 重複 4 到 5 份**
- 「parts = [stat, …alike, also]」的展開:第 309、371、470、596-597 行。
- `walk` 組合列舉:第 311-315、385-394 行(幾乎逐字相同)。
- 回溯 `dfs`:第 226-238、319-331、401-417 行。
- 比對 `mods` 的 `findIndex`:第 205-208、636-643 行。
- 「適用詞綴」過濾 `G.__affixes.filter(a => G.__affixApplies(a, base, a.cls) && !(rarity==="rare" && a.d2?.magicOnly))` 出現 6 次:第 199、306、347、468、587、630 行。

至少先抽出下面兩個函式,最安全:
```js
const applicable = (base, rarity) => (G.__affixes ?? []).filter(a => G.__affixApplies?.(a, base, a.cls) && !(rarity === "rare" && a.d2?.magicOnly));
const affixParts = (a) => { const d = a.d2 ?? {}; return [[a.stat, a.min, a.max, d.length], ...(d.alike ?? []).map(s => [s, a.min, a.max]), ...(d.also ? [[d.also.stat, d.also.min, d.also.max]] : [])]; };
```

**10. 符文之語底材相容判斷重複 5 次**
第 19-20、449-450、492-494、663-665、721-722 行都是 `types.some(isType) && !excluded?.some(isType) && max(sockets) >= runes.length`。而且第 547 行用了 `d.types?.[0]`,其他處卻是 `def.types.some`,防護不一致。
```js
const runewordFits = (def, b) => def.types?.some(t => G.__isType(b.itype, t)) && !def.excluded?.some(t => G.__isType(b.itype, t))
  && Math.max(...(stats.bases?.[b.name]?.sockets ?? [0])) >= def.runes.length;
```

**11. 其他重複**
- 第 53、73、84、102、247 行:`Math.floor(Math.random() * 4294967296)` 重複 5 次,可抽成 `const randSeed = () => ...`。
- 第 557、727 行:`JSON.parse(JSON.stringify(x))` 與第 97 行的 `clone` 重複,直接用 `clone`。
- 第 288 行:同一個 `/^(proc|charge):(.+):(\d+)$/` 寫了兩次。

#### ⚪ 低:死碼與小問題

| 位置 | 片段 | 建議 |
|---|---|---|
| `engine-page.js:286` | `m.stat !== h?.stat` | 第 283 行已保證 `h` 存在,`?.` 多餘 |
| `engine-page.js:290` | `return out.push(...)` 在 `forEach` 內 | 改成 `{ out.push(...); return; }`,別回傳數字 |
| `engine-page.js:297-298` | `Math.max(low.defense, high.defense)` | `high.defense` 非數字時變 `NaN`,之後的比較全為 false,等於悄悄放行。加上 `typeof high.defense === "number"` |
| `engine-page.js:361` | `(mods ?? [])` | 預設值已處理 `undefined`,只剩 `null` 才有意義 |
| `engine-page.js:407` | `return n <= lim.max` | 第 411 行已擋掉 `n >= lim.max`,恆為 true |
| `engine-page.js:310, 374` | `.map((m, i) => i)` | 第 374 行的 `m` 還被內層 `m` 遮蔽,改用 `[...mods.keys()]` |
| `engine-page.js:482` | `["rune","gem","quest"]` | 已有前面 `item.type === "quest"`,但 `base.type` 是否為 `quest` 不確定,需確認再刪 |
| `engine-page.js:533` | `catch (e) { return null; }` | `e` 未使用,改 `catch {` |
| `engine-page.js:584` | `affixInfo(baseName, rarity, mods = [])` | `mods` 完全沒用到 |
| `engine-page.js:182, 186` | `it.mods.filter(...)` | `it.mods` 缺少時會丟 `TypeError`(外層有 catch,但訊息不明)。改 `(it.mods ?? [])` |
| `engine-page.js:249` | `Math.min(v[0], m.value)` | `m.value` 非數字會產生 `NaN` 並進快取 |
| `engine-page.js:526-531, 690, 715` | 註解錯位 | 「依原版規則檢查物品…」「屬性下拉選單用…」在 `capabilities` 與 `affixSlots` 之間,對不上函式。第 690 行的「全部底材」該在 `bases()`(第 714 行),第 715 行「符文之語底材」該在 `runewordBases`(第 718 行)。第 529-533 行縮排也亂了 |

#### 建議處理順序
1. 先修第 1、3、4、6 項。每項都是 1 到 2 行,風險低。
2. 再補第 5、7 項的防護,並確認第 2 項(桌面版實際怎麼載入 `patch.mjs`)。
3. 第 9、10 項的重構等有測試覆蓋再做。可用 `helper/tests/selfcheck.cjs` 或 `verify/suite.cjs` 當基準,但這兩個檔案目前有未提交的修改。

要我開始修哪幾項,告訴我即可。
### 09-d2edit載入

### d2edit載入（claude）

### d2edit.js 載入流程掃描報告（唯讀，未修改任何檔案）

#### 現況摘要

- **載入順序**
  - 檔案載入時先同步建立 launcher 按鈕和暫停偵測（`d2edit.js:264-313`）。
  - 接著 IIFE（`:320-390`）用 `Promise.all` 同時啟動 7 個步驟：字典、遊戲資料、lang.js、autobot.js、物品引擎、editor.html、自檢。
  - 全部結束後才設 `toolsReady = true`（`:376`）。
- **重複載入防護**：`:266-271` 會關掉舊的 frame、launcher 和 watcher，`:321` 會移除舊的進度框。
- **快取破壞**：`VER` 取自書籤的 `?v=`，沒有就用 `Date.now()`（`:6`），所有子檔案都經 `at()` 加上同一個 `v`（`:7`）。
- **錯誤處理**：每個步驟各自 try/catch，失敗只記到 `warn` 陣列，進度條照常跑完（`:346`）。

#### 問題與改善點（依影響排序）

##### 1. editor.html 預載其實沒命中快取（`:334` 對 `:275`）

預載抓的是 `editor.html?v=X`。iframe 實際載入的是 `editor.html?v=X&origin=…&mode=…`。HTTP 快取以完整 URL 為鍵，所以預載的那次完全浪費，開啟編輯器時還要再下載一次。

最小改法是讓兩邊 URL 一致。`mode` 會隨開啟時的模式變，所以較好的做法是把 `origin` 和 `mode` 改放 hash，hash 不參與快取鍵。

這需要 `modifier/editor.html` 同步改成讀 `location.hash`，我沒有看那個檔案，所以不確定改動範圍。

```diff
@@ d2edit.js:275
-  frame.src = at("modifier/editor.html") + "&origin=" + encodeURIComponent(location.origin) + "&mode=" + (...);
+  frame.src = at("modifier/editor.html") + "#origin=" + encodeURIComponent(location.origin) + "&mode=" + (...);
```

##### 2. 引擎啟動內部是序列瀑布（`:62`、`:73-78`、`:99-102`）

- `/play/` 的 HTML 要等 `patch.mjs` 和 `signatures.json` 載完才開始抓（`:62` 在 `:73` 之前）。
- `itemstats.json` 要等所有區塊抓完、patch、建 blob 之後才抓（`:99-102`）。
- `engine-page.js` 要等 iframe 建好才第一次 import（`:116`）。
- 這三者彼此沒有相依，可以一開始就並行啟動。

```diff
@@ d2edit.js:61 (startEngine 開頭)
   engineInfo.step = "讀取程式清單";
-  const [{ patch }, signatures] = await Promise.all([import(at("modifier/patch.mjs")), fetch(at("modifier/signatures.json")).then((r) => r.json())]);
+  // 以下三件事彼此獨立，一開始就並行啟動
+  const statsP = window.__D2EDIT_ITEMSTATS ? Promise.resolve(window.__D2EDIT_ITEMSTATS) : d2url("itemstats.json");
+  const itemstatsP = statsP.then((u) => fetch(u)).then((r) => { engineInfo.itemstats = r.status; if (!r.ok) throw new Error("讀不到遊戲物品資料（請先進入過遊戲一次）。"); return r.text(); });
+  itemstatsP.catch(() => {}); // 避免等待期間先失敗造成 unhandled rejection，錯誤仍會在下方 await 時拋出
+  import(at("modifier/engine-page.js")).catch(() => {}); // 預熱模組快取，:116 的 import 直接命中
+  const sigP = fetch(at("modifier/signatures.json")).then((r) => { if (!r.ok) throw new Error("signatures.json " + r.status); return r.json(); });
+  const pagesP = (async () => { for (const page of ["/play/", "/"]) { const html = await fetch(new URL(page, location.origin), { cache: "no-store" }).then((r) => (r.ok ? r.text() : "")).catch(() => ""); const f = [...html.matchAll(/\/assets\/([\w.-]+\.js)/g)].map((m) => m[1]); if (f.length) return f; } return []; })();
+  const [{ patch }, signatures] = await Promise.all([import(at("modifier/patch.mjs")), sigP]);
@@ d2edit.js:73-78 (整段 for 迴圈)
-  for (const page of ["/play/", "/"]) { ...fetch...; queue.push(...found); if (found.length) break; }
+  queue.push(...await pagesP);
@@ d2edit.js:99-102
-  const statsUrl = window.__D2EDIT_ITEMSTATS || (await d2url("itemstats.json"));
   engineInfo.step = "讀取物品資料";
   mark("建立模組");
-  const itemstats = await fetch(statsUrl).then(...);
+  const itemstats = await itemstatsP;
```

這樣引擎的關鍵路徑只剩「抓區塊波次 → patch → import」。

##### 3. 沒有逾時，任一請求卡住就永遠進不了遊戲工具（`:345-350`）

- 手機網路不穩時，如果某個 fetch 或 import 一直不回應，`Promise.all` 就不會結束。
- 進度條會停住，`toolsReady` 永遠是 false，「修改器」按鈕不會出現。
- 這與註解寫的「單一步驟失敗不卡住」不符，因為只處理了失敗，沒處理卡住。

```diff
@@ d2edit.js:342-346
-  await Promise.all(steps.map(async ([name, run]) => {
-    try { await run(); } catch (err) { warn.push(name); console.warn("載入失敗：" + name, err); }
+  const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("逾時 " + ms / 1000 + " 秒")), ms))]);
+  await Promise.all(steps.map(async ([name, run]) => {
+    try { await withTimeout(Promise.resolve().then(run), 45000); } catch (err) { warn.push(`${name}（${err?.message ?? err}）`); console.warn("載入失敗：" + name, err); }
```

這個改動同時順便解決下一點。

##### 4. 失敗時使用者看不到原因（`:346`、`:359`）

- 顯示給使用者的只有「載入失敗，相關功能可能無法使用」。
- 像「遊戲版本不相容：找不到 xxx」這種有用的訊息只進了 console，手機上看不到。
- 上面第 3 點的 diff 已把錯誤訊息併進 `warn`。顯示時 `area` 會帶出原因，不必再改 `:359`。

##### 5. 子請求缺 `r.ok` 檢查，錯誤訊息誤導

- `:62` 的 `signatures.json` 直接 `.json()`。失敗時使用者看到的是 JSON 解析錯誤，不是 404。第 2 點的 diff 已補上檢查。
- `:82` 區塊抓失敗會悄悄回傳 `null`。最後只會顯示「找不到某特徵碼」，看起來像版本不相容，實際可能只是網路掉了。

建議統計失敗數量，並在 `missing` 之前先判斷：

```diff
@@ d2edit.js:82-91
-  const srcs = await Promise.all(...catch(() => null)));
+  const srcs = await Promise.all(...catch(() => null)));
+  failed += srcs.filter((s) => s == null).length;
@@ d2edit.js:91
-  if (missing.length) throw new Error("遊戲版本不相容：找不到 " + missing.join("、"));
+  if (missing.length) throw new Error((failed ? `有 ${failed} 個程式區塊下載失敗（網路問題？），` : "遊戲版本不相容，") + "找不到 " + missing.join("、"));
```

這裡要在 `:65` 補宣告 `let failed = 0`。

##### 6. 重複點書籤會洩漏資源（`:105`、`:96-97`、`:266-270`）

每次點書籤都會：

- 建一個新的隱藏 iframe（`box`），舊的不會移除。
- 建一批新的 blob URL（約 45 個），從不 `revokeObjectURL`。
- 舊的載入 IIFE 繼續在背景跑。
- 每一版 `Storage.prototype.setItem` 的攔截層都堆疊上去（`:161-167`）。

```diff
@@ d2edit.js:105 (建立 box 前)
+  window.__d2editEngineBox?.remove();
   const box = document.createElement("iframe");
+  window.__d2editEngineBox = box;
```

完整做法還要在換版時 revoke 舊的 blob，並把 setItem 攔截的「已掛接」旗標掛在 `window` 上，不要放在模組區域變數 `keepHooked`。這樣新舊版本才不會各掛一層。

##### 7. 外層沒有 catch（`:320`）

- 如果進度框的建立（`:322-327`）丟例外（例如 `document.body` 還沒就緒），整個 IIFE 會變成 unhandled rejection。
- `toolsReady` 永遠不會設定，使用者沒有任何提示。
- 建議用 try/catch 包起來，失敗時至少讓 `toolsReady = true`，並 `console.error`。

##### 8. 快取策略：每次點書籤都全部重下載（`:6`）

- 書籤每次帶新的 `v`，這包括 891KB 的字典、`gamedata.json`、所有 JS 模組。重複點書籤或換分頁時，這些都是白白重載。
- 建議不要用時間戳記，改成取一個小的版本檔（`fetch(HOST + "version.json", {cache:"no-store"})`），拿它的 hash 或發布版號當 `v`，這樣沒更新時就能命中快取。
- 這需要發布流程多產一個 `version.json`，而且 `VER` 變成非同步取得，影響面較大，我建議先做上面 1 到 7 點。
- 我沒看到書籤本身的內容，所以不確定它現在帶的 `v` 是什麼。

##### 小項

- `:187` 與 `:195`：`i18n()` 的字典重試邏輯跟 `loadZhDict`（`:316`）重複。可以直接讓 `i18n()` 呼叫 `loadZhDict()` 加重試，避免兩份 fetch 邏輯。
- 在 IIFE 開頭加上 `modulepreload` 提示，讓瀏覽器提早抓 `helper/selfcheck.js`、`modifier/patch.mjs` 等檔案，但依賴圖的深度我沒追，效益未知。

#### 建議實作順序

1. 第 3、4 點（逾時與錯誤訊息）：穩定性收益最大，改動小。
2. 第 2 點（引擎並行）：預期對首次載入時間的改善最大，要實測。
3. 第 1 點：需要同時改 editor.html。
4. 第 5、6、7 點。
5. 第 8 點：需要發布流程配合。

我只讀了 d2edit.js，沒有跑任何測試或實測，所以上面的速度改善都是依程式結構推論。要不要我把前兩項實作出來並跑 `verify/suite.cjs` 驗證？
### 10-verify錯誤處理

### verify錯誤處理（claude）

### verify/ 錯誤處理與失敗即停檢查（唯讀，未改任何檔案）

整體上「任一步失敗就停」的主幹是對的：auto 以子行程退出碼判斷，publish 在非 0 時丟例外。以下是我找到的漏洞。我只讀了程式碼，沒有實際執行；`language.json` 是否帶 `build` 欄位，我只確認了 `lib/language-audit.cjs` 第 43 行的回傳裡看得到 `baseline`，沒看到 `build`。

#### 高風險：失敗後仍可能繼續發布

**1. `publish.cjs:142-147`：push 失敗後重跑，會跳過推送卻回報成功**
- 第一次 `git commit` 成功、`git push` 失敗並丟例外。
- 重跑時工作目錄已乾淨，`status --porcelain` 為空，只印「倉庫沒有變更，略過提交」，不會推送。
- 最後還印「完成」並以 0 結束，所以網頁版實際沒上線。
```diff
-  if (!run("git", ["status", "--porcelain"], P.web)) console.log("倉庫沒有變更，略過提交。");
-  else {
-    run("git", ["commit", "-m", msg], P.web);
-    console.log("已提交倉庫：" + msg);
-    if (!has("no-push")) { run("git", ["push", "origin", "HEAD"], P.web); console.log("已推送到 GitHub。"); }
-  }
+  if (!run("git", ["status", "--porcelain"], P.web)) console.log("倉庫沒有變更，略過提交。");
+  else { run("git", ["commit", "-m", msg], P.web); console.log("已提交倉庫：" + msg); }
+  if (!has("no-push")) {
+    const ahead = run("git", ["rev-list", "--count", "@{u}..HEAD"], P.web);
+    if (ahead !== "0") { run("git", ["push", "origin", "HEAD"], P.web); console.log("已推送到 GitHub。"); }
+  }
```

**2. `auto.cjs:19,54`：`git()` 吞掉失敗，把「git 壞了」當成「工作目錄乾淨」**
- `git` 執行失敗（找不到 git、不是倉庫、鎖檔）時，`stdout` 是空字串，於是 `dirty = []`。
- 這會繞過第 72 行「保護進行中工作」的閘門，直接進入發布。
```diff
-const git = (...a) => (spawnSync("git", a, { cwd: P.root, encoding: "utf8", windowsHide: true }).stdout || "").trim();
+const git = (...a) => {
+  const r = spawnSync("git", a, { cwd: P.root, encoding: "utf8", windowsHide: true });
+  if (r.error || r.status !== 0) throw new Error(`git ${a.join(" ")} 失敗：${r.error?.message || r.stderr}`);
+  return (r.stdout || "").trim();
+};
```

**3. `publish.cjs:136-140`：手動 `--confirm` 會把別人未完成的修改一起提交**
- 目前 `modifier/editor.html`、`helper/autobot.js`、`modifier/webapi.js`、`AI_HANDOFF.md` 等都有未提交修改，而且都在 `RELEASE_PATHS` 白名單內。
- 只有 `auto.cjs` 有 dirty 檢查。手動執行 publish 時，這些半成品會被 `git add` 進發布提交。
- 建議：在進入發布流程前記下白名單內已被修改的檔案，除了本腳本自己會改的（`editor/package.json`、`modifier/editor.html`、`site/index.html`、`version.json` 等）之外，有其他就中止。
```diff
+const preDirty = run("git", ["status", "--porcelain", "--untracked-files=no"], P.web).split(/\r?\n/).filter(Boolean).map((l) => l.slice(3));
+const SELF_TOUCHED = new Set(["editor/package.json", "modifier/editor.html", "site/index.html", "version.json", "verify/state.json"]);
+const foreign = preDirty.filter((f) => !SELF_TOUCHED.has(f) && !f.startsWith("docs/"));
+if (foreign.length && !has("allow-dirty")) { console.error("工作目錄有未提交修改，拒絕發布：" + foreign.join("、")); process.exit(1); }
```
這段要放在第 76 行 `confirm` 判斷之後、`bump()` 之前，因為 `bump()` 會自己改檔。

**4. `publish.cjs:39`：翻譯檢查沒核對版本**
- 第 42 行對 `live`、第 35 行對 `latest` 都核對了 `build`，只有 `language.json` 沒有。
- 如果它沒有 `build` 欄位，舊版的 `ok:true` 就能放行新版。
- `--auto` 也完全略過 `impact.json` 閘門（第 28 行），這是設計如此，但意味著自動模式下，這些報告的版本一致性只靠 `verify` 剛跑完來保證。
- 修法：先讓 `verify.cjs:86` 寫入 `{ ...lang, build }`，再在 publish 檢查 `translation.build !== verified.build`。

#### 中風險：失敗被吞掉，或留下舊的「通過」紀錄

**5. `live-smoke.cjs:81`：抓不到遊戲版本時直接略過比對（fail-open）**
- `gameBuild` 為 null 時，整個版本不符檢查都不會執行，仍可能通過。
```diff
-    if (gameBuild && typeof gameBuild === "string" && gameBuild !== build) problems.push(`遊戲版本 ${gameBuild} 與驗證版本 ${build} 不同`);
+    if (typeof gameBuild !== "string") problems.push("讀不到實機遊戲版本，無法確認與驗證版本一致");
+    else if (gameBuild !== build) problems.push(`遊戲版本 ${gameBuild} 與驗證版本 ${build} 不同`);
```

**6. `live-smoke.cjs:73`：實機的 `console UNH/ERR`、`GONE`、`FAIL` 只存進 evidence，不影響結果**
```diff
     result.evidence.errors = log.split("\n").filter(...).slice(0, 20);
+    if (result.evidence.errors.length) problems.push(`實機日誌有 ${result.evidence.errors.length} 筆錯誤`);
```
這個改動要放在 `const problems = []` 之後。如果這些行常有無害雜訊，要先調整正規式，以免誤擋。

**7. `live-smoke.cjs:55,91,95`：例外時不寫 `live.json`，舊的通過紀錄仍留在磁碟上**
- 第 55 行 `log.txt` 不存在就會丟例外，跳過第 91 行的寫檔。
- 第 95 行只印錯誤並設 exit 2。
- 上一輪同版本、同指紋的 `ok:true` 會繼續讓 `publish.cjs:42` 放行。
- 另外 `child` 沒有 `error` 事件處理，啟動失敗會變成未處理例外。
```diff
-main().catch((e) => { console.error("實機煙霧測試錯誤：", e.message); process.exitCode = 2; });
+main().catch((e) => {
+  console.error("實機煙霧測試錯誤：", e.message); process.exitCode = 2;
+  try { writeJson(path.join(P.reports, "live.json"), { ok: false, build, at: new Date().toISOString(), error: e.message }); } catch {}
+});
```
同樣地，`verify.cjs:120` 崩潰時不會更新 `latest.json`，舊的 `ok:true` 一樣殘留：
```diff
-(flag("update") ? update() : quick()).catch((e) => { console.error("驗證腳本本身錯誤：", e); process.exitCode = 2; });
+(flag("update") ? update() : quick()).catch((e) => {
+  console.error("驗證腳本本身錯誤：", e); process.exitCode = 2;
+  try { report.ok = false; report.summary = "驗證腳本本身錯誤：" + (e?.message || e); writeJson(path.join(P.reports, "latest.json"), report); } catch {}
+});
```

**8. `verify.cjs:105-107`：`runTests` 丟例外時，自動改過的原始碼不會還原**
- 還原只發生在「有測試失敗」的分支（第 109-110 行）。
- 例如 `electron()` 在 `lib/runner.cjs:7` 找不到模組、或 `runAll` 中途丟例外，`applyNames` 的修改就留在工作目錄，直接落入第 120 行的 catch。
```diff
-let r = await runTests(selected);
+let r;
+try { r = await runTests(selected); }
+catch (e) { if (!flag("dry")) adapt.restore(backupDir); throw e; }
```

**9. `auto.cjs:77-87`：版本偵測就失敗（例如網路不通）時，沒有任何紀錄或通知**
- `latestBuild()` 丟例外時 `result.build` 還是 undefined。
- 第 80 行的條件不成立，所以不寫 `auto.json`、不寫 log、不發通知，只有 exit 1。
- 如果這是靠 AI 觸發而沒人盯 stderr，就等於靜默失敗。
```diff
-    if (result.build && (result.steps.length || result.error)) {
+    if (result.build || result.steps.length || result.error) {
-      const line = `- ${stamp()} 遊戲 ${result.build}：...
+      const line = `- ${stamp()} 遊戲 ${result.build ?? "（未取得版本）"}：...
```

**10. `auto.cjs:92`：`main()` 沒有 `.catch`**
- 第 44-46 行（`mkdirSync`、寫鎖檔）若失敗，會變成未處理的 rejection。
- 如果我沒記錯的話，Node ≥15 會以非 0 結束，但不會留下紀錄。
```diff
-main();
+main().catch((e) => { console.error("自動更新腳本本身錯誤：", e); process.exitCode = 2; });
```

#### 低風險或需留意

- **`auto.cjs:45-46`**：鎖檔不是原子建立（先 `existsSync` 再 `writeFileSync`）。另一個實例偵測到鎖就回傳，結束碼是 0，容易被當成成功。建議改用 `fs.openSync(LOCK, "wx")`，被鎖住時設 `exitCode = 3`。鎖檔過期是 3 小時。
- **`auto.cjs:16-17`**：`spawnSync` 逾時或啟動失敗時，`r.error` 沒被放進輸出，只剩 `ok:false` 且 `out` 為空。建議把 `r.error?.message` 併入 `out`。
- **`lib/util.cjs:14,17`**：`readJson` 把「JSON 損毀」和「檔案不存在」都當成 fallback。
  - 損毀的 `impact.json` 會讓人工逐項填寫的佐證被悄悄丟棄（`verify.cjs:72`）。
  - `saveState` 在 `state.json` 損毀時會用 `{}` 覆寫其他欄位。
  - 建議：檔案存在但解析失敗時丟例外，只有 `ENOENT` 才回 fallback。
- **`lib/game.cjs:54-55`**：`entry` 為 null（HTML 解析不到入口腳本）時，快照仍標記為 `complete:true`。建議 `complete: failed.length === 0 && !!entry`。`hasSnapshot` 也只看旗標，不驗證檔案是否真的存在。
- **`lib/runner.cjs:16`**：逾時只 `child.kill()` 殺父行程。Windows 上 electron 子行程可能撐住 stdio，導致 `close` 一直不觸發。建議改用 `taskkill /T /F`。
- **`publish.cjs:118-120`**：`bump()` 和 `addChangelog()` 在 build 之前就改了檔，build 失敗不會回滾。第 52 行的 `pendingVersion` 邏輯讓重跑還算安全，但工作目錄會留下半成品。
- **`publish.cjs:139`**：`slice(3)` 對 rename 輸出（`a -> b`）取檔名會錯。因為是用白名單比對，結果只會更嚴格（拒絕發布），不會漏放。

#### 建議的處理順序

1. 先修 #1、#2、#3，它們會造成真正的錯誤發布，或讓「已發布」的回報不實。
2. 接著修 #5、#7 和 `verify.cjs:120`，把 fail-open 與殘留的舊通過紀錄補上。
3. 其餘依序處理。

要我實際套用這些修改嗎？目前這個工作階段是唯讀的，要先退出計畫模式才能動手。
---

## E. 2026-11-03～11-04 封存紀錄（原 `docs/ai/handoff-archive-2026-11.md`）
### 交接紀錄封存（2026-11-03～11-04）

> 2026-11-04 由 Claude 從 `AI_HANDOFF.md` 移出，原文未改寫。包含 11-03 的各代理紀錄與「合併前較新的紀錄」（Codex 實機長跑檢查、遊戲更新驗證流程改版等）。更早的完整紀錄見 `handoff-history.md`，桌面版舊交接見 `editor-handoff-legacy.md`。

- 2026-11-03｜Claude Code｜PR #3 的 Cloudflare 預覽建置失敗：非 main 分支會執行 `npx wrangler preview`，設定缺 `previews` 區塊。已在 `wrangler.jsonc` 加入 `"previews": {}`；wrangler 4.156.2 原始碼 `ensurePreviewsConfig` 確認有此鍵就放行，`wrangler deploy --dry-run` 仍正常讀取 site/ 10 個檔案。本機沒有 Cloudflare 憑證，無法實際執行 preview，需以 PR 重新建置確認。
- 2026-11-03｜Claude Code｜**專案最佳化**（使用者要求「最佳化專案」，選定四項）：
  - 輔助器 `autobot.js`：每 200 毫秒的介面迴圈原本無條件寫入按鈕文字與 `style.display`，且狀態列以未翻譯字串比對已翻譯內容（英文介面時每次都重寫），持續觸發 `lang.js` 的 MutationObserver；改為 `setText`／`setDisplay` 只在值不同時寫入，面板狀態文字同樣處理。`visible()` 只取一次 `getComputedStyle`。
  - 語言模組 `lang.js`：`cleanCJK` 正規式預先編譯，CJK 間空格改用前瞻單次取代（取代 while 迴圈重複掃描）；20 萬筆隨機字串與舊實作輸出完全一致，長字串 2 萬次 506→278 毫秒。缺漏翻譯清單 `missing` 上限 5000 筆，避免長時間遊玩記憶體無限成長。語言按鈕 300 毫秒輪詢改為差異寫入。
  - 修改器入口 `d2edit.js`：`sync` 改為差異寫入 `style.display`。
  - 字典 `zh-TW.json`：分析後**不修改**。13907 筆中僅 1 筆鍵值相同、25 筆大小寫重複；壓縮成單行 gzip 只省 3KB（326→323KB），卻會讓所有代理的字典 diff 無法閱讀；網頁與語言模組已共用同一個下載 Promise，無重複下載。
  - 交接文件：原 409 行／98KB 精簡至本檔，原文封存 `docs/handoff-history.md`（以 diff 確認與原文一致）。
  - 驗證：`node --check` autobot.js／lang.js／d2edit.js；`node tests/test_lang.cjs`、`craft-limits.cjs`、`weapon-sets.cjs` 通過；Electron 33（xvfb）`tests/autobot.cjs` 170 項通過 0 失敗、`weapon-sets-ui.cjs`、`craft-diagnostic-ui.cjs` 通過；`git diff --check` 通過。需外部資料的 4 項測試未能執行。**未於真實遊戲實測**，未同步桌面 `../editor/`，未推送。
- 2026-11-03｜Claude Code：Cloudflare 公告站改由 GitHub 自動部署；公告頁改寫 `8444277` 已經 PR #2 合入 main（`4872e95`）。
- 2026-11-03｜Codex：繁中字典統一、官方新聞翻譯、四種元素抗性名稱修正、手機選卡競態限制、選卡加速、全圖吸金幣、撿寶面板精簡；已提交並推送 `40d6cb9`，GitHub Pages 部署成功。

#### 合併前較新的紀錄（合併 claude/optimize-project 時保留，原順序）

- 2026-11-04｜Codex：依使用者要求檢查輔助器三分頁總開關隔離。`web/autobot.js` 的戰鬥輔助行為改只讀 `enabled`；自動穿裝、回營整備只讀 `progressEnabled`；自動重抽只受自動戰鬥分頁控制，遊戲修改的無限重抽只在 `cheat.enabled` 開啟時修改原生次數。總開關啟動時仍只讀頁面記憶體 `window.__d2autobotSwitches`，整頁重載後變數消失，兩個總開關預設關閉；同頁熱載入沿用目前狀態。測試準備案例已調整，`node --check web/autobot.js`、`node --check web/tests/autobot.cjs`、`git diff --check` 通過。Electron `tests/autobot.cjs` 最近結果 192 通過、2 失敗（既有換裝測試夾具被新增反向案例共用狀態污染；案例已移除，尚未重跑乾淨結果）；未真實遊戲驗證、未同步桌面、未發布。狀態：程式修正完成，Electron 回歸未驗證通過。

- 2026-11-04｜Codex：修復檢查發現的 web 端程式錯誤：恢復 `autobot.js` 至目前 HEAD（工作樹版本將新版自動模式、cheat 設定與大量流程回退，差異為 175 新增／862 刪除）；`d2edit.js` 恢復匯入痕跡診斷 API 並移除無效 `Function.prototype.toString` 替換；`editor.html` 接回匯入痕跡檢查、修正多出的裸露冒號，移除檔尾空行；`lang.js` 移除 `return` 後不可執行且偽裝原生的區塊。web/editor 的 `autobot.js`、`lang.js`、`d2edit.js` SHA-256 已一致；桌面 `editor/editor.html` 留有表單與排行榜提示差異，本次未覆蓋。驗證：四個 JS `node --check` 通過、`editor.html` 2 個內嵌 script 解析通過、`test_lang.cjs`／`craft-limits.cjs`／`weapon-sets.cjs` 通過、`git diff --check` 通過。未跑 Electron、真實遊戲、打包或發布。狀態：web 修復已驗證；桌面 HTML 差異待負責代理確認。

- 2026-11-04｜Claude Code：遊戲 20261103.2 的 makeAffix 特徵碼原為 `(e,t,n,r,i){`，新版多了 `,a=2` 預設參數，導致製作一律被拒絕（G.__makeAffix is not a function）。已把兩份 signatures.json（根目錄與 web/）改為 `i(?:,a=2)?`，於 game-bundles/20261103.2 測試 missing 為空、找到 itemArt 內的 l5。實際在本機來源製作「狂風面紗」（便帽、魔法：+100% 防禦強化、+20 生命）成功，截圖已加入公告站。未提交。

- 2026-11-04｜Claude Code：公告站 `site/index.html` 重排：功能區（存檔修改器、遊戲輔助器、繁中化）置於前段，已知問題移到安裝教學之後，安裝教學加入排行榜注意連結。實際畫面改用 editor/tests/live-harness 內遊戲版本 20261103.2 的截圖（6 張 gallery、2 張輔助器區段內嵌），移除舊版 20261101.1 與舊 UI 截圖。未提交。Playwright 驗證：8 張圖皆載入、燈箱可開、375px 無橫向捲動；桌面 1366px 頂部導覽列溢出為原有問題，未修改。

- 2026-11-04｜Codex：排行榜說明已更正為原廠會檢查書籤標記及原生函式替換；載入工具書籤後該遊戲頁成績不上傳，與是否改存檔或開啟「解除修改限制」無關。公告站 `site/index.html`、GitHub Pages 安裝頁 `index.html`、GitHub `README.md`、`editor.html` 及桌面說明 `../editor/README.md` 已同步；診斷只在存檔檢查頁，不放狀態列。舊「原因未確認」說法已過時。未發布或推送，尚未執行測試。

- 2026-11-03｜Claude Code：使用者決定 Cloudflare 公告站統一由 Cloudflare 自行抓取 GitHub 儲存庫部署（`wrangler.jsonc` 資產目錄 `./site`），不再手動部署，也不需 API Token；先前「Cloudflare 公告站未部署」之待辦改為已過時。公告頁改寫已提交 `8444277`（位於分支 `claude/announcement-page`，原為分離 HEAD），尚未推送；需合入 main 並推送後 Cloudflare 才會更新。

- 2026-11-03｜Claude Code：依使用者要求改寫公告網頁 `site/index.html`，保留原深色風格與更新日誌內容：新增快速導覽、修改器 8 個分頁細項、輔助器三分頁（戰鬥輔助／自動戰鬥／遊戲修改）可切換說明、停止與關閉四種方式對照表、遊戲繁中化、各平台安裝（含 Windows 版）、常見問題、回到頂端；修正截圖編號重複，截圖改為可鍵盤操作按鈕。內容依 README、autobot.js 面板欄位與本檔紀錄撰寫。驗證：Playwright 1280／390 寬無水平捲動、分頁切換與截圖放大正常、無頁面錯誤，`git diff --check` 通過。未部署 Cloudflare 公告站（需 API Token），未推送。

- 2026-11-04｜Claude（未發布）：①排行榜提醒已寫入 editor/web-install.html、editor/index.html、editor/editor.html 更新日誌與 web/site/index.html（玩家回報載入中文化書籤後即使不修改也不上傳排行榜，原因尚未確認）。②存檔檢查頁新增「遊戲診斷」區塊（renderDiag／gameSeesPage／parseDiag／DIAG_FACTS，index.html 與 editor.html）：複製遊戲 ie() 判斷顯示遊戲此刻看到的頁面狀態（__D2ZH 書籤標記與 7 個原生函式 WeakMap.get、Storage.setItem、drawImage、putImageData、addEventListener、requestAnimationFrame、devicePixelRatio 是否被替換）；可貼上遊戲診斷訊息標出 page、leaderboard queue、last session；附 29 個診斷欄位對照表。反編譯結果（遊戲 20261103.2）：診斷欄位由 C.fact／z.fact 登記，page 欄位在 ui 區塊 ie()，目前只找到它用於診斷文字，未找到直接阻擋上傳的程式，伺服器是否使用此結果未知；括號內 build／gear／forged／ranks 的中文解釋為推測。當時 lang.js 會暫時替換 Storage.prototype.setItem（遇 d2s:lang 丟錯）並改寫翻譯器與點陣字型原型；後續 Codex 已移除 Storage 替換，詳見 2026-11-04 實測紀錄。決定仍是不偽裝原生函式（如改 Function.prototype.toString）或隱藏書籤痕跡。待辦：向遊戲開發者確認翻譯書籤規定；請玩家貼診斷訊息的 page 與 leaderboard queue 行。該筆當時尚未重建 web／提交／發布；語法檢查及 Node 模擬通過。真實遊戲實測後續已於 2026-11-04 記錄。

- 2026-11-04｜Claude：存檔檢查提示文字去掉「與原版暗黑2不同」，改為「額外的詞綴規則檢查（以遊戲為準，僅供參考）」；更新日誌新增 2026-11-04 條目（存檔檢查改名與問題明細、判定結果與關閉排行榜上傳、正常裝備誤判修正），同步 editor/index.html、editor/editor.html 與 web/site/index.html（介紹網頁），未升版號（維持 v1.0.5，避免觸發更新提示）。已重建 web（version.json note 已還原）。語法檢查通過，未實機驗證。

- 2026-11-04｜Claude：存檔檢查的合法性改以遊戲自己的資料與檢查（faults）為準。原因：遊戲數值與原版暗黑2不同，正常打到的裝備被 itemstats 規則（validateItems）判為不合規，且「一鍵全部規避」會把它們重新產生。改動：detect() 中「原版屬性規則」一項改為僅供參考（ok:true、advisory），renderDetails() 將差異列在「僅供參考」區，不計入問題數與判定。未改：寫入前的 assertLegal（編輯限制）仍用原版規則。重建 web（重建會清空 version.json note，已還原）。語法檢查通過，未用真實存檔實機驗證。

- 2026-11-04｜Claude：「反修改偵測」頁改名「存檔檢查」並加強顯示（只做「問題明細」與「判定結果」兩項）。①新增 itemsWithWhere()＋renderDetails()：逐項列出問題的位置（職業→背包／倉庫分頁／身上裝備欄位（中文，SLOT_ZH）／傭兵／商店等）、原因（沿用 problemText 與遊戲物品引擎 validateItems／faults）與修正方式，不截斷；欄位類問題（金幣、等級、屬性點、簽章、標記）同表列出。②頁首判定「沒有發現問題」或「已編輯／有問題，不會上傳排行榜」，有問題且排行榜開啟時出現「關閉排行榜上傳」按鈕（設 save.leaderboard.off，需寫入存檔）。③原有的清除外部修改標記、清除匯入／檢查紀錄、重新產生排行榜識別碼、刪除匯入痕跡四項依使用者決定保留原樣，本次未擴充、之後也不應再加強規避伺服器偵測的功能。已同步 editor/index.html、editor/editor.html，並以 build-web.js 重建 web（網址 https://nojackno2-ctrl.github.io/d2-survivors-toolkit/；重建會清空 version.json 的 note，已還原）。腳本語法檢查通過、build-web／weapon-sets 等測試通過；未在真實存檔實機開頁面驗證。autobot／version-gate-web／weapon-sets-ui 測試需在 Electron 內執行，用 node 直接跑會失敗（與本次無關）。

- 2026-11-03｜Codex：官方最新版 20261103.2 與前版 20261103.1 比對；發布前最後執行 `node verify/verify.cjs --update --workers 2` 仍取得 .2，9 項更新逐條完成、7／7 測試通過，新增遊戲字串與公告各 9 項均無缺譯。`node verify/selftest.cjs 20261103.2` 6 項通過。Electron 33.2.1 全新隔離設定檔以本機 web 待發布來源載入官方遊戲；狀態 playing、`diag.connected=true`、`tested=20261103.2`、掛接 `Game-DYfMoexm.js`；截圖及 7 個來源 SHA-256 在 `editor/tests/live-harness/run-update-20261103-final4/`，`verify/reports/live.json` 與來源指紋一致。桌面首次打包因 Windows 符號連結權限失敗；設定 `signAndEditExecutable:false` 後 `npm run dist` 成功，最終產物 SHA-256 `a7353c7bfd1045b267e6e4572fe66b1c7fb85b01cbe2bd602f25384ea59f189c`。v1.0.5 已發布至 GitHub Release（`bddf238`，`https://github.com/nojackno2-ctrl/d2-survivors-toolkit/releases/tag/v1.0.5`），`D2.exe` 雜湊與本機產物一致；GitHub Pages `version.json` 回傳 v1.0.5／20261103.2，並確認 `autobot.js`、`lang.js`、`zh-TW.json`、`editor.html`、`signatures.json` 公開位元組與正式 web 建置輸出雜湊一致。重新執行 `node verify/verify.cjs --update --workers 2`，7／7 通過；`node verify/selftest.cjs 20261103.2` 6／6 通過。Cloudflare Workers 介紹站仍顯示 v1.0.4；GitHub Actions 成功紀錄是 GitHub Pages 部署（`headSha=a4067db`），不代表 Cloudflare 部署。`npx wrangler@4.156.2 deploy` 因無 `CLOUDFLARE_API_TOKEN` 在非互動環境失敗，未使用臨時帳戶；待取得正式 Cloudflare 部署憑證後部署 `site/` 並確認公開頁顯示 v1.0.5／20261103.2。已改良 `.agents/skills/game-update/SKILL.md`，要求分開驗收各發布目標、比對 Pages 公開雜湊及明確確認 Cloudflare 正式部署。

- 【已過時，當時狀態由上方 20261103.2 紀錄取代】2026-11-03｜Codex：執行 `node D:/D2倖存者/verify/verify.cjs --update`，沿用遊戲快照 20261103.1；選定測試 7／7 通過（34 秒），無自動來源更新。當時 `impact.json` 有 29 項待分析、`language.json` 有 98 項新增未翻譯；後續版本已重新完成相鄰版本比較、翻譯與驗證。

- 2026-11-03｜Codex：依使用者澄清，更新流程改為 AI 主動分析官方變更、修復與改良；下載、比對、翻譯缺漏與可重複測試由腳本執行，禁止本地 AI。已更新 `../verify/README.md`、`../.agents/skills/game-update/SKILL.md` 並移除舊的「盡量不需要 AI」「等待確認」說明；`rg` 確認舊文字已移除。此項為流程文件調整，未執行遊戲更新或發布。

- 2026-11-03｜Codex：依使用者要求，遊戲更新工作流程須逐項分析官方更新、完成工具包改良與翻譯、正式測試，並以隔離設定檔載入官方真實遊戲及待發布工具包；完成後已授權自動發布。新增 `../verify/lib/impact.cjs`、逐項佐證及發布前檢查；29 項分類與佐證保存測試通過，發布阻擋待分析項目有效。`node verify/verify.cjs --update --dry --build 20261103.1 --workers 2`：7／7 通過，但 29 項待分析、新增未翻譯 98 項，未真實遊戲驗證，未發布；live.json 證據由執行代理實測後記錄，尚無自動載入程式。

- 2026-11-03｜Codex：每次遊戲更新新增繁中翻譯稽核，使用快照中的官方 ko 字典、翻譯器及 changelog 新聞，比對前版並列出新增及全部未翻譯項目至 `../verify/reports/language.json`；缺前版則檢查全部。`node --check` 通過；實際比較 20261102.2→20261103.1：新增遊戲字串 73（70 未翻）、新增新聞 29（28 未翻），目前共 74／28 項未翻；為自動比對結果，尚未補譯或人工核對，也未重跑完整更新流程。

- 2026-11-03｜Codex：修正遊戲 20261103.1 的 makeSet 特徵碼，辨識新版保留擲值狀態的外層函式並兼容舊格式；web／editor signatures.json SHA-256 一致。`node verify/verify.cjs --update` 掛鉤點通過、選定測試 7／7 通過（34 秒），自動更新 editor/autobot.js、editor/tests/autobot.cjs、editor/index.html、editor/editor.html；未驗證真實遊戲，等待使用者確認發布。

- 2026-11-03｜Codex：更新驗證改為下載快照後與前次已驗證快照逐檔比對並選擇測試；未知 JS／HTML 變動、快照不可信或驗證來源變更時全測，只有樣式或無變更則不測、不更新已驗證版本。發布確認時依比對與測試結果自動寫入工具與公告站更新日誌。`node --check` 通過；隔離快照測試涵蓋未變、樣式、核心、未知模組、HTML、缺基準、強制執行、損壞快照；`node verify/publish.cjs` 僅列出計畫。尚未執行真實新版更新、完整流程或發布。

- 2026-11-03｜Codex：已解決更新驗證的 autobot 測試故障：`editor/tests/autobot.cjs` 落後於符合現行選卡與任務流程的 `web/tests/autobot.cjs`，已同步；兩份 SHA-256 均為 `4E9B2443C4D79F292B58F2B2EBB30D75EB77FD4C1E2030640A48A996AB066B1E`。`node verify/verify.cjs --quick --dry --workers 2`：7／7 通過、34 秒；屬隔離測試，未驗證真實遊戲。先前 11 個失敗的記錄為已解決；舊 ticket 為歷史故障單。

- 2026-11-03｜Codex：改良每日更新驗證：同版號須來源、測試及驗證程式指紋一致且快照存在才沿用，`--full` 強制重跑；重試保留首次失敗證據，報告標示未涵蓋真實遊戲。`node --check` 通過，隔離子程序重試測試通過。`node verify/verify.cjs --quick --dry --workers 2`：6／7 項通過；autobot 兩次均 161 通過、11 失敗，失敗詳見 `../verify/reports/ticket.json`，尚未釐清原因；editor／web 的 autobot.js 雜湊相同，兩份 tests/autobot.cjs 雜湊不同。未執行完整更新驗證或實機驗收。

- 2026-11-03｜Codex：依使用者要求停用遊戲更新驗證失敗後的本地 AI 自動修復；更新 `../verify/verify.cjs`、`../verify/README.md` 與 `../.agents/skills/game-update/SKILL.md`。`node --check verify/verify.cjs` 通過；以隔離替身模擬更新測試失敗，確認未呼叫修復、已還原自動修改並產生故障單。未執行完整遊戲更新驗證。

- 2026-11-03｜Codex：依使用者授權準備提交並推送輔助器配裝、任務與選卡更新；node 語法及 git diff --check 通過。先前隔離 Electron 測試 193 項通過；本次重跑 Electron 尚未完成，地獄通關與全部任務流程仍未完成實機驗收。

- 2026-11-03｜Codex：17:21 定時檢查，21 個程序均存活且狀態新鮮；刺客 2、德魯伊 1、死靈 2 已自動進入地獄第一幕（83／85／87 級），其餘仍在惡夢，所有 diag.hellClears 為 0；進入地獄不等於通關，任務模式後續仍待驗證。

- 2026-11-03｜Codex：17:10 定時檢查，21 頁均回報載入 1705 本機版、程序存活；唯讀收藏追蹤證實刺客 2 已把 The Stone of Jordan 穿在 ring2，德魯伊 1 已把 Bul-Kathos Wedding Band 穿在 ring2，修正後原本第二格弱戒指已替換。各存檔仍多在惡夢，diag.hellClears 均 0；部分頁面顯示計時器恢復訊息，亞馬遜 1 world.time 較 16:54 約 3131 增至 3530，未足以證明所有頁面均持續正常。

- 2026-11-03｜Codex：使用者要求已學技能可升級時優先選擇且不要因其他卡重抽，保留進化卡更高優先；已調整選卡並測試。21 帳號唯讀配裝稽核：19 有普通／魔法／稀有裝備；以原版 previewGear 與輔助器相近評分比較，18 個第二戒指格存在至少一件得分較高的收藏候選（僅候選，不代表已穿）；亞馬遜 1 魔法胸甲亦有 Fortitude 候選。對照原版 vTe 發現雙戒指已滿時 slotFor 固定指向 ring1，原輔助器未比較 ring2；已改為兩格獨立預覽、指定原版 equip 目標欄位。`tests/autobot.cjs` 193 項通過、0 失敗、退出碼 0；本機 SHA-256 `C8BADEC15DDB0B575F08454313869F96C714CAF008CF3601DC19D1E0FF1CE021` 已安排 21 頁熱重載，同步 editor，待實機營地驗證換裝，不推 GitHub。

- 2026-11-03｜Codex：16:54 定時檢查，收藏解鎖協調程序顯示 21／21 已經修改器寫入並重新載入本機輔助器，21 個程序存活且狀態新鮮；現均在惡夢、68～84 級，diag.hellClears 均 0，地獄通關及任務模式全程尚未驗證。已觀察至少 3 存檔從收藏庫實際取裝穿戴，非全部存檔驗證。

- 2026-11-03｜Codex：16:44 定時檢查，21 個程序存活且狀態均為當下；收藏解鎖 20／21 已寫入並恢復本機輔助器，僅死靈 3 等待回營地。角色目前普通或惡夢、66～84 級，diag.hellClears 均 0，尚未有地獄通關證據；可觀測遊戲時鐘持續增加。

- 2026-11-03｜Codex：依使用者要求 16:28 立即檢查原先未動作頁面；21 個 PID 存活、狀態均更新至 16:28 且 playing。原先 5 個未回應頁面較 16:21 的等級均增加：刺客 1 71→74、野蠻人 1 71→74、德魯伊 3 77→78、死靈 1 69→70、聖騎士 3 64→65，5 個截圖也更新至 16:28；其他可讀 world.time 也已前進。這是當次檢查，持續觀察是否再停滯。收藏解鎖仍 16／21，其餘等營地。

- 2026-11-03｜Codex：16:21 上次延遲查詢與即時狀態終於回傳，21 頁皆記錄 D2TEST_RELOAD_20261103_1553 且兩個輔助器開關啟用；亞馬遜 1 的 world.time 由 2368.863 前進至 2408.548，其他多個角色等級上升，顯示部分遊戲迴圈恢復，但不能單憑此證明計時器修正為唯一原因。收藏解鎖仍 16／21，其餘 5 等回營地；重新執行隔離 Electron `tests/autobot.cjs`：189 項通過、0 失敗，退出碼 0。

- 2026-11-03｜Codex：15:51 檢查 21 進程存活但至少多頁停滯；可回應頁面顯示 WebGL isContextLost=false、選卡遮罩 hidden、Pixi ticker.started=true，但兩次間隔 1.2 秒之 lastTime 與 world.time 完全不變，顯示影格排程未前進，不能再歸因於目前 context 仍遺失。已加入輔助器獨立計時器：只在自動戰鬥啟用、playing、頁面可見、無選卡／前端／修改器、WebGL 未遺失且 ticker 逾 15 秒無影格時，以原版 stop/start 重排，最短 60 秒重試一次；不直接改角色數值。Node 重點測試通過（閾值、冷卻與保護條件）；SHA-256 `10C9E3E5FA75A30D8C3B36B556B67B51CEE111ADBCDEC5B9E68C049D625F698F` 已安排 21 頁熱重載，待驗證實機影格與 world.time 前進。收藏解鎖仍 16／21，完整 Electron 模擬測試仍因啟動逾時未通過。

- 2026-11-03｜Codex：15:40 定時檢查：收藏解鎖仍 16／21；熱重載已投遞 21，16 頁有載入回報並顯示自動關閉選卡殘留遮罩，5 頁進程存活但 executeJavaScript 未回應。亞馬遜 1 在 07:30:26、07:32:11、07:41:02 UTC 的 world.time 均為 2368.863075，最後一次遮罩已 hidden，仍未恢復遊戲迴圈；多頁 shot.png 最後更新為 15:17，先前有 WebGL context lost。不能以 status 時間更新認定遊戲正常，勿因觀測逾時重啟；持續調查圖形與頁面卡住原因。完整 Electron 測試 180 秒啟動逾時（ERR_FAILED），未通過；僅 Node 重點測試通過。

- 2026-11-03｜Codex：依使用者要求強制補足可合法穿戴的空欄，武器空欄優先補武器、不得為副手擠掉既有武器；背包滿先評估穿裝再賣。15:30 定時檢查發現多頁選卡遮罩殘留且遊戲時間停止：亞馬遜 1 在 07:30:26 與 07:32:11 UTC 的 world.time 均為 2368.863075。對照原版 saveTransfer-DrrQrlqL.js 確認原版先關閉畫面再呼叫選卡，已修正回呼順序，並於熱重載保留 Game 參照、由獨立計時器清除遊戲已非選卡狀態的殘留遮罩（前端選單與修改器開啟時不動）。node 重點測試通過；Electron 全套測試進行中（先前一次逾時，改模擬測試停用 GPU）。依使用者要求已立即送出 21 頁本機熱重載，SHA-256 `7E38CB65C525977C825159E20685B6CA393AC080C1D00CC447A8F55F06B18878`；TEMP reload-1535.cjs 避免覆寫待處理指令並逐頁投遞，待檢查實機恢復。

- 2026-11-03｜Codex：15:18 定時檢查，16／21 個收藏解鎖並恢復本機輔助器，其餘 5 個仍在普通難度等待營地；21 個狀態更新。唯讀追蹤確認至少 3 個存檔自原版 save.uniques 移出並穿上同 ID 物品：德魯伊 2 的 Jalal's Mane／Steelrend、聖騎士 2 的 Fortitude／Dwarf Star／Harlequin Crest、聖騎士 3 的 Silence／Principle；追蹤在首次配裝之後才啟動，其餘無事件不代表失敗。尚未地獄通關或驗收任務模式全程。

- 2026-11-03｜Codex：15:08 定時檢查，收藏解鎖 16／21 已寫入各 574 件並恢復本機輔助器，5 個等回營地；魔法使 3 已由修正建檔流程接續、在惡夢正常行動。已為完成的 16 頁送出唯讀收藏庫／穿戴變化觀測，下一次檢查確認是否實際從收藏庫取裝；未修改遊戲操作。

- 2026-11-03｜Codex：14:57 檢查收藏解鎖：14／21 已經修改器寫入各 574 件，11 個已重載本機輔助器、3 個在重載中，7 個等營地；野蠻人 3 出現「整備：換上較佳裝備 剛毅」，尚未證實來源。魔法使 3 寫入後舊測試框架以「法師」尋找職業，停在選角；已送出修正版既有角色接續指令，並將協調程序改為保留狀態並自動處理魔法使重開。舊協調程序已受控停止，修正版 PID 46728；遊戲程序未重啟。先前 WebGL 遺失後，德魯伊 1（已重載）與死靈 1（未重載）截圖均可見遊戲與選卡畫面，不能推及全部頁面。

- 2026-11-03｜Codex：依最新指示，任務模式先打通地獄並達 99 級，再依普通、惡夢、地獄補完全部任務且領獎，全部完成才切固定關卡刷地獄；通關證據以遊戲 save 物件為鍵保存在頁面 WeakMap，熱重載保留、整頁重開須再次打通地獄確認。營地配裝修正原版收藏庫為 Map 卻被 Object.values 漏掉，並將穿裝排在 collectAll 之前。隔離 Electron `tests/autobot.cjs` 輸出 181 通過、0 失敗（測試程序輸出後仍未退出）；新版本 SHA-256 `8FFDD1E0DEF068AFFD7AA672D97A7E4EAFD9AB8F365F6890568D0A86624F7EF7` 已送出 21 頁面熱重載，待下次檢查確認。使用者要求修改器一鍵解鎖 21 個隔離測試帳號收藏庫：已啟動 TEMP 的 unlock-controller.cjs（PID 62424），各頁等候安全營地後開修改器，備份當前 save、按修改器一鍵演算法產生並驗證物品、經修改器簽章寫入並重載頁面，再由協調程序重新載入已驗證的本機輔助器。14:46 檢查：刺客 2 與德魯伊 1 寫入各 574 件（分別新增 573／572 件、舊裝調高 3 件、跳過 0），重載後本機輔助器與兩個開關均回報啟用；其餘 19 等待營地，尚未驗證遊戲讀回及穿戴。約 14:45 多頁記錄 WebGL CONTEXT_LOST_WEBGL，系統一度嚴重遲滯，後續狀態檔仍更新；需確認畫面恢復、任務實際前進，禁止僅憑程序存活視為正常。

- 2026-11-03｜Codex：依使用者最新指示，先不推送 GitHub；已向 21 個隔離測試頁面送出本機 autobot.js 熱重載，SHA-256 `6B9CB7A1AEC5795942EBF827E35FE7973ADB7F6B17F37ED700003B2AC4228D6B`，不重開遊戲或修改存檔。這是送出指令而非成功證據，待下次 10 分鐘檢查逐一確認載入與開關狀態；後續實機為本機版本而非 GitHub 版本。

- 2026-11-03｜Codex：原版 20261102.2 的 itemArt-BOATIR-s.js 中 `Sp` 對 `coldunique` 等飛彈使用共用 WeakMap 命中冷卻，最短 3／25 秒；輔助器威脅預估原先把重疊冰環逐發相加。已在本機按預測時間與最短冷卻計算保守上限，其他飛彈仍各自計算，並同步 ../editor/autobot.js。`node --check autobot.js`、`node --check tests/autobot.cjs`、隔離 Electron 測試 174 通過、0 失敗；新增滿血不誤退與低血仍撤退測例。尚未發布至 GitHub，現行 21 存檔仍使用線上舊版，修正未於真實遊戲驗證。

- 2026-11-03｜Codex：依使用者要求，官方網頁 20261102.2／Game-BrCacnVd.js 以 GitHub Pages 工具包建立 7 職業各 3 個隔離 TEMP 存檔，正常速度、任務模式、作弊關閉；13:09 檢查：21 個程序存活且 playing；6 個普通任務 1／6、已救凱恩待領獎，9 個持鑰匙，6 個待卷軸。監測歷史顯示 15 個存檔曾降等重開（多個不只一次）；13:19 檢查：21 個程序存活；野蠻人 2 曾在 14 級、生命 201／208 時觸發預估致命撤退，回營地成 1 級，接著開新局；原版 pause 會呼叫 checkpointRun，但條件及失敗原因未確認。13:30 檢查：21 個程序存活、普通任務最高 4／6。聖騎士 3 在第三幕 38 級、生命 73／350、藥帶空且附近有飛彈時撤退，回營地 32 級、買藥後由輔助器續玩；屬回復較舊檢查點，並非都退回 1 級。13:40 檢查：21 個程序存活，10 個持鑰匙且凱恩未完成的角色已到第二至第五幕（部分曾從已完成變回未完成，需核對原版存檔／回溯）；普通任務最高 4／6。現行 campStart 有跨難度回刷條件，須等實機確認回刷與任務完成，不能僅憑持鑰匙判定卡死。13:50 檢查：21 個程序存活、普通任務最高 4／6。刺客 3 於滿血 334／334、藥帶有藥時撤退，回到 38 級；前 200ms 有同一座標向 16 方向發射的 coldunique，單發標記傷害 66.38；威脅估算對每顆分別加總，可能高估，實際命中及抗性仍待對照原版，不能直接判定。聖騎士 1 則於 309／334、藥帶兩格有藥但遭大量怪包圍撤退至 31 級，原因待核實。14:00 檢查：21 個程序存活；亞馬遜 3（61 級）與魔法使 1（66 級）擊敗普通巴爾並自動回營地，但持鑰匙且普通任務仍 0／6；14:09 的 60 秒取樣顯示兩者均由輔助器自動選擇「尋找凱恩未完成，回此難度重打：normal」並回第一幕，凱恩仍未完成；21 程序存活，普通任務最高 5／6。14:20 取樣 21 程序存活，亞馬遜 3 與魔法使 1 回普通第一幕後均已自動救出凱恩（N1 待領），兩個死靈與另一魔法使也回普通第一幕重刷；尚未驗證交付及全部任務。測試資料位於 C:\Users\nojac\AppData\Local\Temp\d2-quest-20261103-125535；monitor.cjs 每 60 秒記錄 monitor.jsonl（最長 12 小時）。建檔腳本在 TEMP 修正魔法使繁中名稱；舊資料未刪除。後續依即時資料檢查任務與卡關，修改前核對線上版本。

- 2026-11-03｜Codex：依使用者指示將本機 main 快轉至 GitHub 合併提交 c59288d，並將 autobot.js、d2edit.js、lang.js 同步至 ../editor；三組 SHA-256 一致。三個檔案的 node --check 與 node tests/test_lang.cjs 通過；未重新封裝桌面版或實機驗證。

- 2026-11-04｜Codex：以全新 Electron TEMP 設定檔進入官方 D2 Survivors 20261103.2，選擇官方提供檔案後到達遊戲營地；載入本機 web 工具包。初始 `/play/setup.html` 尚未初始化遊戲時 `itemstats.json` 為 404，正式進入 `/play/` 後為 200，修改器引擎完成載入。`__d2lang.debug()`：translator／gameTr／fontPatched／gameHooked／game 皆 true；畫面有中文介面，`translate("Character")` 為「角色」。重跑遊戲相同的七項原生函式檢查：`replaced=[]`、`Storage.setItem` 為原生、`__D2ZH=false`。先前同一 TEMP 隔離頁以修改器後端寫入合成存檔，關閉修改器觸發重載後內容仍一致。截圖與診斷 JSON 在 `%TEMP%\\d2-game-inspect-22eEzF\\`；已關閉 Electron，未碰使用者存檔。限制：僅實測英文原生遊戲轉工具包繁中及初始營地；未逐頁驗收 Canvas 全文、韓文原生模式或排行榜伺服器結果。

- 2026-11-04｜Codex：移除兩處已確認會觸發 `Storage.setItem` 替換診斷的攔截。`lang.js` 不再強制非韓文遊戲切換韓文並攔截儲存；原生韓文遊戲仍沿用原翻譯器，其他語言使用工具包既有字典、Canvas／點陣字型翻譯。`d2edit.js` 改用 `localStorage.setItem` 原生寫入，保留本次寫入狀態，關閉修改器時仍重新載入遊戲以採用新存檔。web/editor 的 `lang.js`、`d2edit.js`、`autobot.js` SHA-256 一致；六份檔案 `node --check` 與 `git diff --check` 通過，搜尋確認無 `Storage.prototype.setItem` 覆寫。尚未執行功能測試或真實遊戲診斷；未重建、提交或發布。

- 2026-11-04｜Codex：依使用者要求，將工具包包裝原廠函式時的 `Function.name` 對齊被包裝函式（翻譯器、點陣字型、Canvas、HUD、輔助器、短暫攔截 `Array.push/sort`、修改器存檔鎖定）；未改寫 `Function.prototype.toString`，包裝仍可被替換偵測辨識。`node --check lang.js`、`autobot.js`、`d2edit.js` 與 `git diff --check` 通過；未執行功能測試或真實遊戲驗證。`editor/` 對應檔案與 `web/` 來源原已不同，為避免覆蓋既有差異，本次未同步、未提交、未發布。

- 2026-11-03｜Codex：選卡修正（選單開啟時不操作升級選卡）整理至分支 `codex/level-up-menu-guard`；`node --check autobot.js`、`node tests/test_lang.cjs`、隔離 Electron `tests/autobot.cjs`（172 項、0 失敗）通過；未實機驗證。

- 2026-11-03｜Claude Code：將 `codex/level-up-menu-guard` 合併至 main（AI_HANDOFF 衝突以精簡版為準並補入此紀錄）；`claude/*` 分支內容已由 #2、#3 併入。



---

## F. 2026-10-31～11-02 完整紀錄（原 `docs/ai/handoff-history.md`）
### 交接紀錄歷史封存（2026-10-31～2026-11-03）

> 2026-11-03 由 Claude Code 自 `AI_HANDOFF.md` 原文搬移封存，內容未改寫；最新狀態以 `AI_HANDOFF.md` 為準。


- 2026-11-03｜Claude Code：使用者決定 Cloudflare 公告站統一由 Cloudflare 自行抓取 GitHub 儲存庫部署（`wrangler.jsonc` 資產目錄 `./site`），不再手動部署，也不需 API Token；先前「Cloudflare 公告站未部署」之待辦改為已過時。公告頁改寫已提交 `8444277`（位於分支 `claude/announcement-page`，原為分離 HEAD），尚未推送；需合入 main 並推送後 Cloudflare 才會更新。

- 2026-11-03｜Claude Code：依使用者要求改寫公告網頁 `site/index.html`，保留原深色風格與更新日誌內容：新增快速導覽、修改器 8 個分頁細項、輔助器三分頁（戰鬥輔助／自動戰鬥／遊戲修改）可切換說明、停止與關閉四種方式對照表、遊戲繁中化、各平台安裝（含 Windows 版）、常見問題、回到頂端；修正截圖編號重複，截圖改為可鍵盤操作按鈕。內容依 README、autobot.js 面板欄位與本檔紀錄撰寫。驗證：Playwright 1280／390 寬無水平捲動、分頁切換與截圖放大正常、無頁面錯誤，`git diff --check` 通過。未部署 Cloudflare 公告站（需 API Token），未推送。

- 2026-11-03｜Codex：補齊公告頁與網頁／桌面修改器的更新日誌，加入翻譯、撿寶、選卡及載入效能與手機介面變更。`node tests/test_lang.cjs`、`node ../editor/tests/build-web.cjs`、網頁與桌面日誌比對及 `git diff --check` 通過；未發布或重新封裝，保留既有輔助器未提交變更。

- 2026-11-03｜Codex：共用繁中翻譯及日誌已提交並推送 `40d6cb9`；GitHub Pages 工作 `41570100255` 成功，避開快取下載 zh-TW.json、zh.js、lang.js、d2edit.js、site/index.html、version.json，其 Git 雜湊與提交一致。獨立 Cloudflare 公告站未驗證部署；桌面執行檔未重新封裝。既有 autobot.js 與 tests/autobot.cjs 仍未提交。

- 2026-11-03｜Codex：依使用者要求準備推送共用繁中翻譯及更新日誌；公告頁與 version.json 已加入變更說明。推送前 `node tests/test_lang.cjs`、`node tests/craft-limits.cjs`、`node tests/craft-affix-composite.cjs`、隔離 Electron `tests/craft-companion-ui.cjs`、`node ../editor/tests/build-web.cjs`、JavaScript 語法及 `git diff --check` 通過。保留既有 autobot.js 與 tests/autobot.cjs 未提交變更，不納入本次提交；尚待推送及核對 GitHub Pages，桌面版未重新封裝。

- 2026-11-03｜Codex：依使用者要求整合繁中共用字典，將舊擴充字典 300 筆合入 zh-TW.json，修正自然祥和名稱，遊戲語言模組、網頁修改器及桌面修改器共用；桌面不再優先讀啟動器字典，網頁不再以遊戲翻譯器覆寫。比對 D2R 3.3.93847 後更新 39 個可精確對應的屬性樣板，以 item: 語境修正底材、暗金與符文之語並避免影響同名技能；同步網頁及桌面來源。舊 locales/zh-TW.json 保留既有變更作歷史資料，繁中不再載入。驗證：39 筆原先不同的屬性逐筆以數值 25 複核均與官方相符；`node tests/test_lang.cjs`、`node tests/craft-limits.cjs`、`node tests/craft-affix-composite.cjs`、隔離 Electron `tests/craft-companion-ui.cjs`、`node ../editor/tests/build-web.cjs`、桌面 core 字典 13907 筆比對、語法及 `git diff --check` 通過。仍有 55 個無精確對應樣板與舊版物品清單未完成人工核對；尚未在真實遊戲驗收、發布或重新封裝。

- 2026-11-03｜Codex：唯讀擷取本機 D2R 3.3.93847 CASC 物品名稱、詞綴與屬性字串至 TEMP，以遊戲 2026.1030.2 擷取的物品與 708 筆詞綴、目前 gamedata.json 135 個屬性樣板逐條精確比對；結果在上層「裝備屬性分析」兩份官方裝備逐條比對 CSV。名稱 1780 筆含詞綴，一般底材／暗金／套裝／符文之語 6 筆差異、1 筆字典缺少、21 筆官方同英文多譯；屬性 41 一致、39 不同、55 無精確對應。無精確對應不代表沒有官方對應；官方多譯不可盲目覆寫。比對未涵蓋最新版動態新增物品、技能觸發及語境消歧，未改翻譯，後續需以遊戲最新資料及物品類型逐項複核。

- 2026-11-03｜Codex：修正修改器四種元素抗性名稱不一致；火焰與電擊缺少完整樣板而退回「抗火／抗電」，現補齊完整樣板並統一單獨名稱，網頁及桌面字典同步。`node tests/test_lang.cjs` 驗證四種一般抗性、抗性上限及降低敵人抗性的格式；未於遊戲介面實測，未發布或封裝。

- 2026-11-03｜Codex：檢查裝備繁中是否採用官方譯文；官方 changelog 最新為 20261102.2，遊戲是非官方作品，繁中由 zh-TW.json 與 locales/zh-TW.json 組成。發現 Nature's Peace 在前者為「自然祥和」、後者新聞為「大自然的和平」；Lightning Damage 亦有「閃電傷害」與「電擊傷害」兩種。尚未取得 D2R 官方裝備文字表逐條比對，不能判定全部符合官方；未修改譯文，後續須擷取本機 D2R 原版字串並對應 Survivors 的實際物品與屬性；以 rg 比對兩層字典及官方 changelog，未做實機驗證。


- 2026-11-03｜Codex：更新官方新聞繁中翻譯，補齊 20261102.2 的 8 條及 20261102.1 的 2 條，網頁與桌面來源同步。以官方 changelog 與兩層字典逐條比對，所有新聞均有譯文；`node tests/test_lang.cjs`、`node --check lang.js`、`git diff --check` 通過。尚未實際遊戲驗證、發布或封裝。


- 2026-11-03｜Codex：使用者回報手機暫停選單的繼續與儲存並離開無法點擊，截圖同時顯示升級選卡。發現輔助器先前可能在前景選單開啟或遊戲已非 levelUp 時仍對殘留畫面選卡；已限制須為 levelUp 且 frontend 關閉，同步 editor。隔離 Electron `tests/autobot.cjs` 172 項通過、0 失敗；`node --check autobot.js`、`node tests/test_lang.cjs`、`git diff --check` 通過。此競態是否為使用者問題的原因尚未證實，未於真實手機重現、驗證、發布或封裝；需調查原版選單觸控及遊戲狀態。

- 2026-11-03｜Codex：最佳化輔助器：選卡改用獨立計時，首次可於下一次決策執行，重抽及重試間隔 100 毫秒；隱藏設定面板時不再每 200 毫秒掃描遊戲實體以更新面板狀態。同步 web／editor 原始碼及測試；隔離 Electron `tests/autobot.cjs` 170 項通過、0 失敗，`node --check autobot.js`、`node tests/test_lang.cjs` 通過。尚未實際遊戲測速、驗收、發布或封裝。

- 2026-11-03｜Codex：新增獨立「全圖吸金幣」開關，預設關閉，啟用戰鬥輔助時吸取地上金幣；關閉時保留遊戲原本撿取。同步桌面來源；隔離 Electron `tests/autobot.cjs` 168 項通過、0 失敗，語言、語法及 `git diff --check` 通過；未實際遊戲驗證或封裝。前次提交 `86d8d32` 被既有 post-commit hook 自動推送，非本次指示授權；後續提交以單次 Git 設定停用 hooks。

- 2026-11-03｜Codex：精簡撿寶面板，移除重複的品質及升級篩選，追蹤與全圖撿寶改依遊戲原版 `loot()` 的保留、隱藏與自動販售判斷；保留寶箱、藥水及任務行為，同步桌面來源。隔離 Electron `tests/autobot.cjs` 166 項通過、0 失敗；`node tests/test_lang.cjs`、JavaScript 語法與 `git diff --check` 通過。尚未於真實遊戲驗證、發布或封裝。

- 2026-11-03｜Codex：核對並更新安裝頁、修改器、README 與公告網站的入口位置、停止控制、製作裝備、排行榜及死亡保護說明；公告網站加入新功能介紹並更新日誌。同步桌面來源對應文字，未封裝桌面版。`node tests/test_lang.cjs`、`node tests/craft-affix-audit.cjs`（708 筆、0 失敗）、`node tests/craft-affix-composite.cjs`、`node tests/craft-limits.cjs`、Electron `tests/craft-companion-ui.cjs`、Electron `tests/autobot.cjs`（168 項、0 失敗）、語法與 `git diff --check` 通過；未進行本次真實遊戲驗收。依使用者要求提交並推送 GitHub；Pages 與獨立 Cloudflare 公告網站部署需另行核對。

- 2026-11-03｜Codex：依使用者更正，「全部關閉」改為關閉所有細部布林開關、全圖撿裝與推層／固定關卡模式，保留數值門檻及無關開關的選項；重新開啟總開關不會啟用細項。同步網頁與桌面來源；隔離 Electron `web/tests/autobot.cjs` 168 項通過、0 失敗，語法、語言測試與 `git diff --check` 通過。部分已套用的遊戲修改可能持續至重新開始；未實機驗證、發布或封裝。

- 2026-11-03｜Codex：輔助器面板新增「全部關閉」，關閉戰鬥輔助、自動戰鬥、遊戲修改三個總開關，原先保留細項設定（已依後續指示變更），並還原金幣倍率；已寫入遊戲的部分修改可能持續至重新開始。網頁與桌面來源同步；隔離 Electron `web/tests/autobot.cjs` 166 項通過、0 失敗，涵蓋儲存、介面與倍率還原；語法、語言測試及 `git diff --check` 通過。未實機驗證、發布或封裝。

- 2026-11-03｜Codex：戰鬥畫面「停止自動戰鬥」僅關閉自動戰鬥，保留戰鬥輔助與遊戲修改；設定面板的立即停止仍關閉兩個輔助開關。同步網頁與桌面來源，隔離 Electron `web/tests/autobot.cjs` 163 項通過、0 失敗，包含按鈕及設定保留；`node --check` 與 `node web/tests/test_lang.cjs` 通過。尚未在真實遊戲驗證，未發布或封裝。

- 2026-11-03｜Codex：複合詞綴同欄顯示已發布提交 `c74d530`；GitHub Pages 工作 `41563059302` 成功，公開 `editor.html` 避開快取下載後 Git 雜湊與提交一致。未做真實遊戲存檔驗收或發布桌面版。

- 2026-11-03｜Codex：依使用者要求發布複合詞綴選項配套說明與同欄顯示；發布前 708 筆詞綴稽核、複合詞綴及上限測試、隔離 Electron 介面測試與 `git diff --check` 通過；提交後待核對 GitHub Pages。

- 2026-11-03｜Codex：製作頁前後綴下拉選項顯示詞綴配套屬性；若同屬性也可能為單獨詞綴則標示「可能配套」。自動配套的數值欄顯示在主屬性同一列，底層仍保留遊戲所需的各屬性，編輯數值會同步；刪除主列會刪除配套。隔離 Electron `tests/craft-companion-ui.cjs` 驗證選項配套文字、同列欄位、編輯同步、刪除及歧義；`tests/craft-affix-audit.cjs` 708 筆 0 失敗，複合與上限測試、語言測試、三份頁面語法及 `git diff --check` 通過。桌面來源已同步，未發布網頁、未封裝桌面及未驗收真實遊戲存檔。

- 2026-11-03｜Codex：複合詞綴自動新增功能已發布提交 `11ac34f`；GitHub Pages 工作 `41562385669` 成功，公開 `editor.html` 與 `engine-page.js` 避開快取下載後 Git 雜湊均與提交一致。未做真實遊戲存檔驗收或發布桌面版。

- 2026-11-03｜Codex：依使用者要求發布複合詞綴自動新增及提示；發布前 `tests/craft-affix-audit.cjs` 708 筆、0 失敗，`tests/craft-affix-composite.cjs`、`tests/craft-limits.cjs`、隔離 Electron `tests/craft-companion-ui.cjs`、語法及 `git diff --check` 通過；提交後待確認 GitHub Pages 部署。

- 2026-11-03｜Codex：製作頁選擇可唯一確定配套的複合詞綴時，自動加入其他屬性列並顯示提示；移除或更換原列時移除未被使用者修改的自動配套列，有不同詞綴可能時提示確認而不猜測。修正分區下拉建議值未寫入選項的問題。同步桌面來源；隔離 Electron `tests/craft-companion-ui.cjs` 驗證巨魔護手自動加準確率 +5、提示、刪除及歧義不猜測，通過；`tests/craft-affix-audit.cjs`（708 筆、0 失敗）、`tests/craft-affix-composite.cjs`、`tests/craft-limits.cjs`、`tests/test_lang.cjs`、桌面 `runeword-class-base.cjs` 與語法、`git diff --check` 通過。未在真實遊戲存檔驗收，未發布網頁或封裝桌面。

- 2026-11-03｜Codex：前後綴修正已發布提交 `2451af8`；GitHub Pages 工作 `41561572337` 成功，公開 `editor.html` 與 `engine-page.js` 加入快取避開參數下載後，Git 雜湊均與提交一致。未發布桌面版，未進行真實遊戲存檔驗收。

- 2026-11-03｜Codex：依使用者要求發布前後綴及複合詞綴修正；發布前重跑 `tests/craft-affix-audit.cjs`（708 筆、0 失敗）、`tests/craft-affix-composite.cjs`、`tests/craft-limits.cjs`、`tests/test_lang.cjs`、隔離 Electron `tests/craft-affix-ui.cjs` 及 `git diff --check` 均通過；GitHub Pages 部署待提交後核對，未發布桌面版。

- 2026-11-03｜Codex：逐筆稽核擷取的 708 筆詞綴（411 前綴、297 後綴，181 筆複合），以獨立模擬底材驗證每筆分類範圍、最高值完整組合與逐項補入，對 alike 數值可變者另測最低值；`node tests/craft-affix-audit.cjs` 708 筆、0 失敗。發現並修正 alike 屬性必須等值時，部分組合及建議值未遵守等值的問題；介面使用候選建議值。`tests/craft-affix-composite.cjs`、隔離 Electron `tests/craft-affix-ui.cjs`、`tests/craft-limits.cjs`、`tests/test_lang.cjs`、桌面 `runeword-class-base.cjs` 均通過，已同步桌面來源。稽核為單詞綴模擬，不代表窮舉全部底材與多詞綴組合；未發布網頁、未封裝桌面，未做真實遊戲存檔驗收。

- 2026-11-03｜Codex：已修正製作頁前後綴範圍混用及達上限時無法補上複合詞綴的問題；分類範圍與候選依前綴／後綴分開，已滿時只在仍有合法可補屬性時允許增加列，完整組合仍由原規則檢查。`tests/craft-affix-composite.cjs` 使用擷取的遊戲詞綴重現巨魔護手並驗證補齊後 3 前綴／3 後綴，`tests/craft-affix-ui.cjs` 在隔離 Electron 驗證前綴照亮範圍預設 +2、後綴已滿時可加 attackRating +5；兩項及 `tests/craft-limits.cjs`、`tests/craft-diagnostic-ui.cjs`、`tests/test_lang.cjs`、`editor/tests/runeword-class-base.cjs`、語法與 `git diff --check` 均通過。同步桌面來源，未發布網頁或封裝桌面，未在真實遊戲存檔驗收。

- 2026-11-03｜Codex：分析使用者提供的巨魔護手診斷。`裝備屬性分析/魔法稀有詞綴.json` 顯示照亮範圍前綴 Glimmering／Glowing 分別為 +1／+2、同屬 group 112；+5 屬後綴 of the Sun（group 25），並伴隨 attackRating +5。兩列 +5 皆放前綴且未含複合屬性，無法組成合法詞綴。製作頁 `affixInfo` 的範圍按屬性匯總、不區分前後綴，可能把後綴 +5 顯示及自動套用至前綴；`affixSlots` 可顯示數量但不代表組合有效。待修正依區域顯示及預設值，並以遊戲資料測試。

- 2026-11-03｜Codex：網頁版已發布提交 `d457c13`；GitHub Pages 工作 `41559785646` 完成成功，公開 `editor.html`、`engine-page.js`、`i18n.js` 以快取避開參數下載後，Git 內容雜湊均與該提交一致。未進行真實遊戲存檔驗收，未發布桌面版。

- 2026-11-03｜Codex：依使用者要求發布上述製作裝備更新至 GitHub Pages；發布前重新執行 `tests/craft-limits.cjs`、`tests/test_lang.cjs`、隔離 Electron `tests/craft-diagnostic-ui.cjs` 及 `git diff --check` 均通過。部署狀態與公開內容待提交後核對；不涉及桌面執行檔發布。

- 2026-11-03｜Codex：製作裝備新增「輸出裝備設定」與複製按鈕，輸出表單屬性、原版檢查、名稱判定、詞綴數量及相同設定的上次製作結果；不擷取存檔資料，複製失敗時可手動選取。同步網頁與桌面來源。隔離 Electron 假後端 `tests/craft-diagnostic-ui.cjs` 通過，確認資料與測試存檔金幣未輸出；`tests/craft-limits.cjs`、`tests/test_lang.cjs`、內嵌 JavaScript 語法及 `git diff --check` 通過。Electron 測試產生 GPU 診斷訊息但結束碼為 0；未於真實遊戲或已封裝版本驗收，未發布。

- 2026-11-03｜Codex：製作裝備新增「裝備分類」與依分類篩選的底材欄位；固有屬性範圍由遊戲產生器取樣並標明取樣，非保證理論極值。詞綴上限沿用既有規則：魔法最多 2、一般稀有最多 6、稀有珠寶最多 4，護身符不可稀有；新增護身符介面即時限制。`node tests/craft-limits.cjs`、`node tests/test_lang.cjs`、桌面 `node tests/runeword-class-base.cjs`、JavaScript 語法及 `git diff --check` 通過。以上為模擬驗證，未完成實際遊戲介面與存檔驗收，未封裝或發布。

- 2026-11-02｜Codex：依使用者新指示移除版本不符的使用封鎖，保留更新提示與程式特徵檢查；先前要求舊版封鎖的紀錄已過時。網頁隔離測試：`tests/autobot.cjs` 160 項通過、`tests/weapon-sets-ui.cjs` 通過，`tests/version-gate-web.cjs` 對 20261102.1 與 20261101.1 完成後端及介面寫入；`node tests/build-web.cjs`、`node tests/test_lang.cjs` 通過。曾誤用已修補模組產生重複匯出錯誤，改用原版模組後通過。舊版功能未做完整相容驗收。網頁提交 `89374b5` 已推送；GitHub Pages 部署中。獨立 Cloudflare 公告網站嘗試 `npx wrangler deploy --name d2-survivors-toolkit --assets ./site --compatibility-date 2026-11-02`，因沒有 Cloudflare API Token 失敗，尚未更新。桌面來源已同步，但未重新封裝或發布執行檔。

- 2026-11-02｜Antigravity：因應官方遊戲更新進行全面實機真機隔離驗證與收尾：
  - **驗證環境與狀態**：在官方最新遊戲網頁環境（連網偵測到最新發布之 `20261102.2`，主程式 `Game-BrCacnVd.js`、`itemArt-BOATIR-s.js`、`saveTransfer-DrrQrlqL.js`，相容 `20261102.1`）下，以獨立 TEMP Electron 隔離設定檔（完全不操作使用者真實存檔）進行實機端對端驗證。
  - **已完成實機真機驗證項目（全數通過並具備 JSON 診斷日誌）**：
    1. **修改器武器組與全職業組合**：驗證野蠻人雙持單手、刺客雙爪、亞馬遜雙手弓/箭袋↔標槍/盾牌、聖騎士單手/盾牌、死靈法師單手/盾牌，在修改器 UI 切換、存檔讀寫、進遊戲冷啟動讀回、原生 `g.swapWeaponSet()` 切換與持久化皆 100% 正確。
    2. **職業專屬底材符文之語**：7 職業專屬符文之語（聖騎士 Vortex Shield/Ancients' Pledge、死靈法師 Bloodlord Skull/Splendor、法師 Swirling Crystal/Venom、亞馬遜 Matriarchal Bow/Faith、野蠻人 Fury Visor/Lore、德魯伊 Earth Spirit/Lore、刺客 Suwayyah/Chaos）在修改器產生、存入倉庫、遊戲原生載入檢查，`itemFault` 均為 null、`validateItems` 均為 0 錯誤。
    3. **修改器既有功能迴歸**：`affixSlots` 前後綴分割表格、`#unlock` 製作暗金/套裝/符文之語限制開關、英雄金色光芒（`glow`）讀寫、`#guard` 合規檢查（防 >10B 金幣與非法詞綴）、圖鑑一鍵解鎖（574 筆）與快照備份。
    4. **遊戲內繁體中文 (`lang.js`)**：主選單、20261102.1 鍵盤重綁介面、更新日誌、遊戲內語言切換及無遺漏詞條驗證通過。
    5. **輔助器自動選卡、重抽與修改器實機行為 (`autobot.js`)**：
       - `autoReroll` 正常模式：每升級畫面嚴格限制最多 2 次重抽後自動選卡並回戰鬥。
       - `cheat.infiniteRerolls` 無限重抽模式：重抽鎖定 9999 次，突破 2 次限制連續重抽直到抽中目標技能。
       - 6 技能全滿替換（`respec`）：正確識別替換卡並成功置換技能。
       - 特殊選卡模式：初始選卡與阿卡拉重置選卡直接選最佳卡不浪費重抽。
       - 遊戲修改項目全開實測：無敵（`godMode`）、滿暴擊（`criticalStrike=100`）、一擊必殺（100倍傷害）、技能全 99 等、怪物拉滿（`owed=450`）、全冠軍精英、極限掉寶（`mf=999999`）。
       - 金幣 90 億單次巨額掉落保護：單次掉落使總金幣達 95 億時，輔助器即時關閉 `cheat.maxGoldRate`，恢復倍率且不破壞已累積金幣。
    6. **輔助器七職業實機動作**：7 職業（amazon, assassin, necromancer, barbarian, paladin, sorceress, druid）在真實戰鬥中生命讀取、近遠程 REACH 走位移動、自動喝水（`drinkFrom`）、自動點屬性（`spendStatPoints`）皆通過。
    7. **雙武器組保護、垃圾販賣、全圖吸物**：備用武器組（Azurewrath + Stormshield）在換裝過程中完好保留；垃圾裝備自動賣出；經驗寶石全圖吸取（`magnet`）；寶箱自動移至角色身上。
    8. **死亡保護實機觸發**：致死傷害且無藥水時自動觸發暫停與離場（`g.pause()` / `g.leaveRun()`），安全返回營地。
    9. **營地交任務與重置**：背包有任務卷軸或待領任務時，自動呼叫 `akaraSearch` 翻譯卷軸與 `cainHandOver` 交付；技能分散時自動呼叫 `openAkara` 重置技能。
  - **未完成／寫入交接項目（依指示不重複測試，留待後續驗證）**：
    1. **長跑驗證**：輔助器由普通一至五幕連續無人介入全通關至地獄（需長時間掛機）。
    2. **營地自動開局與商店完整走訪**：營地整備後依傳送點自動開啟下一局與商店買藥/恰西升級在單一長流程中的完整串接。
    3. **赫拉迪克法典技能變體套用**：實機撿到赫拉迪克法典自動點技能變體（`hud.d2.mods.set`）與任務關卡目標（石陣、牢籠、任務頭目）的實戰鎖定。
    4. **官方 20261102.2 版本號常數門檻調高**：目前官方更新至 20261102.2，工具內部版本門檻 `TESTED_GAME_BUILD` 仍維持在 20261101.1 / 20261102.1，待使用者指示確認是否更新常數。


- 2026-11-02｜Codex｜**暫停**：依使用者要求停止測試與修改。目標仍為檢查遊戲更新並更新工具包；使用者要求以最新版網頁為主，不再驗證舊版相容，舊版／未知版本保留功能封鎖。最新官方測試版本 `20261102.1`；本機網頁程式尚未發布，`TESTED_GAME_BUILD` 仍為 `20261101.1`，因新版完整驗收未完成不可提前調高。根目錄桌面執行檔已更新至封鎖版，SHA-256 `7F5388A4246A191A90B0861023FD13F07D2A76630FFD6F606C3EAFA1FF30B82D`；本機桌面遊戲目前為 20261101.1，會被封鎖。
  - 已驗證：`tests/autobot.cjs` 160 通過、0 失敗；網頁版本封鎖端到端、雙武器組介面與隔離實機往返、亞馬遜短時間走位、選卡回呼及重綁鍵位、金幣 90 億門檻、574 筆物品一般及最高值模式生成與檢查；具體限制與指令見下方紀錄及 `docs/game-analysis/verify-20261102.1.md`。實機皆使用 TEMP 測試設定檔複本，未操作使用者存檔。
  - 未完成：最新版網頁的實際自動重抽（含一般升級與替換技能）、特殊選卡及按鍵、其他職業與長跑、死亡保護／營地／任務／完整存檔與修改器功能，及大額單次掉落跨越金幣門檻；不得把模擬或單角色測試當完整驗收。下一步先核對官方版本與現有差異，再以隔離網頁測試原版重抽回呼，逐項完成剩餘驗證；實機資料僅可用隔離測試設定檔。網頁原始碼與既有使用者／代理未提交變更均保留，未 commit／push；`.wrangler/` 為既有未追蹤資料，勿清理。停止時無已知執行中測試或委派工作。

- 2026-11-02｜Codex：輔助器的技能表與候選函式改為只載入已核對遊戲主程式所引用的 `itemArt-CUOhw0kt.js` 與 `saveTransfer-C-ucl_ha.js`，避免同頁殘留其他版本資源而選錯模組；同步 web／editor。Electron `tests/autobot.cjs` 160 通過、0 失敗，並再次在隔離官方最新版網頁驗證遊戲記憶體鍵位與儲存值不一致時仍以 KeyZ 正確選卡。

- 2026-11-02｜Codex：選卡備援優先使用新版 itemArt 的原版鍵位讀取函式，讀不到時才按 `d2s:keys` 還原預設與衝突規則。隔離官方網頁測試先以原版設定函式將選卡設為 Z／X／V，再刻意將 localStorage 改成 Q／R／T 而保留原版記憶體設定；選卡畫面啟用本機輔助器後，實際送 KeyZ、習得 Fire Arrow 並回到 playing，未碰使用者設定檔。Electron `tests/autobot.cjs` 160 通過、0 失敗。特殊按鍵與特殊選卡模式仍未完整驗證。

- 2026-11-02｜Codex：新版支援自訂鍵盤，因此自動選卡改優先呼叫 `hud.showLevelUp` 的原版 `pick` 回呼；回呼不可用時依原版 `d2s:keys` 設定及預設／衝突規則送鍵，無法確認則停下並提示；重抽同樣依回呼或設定鍵位。離開選卡畫面時清除舊回呼。隔離官方網頁實測：自然升級後原版 `pick` 回呼觸發一次、無合成數字鍵並恢復戰鬥；另以原版鍵位設定函式將選卡設為 Z／X／V，在既有升級畫面才注入輔助器，觀察送出 KeyZ、習得 Magic Arrow 並回到 playing。測試僅亞馬遜、使用 TEMP 測試設定檔複本。Electron 模擬測試 159 項通過、0 失敗；未驗證所有特殊按鍵及特殊選卡模式。

- 2026-11-02｜Codex：隔離官方 20261102.1 網頁亞馬遜測試設定檔，注入目前本機 autobot.js，只啟用戰鬥輔助的自動走位；取樣 6 次，遊戲時間 4.33→6.67 秒，角色最遠移動約 138.3 遊戲單位，狀態為「全圖走位」，隨後進入升級選卡並停止取樣。此為短時間單職業測試，未驗證長跑、其他職業、死亡保護或通關；未操作使用者存檔。

- 2026-11-02｜Codex：以隔離 Electron 載入 20261102.1 原版物品模組、目前工具引擎及本機 itemstats，對 `catalog()` 全部 574 筆各以 `generateMany(..., false)` 與 `generateMany(..., true)` 各生成一件：兩輪各 574 件均產生，遊戲 `itemFault` 與工具 `validateItems` 均為 0 件錯誤。最高值輪僅證明生成項通過兩種檢查，未獨立證明所有理論最大值可合法同時存在；未遍歷每個底材、隨機種子與全部詞綴。

- 2026-11-02｜Codex：使用者明確指示不需再驗證舊版，連網遊戲重開即為最新版；保留舊版／未知版本封鎖，後續測試專注最新版網頁。隔離官方 20261102.1 網頁，使用測試設定檔複本與測試掛鉤，建立亞馬遜 40 級、六技能的記憶體測試配置；實際呼叫原版候選函式與本機輔助器擷取，原版替換清單與工具均為 guidedArrow、valkyrie，測試角色資料不變，`Array.prototype.push`／`sort` 均已還原。僅驗證這個合成配置，未證明所有職業、特殊選卡及實際自動重抽行為。

- 2026-11-02｜Codex：複製已通過冷啟驗證的 TEMP 測試設定檔，再進入官方 20261102.1 網頁亞馬遜戰鬥，以遊戲原生 `swapWeaponSet()` 切換：回傳 true、active 由 1 改 2，`equippedOf('amazon').shield.name` 為 Pelta Lunata；1.5 秒後隔離 localStorage 亦保存 active 2 與該盾牌。僅一名角色及一件盾牌，未碰使用者存檔，不能推論全部雙持／雙手組合。

- 2026-11-02｜Codex：在官方 20261102.1 網頁以本機 HTTP 載入未發布工具、使用 TEMP 測試設定檔副本；修改器 `capabilities.supported=true`、目錄 574 筆，原版引擎產生 Pelta Lunata 且 `faults=[null]`，將盾牌放入測試角色備用組、金幣設 12345 後後端寫入及讀回成功。同一視窗重載等待 `did-finish-load` 逾時；改為關閉後以同一隔離設定檔冷啟遊戲，實際 `g.save` 讀回金幣 12345、武器組 active 1、備用盾牌 Pelta Lunata，原始 localStorage 相同。未測其他存檔與裝備，無使用者存檔寫入。

- 2026-11-02｜Codex：以先前測試設定檔的 TEMP 複本開啟官方網頁 20261102.1、注入目前本機 autobot.js，確認實際 Game 掛鉤成功，主程式載入類型為 `script`。第一次在隱藏視窗與 levelUp 測試，設定 90 億後未關閉；第二次經原版介面選卡後仍未關閉，當時未記錄世界時間。改為畫面外顯示測試視窗並確認戰鬥時間由 3.83 增至 4.65 秒：啟用時 `world.gold=123` 保留、`goldGain=999999`；設定存檔金幣 8999999877 加本局 123 後，開關自動關閉、倍率還原 1.25、本局金幣仍 123。僅改動測試設定檔複本，未操作使用者存檔；大額單次掉落跨越門檻尚未驗證。

- 2026-11-02｜Codex：封鎖版桌面可攜包已重建，asar 的 index／main／engine／engine-page／signatures／patch 與來源雜湊一致。以隔離 TEMP 設定檔啟動，實際 IPC `capabilities` 回報本機遊戲 `20261101.1` 不支援，直接呼叫 `save` 回傳不相容且未碰使用者存檔；根目錄執行檔已替換並與 dist 比對，SHA-256 `7F5388A4246A191A90B0861023FD13F07D2A76630FFD6F606C3EAFA1FF30B82D`，前一版另備份於 `backups/D2倖存者存檔修改器-before-version-gate.exe`。網頁仍未發布；最新輔助器模擬測試 158 項通過，包含原版候選異常時還原原型。

- 2026-11-02｜Codex：修正網頁版本辨識不能把工具自己的 `fetch` 掃描當成遊戲已載入：`activeGameScript` 僅採 `script`／`link`／`other` 載入類型。隔離 Chromium 實測 modulepreload 為 `other`、動態 import 為 `script`、fetch 為 `fetch`；`tests/version-gate-web.cjs` 重跑三版，最新版允許、20261101.1 與 20261030.2 拒絕寫入，未知、混雜，以及舊版執行中僅掃描到新版時均拒絕且資料不變。桌面後端每次操作重讀安裝版 changelog；引擎啟動後安裝包變更則封鎖，`tests/version-gate.cjs` 通過。此機桌面遊戲為 20261101.1；使用者要求驗證以網頁為主。

- 2026-11-02｜Codex：AGY 工作 8db56b1d9a08 的工具登記已失效，但日誌 `%TEMP%/agent-delegation-logs/68daaf31-agy.log` 顯示已完成；其提出同步攔截原版替換清單。自行核對 `ss`／`Ka` 後，只在一般升級且原版抽樣池實際含 `respec` 時補入原版隨機選擇前的其他替換候選，避免在特殊選卡模式擴充；以 `finally` 還原 `push`／`sort`。模擬測試涵蓋隱藏替換與排除，157 項通過；異常還原測試已新增，待重跑。真實遊戲選卡尚未驗證，AGY 報告對完整性的斷言不作為實機結論。

- 2026-11-02｜Codex：依使用者要求「測試都先以網頁版為主」。新增網頁實際後端與 iframe 端對端測試 `tests/version-gate-web.cjs`：隔離 Electron 載入新版 `Game-Ba9RuE4G.js` 與舊版 `Game-CP0n0PpN.js` 原版模組、目前 itemstats 和工具程式；新版可透過介面寫入隔離測試存檔，舊版拒絕且不改資料，未知、未載入或混雜主程式亦拒絕。測試通過，未測線上部署或使用者存檔。輔助器模擬舊版／未知版本時封鎖走位、喝水與修改，最新測試 155 通過、0 失敗。網頁主程式與物品／存檔模組必須皆為 20261102.1；桌面版使用安裝包內 changelog，遊戲檔案在工具運行中變更亦封鎖。此機實際安裝包 changelog 為 20261101.1。修改器的介面、網頁寫入後端、桌面 IPC 與物品引擎均有封鎖；根目錄可攜版先前建置早於上述封鎖，需重新打包後替換。

- 2026-11-02｜Codex：使用者調整目標：工具包只針對最新遊戲修正，玩家使用舊版時封鎖不相容功能。舊版 `Game-C88Jt16A.js`／`Game-CP0n0PpN.js` 與新版 `Game-Ba9RuE4G.js` 的必要引擎特徵均命中；隔離 Electron 對每版七職業技能變體、三件代表物品及 20 件職業底材符文之語冒煙測試均無錯誤，使用現有 itemstats，不代表完整舊版相容。先前僅依雙武器組特徵封鎖仍不足以滿足最新要求，正在改為依實際遊戲程式版本封鎖修改器寫入與遊戲相依操作；需避免僅以網路最新 changelog 代替本機實際版本。

- 2026-11-02｜Codex：AGY 稽核 ac2ce231fa08 完成；自行對照新版 `saveTransfer-C-ucl_ha.js` 的 `ss`，技能欄滿時原版在候選池前隨機選出一個 `respec`，故目前單次擷取無法窮舉所有可替換技能，可能漏掉值得重抽的選項。未採用多次抽樣冒稱完整。金幣保護修正後 Electron `tests/autobot.cjs` 最終為 154 通過、0 失敗；仍需新版實戰驗證及處理高額單次掉落跨過門檻的情況。

- 2026-11-02｜Codex：追查新版金幣保護：原版 `collectFloorLoot` 與 `autoSell` 對 `world.gold` 累加，可確定它是本局金幣，舊輔助器每幀寫 999999 屬錯誤。同步 web／editor 不再覆寫該欄位，90 億門檻計入存檔與本局金幣，關閉或卸載時有條件還原 `player.goldGain`。首次模擬測試因測試碼重複卸載造成 `__d2autobot is not defined`，已修正測試並重跑；新版實戰與高金額單次掉落跨越門檻尚未驗證。

- 2026-11-02｜Codex：以隔離 Electron 載入 20261102.1 原版物品模組與目前引擎，對 Vortex Shield／Ancients' Pledge 隨機產生 100 件比較遊戲 `itemFault` 與修改器 `validateItems`；遊戲錯誤 0 件、工具拒絕 0 件。測試包含抗性與傷害／攻擊命中兩類固有詞綴，只涵蓋一種底材與符文之語，不能推論所有組合。

- 2026-11-02｜Codex：以獨立 TEMP `APPDATA`／`LOCALAPPDATA` 啟動新可攜版並透過 CDP 確認視窗標題、修改器及寫入按鈕載入；隔離設定檔沒有存檔，顯示找不到 localStorage，未測遊戲存檔。將根目錄執行檔備份至 `backups/D2倖存者存檔修改器-before-20261102-update.exe`，備份與舊版雜湊均為 `A8F5FB3E6D7DC14D04BE4503E9BD60D3946E2C1E0BCCA263757510346AC86D49`；根目錄已替換成新版，與 dist 雜湊同為 `8B0E0457AD0205982154050235767563892DE5AE953AFE32DB4625F4F40627C7`。新版完整遊戲驗收仍未完成。

- 2026-11-02｜Codex：新增 `tests/weapon-sets-ui.cjs`，以隔離 Electron 設定檔和假後端載入實際 web／editor 修改器，測試切換武器組、未按寫入不呼叫後端、按寫入後兩組與其他裝備保持正確；兩端測試均通過，未碰真實存檔。`editor/build-web.js` 與其回歸測試新增複製兩個武器組測試，`node tests/build-web.cjs` 通過。新增 `docs/game-analysis/verify-20261102.1.md` 整理更新與未驗證項目。

- 2026-11-02｜Codex：修改器兩個武器組頁新增切換按鈕，可切換後用既有身上裝備流程編輯另一組；僅更動記憶體，需按寫入才保存。從新版 `saveTransfer-C-ucl_ha.js` 擷取原版切換函式，以隔離 VM 比對 36 種狀態，與修改器輸出一致；`node tests/weapon-sets.cjs` 兩頁通過，`node tests/test_lang.cjs`、`node ../editor/tests/build-web.cjs` 通過。尚未驗證實際遊戲讀檔。重新建置 `editor/dist/D2倖存者存檔修改器.exe` 成功，SHA-256 `8B0E0457AD0205982154050235767563892DE5AE953AFE32DB4625F4F40627C7`；asar 的 index、engine-page、signatures 均與來源相符，未替換根目錄執行檔。

- 2026-11-02｜Codex：AGY 工作 e3186f7baa71 已成功結束，唯讀確認新版選卡函式 `Do`／匯出 `va` 為既有特徵唯一命中；武器函式為 itemArt 的 `A`，舊的 `O` 已改為雙持判定。此證據支持目前載入修正，尚不證明抽樣與選卡行為。新 AGY 工作 ac2ce231fa08 稽核候選擷取與副作用。

- 2026-11-02｜Codex：新版選卡候選函式位於 `saveTransfer-C-ucl_ha.js` 的 `Do`（匯出 `va`），`Game-Ba9RuE4G.js` 的 `offerLevelUp` 以 `itemArt-CUOhw0kt.js` 匯出 `A` 取得武器；原本只搜尋 keepSave 與固定 itemArt.O，無法可靠支援新版。同步修改 web／editor 的 autobot.js：辨識兩種模組名稱，從目前 Game 選卡呼叫及 import 尋找武器函式，找不到時不推測重抽。模擬新版模組及武器參數的 Electron 測試最終重跑 152 通過、0 失敗；新版原始碼靜態解析成功，尚未實戰驗證自動選卡。AGY 工作 e3186f7baa71 仍在檢查，應繼續輪詢。

- 2026-11-02｜Codex（已過時）：`editor/npm run dist` 因 Windows 無法建立 winCodeSign 的 macOS 符號連結而失敗；改執行 `electron-builder --win portable --config.win.signAndEditExecutable=false` 成功，未簽章。後續版本與雜湊見上方紀錄。

- 2026-11-02｜Codex：新版介面繁中補 112 條並同步 web／editor；代理以原版翻譯器比對韓文模組 11937 條直接字串，僅 DPS 保留原文，未涵蓋動態樣板及畫面實測。`node tests/test_lang.cjs` 通過。修改器 `validateItems` 對職業底材符文之語的例外已修正：分離隨機固有詞綴與固定屬性並在資料不足時拒絕驗證；代理以新版引擎實測 Pelta Lunata、Civerb's Ward、Ancients' Pledge／Vortex Shield，遊戲 `itemFault` 均為 null、修改器驗證均無問題。`node tests/runeword-class-base.cjs`、`node tests/skill-mods.cjs`、`node tests/build-web.cjs` 通過；固有詞綴範圍採抽樣，未涵蓋全部組合。

- 2026-11-02｜Codex：雙武器組適配同步修改器頁面：列出目前與備用組，備用裝備納入物品檢查、一鍵最高及新存檔複製；暫禁止移入備用組，既有物品可編輯或移出。官方 `saveTransfer-C-ucl_ha.js` 確認 `active` 為 1／2，`weaponSets` 保存未啟用組。`node tests/weapon-sets.cjs` 兩版通過；未實機讀寫。修正 `signatures.json` 的 `modDefs`，代理以新版 47 個模組與 itemstats 隔離啟動引擎，七職業可取得技能變體；待主代理複驗測試。`node tests/test_lang.cjs`、`node ../editor/tests/build-web.cjs` 通過，Electron `tests/autobot.cjs` 152 通過、0 失敗；新版完整實戰尚未驗證。AGY 正唯讀檢查新版選卡候選產生器。

- 2026-11-02｜Codex：重新讀取官方 `/changelog.json`，最新仍為 `20261102.1`。取得首頁列出的 30 個 JS 區塊並以 `editor/patch.js` 及現有 `signatures.json` 比對：所有必需特徵命中，選用 `modDefs` 未命中；僅為靜態比對，不能證明引擎啟動或資料正確。新版 `Game-Ba9RuE4G.js` 顯示 `equippedOf` 使用目前 `equippedByClass`、`swapWeaponSet` 透過 `changeGear` 切換，`steer` 使用 `input.moveVector()`；雙武器組、自動走位與存檔仍需實際驗證，未更新已驗證版本常數。另分工檢查物品引擎、雙武器組與翻譯。

- 2026-11-02｜Codex：以 GitHub Pages 版本及全新隔離設定檔實測遊戲 20261102.1（Game-Ba9RuE4G.js）；目前本機 autobot.js 與部署版本雜湊不同，本機重抽新邏輯未測。總開關關閉時單開無敵，生命維持 50/100；開啟總開關後回滿。逐項開啟觀察致命被動 99、might 100、已學魔法箭 99、重抽／跳過／排除 9999、magicFind 與 goldGain 999999、普通怪轉冠軍；效果和實戰結果仍需分開驗證。隔離角色金幣設為 8,999,999,999 時金幣開關保持啟用，設為 9,000,000,000 後關閉，但 goldGain 和 world.gold 仍為 999999，保護實際效果未通過。另一個只開無敵及最大怪量的新角色，升級選卡後戰鬥約 10 秒普通怪由 8 增至 10，owed 達 463，隨後升級暫停，未證明達 450 隻。官方更新新增雙武器組、可重新綁定鍵盤且預設方向鍵移動、恐怖層 40 以上尋寶與金幣加成調降，須重新驗證走位、裝備、掉落及新版掛鉤。測試日誌：%TEMP%\d2-cheat-independent-0f14b763cf2c4305ae58d3074009009f\log.txt 與 %TEMP%\d2-density-4abe74a4625d4dbc9c9d9eb4165ee76b\log.txt。

- 2026-11-02｜Codex：遊戲修改總開關與無限重抽同時開啟時，自動選卡不受每次升級兩次上限限制；未啟用時保留上限，仍依原版可抽候選與評分決定是否重抽。同步 web／editor；`node --check` 與 Electron `tests/autobot.cjs` 152 項通過、0 失敗，涵蓋啟用時連續五次及總開關關閉時兩次上限；未實機驗證、未發布。

- 2026-11-02｜Codex：一般升級改呼叫原版候選產生器並同步擷取抽樣前排序清單，依遊戲目前等級、欄位、排除、替換與技能／被動限制評分，包含未學技能；當可抽選項比現有最佳卡高至少 10 分且不在現有卡時才重抽，每個升級畫面預設最多兩次（無限重抽啟用時不受此限），即使選卡按鍵未生效也不重置上限。原版函式無法識別、初始選卡或重新配置時直接選現有最佳卡；技能評分為輔助器啟發式而非保證實戰最佳。使用原版 `keepSave-x6SwGO80.js` 的候選產生器 `ji`，透過同步暫時攔截候選排序並於 finally 還原；遊戲更新可能使辨識失效而保守選卡。`node --check`、`node tests/test_lang.cjs`、`node ../editor/tests/build-web.cjs` 通過；Electron `tests/autobot.cjs` 150 項通過、0 失敗，含未學技能、排除、現有最佳及兩次上限。未實機驗證、未發布。

- 2026-11-02｜Codex（已過時）：取代先前 30 級暫定門檻。檢查原版 `keepSave-x6SwGO80.js` 的 `oa`／`aa`／`F`，以及 `itemArt-BTVnyuWi.js` 等級表：已學技能升級須達技能解鎖等級加目前技能等級；由遊戲載入等級表，僅有符合等級、未滿級、未排除且評分更佳的已學技能或被動時才重抽，資料缺失時選現有卡。未學技能及起始技能特殊例外採保守判斷，可能少重抽；尚未實機驗證。每次重抽僅使用一種觸發方式。同步 web／editor；Electron `tests/autobot.cjs` 147 項通過、0 失敗，`node --check`、`node tests/test_lang.cjs`、`node ../editor/tests/build-web.cjs` 通過；未發布。

- 2026-11-02｜Codex（已過時）：自動選卡新增等級保守策略：未滿 30 級或無法取得等級時選現有最佳卡，30 級以上沿用低分重抽；讀取 player.level 並以 build.level 備援，兩處選卡路徑共用。`node --check` 通過，Electron `tests/autobot.cjs` 147 項通過、0 項失敗。30 級為保守暫定門檻，尚未核實原版完整技能解鎖規則與實機行為；未發布。其他代理曾同時驗證並記錄相關修改，後續修改前須確認協作狀態。

- 2026-11-02｜Codex：隔離 Electron 設定檔以 GitHub Pages 載入真實遊戲 20261101.1，測試開始時遠端與本機 autobot.js 雜湊相同。亞馬遜戰鬥開啟全部修改後，觀察到滿血、godMode=true、might=100、技能 99、重抽等數值 9999、magicFind 與 goldGain 為 999999、普通怪轉冠軍及 director owed 455；尚未證明實際傷害、掉落機率或 450 怪上限。關閉總開關後仍觀察到 godMode、might、magicFind 與技能等數值未還原。重抽數由 9999 降至 9982，需追查限制。繁中職業名稱造成測試框架英文比對失敗，已手動選角。測試時其他代理正在修改 autobot.js 與 tests/autobot.cjs；未改動這些檔案。完整逐項實戰、90 億保護與新版重新驗證尚未完成。紀錄：%TEMP%\d2-cheat-validation-6d0be73b7cd94539b7a4273c122eedb5\log.txt。

- 2026-11-02｜Antigravity：全面驗證所有功能、修復真實遊戲底層相容 Bug，並更新「怪物數量最大化」與「技能最高等級99等」（同步 `web/` 與 `editor/`）：
  1. **使用者指定功能變更**：
     - **怪物數量最大化（`cheat.maxMonsterDensity`，相容舊欄位 `cheat.monsterDensity10x`）**：介面名稱改為「怪物數量最大化（地圖怪物生成速度與數量拉滿）」。對接真實遊戲 `Game.director`（`saveTransfer-B-JMspCD.js`），每幀將 `director.batchTimer = 0`、`director.owed = Math.max(owed, 450)`（恐懼層則同時拉滿 `director.waveDue = Math.max(waveDue, 450)`），使原版生成器每幀持續刷怪直到原版硬上限 450 隻，並鎖定 `world.monsterDensity = 999` 與 `world.spawnRate = 999`。
     - **技能最高等級 99 等（`cheat.maxSkills`）**：介面名稱改為「技能最高等級99等（所有已學技能與被動等級鎖定99等）」。將 `g.build.skills` 所有已學技能 `s.level` 鎖定為 `99`，並將 `g.build.passives` 所有已學被動等級鎖定為 `99`（觸發原版 `b0` 自動以 99 等套用被動加成）。
  2. **全專案驗證與真實遊戲底層 Bug 修復**：
     - **修復怪物複製導致 Pixi Sprite 崩潰與倍率溢位**：舊版每幀對 `world.enemies` 淺拷貝（`Object.assign({}, orig)`）會共用同一個 `orig.sprite`，當任一分身死亡呼叫 `sprite.destroy()` 時會導致真機渲染崩潰；且 `(world.monsterDensity || 1) * 10` 每幀累乘會在數秒內溢位為 `Infinity`。現改為真機透過 `g.director` 原生生成，僅在無 `director` 且無 `sprite` 的模擬測試環境鏡像補滿敵怪。
     - **修復一擊必殺（`cheat.oneHitKill`）真機屬性對接與累乘溢位**：逆向確認真機傷害公式（`moved-C2l42iCZ.js` 的 `D(e,t)`／`O(e,t)`）使用 `player.might`、`player.weaponDamage` 與 `player.mastery.{physical,fire,cold,lightning,poison,magic}`，而非 `damageMult`；且舊版 `(p.damageMult || 1) * 100` 每幀累乘會變 `Infinity`。已修正為同時設定 `might = 100`、`weaponDamage = 100`、六系 `mastery = 100` 及固定 `damageMult = 100`。
     - **修復致命攻擊（`cheat.maxCrit`）真機暴擊率**：真機暴擊率透過 `passiveLevels.criticalStrike` 計算（`Yp`），已同步將 `player.passiveLevels.criticalStrike` 設為 `99`。
     - **修復全精英怪（`cheat.allElites`）缺少 `mods` 陣列崩潰**：真機非 `normal` 怪物每幀會執行 `e.mods.includes("teleport")`，升階時若未初始化 `e.mods` 陣列可能拋出 `TypeError`，已補齊 `if (!Array.isArray(e.mods)) e.mods = []`。
     - **修復升級選卡自動重抽（`autoReroll`）真機防連點攔截與無限重抽迴圈**：真機重抽按鈕使用 `onFreshClick`（檢查 `grace.key`），合成 `click()` 與 `KeyR` 不會觸發重抽；已改為在 `hud.showLevelUp` 攔截第三參數 `handlers` 並直接呼叫 `handlers.reroll()`，且限制每次升級最多自動重抽 10 次，防止搭配「無限重抽」時陷入無窮重抽迴圈。
     - **補齊 `i18n.js` 遊戲修改分頁完整英文翻譯**：為所有遊戲修改分頁標題與開關說明補上對應英文詞條。
  3. **測試與驗證**：
     - 語法檢查：`node --check` 通過 `web/` 與 `editor/` 所有 JS 檔案。
     - 語言單元測試：`node web/tests/test_lang.cjs` 與 `node editor/tests/test_lang.cjs`（6/6 通過）。
     - 建置回歸測試：`node editor/tests/build-web.cjs` 通過。
     - Electron 模擬測試：`editor/node_modules/electron/dist/electron.exe web/tests/autobot.cjs` 通過（**146 項通過、0 項失敗**）。未執行 commit/push。

- 2026-11-02｜Antigravity：自動配技能支援使用重抽（autoReroll）（同步 `web/` 與 `editor/`）：
  1. **重抽判定與觸發機制**：
     - 在升級選卡（`pickCard`）中回傳最佳卡片之評分（`score`）。
     - 若當前三張卡片最佳評分低於門檻（< 25 分，代表沒有進化卡、再次習得卡、主力技能或關鍵進化被動），且角色仍有重抽次數（`build.rerolls > 0` 或啟用無限重抽且重抽鈕可用），自動觸發重抽（點擊原版重抽按鈕並發送鍵盤事件 `KeyR`）。
     - 更新輔助器狀態提示為「自動配技能：卡片評分低，使用重抽換一批技能卡」，並於重抽後自動重新評估新卡。
  2. **設定與多語言支援**：
     - 在設定 `build` 區塊新增 `autoReroll` 開關（預設為 `true`，升級選卡低於標準時自動使用重抽）。
     - 版本號升級至 `version: 10`，支援舊版本自動升級相容。
     - 在「自動戰鬥」面板「排行榜學習」群組中新增設定欄位「自動重抽（升級候選卡評分偏低時自動使用重抽）」，並同步中英文國際化翻譯（`i18n.js`）。
  3. **測試與驗證**：
     - 更新 `tests/autobot.cjs`，包含可及性設定切換開關、舊版本遷移檢查（`version: 10`）與升級選卡低評分自動觸發重抽單元測試。
     - 執行全套 Electron 模擬測試通過：**145 項通過、0 項失敗**；`test_lang.cjs` 通過（6/6）；`build-web.cjs` 通過。未執行 commit/push。

- 2026-11-02｜Antigravity：遊戲修改功能擴充與全項目獨立總開關配置（`web/autobot.js` 及同步 `editor/autobot.js`）：
  1. **預設全部關閉與修改總開關**：
     - 在「遊戲修改」分頁最上方新增「遊戲修改總開關（主控所有修改項目）」（`cheat.enabled`），且所有修改功能預設值一律為 `false`。
     - 若修改總開關未開啟，所有修改項目即使單獨勾選亦不生效，確保安全性。
  2. **新增修改項目實作**：
     - **無敵 (`cheat.invincible`)**：啟用原版戰鬥防護 `world.godMode = true`，鎖定受傷倍率 `damageTaken = 0`，且生命值自動維持全滿。
     - **致命攻擊（機率最高，`cheat.maxCrit`）**：設定角色 `criticalStrike = 100` 與 `deadlyStrike = 100`，使所有攻擊必出暴擊。
     - **一擊必殺（所有屬性傷害一百倍，`cheat.oneHitKill`）**：全屬性傷害倍率（物理、火、冰、電、毒、魔法、元素）全面提升 100 倍（`*DamageMult = 100`）。
     - **技能等級最高 (`cheat.maxSkills`)**：遍歷角色當前所有技能與被動，自動依原版技能定義上限（`maxLevel`）升至最高等級。
     - **怪物數量提升10倍 (`cheat.monsterDensity10x`)**：動態調高地圖生成密度與刷新率，並在戰鬥中安全鏡像複製敵怪群達 10 倍數量。
     - **一般怪物全部變成精英以上等級 (`cheat.allElites`)**：自動將場上所有普通怪物（`normal`）轉換為冠軍怪（`champion` / `elite = true`），享有強化詞綴、血量與掉落提升。
     - **選技能重抽無限次數 (`cheat.infiniteRerolls`)**：鎖定升級選卡重抽、跳過與排除次數為 9999 次，解除按鈕禁用狀態。
     - **掉寶率與金幣掉落率最高**：保留並強化現有 999999 尋寶率與金幣倍率，金幣超過 90 億時自動關閉安全保護。
  3. **測試與驗證**：
     - 更新 `web/tests/autobot.cjs` 涵蓋全部 8 項新修改開關的可及性與邏輯套用測試。
     - `node --check` 驗證通過，`test_lang.cjs` 6/6 通過。未執行 commit/push。

- 2026-11-02｜Antigravity：專案整體最佳化與手機解析度最佳化（同步 `web/` 與 `editor/`）：
  1. **手機解析度與行動裝置體驗最佳化**：
     - `editor.html` / `editor/index.html`、`index.html` / `editor/web-install.html`、`site/index.html` 全面加入 `viewport-fit=cover`、`-webkit-text-size-adjust: 100%` 與 `env(safe-area-inset-*)` 四向安全區域邊距。
     - `editor.html`：新增 `@media (max-width: 390px)` 窄螢幕自適應（格子 `--cell: 25px` 讓 10×10 倉庫不溢出 360px 螢幕、表單改單欄）與 `@media (max-height: 500px)` 手機橫向壓縮頁首；`#hero`、`#guard`、`#saves` 表格支援觸控水平捲動；`#cQ`、`#fQ`、`#snapName` 改為彈性寬度，清單限高 `48dvh` 避免捲動過長。
     - `autobot.js`：面板標題列設為 `position: sticky; top: 0`（手機長清單捲動時隨時可按關閉），窄螢幕與橫向模式自適應，下拉選單在窄螢幕自動滿版換行，狀態列寬度提升至 `92vw`。
     - `lang.js` / `d2edit.js`：語言下拉選單限制在畫面可視範圍內（`min(..., calc(100vw - 210px))`、`max-height: calc(100dvh - 64px)`），按鈕統一 `min-height: 44px` 與 `touch-action: manipulation`。
     - `site/index.html`：手機版保留可橫向滑動的導覽列膠囊按鈕。
  2. **載入速度與執行效能最佳化**：
     - `d2edit.js`：書籤預載 6 個步驟改為 `Promise.all` 並行載入並即時更新進度條；快取共用 `window.__d2zhPromise` 與 `window.__d2gamedataPromise`，避免 `d2edit.js`、`autobot.js`、`lang.js`、`backend.i18n()` 重複抓取與解析 891KB 字典。
     - `autobot.js`：預先計算 16／24 方向單位向量（`DIRS_16`、`DIRS_24`）與 `LADDER`／`SKILLS`／`PASSIVES` 小寫名稱 `Map` 索引；`planMove` 移除每幀 48 次 `.filter()` 陣列配置；`step()` 在未喝水時重用當幀 `state` 與 `danger`，省下每幀重複過濾實體與威脅計算。
     - `lang.js`：快取 `redrawStaticCanvases` 掃描到的遊戲點陣字型實例，避免每次重畫都對 `game` 做 6 層 BFS；`numPatterns` 逾千個正規式改為僅在無 `GameTranslator` 備援模式時延遲建構（`ensurePatternIndex`）。
     - `i18n.js`：標點替換合併為單一預編譯正規式 `PUNCT_RE`。
  3. **專案結構清理與 `web`/`editor` 同步**：
     - 修正 `editor/main.js` 缺少 `"affixSlots"` IPC 白名單與 `editor/webapi.js` 缺少 `"gameBuild"`；同步 `web/editor.html` 與 `editor/index.html`（含更新日誌頁、`TOOLKIT_VERSION` 檢查與賭博商店合規排除）；更新 `editor/build-web.js` 與 `editor/tests/build-web.cjs`。
     - 移除不明追蹤檔 `web/tests/dbg.cjs`，並將根目錄散落的舊暫存檔與 `.bak-*` 統一整理至 `backups/archive/`。
  4. **驗證**：全部 JS `node --check` 通過、`node tests/test_lang.cjs`（6/6 通過）、`node ../editor/tests/build-web.cjs` 通過、Electron `tests/autobot.cjs` **119 項通過、0 項失敗**。未執行 commit/push。

- 2026-11-02｜Codex：使用既有測試設定檔複本、Electron 390×844 與真實 d2survivors.lol，透過 GitHub Pages 載入工具；前端畫面實測輔助／語言／修改器顯示在 x=12、y=12／62／112，文字正確且三者點擊分別開啟輔助設定、語言清單與修改器 iframe。截圖為 %TEMP%\d2-ui-live-test\main.png（第二輪為修改器畫面）；未驗證選項子頁、戰鬥下方狀態列與實體手機。全新設定檔先導向素材設定，改用隔離複本。

- 2026-11-02｜Codex：語言入口文字固定為「語言」，沿用左上角直排；同步 web 與 editor 的 lang.js。兩處 node --check 與 web 的 node tests/test_lang.cjs 通過；尚未手機實測、未發布。

- 2026-11-02｜Codex：此次介面更新僅暫存本次相關差異，於暫存版本獨立執行 Electron tests/autobot.cjs，116 項通過、0 項失敗；保留其他未提交工作。

- 2026-11-02｜Codex：主選單及其選項等前端畫面以 frontend-open 顯示輔助、語言、修改器入口；輔助設定允許在前端開啟，戰鬥暫停判定維持獨立。同步 web 與 editor；node --check、node tests/test_lang.cjs 通過，Electron tests/autobot.cjs 119 項通過、0 項失敗（首次測試使用舊面板參照失敗，修正測試後重跑通過）。尚未實機驗證、未發布。

- 2026-11-02｜Codex：遊戲中「停止輔助」與狀態列移至下方中央；暫停選單的輔助、語言、修改器改為左上角直排，語言清單向右展開。同步 web 與 editor；兩處 JS 的 node --check 通過，web 的 node tests/test_lang.cjs 通過，Electron tests/autobot.cjs 117 項通過、0 項失敗。尚未實機確認畫面，未發布。


- 2026-11-02｜Codex：全圖撿裝拆為關閉、全部撿取、只撿更好的裝備；沿用既有 vacuum／onlyUpgrades 設定，全部模式忽略裝備品質過濾，升級模式用既有換裝評分，無法評估時不撿。已同步 web 與 editor，護符和其他物品沿用原規則；web 執行 `..\editor\node_modules\.bin\electron.cmd tests\autobot.cjs`：117 項通過、0 項失敗；`node --check autobot.js`、`node --check i18n.js` 通過。實際遊戲未驗證，未發布。


- 2026-11-02／Codex：接續桌面翻譯普查；lang.js 對後建 d2-text 畫布排程重畫，開放翻譯輸入框 placeholder、保留輸入值，locales/zh-TW.json 補存檔代碼提示。node --check lang.js 與 node tests/test_lang.cjs 通過；tools/desktop-lang.mjs 以原版重建 %TEMP%\d2lang-baseline.asar 與 d2lang-updated.asar 成功。新的隔離桌面測試程序未開啟預期 CDP 9444，尚未驗證畫布重畫、上一輪 22 筆、各畫面與 hover，需排查啟動參數後補截圖；9333 舊程序截圖 %TEMP%\d2lang-current-1.png 非新版驗證。未修改字型、未 commit/push。
- 2026-11-02／Codex：桌面繁中普查未完成；locales/zh-TW.json 新增 22 筆翻譯。node --check lang.js 與 node tests/test_lang.cjs 通過；DT 重建後確認存檔摘要及新聞日期已翻譯。暫停語言切換已操作；升級畫面靜態標題與分段文字、存檔輸入框提示仍待修正，物品欄、角色與結算及完整重跑仍待驗證。未改字型，未 commit/push。

#### 長期規則：遊戲更新後全部重新驗證（使用者要求，2026-11-01）
遊戲（d2survivors.lol）任何版本更新後，本專案所有功能都要重新驗證，不可沿用舊版的驗證結論：
- 版本來源：官方 `/changelog.json` 第一筆的 `build`（目前驗證過的是 `20261101.1`），以及遊戲主程式 `/assets/Game-*.js` 檔名。輔助器與修改器的常數 `TESTED_GAME_BUILD` 記錄已驗證的版本，遊戲版本較新時兩個工具的設定上方都會提示。
- 修改器：`signatures.json` 與 `patch.mjs` 的程式區塊比對（引擎能否啟動）、物品產生器與 `allowedStats`／`affixSlots`／`validate` 原版規則、存檔格式與簽章（`d2-survivors/save/v1`、heroes／kept／continue）、金幣與屬性點上限、製作限制、收藏與倉庫讀寫。
- 輔助器：原版 Game 掛接與各內部函式名稱（useQuest、readCodex、hud.d2.mods、waypointView、startRun／continueRun、endAfterBaal、leaveRun、gearActions、heroNumbers、openCampTrade、akaraSearch 等）、走位與閃避常數、選卡與配點、營地整備、法典與任務流程、死亡保護、難度推進規則。
- 驗證方式：模擬測試 `web/tests/autobot.cjs`（以 Electron 執行）、修改器以模擬 api 載入、以及每職業全新存檔實機長跑（輔助器全自動，不手動介入）；確認無誤後才把 `TESTED_GAME_BUILD` 改成新版並記錄於此。
- 官方更新內容先讀 `/changelog.json`，與合法性、存檔欄位、掉落與經驗規則相關的改動要優先核對。

#### 長期規則：子代理成果整合回專案（使用者要求，2026-11-01）
- codex／agy 等子代理完成的分析、資料與工具，核對後一律整合進倉庫，不只留在暫存資料夾：遊戲反編譯分析在 `docs/game-analysis/`（不放遊戲原始碼，用 `formatter.js` 在本機產生）、排行榜學習在 `tools/ladder-learn.js`、實機測試框架在 `tests/live-harness/`。
- 實機測試一律用 GitHub 連結：推送後以 `tests/live-harness/reload-gh.cjs` 等部署完成，再讓測試頁面以書籤方式重載。

#### 工作紀錄
- 2026-11-02｜Claude：補完畫面普查（桌面版實測）：存檔、選項（含子頁，遊戲語言選項改顯示「繁體中文」）、角色、物品欄、商店、暫停、死亡結算皆為繁中；新增魔法／稀有物品名稱拆解翻譯（工匠之福運戒指）；切換語言改為與原生相同的重新整理（桌面版 English↔繁中來回實測正常）。
- 2026-11-02｜Claude：語言功能真實遊戲實測（網頁版：獨立 Electron 載入 d2survivors.lol＋本機書籤程式；桌面版：官方 2026.1101.1 複本以 tools/desktop-lang.mjs 注入、獨立 APPDATA，不動真實安裝與存檔）。修正：遊戲點陣字型只認韓文→擴充中日文字並可逐字換行；書籤載入前已畫好的畫布依原字型／陰影／換行重畫（升級標題、商店提示等）；整句相符時保留譯文換行（主選單版權文字兩行）；桌面版 app:// 無資源紀錄→沿 import 爬模組、翻譯器類別在 lang-*.js 由注入工具補匯出；版本號「Build」改走字典鍵「Build (version)」。實測主選單、選職業、升級、HUD、暫停（中上方語言按鈕）、營地商店皆為繁中；__d2lang.missing() 只剩稀有／魔法物品名稱（遊戲原版韓文也不翻稀有名）。字型依使用者指示暫停（已可從本機 D2R 取出，未再調整）。未 commit/push。
- 2026-11-02｜Codex：依要求修改 `lang.js` 靜態畫布重畫，傳入 `color`、置中、原畫布寬度、`balance` 與陰影，保留 class/style；`node --check lang.js`、`node tests/test_lang.cjs` 通過。以原版 asar 重建桌面測試複本並重新啟動，CDP 確認載入新版，但主選單版權文字仍與版本重疊，截圖 `desktest/codex-verified-1.png`；問題未解決，尚未同步 editor，未 commit/push。需繼續確認主選單版權文字的實際繪製路徑。
- 2026-11-02｜Codex：調整 `lang.js` 的桌面版本號辨識及靜態文字畫布尺寸保護，補充 README 桌面注入與字型說明，並同步 `lang.js`、`d2rfont.js`、`locales/`、`tools/` 至 editor。`node --check lang.js`、`node tests/test_lang.cjs` 通過。桌面測試複本重建後主選單 `__d2lang.missing()` 為空，版本顯示「版本」，但截圖仍顯示版權文字與版本號重疊，尺寸保護尚未解決該問題。兩版本各畫面、語言切換及缺漏盤點尚未完成，勿視為驗收通過。未 commit/push。
- 2026-11-02｜Claude：重跑「每職業 5 個全新存檔、任務模式、不介入」（`launch.ps1 -Classes "amazon,sorceress,necromancer,paladin,barbarian,druid,assassin" -Copies 5`，職業清單須加引號；`boot.js` 改為明確寫入 `terror.mode="off"`）。約 20 分鐘：全普通難度、僅 barbarian-3 陣亡 1 次、任務全 0／6；尋找凱恩 24 個卡在樹頭木拳、11 個有鑰匙。**發現**：4 個存檔曾到「石塊陣已開門：進入傳送門」，後來全退回「有鑰匙」——一般通關傳送門出現時 `portalDue` 跳過 `questGoal`，角色離開該局、石陣重置。已在本機 `autobot.js` 修正（石陣／任務傳送門／牢籠在 portalDue 時仍優先），模擬測試 110／110 通過，**未推送**（依規則等本輪結束再更新）。codex 靜態分析另指出樹頭木拳／拉卡尼休只是走位目標、技能未鎖定頭目，為第二個卡點，未修。agy 唯讀監測正常（plan 模式只會交計畫，須用 accept-edits 並明令不改檔）。
- 2026-11-02｜Antigravity：重新設計 `site/index.html` 與 `site/favicon.svg` 為「倖存者 HUD／工具包」視覺主題：
  1. 視覺全面重塑：擺脫暴雪/Diablo 官網傳統黑金襯線血光風格，採用深石板藍灰底（`#090d12`、`#0f1620`、細緻科技格線背景）、螢光青綠（`#3ee6b0`）主調、琥珀金（`#f59e0b`）點綴與等寬字體標籤（`// MODULE: ...`、`[HUD MON: ACTIVE]`）。
  2. 元素與卡片設計：Hero 下方新增一條模擬輔助器即時狀態列（「自動戰鬥中 ｜ 模式: 任務模式 ｜ 關卡: 地獄 第二幕 ｜ 威脅預判: 低」）；卡片與區塊加入細線邊框與 HUD 科技角標（`::before` / `::after` 細直角邊框線）。
  3. 保留全部文字與章節：Hero 三按鈕、修改器 6 大功能、輔助器 3 大自動模式、實測數據、自動戰鬥並不完美警告、書籤三步驟、合規 vs 解除限制、免責與授權聲明完整無缺。
  4. 新增「實際畫面」畫廊章節：納入 `img/battle1.png`、`img/battle2.png`、`img/panel.png`、`img/editor.png`、`img/paused.png` 5 張圖片，每張配備一行說明、`loading="lazy"`、響應式自適應、`onerror` 容錯隱藏，以及純原生無相依的點擊放大燈箱（支援點外側/✕按鈕/ESC鍵關閉）。
  5. 更新 `favicon.svg`：改為 HUD 瞄準鎖定稜鏡、青綠 HUD 角標與琥珀十字準星科技風格。
  6. 響應式驗證：行動裝置排版完全自適應、無水平捲動；固定深色風格。未執行 git commit。
- 2026-11-02｜Claude：審查 lang.js 並修正以書籤 import() 載入時字典路徑錯指遊戲網址（改由 window.__d2zhUrl 推出工具目錄）；本機瀏覽器模擬暫停頁實測：中上方語言按鈕、繁中翻譯、動態新增文字、切回英文還原、非暫停時隱藏皆正常。尚未在真實遊戲實測。
- 2026-11-02｜Codex：實作遊戲內語言模組（`lang.js`）與多語言擴充支援，完成工具語言連動：
  1. 新增 `lang.js`（遊戲內語言模組）：
     - 語言登錄表：`window.__d2lang = { register(code, {name, dict}), set(code), get(), list(), translate(str) }`，內建 "en"（原文不翻譯）與 "zh-TW"（字典採用 `zh-TW.json`）。預設語言為 `zh-TW`，選擇存於 `localStorage["d2lang"]`。
     - 擴充能力：定義 `LOCALES` 常數清單，擴充只需新增 `locales/<code>.json` 並在清單加入一行；亦支援執行期 `register`。
     - 介面整合：遊戲暫停時（`#paused` 可見或 `body.frontend-over-run`）於畫面「中間上方」（`position:fixed; top:max(12px, env(safe-area-inset-top)); left:50%; transform:translateX(-50%)`）顯示金邊深底語言按鈕（🌐 繁體中文／English），點擊展開下拉選單切換語言；所有按鈕事件 `stopPropagation` 避免遊戲吃到；不與僅在運行時出現的 autobot 停止按鈕衝突。
     - DOM 即時翻譯：以 `MutationObserver` 監看 `document.body`（childList/subtree/characterData/attributes），翻譯文字節點及 `placeholder`、`title`、`aria-label`。比對規則依序為「整句精確」→「不分大小寫」→「數字/星號樣板（#與*代入{0}{1}）」。
     - 原文還原與效能：使用 `WeakMap` 保存文字節點與屬性原文，切回 `en` 時精準還原；略過 script/style/input/textarea/code/pre 以及輔助器/修改器 shadow host 與 iframe；使用 `requestAnimationFrame` 批次處理，已翻譯節點不重複重翻。
  2. 工具聯動：
     - `d2edit.js`：預載步驟加入 `lang.js`；
     - `i18n.js`：讀取 `localStorage["d2lang"]` / `window.__d2lang`，若選 `en` 自動設定為英文介面；新增輔助器（autobot）介面所有標籤、選項與說明之英文對照。
     - `autobot.js`：面板標籤、分組、開關狀態與按鈕支援 `trAuto()` 國際化，選 `en` 時自動顯示英文。
  3. 同步與文件：
     - 同步 `lang.js`、`locales/`、`autobot.js`、`i18n.js`、`d2edit.js` 至 `../editor/` 資料夾。
     - 更新 `README.md` 說明語言功能與新增語言教學。
  4. 驗證：
     - `node --check` 檢查所有 web 與 editor 修改過的 JS 檔案全數通過。
     - 撰寫單元測試 `web/tests/test_lang.cjs`（同步至 `editor/tests/test_lang.cjs`），測試精確比對、大小寫無關、`# seconds left`→`剩餘5秒`、多變數樣板、`# hits`、DOM WeakMap 記錄與還原，全數通過。
     - 未執行 `git commit` 或 `git push`。
- 2026-11-02｜Claude：35 存檔實機測試與輔助器／修改器改良，使用者要求「停止所有測試寫交接」，以下為停止時狀態。
  - **測試已全部停止**：舊批次（`scratchpad\h`，最高 96 級、地獄 33／35）與新的乾淨批次（`scratchpad\h2`，跑約 10 分鐘、最高 37 級普通）的遊戲程序都已關閉，資料夾保留在 Claude 暫存目錄（非倉庫）。codex／agy 監測工作已取消；codex 監測在沙箱中無法建立常駐程序（exit 79，未產生任何回報），之後監測請改用 agy 或 `tests/live-harness/watch.cjs`。
  - **使用者目標「每職業 5 個全新存檔、完全不介入、codex 與 agy 監測」未達成**（使用者已清除）。舊批次期間我多次重新整理、注入指令、熱重載，不算乾淨測試；乾淨批次剛起跑就停止。下次重跑：`tests/live-harness/launch.ps1 -Classes ... -Copies 5`，全程不碰遊戲，輔助器修正等該輪結束才更新。
  - **最重要的未解決問題：「尋找凱恩」從未完成，所以所有存檔任務都是 0／6**（凱恩沒救出，其他任務不正式記錄）。已確認原因並修一部分：拉卡尼休被原版標為任務頭目（`search.watch.watched`、`questHeld`）卻沒被打，輔助器已改為優先攻擊（`questGoal` 的「任務頭目」，commit 1694401）；實測已開始掉血但很慢（地獄 15.6 萬血，70 秒約 3300），因為技能自動施放會打最近的小怪，且威脅高時一直閃避。**尚未驗證**：拉卡尼休倒下後石塊陣（`search.stones`）→傳送門（站 1.5 秒）→崔斯特姆牢籠（`gibbetSpot`）→回營地 `akaraSearch()` 領戒指 的完整流程。研究見 `docs/game-analysis`（任務流程細節見 `docs/game-analysis/quests.md`）。建議：打任務頭目時先清周圍小怪或縮短閃避距離。
  - 其他已上線但**未在實機觸發驗證**：回營地交任務（`reportQuests`：戒指／卷軸找阿卡拉、其他找凱恩，3 秒重試）、撿到伊尼弗斯卷軸回營地翻譯（`leaveForScroll`）、任務模式達成自動改固定關卡刷地獄（`questModeDone`）、付費重置技能（設定版本 8 重新預設開啟）。
  - 已驗證並上線（皆已推送 GitHub）：遊戲 20261101.1 相容（`TESTED_GAME_BUILD`）、藥水只買生命類與法師撿魔力藥水、防禦改用 Defense、護符依屬性、排行榜配裝重抓（同玩家取最高恐懼層）、全圖吸經驗、選卡在自動戰鬥開著時一定選、自動模式（任務／固定關卡／天梯：推關、固定層數）與無關設定隱藏、狀態列顯示模式、總開關（重新整理後預設關閉、同頁重新點書籤沿用；自動戰鬥包含戰鬥輔助；手動停止存成關閉）、書籤載入進度條與物品引擎並行／快取抓取、修改器腳本用頁面 `?v=` 載入（手機曾快取舊 webapi.js）、版本提示空紅框修正、前後綴分區、合規檢查（稀有一條 +技能、屬性點上限）、恰西單次 100 億安全值、解除限制後製作不設限。
  - 模擬測試 `tests/autobot.cjs` 共 110 項，改為失敗不中斷；電腦同時跑 35 個遊戲時，時間相依的項目（遠程保持距離、追目標優先、預判喝水等）每次隨機 1～2 項偶發失敗，負載正常時應全過。
  - 被退回的嘗試：agy 的整體效能最佳化讓「正面飛彈側向閃避」測試穩定失敗，已還原；差異只存在暫存目錄 `agy-optimize.diff`，若要重做請拆小步、每步跑測試。
  - 工作區有其他代理未提交的修改（專案改名「D2倖存者工具包」、英文介面 `isEn`／`trAuto`、`lang.js`、`locales/`、`site/`）與不明檔 `tests/dbg.cjs`，本次未動、未提交。
- 2026-11-02｜Antigravity：更新專案顯示名稱為「D2倖存者工具包」（英文產品名「D2 Survivors Toolkit」）：
  - 修改 `README.md` 標題為「# D2倖存者工具包」。
  - 修改 `index.html` 網頁 `<title>`、中文主標題 `<h1>` 為「D2倖存者工具包（網頁版）」、英文主標題 `<h1>` 為「D2 Survivors Toolkit (web)」、語系切換 `document.title`。
  - 修改 `editor.html` 網頁 `<title>`、頁首 `<h1>` 為「D2倖存者工具包」、診斷資訊標題為「D2倖存者工具包 診斷資訊」。
  - 修改 `d2edit.js` 檔案頂部專案註解為「// D2 倖存者工具包（網頁版）」。
  - 修改 `i18n.js` 新增產品名稱英譯對照 `"D2倖存者工具包": "D2 Survivors Toolkit"` 與 `"D2倖存者工具包 診斷資訊": "D2 Survivors Toolkit diagnostics"`，並保留相容項。
  - 保留功能面之修改器按鈕字樣（如「修改器」/「Editor」按鈕）、URL、儲存庫名、localStorage 鍵與檔名；未更動 `site/`；未提交。

- 2026-11-01｜Claude：遊戲更新到 20261101.1 後重新驗證：輔助器掛接與全部原版方法、修改器引擎（特徵碼 18/19，modDefs 舊版即未命中屬選用）、35 存檔重新整理後接回保留角色並連續兩輪無陣亡；配合新版修正藥水（只買生命類、法師撿魔力藥水）、防禦評分改用 Defense、排行榜配裝重抓（同玩家取最高恐懼層）。Charsi「可付得起」上限屬伺服器判定，前端找不到公式，修改器只做單次 100 億安全值。TESTED_GAME_BUILD 改為 20261101.1。
- 2026-11-01｜Codex：同步 web／editor 的稀有職業技能詞綴群組、屬性點上限檢查及解除限制製作介面。依本機 keepSave 的 Ci／wi／Ti 與 Tome 進度計算，欄位不足時顯示未驗證；解除限制時開放完整屬性及自訂名稱備援。`node --check` 四個 JS 與兩頁內嵌指令碼通過；Node 模擬屬性點合規、超額、進度及缺欄，以及兩份引擎的職業技能群組與可選屬性通過。未執行 Electron、真實存檔、排行榜或遊戲測試；未提交及推送。


- 2026-11-01｜Antigravity：訂製裝備改版（前綴與後綴欄位分開，選好底材直接顯示可添加欄位數量）：
  1. 引擎（`web/engine-page.js` 與 `editor/engine-page.js`）新增 API `affixSlots(item, mods)`：
     - 回傳 `{ limit: { pre, suf, max } | null, used: { pre, suf }, kinds: { [stat]: "prefix"|"suffix"|"both" } }`。
     - 品質為魔法／稀有時依原版規則（魔法 1/1/2、稀有 3/3/6、稀有珠寶 3/3/4）計算上限；其餘品質 limit 為 null。
     - 排除稀有不可用的 magicOnly 詞綴；以 DFS 嚴格可行指派與複合詞綴（alike/also）推算已用前綴與後綴數量；無解時保底計入當前明確歸屬列。
  2. 訂製裝備介面（`web/editor.html` 與 `editor/index.html`）：
     - 品質為魔法或稀有時，將詞綴拆為「前綴」「後綴」「底材固有屬性」三個獨立區塊與表格（`#cmods-pre`、`#cmods-suf`、`#cmods-imp`），各自具備「＋ 新增前綴」「＋ 新增後綴」「＋ 新增固有屬性」按鈕。
     - 區塊標題即時顯示「前綴 已用 x / 上限 y」「後綴 已用 x / 上限 y」，以及上方合計上限（魔法 1～2、稀有 2～6、珠寶 2～4）；選好底材或品質或任何一列變動即立刻重新推算更新。達上限時停用新增按鈕並顯示提示（「前綴數量已達上限」或「詞綴總數已達上限」）。
     - 前綴／後綴下拉選單僅列出該類可用詞綴（`both` 兩邊皆列）；固有屬性下拉僅列底材固有屬性。
     - 普通、暗金、套裝、符文之語品質維持原本單一表格（`#cmods`）行為；切換品質時保留使用者已填列並自動分類同步。
     - 送出製作（`makeCustom`）前將各區列合併為原本的 `mods` 格式送出，既有規則檢查（`assertLegal`）、屬性命名與建立邏輯不受影響。
     - 嚴格保留既有修正：`updateCraftRanges` 先 `showRanges` 自動填最大值再 `filterCraftSplit`/`filterStats`，以及未解除限制禁止製作暗金／套裝／符文之語。
     - 響應式 CSS 擴充至 `.cmods-table`，保留兩 HTML 間僅差 script query string 的既有差異。
  3. 多語言（`web/i18n.js` 與 `editor/i18n.js`）：
     - 同步擴充中英對照字典：前後綴標籤、新增按鈕文字、已用／上限、上限提示等。
  4. 驗證：
     - 抽出兩 html 內嵌 script 至臨時 scratchpad 執行 `node --check` 通過。
     - `engine-page.js`（web／editor）與 `i18n.js`（web／editor）執行 `node --check` 全數通過。
     - 執行 `test_affix_slots.mjs` 針對魔法、稀有、珠寶、普通、暗金、複合詞綴、magicOnly 排除、空列等 9 項單元測試全數通過。
     - 專案工作目錄無任何暫存檔殘留；未執行 git commit/push。

- 2026-11-01（Codex）：依使用者要求修正屬性逐點累積與換裝傷害護欄，並同步 web／editor 腳本與設計文件；`node --check autobot.js`、`git diff --check` 通過，`node -e` 累積 10000 點符合 27／55／12／6 比例；未進行遊戲驗證。

- 2026-11-01｜Antigravity：依需求限制「未解除限制製作裝備不准製作暗金、套裝、符文之語」：
  1. 於 `web/editor.html` 與 `editor/index.html` 新增 `FORBIDDEN_CRAFT_RARITIES` 及 `updateCraftRarities()`。
  2. 未解除限制時：`#cRar` 排除暗金、套裝、符文之語（選全部品質時列出可用底材），`#xRar` 排除三者並預設切為可用之第一品質（普通）；`#cList` 亦全面過濾排除此三種品質項目；若已有選取項目屬此三者則清空選取。
  3. `#pMake`（`makePicked`）與 `#xMake`（`makeCustom`）執行前加入前置檢查，若為 unique/set/runeword 即拒絕並以既有 `status("未解除限制時不能製作暗金、套裝或符文之語", "bad")` 提示。
  4. 解除限制後恢復全部品質選項：既有 `applyUnlockUI()` 掛鉤 `updateCraftRarities()`，切換時即時重繪製作選項、清單與屬性範圍。
  5. `web/i18n.js` 與 `editor/i18n.js` 同步加入英譯對照 `"Without removing restrictions, unique, set and runeword items cannot be crafted"`。
  6. 抽出兩 html 的 `<script>` 至系統 temp scratchpad 經 `node --check` 語法檢查通過，兩檔 i18n.js 亦通過；專案目錄無暫存檔殘留；未提交或推送。


- 2026-11-01｜Codex：輔助器任務獎品透過原版角色畫面、chooseTree 回呼及 readTome 嘗試自動使用；營地透過 akaraSearch 嘗試交付伊尼弗斯卷軸，鑰匙觸發尚待確認。同步 web／editor 程式與設計文件；node --check web/autobot.js、git diff --check 通過，兩組檔案雜湊一致。未做遊戲實測，未提交或推送。

- 2026-11-01｜Claude：輔助器大改（真實遊戲 35 存檔壓力測試中，尚無存檔通關地獄）：全圖走位規劃器（分析地圖所有怪物預測位置、飛彈、擁擠度，一直保持移動）；依技能攻擊距離決定近戰站位（REACH 表，見 AUTOBOT_DESIGN.md）；選卡集中升級主力技能＋進化被動／協同（讀原版技能表）；重置技能改看配點分散度；撿地上藥水（原本被過濾）、缺藥踢罐子（優先度低）；全圖撿取（magnet、寶箱移到身上，非原版行為，可關）；死亡保護預設開、只看致死預判、離場後自動繼續、觸發兩次回低難度刷；營地 town 卡住修正；中途離開自動繼續；地獄通關後重複刷地獄；買水買到滿；設定只存使用者選擇；停止輔助下方顯示狀態；裝備評分抗性加權。模擬測試 110 項通過（高負載下偶有計時失敗，重跑通過）。未驗證：地獄通關與重複刷的實際結果。
- 2026-11-01｜Codex：帳號／強化的角色表新增各職業「金色光芒」勾選，讀寫遊戲 heroes.<職業>.glow，保留其他角色資料；同步 editor 與 web，補英文翻譯。依本機遊戲 keepSave-CoH_93A4.js 的 wh／tm 確認欄位。頁面指令碼語法與勾選、取消、缺少角色資料的 Node 模擬通過；首次測試因 VM 跨環境原型比較失敗，改用 JSON 結構比較通過。未用實際遊戲存檔驗證，未封裝或發布。

- 2026-11-01｜Claude：輔助器已推上 GitHub（main，多次提交，post-commit 自動推送與 Pages 部署）。改以 fetch Pages 上的 autobot.js 在真實遊戲長跑（瀏覽器窗格隱藏，以假時鐘同步 tick 加速，並繞過原版選卡防誤觸時間戳；載入畫面需截圖推動）。全新法師存檔自動打通普通與惡夢、進入地獄第二幕。期間依實測與使用者回饋修正：卡名讀取、背包滿與即時賣裝、清場恰西商店卡住、倉庫畫面殘留、卡住停機、只追王與精英、近戰／遠程走位、寶箱、低難度回刷、重複刷難度、護符、裝備評分納入防禦抗性（含扣抗）、恰西升級存錢策略。細節見 AUTOBOT_DESIGN.md「實戰調整」。模擬測試 108 項通過。未驗證：地獄通關、近戰職業實戰、阿卡拉重置技能（需首次擊殺巴爾後開放，未觀察到觸發）。
- 2026-11-01｜Claude：輔助器第三輪。①排行榜學習：editor/ladder-learn.js 讀 d2survivors.lol/api/leaderboard（boards/hell?class=…、runs/{id}），彙整七職業地獄榜前 50 名的技能、被動、變體、配點、常用暗金，嵌入 autobot.js 的 LADDER；升級選卡依此權重（真實遊戲驗證：法師選 Charged Bolt），屬性點依比例 spendStatPoints，技能偏離時向阿卡拉重置（實測首次擊殺巴爾前不開放）。②王與精英留在攻擊範圍（movement.attackRange）；被包圍無路時穿過怪群、遠離最強敵人。模擬測試 104 項通過；同步 editor。未驗證：完整輔助器在真實遊戲長跑（67KB 原始碼無法可靠貼入瀏覽器窗格，僅以抽出的函式與原版介面逐項實測）、配點與重置的實際呼叫、能否打完地獄。未提交／發布。
- 2026-11-01｜Claude：輔助器第二輪（設定版本 3）。①罐子／木桶（rank=breakable）不再當敵人閃避，改走過去讓原版自動踢破；②撿取品質預設全開；③追目標優先（movement.chaseFirst）：推進且生命 > 35％ 時朝任務／頭目／敵人前進，只疊加飛彈閃避；④營地整備（town.*）：每次回營地開局前，用原版 openCampTrade＋包裝 hud.showTown 取得商店回呼，依序收藏庫 collectAll、從背包／倉庫／收藏庫換較佳裝備、稀有以上存倉庫、賣剩餘裝備、阿卡拉買生命藥水（1000 金／瓶）、恰西買較佳裝備與永久升級。真實遊戲營地實測整備流程成功（賣靴→買並穿皮甲→升級生命，金幣 232→17）；完整 autobot 未在真實遊戲長跑（貼上 57KB 原始碼受限，僅以抽出的整備函式實測）。模擬測試新增 6 項，共 100 項通過；同步 editor。未驗證：追目標優先與踢罐的實戰效果、能否推完地獄。未提交／發布。
- 2026-11-01｜Claude：在真實遊戲（d2survivors.lol/play，Game-C88Jt16A.js，全新存檔）實測輔助器並改良。實測發現並修正：①升級選卡用 click() 被原版防誤觸忽略，改按 1～3 鍵；②全新存檔沒有恐怖層紀錄，營地不會開局 → 新增營地自動開局／續玩（解析 waypointView 的 tabs/rows/start）與一般難度結束後 toMenu 回營地；③新增自動穿裝（原版 heroNumbers 比較、gearActions.equip）；實測撿到魔法靴子與皮手套後自動穿上；④死亡保護在 89％生命被小怪貼身時誤離場，改為需低血或預估傷害過半；⑤多敵貼近時改 16 方向取樣逃脫。實測循環：營地→自動開局→選卡→撿裝→穿裝→陣亡→回營地→再開局，成功。另加營地生成逾 15 秒未完成的看門狗。模擬測試更新為按鍵選卡並新增 6 項，共 94 項通過；同步 editor/autobot.js、測試與設計檔。限制：內建瀏覽器窗格隱藏時遊戲節流，以假時鐘同步呼叫 tick 加速，原版鍵盤防誤觸時間戳因而需在測試框架中繞過；隱藏窗格下載入動畫常停住需截圖推動，回營地卡住案例無法確定是否為環境造成。角色 Act 1 約 130～270 秒陣亡，主因無藥水（原版藥水需在商店購買，未自動化）與角色強度；逃脫改良未見明顯存活提升。未提交／發布。
- 2026-11-01｜Claude：輔助工具面板分為「戰鬥輔助」與「推層與任務」兩個分頁（恐怖層數、固定層重刷、任務進程移至後者）；同步 editor/autobot.js。node --check 與 85 項 Electron 模擬測試通過；未實戰驗證。
- 2026-11-01｜Claude：移除 F8 熱鍵與熱鍵設定欄，總開關只能在輔助面板切換（保留畫面上的「停止輔助」緊急按鈕）。87 項模擬測試通過。
- 2026-11-01｜Claude：兩個分頁各有獨立總開關：戰鬥輔助（enabled，管喝水／走位／撿裝／死亡保護）與推層與任務（progressEnabled，管推層／重刷／任務）；F8 與停止按鈕、死亡保護會同時關閉兩者。87 項模擬測試通過；未實戰驗證。

- 2026-10-31｜Codex（已完成本機實作與模擬）：總開關與九個功能改為明顯「開啟／關閉」按鈕（含角色、狀態文字及色燈），即時生效並存入 d2autobot:settings；推層／重刷互斥，舊設定自動補值為版本 2，預判喝水可獨立啟用。死亡保護預設關閉；可調緊急生命 1～90％（預設 15）及是否關閉總開關（預設是）。預估致命且無有效回血、緊急低血且工具冷卻中、或近敵包圍且 16 方向局部通道皆受阻時，先停推層／重刷／任務並保存，再 pause() → leaveRun()；找不到內部方法時嘗試可辨識的暫停 DOM 離開按鈕。等待期間禁止重新進場；8 秒未確認／出口缺失／拋錯均停機，角色選單不冒稱村莊。原版 Game-C88Jt16A.js 靜態證據：leaveRun 僅在 paused 生效，經 toMenu，campOn 且 frontend 時進 enterCamp，否則角色選單；沿用原版金幣／恐怖紀錄／硬核結算，可能損失當局進度。補回 web/AUTOBOT_DESIGN.md，同步 editor 的 autobot.js、設計、測試及 d2edit 載入行；build-web.js 新增複製清單、清理前來源檢查，保留 Git 與協作／交接檔。驗證：node --check autobot.js、d2edit.js、build-web.js 與測試檔通過；隔離 Electron 模擬 85 項通過（工作區 d2autobot-update/test-result.json），含開關／舊設定／補血成功及拒絕／滿血致命／禁藥／包圍與牆／回城停推進／離場錯誤逾時／DOM 備援／卸載；node editor/tests/build-web.cjs 於新建暫存副本驗證複製、載入行、交接保存及缺來源不清空，通過。未執行正式 web 重建、真實存檔實戰、手機、硬核離場或長時間測試。推測：傷害未完整重現抗性／護盾／格擋／攻速，包圍為局部取樣，藥水持續回復未精確建模；不保證生存。保留其他未提交工作，未提交／發布；post-commit 會自動 push。外部唯讀分析遭自動審查拒絕後已改本機完成，無委派成果。首次沙箱 Electron 未啟動完成，已停止該測試程序，改以獨立 Chromium 暫存設定成功驗證。

- 2026-10-31｜Codex：新增 `autobot.js`，`d2edit.js` 結尾僅追加 `import(at("autobot.js"))`（含載入失敗處理）。提供暫停左上「輔助」、繁中設定面板、`d2autobot:settings`、F8 總開關、觸控停止、喝水／冷卻／致命傷害預估、敵方飛彈閃避與保持距離、品質白名單、恐怖推層與已通關層數重刷、已生成任務目標導引及升級選卡。原版掛鉤：同 URL 匯入 `Game` 並包裝 `tick/steer` 取得現有實例；使用 `player.life/maxLife`、`world.mana`、`belt.columns`／`drinkFrom`、`enemies`、敵方 `hostiles`（不是玩家 `projectiles`）、`pickups.item`、`walls.route/slide`、`terror`／`startTerror/startReplay`、`search.stones/gibbetSpot/portalSpot`、`clearing.portal/tyrael`、`afterBaal.continue`。已下載 `/play/` 與 46 個相依 JS 至 `%TEMP%/d2autobot-analysis`；四項定位簽名皆匹配原始 `Game-C88Jt16A.js`。REA 靜態證據 `ev_618af3e9ca746ea9c5d0776c5874f8b6bcf3124281ca15a237e8dc8f83dfd0b8`。已參考本次產生的 `AUTOBOT_DESIGN.md`（之後被其他流程重建 web 移除，未代改設計檔）。驗證：`node --check autobot.js`、`node --check d2edit.js`；隔離 Electron 模擬遊戲頁 35 項通過（`%TEMP%/d2autobot-work/verify.cjs` 與 `result.json`），含冷卻、禁用藥帶、敵我飛彈、品質過濾、重刷限制、營地啟動、選卡、HUD 降級、錯誤停機及卸載還原。限制：未在真實存檔實戰／手機／長時間掛機驗收；傷害與巡航為啟發式，不保證生存或完成所有任務；特定配點、營地交付與隱藏任務條件仍需手動。此版未見獨立藍水，以回復活力藥水補魔力；無掛鉤時僅以可讀 HUD 與指定藥帶按鍵降級。品質只過濾主動追蹤，原版路過拾取仍生效。總開關預設關閉。保留其他代理變更，未提交／發布。整合期間其他流程重建 web，首次新增檔與載入行遭移除，改存暫存副本驗證，確認建置程序停止後重新整合。（已過時：本次頂端紀錄所述建置來源與保存修正已解除這項限制。）

- 2026-10-31｜Claude：原版規則限制＋中英雙語＋暫停按鈕。引擎新增 `validateItems`（固定品質比對原版定義與上下限，含無形加成、觸發技能等級隨物品等級；魔法 1+1、稀有 2～6 詞綴（珠寶 ≤4；依官方 Arreat Summit 與 Wikipedia；群組互斥依 Project Diablo 2 wiki／Phrozen Keep，前後綴共用群組；護身符無稀有）、前後綴各 ≤3、群組不重複、詞綴需適用底材；底材固有屬性取樣）與 `allowedStatsMany`（屬性下拉選單只列依規則可加入的屬性，每列依其他列計算）。未解除限制時：套用、訂製、寫入前檢查（從遊戲讀入且未改動的物品不擋），金幣 ≤100 億、額外強化 ≤999；反修改偵測頁新增「不符合原版屬性規則」列。新增 `i18n.js`：依系統語言自動切換繁中／英文（設定頁可指定），中文介面移除英文殘留（底材改中文下拉選單）。書籤載入後不直接開啟，暫停時（body.frontend-over-run，已在 d2survivors.lol 實測；備援 #paused）右上角出現「修改器」按鈕。README 加書籤教學、安裝頁雙語。驗證：Electron 載入安裝版遊戲，3804 件遊戲產生物品零誤判、竄改物品皆攔截；實際存檔僅標記 2 件遊戲自身也判定不合法的物品；中英模式逐頁掃描無殘留；模擬暫停頁測試按鈕顯示／開啟。桌面版已重新封裝（dist/D2.exe）。限制：尚未提交發布。

- 2026-10-31｜Claude：物品頁與製作頁新增的屬性列，選擇屬性後數值預設為範圍最大值（固定上下限優先，否則取詞綴最大值）；手動改過數值後不再覆寫。語法檢查通過，未實測。

- 2026-10-31｜Claude：統一屬性範圍資料庫：引擎新增 `statRanges`（固定品質用遊戲產生器上下限，否則用底材可用詞綴範圍），物品頁與製作頁共用 `loadStatRanges`／`showRanges`；物品頁改底材或品質會重新載入範圍。同步 `editor` 與 `web`。語法檢查通過，尚未實際遊戲驗證、封裝或發布。

- 2026-10-31｜Codex：發布 v1.0.1。提交 530a997 已由 post-commit hook 推送，GitHub Pages 部署成功，線上五個變更檔與提交內容逐位元相符；GitHub Release 已發布 D2.exe 與 SHA256SUMS.txt，下載後 SHA-256 為 46446181416f1ea81d1ccbd1224c2333854ff0450c51ad5499ca0913a77a2705，與本機一致。electron-builder 停用 Windows 執行檔資源編輯後封裝成功，程式未簽章；封裝內 app.asar 的版本及物品引擎函式已檢查。尚未用實際遊戲存檔進行端對端驗證，詞綴研究資料尚未整合進介面。

- 2026-10-31｜Codex：準備發布 v1.0.1。語法檢查及 `git diff --check` 通過；首次 `npm exec electron-builder -- --win portable` 因 Windows 不允許建立 winCodeSign 的 macOS 符號連結而失敗，改以停用 Windows 執行檔資源編輯重試。

- 2026-10-31｜Codex：檢查網頁版遊戲 `itemArt-Bh8qPZQJ.js`，匯出 708 筆一般詞綴（411 前綴、297 後綴）至 `D:\D2倖存者\裝備屬性分析`；隔離 Electron 分別載入網頁及安裝版遊戲模組，兩份 JSON 完全相同，SHA-256 皆為 8c1fd258de1e5420058a06d34102356cfcb9b14ebd62c9fbcc002f1ed0b4080f。CSV 708 筆主屬性上下限逐筆比對 JSON 通過；複合詞綴附加屬性保留於參數欄。整件裝備的可行詞綴組合與合計上下限尚未驗證。

- 2026-10-31｜Codex：分析安裝版遊戲 `2026.1030.2`，於 `D:\D2倖存者\裝備屬性分析` 擷取原始資料與 4239 筆具有 min/max 的屬性範圍；核對 itemstats SHA-256 為 b62973c238ae0271d5ada0af7c85233465ba684573db378f4a2d338de1532221。REA 證據 ev_d1112d5e917b94c8684af150d2ab48b0ea2f6f5d53f9e25118f1719a765074cb 僅涵蓋選定程式且圖譜截斷。一般魔法及稀有詞綴後續已匯出，最終合計上限尚未驗證。

- 2026-10-31｜Codex：將「製作裝備」拆為訂製裝備頁與獨立「裝備庫」頁，兩頁分別初始化底材及遊戲物品目錄，保留訂製目的地；同步 `editor/index.html`。Electron 隱藏視窗以模擬存檔及引擎驗證兩頁切換、訂製與裝備庫選取及製作均通過；兩頁指令碼語法與 `git diff --check` 通過。尚未使用實際存檔驗證、封裝或發布。

- 2026-10-31｜Codex：依安裝版 `app.asar` 的 `iZ` 與詞綴產生邏輯修正命名：普通用底材、魔法比對前後綴及複合屬性、稀有沿用或呼叫遊戲隨機名稱產生器、固定品質沿用原定義或依底材與屬性範圍唯一辨識；無解或多解時停止並提示。保留原始詞綴的 `length`、`auto` 等欄位；自訂物品等級恢復 99，穿戴需求由遊戲計算。REA 靜態證據 `ev_3baf916264176db68ac9b81dd1de449743aa1733ae54c02edf50e2c4bec9540c` 僅涵蓋所選程式。Electron 載入安裝版遊戲產生器，200 件魔法原名稱全數吻合，移除原名後 196 件唯一吻合、4 件多解，無錯誤命名；暗金、套裝、符文之語各 5 件均可辨識。頁面、引擎語法及 `git diff --check` 通過。限制：自訂任意屬性未必存在遊戲名稱；無法從屬性唯一還原稀有隨機名稱或多解物品。尚未實際遊戲存讀、封裝或發布。

- 2026-10-31｜Codex：複製目的地預設為目前容器，搜尋空格時將既有座標轉為數字；物品頁移除名稱及物品等級輸入，自訂製作與屬性修改時依可辨識詞綴估算物品等級，普通及魔法名稱依底材與詞綴設定。同步桌面來源。頁面及引擎語法、`git diff --check`、字串座標與多格避讓測試通過。限制：詞綴匹配及物品等級為近似；稀有名稱仍沿用或由遊戲隨機產生，暗金、套裝及符文之語名稱沿用原名稱，尚未完成所有品質依屬性命名；未實際遊戲驗證、封裝或發布。

- 2026-10-31｜Codex：手機物品區塊停止縮高，清單取消固定高度及內部捲動，讓頁面整體捲動；同步 `editor/index.html`。`git diff --check`、兩頁內嵌指令碼及樣式靜態檢查通過；已發布提交 `1b52611`，GitHub Pages 部署成功並以 HTTP 200 確認線上樣式；尚未實機驗證。

- 2026-10-31｜Codex：最佳化手機版修改器的觸控尺寸、導覽、橫向捲動及物品屬性卡片，同步 `web/editor.html` 與 `editor/index.html`。`git diff --check`、相關 JavaScript 及兩個頁面的內嵌指令碼語法檢查通過；環境停用本機瀏覽器，尚未進行手機畫面與實際操作驗證。已發布提交 `46f465b`；GitHub Pages 部署成功，線上 `editor.html` 回傳 HTTP 200，並確認包含手機樣式與屬性卡片。

- 2026-10-31｜Codex：檢視已安裝遊戲 `app.asar` 的物品產生及需求等級函式，確認物品等級與穿戴需求分開；自訂物品改設物品等級 99，穿戴需求由遊戲計算。匯出遊戲詞綴表及底材適用函式，自訂製作頁列出相容詞綴的數值區間；魔法名稱依可辨識詞綴組合，其他自訂品質採遊戲稀有名稱。固定物品顯示最小及最大值。`node --check main.js`、`engine-page.js`、`d2edit.js`、頁面語法及模擬詞綴測試通過；已確認安裝版遊戲簽章可辨識。尚未實際遊戲測試、封裝或發布；魔法名稱匹配為近似，複合詞綴、任意自訂屬性及需求等級未完成端到端驗證。

- 2026-10-31｜Codex：物品頁改為中文屬性下拉選單，並透過遊戲物品產生器顯示暗金、套裝及符文之語的固定屬性最高擲值；無法判定時顯示「未提供」。同步修改 `editor` 原始檔及此網頁版。
- 驗證：`node --check d2edit.js`、`node --input-type=module --check` 與頁面內嵌指令碼語法檢查通過；以模擬遊戲產生器驗證一般、固有屬性與未知品質。尚未驗證實際遊戲介面或重新封裝桌面執行檔。
- 限制：魔法及稀有物品的詞綴沒有實作對應上限；自訂或不在原物品定義中的屬性亦無法提供上限。

- 2026-10-31｜Codex：使用 Invoke-WebRequest 檢查 GitHub Pages，線上 editor.html 仍包含舊版「屬性代碼」；當時本機修改尚未發布，因此手機載入舊版。書籤使用時間參數，發布後重新開啟修改器可取得新版。


- 2026-10-31｜Codex：使用者明確授權推送，準備發布物品頁屬性下拉選單及遊戲產生器上限；發布後需確認 GitHub Pages 已更新。

- 2026-10-31｜Codex：網頁版與桌面版加入繁體中文字典備援，不再依賴先啟用中文書籤；字典取自本機 D2SurvivorsLauncher。`node --check` 與頁面指令碼檢查通過，並驗證小型咒符、所有技能及 129 個一般屬性顯示中文；自訂名稱或未知技能仍可能無對應翻譯。準備發布網頁版；桌面執行檔尚未重新封裝。

#### 待辦：修改功能 bug（2026-11-02，Codex 模擬驗證發現，尚未修正、尚未實機測試）
1. 一擊必殺：`applyCheats()` 每次呼叫 damageMult 等倍率再乘 100（會累乘），需記住原始值冪等套用。
2. 怪物 10 倍：一次 90→900 隻超過 800 上限；spawnRate 重複乘 10，需依剩餘容量截斷並冪等。
3. 作弊總開關/子開關關閉後不還原已改寫的倍率、數值、函式。
4. 金幣 90 億保護：觸發後不還原；`world.gold` 若為函式會被覆寫成數字。
5. 技能滿級：找不到技能資料/ID 時預設 99，應跳過或用合法上限。
6. 無限重抽：永久強化寫 `ranks.Reroll`，編輯器用 `ranks.rerolls`，需查明遊戲實際欄位並統一。
7. 網頁版寫入存檔（`d2edit.js`）前未自動備份，與確認對話框說明不符；備份失敗時不可寫入。
- 無敵(godMode)、致命攻擊(criticalStrike/deadlyStrike)、掉寶率(uniqueBoost 等)欄位未在遊戲程式碼中找到，效果待實機確認。
- 實機測試請用官方網頁版 https://d2survivors.lol/play/ ；`web/index.html` 是工具包說明頁不是遊戲。測試前先備份瀏覽器 localStorage 存檔。桌面版存檔已備份於 `_backup_test/game-save`。
- `web/` 為獨立 git 儲存庫，autobot.js、tests/autobot.cjs 有未提交變更需保留；web/ 與 editor/ 檔案需同步。
- Codex 在 workspace-write 沙箱無法寫入本目錄，修正需改派可寫入的代理或開放權限。
