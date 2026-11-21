---
name: game-update
description: 使用者說「遊戲更新了」「官方更新」「驗收新版」時使用。先由 AI 比對桌面版新舊 app.asar 差異、檢查特徵碼與偵測掃描，分析對工具包的影響；沒變動的部分用腳本快速測試；最後以桌面實機驗證，通過並經使用者確認後才打包發布。
---

# 遊戲更新與工具包適配（桌面版）

原則：**先分析、後測試、最後桌面實機**。AI 負責判斷「更新了什麼、影響工具包哪裡」；腳本只負責比對與回歸測試。不得僅憑腳本通過或關鍵字分類就判定相容。一律用繁體中文回覆。

## 1. 取得新版 `app.asar` 與更新訊息
- 由使用者更新桌面版遊戲（或提供新版 `resources/app.asar`）。
- **待補**（由主代理定義桌面版 `app.asar` 解開與歸檔到 `game-bundles/<build>/` 的標準指令）。
- 檢查新版內的更新紀錄與版本號，建立更新清單。

## 2. 反編譯比對新舊版與偵測掃描（AI 主導）
- 以新舊 `game-bundles/<版本>/assets`（源自桌面版 `app.asar`）為對象，用反編譯／格式化後的原始碼做差異比對（可用 `verify/lib/compare.cjs` 或 `docs/game-analysis/formatter.js`）。
- 重點看：`Game` 主模組、`itemArt`、`saveTransfer`、`ko-*.js` 語言字典、技能與物品資料、選卡與升級、掉落與經驗公式、存檔結構與簽章、`localStorage` 鍵名、主程序 `main.cjs` 的 IPC 與環境變數（`D2S_USER_DATA`、`D2S_LEADERBOARD_URL`、`D2S_REPORT_URL`）。
- 執行偵測掃描：`node verify/lib/detection-scan.cjs --build game-bundles/<版本資料夾> --diff`，精讀每項差異並記錄於 `AI_HANDOFF.md`。
- 必要時更新 `docs/game-analysis/` 的對應分析檔，記錄新 build 的差異。

## 3. 分析與工具包是否相符（AI 主導）
逐項對照模組，判斷是否受影響，並給出具體依據：
- **修改器**（`modifier/`）：`signatures.json`／`patch.mjs` 特徵碼、`engine-page.js` 的物品產生與合法性規則、`gamedata.json`、存檔欄位、雙武器組等。
- **輔助器**（`helper/`）：CDP 讀取的 `Game` 匯出與 `world` 欄位、呼叫的原版方法與例外掛接點、選卡回呼、撿寶、自訂鍵位、任務與技能邏輯。
- **語言**（`lang/`）：新版 `ko-*.js` 字典新增與變更字串、`lang/zh-TW.json` 缺漏與套用／還原流程。
- **防護**（`guard/`）：`save-check.js` 存檔合規規則與排行榜上傳封鎖機制。
- 有受影響的就實際修改，並補有意義的測試；不需修改的，記錄具體判斷依據。

## 4. 沒有變動的部分：腳本快速回歸
- 受影響項目修好後，執行 `node verify/verify.cjs --quick`，跑 `verify/suite.cjs` 登記的靜態與隔離整合測試（`lang`、`item-db`、`drop-ranges`、`weapon-sets`、`autobot`、`memory-only`、`save-check` 等）。
- 測試失敗先查根因，不得為了通過而改驗證腳本或略過失敗。
- 模擬測試不等於真實遊戲驗收。

## 5. 桌面實機驗證（打包前必做）
- **待補**（由主代理另外定義桌面版實機啟動、隔離 `D2S_USER_DATA`＋D2S1 存檔副本、CDP 輔助器、修改器本機讀寫、中文化套用／還原與排行榜本機空伺服器封鎖的驗收流程）。

## 6. 建置與發布
- 維護修改器更新日誌，並更新 `AI_HANDOFF.md`。
- 確認回歸與桌面實機全部通過、工作樹無未提交修改且經使用者明確確認後，再打包獨立桌面執行檔（`editor/` `npm run dist`）。

## 回覆格式
結尾列出：新舊 build、反編譯發現的差異、各模組與特徵碼是否受影響與依據、已改動的檔案、回歸與桌面實機結果、尚待使用者決定的事項。
