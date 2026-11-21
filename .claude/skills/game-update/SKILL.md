---
name: game-update
description: 使用者說「遊戲更新了」「官方更新」「驗收新版」時使用。比對桌面版新舊 app.asar 差異，檢查修改器特徵碼與偵測掃描，評估各模組影響，執行回歸測試與桌面版實機驗證。
---

# 遊戲更新與工具包適配（桌面版）

全程繁體中文。流程：取得新版桌面 `app.asar` → 解開並與舊版快照比對差異＋偵測掃描 → 影響評估（修改器特徵碼、輔助器狀態／方法、中文化 `ko-*.js` 字典）→ 腳本快速回歸 → 桌面實機驗證 → 使用者確認後建置發布。任何步驟失敗即停，查明並修正後重跑受影響項目；模擬與腳本通過不代表實機完成。新遊戲內容先分析，由使用者決定是否加入。

發布前以 `git status --short` 檢查含未追蹤檔案的工作樹，有未提交修改不得發布。

## 1. 取得新版 `app.asar` 與快照比對

1. 由使用者更新本機安裝的桌面版《D2 Survivors》（或提供新版 `resources/app.asar` 路徑）。
2. **待補**（由主代理定義桌面版 `app.asar` 擷取與快照歸檔指令，將新版 `web/assets` 存入 `game-bundles/<build>/assets` 並記錄 `app.asar.sha256`）。
3. 格式化或反編譯新舊 `game-bundles/<版本>/assets`，比對 `Game`、`itemArt`、`saveTransfer`、`record`、`ui`、`ko-*.js`、技能與物品資料、掉落、經驗、選卡、存檔結構與簽章，列出所有程式變動。

## 2. 偵測與線上存檔檢查（每次必做）

新版快照完成後，將下列版本替換成實際資料夾名稱：

```powershell
node verify/lib/detection-scan.cjs --build game-bundles/<版本資料夾> --diff
```

掃描與 `verify/detection-baseline.json` 比對新增／移除的 `/api` 端點、`localStorage` 鍵、封印金鑰字串、原生 API 檢查清單、受限網址參數、上傳紀錄欄位。工具或基準不存在、執行失敗或輸出不完整時停止，不得當成無差異。

AI 必須精讀每項差異對應的新舊程式、呼叫鏈與用途，在 `AI_HANDOFF.md` 記錄位置、證據、影響及未確認事項；不能只依關鍵字或掃描結果下結論。完成審查並確認基準應更新後才執行：

```powershell
node verify/lib/detection-scan.cjs --build game-bundles/<版本資料夾> --update
```

出現存檔上傳、下載、同步跡象（包括新端點、新鍵或帳號登入）時，遊戲可能推出線上存檔：**停下來向使用者報告，不自動發布**；追查證據並評估受影響功能。

## 3. 分模組重驗

- **防護 `guard/`**：追查排行榜上傳端點、`D2S_LEADERBOARD_URL`／`D2S_REPORT_URL` 環境變數行為、`leaderboard.off`、封印金鑰與簽章、存檔檢查（`guard/save-check.js`）。執行 `guard/tests/*` 適用測試。
- **輔助器 `helper/`（CDP 唯讀＋模擬輸入）**：重驗 `Game` 匯出與讀取路徑、`world` 記憶體欄位、仍呼叫的遊戲方法與例外掛接點、選卡、撿寶與受變更影響的功能；執行 `helper/tests/*` 適用測試及 `node helper/tests/memory-only.cjs`。
- **修改器 `modifier/`（本機存檔讀寫）**：重驗 `signatures.json`、`patch.mjs`、物品資料與合法性規則、`engine-page.js`、封印與寫入；執行 `modifier/tests/*` 適用測試，尤其 `item-db` 與 `drop-ranges`。
- **中文化 `lang/`（資料檔替換）**：比對新版 `ko-*.js` 字典新增與變更鍵值，檢查 `lang/zh-TW.json` 缺漏與官方 D2R 繁中對齊；執行 `node lang/tests/test_lang.cjs` 並驗證 `lang/tools/desktop-lang.mjs` 套用／還原往返。

## 4. 快速回歸

分析及修正後，執行快速回歸測試：

```powershell
node verify/verify.cjs --quick
```

查看 `verify/reports/latest.json` 的已執行、略過與結果；`verify/suite.cjs` 的 `always` 項目每次更新必跑。按差異增加針對性測試，未變動部分用腳本快速回歸。

派 Codex 前先確認本機 Ollama 正在執行：

```powershell
Test-NetConnection 127.0.0.1 -Port 11434
```

`TcpTestSucceeded` 為 `False` 時不要派 Codex，避免等待網路；改用其他可用代理或自行處理。

## 5. 桌面版實機驗證

**待補**（由主代理另外定義桌面版實機啟動、CDP 連線、隔離 `D2S_USER_DATA`＋D2S1 存檔副本、排行榜本機空伺服器封鎖、中文化套用／還原與各模組實機驗收流程）。

## 6. 建置與回報

確認所有必要分析、回歸與桌面實機通過後，更新修改器更新日誌及 `AI_HANDOFF.md`。工作樹沒有未提交修改且經使用者確認後，再打包獨立桌面執行檔（`editor/` `npm run dist`）。

回報包括：新舊 build、桌面 `app.asar` 反編譯差異、各模組影響與特徵碼檢查結果、偵測差異摘要與線上存檔判斷、已執行回歸測試結果、**桌面實機驗證了什麼／未驗證什麼**、已改檔案及**是否建議打包發布**。任何未完成或失敗都列出具體阻礙。
