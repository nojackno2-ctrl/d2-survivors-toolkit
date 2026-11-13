---
name: game-update
description: 使用者說「遊戲更新了」「官方更新」「驗收新版」時使用。讀官方更新訊息、比對新舊遊戲程式及偵測差異，評估工具包影響，完成回歸與官方網址實機驗證，經使用者確認後發布。
---

# 遊戲更新與工具包適配

全程繁體中文。流程：官方更新訊息 → 下載新版 bundle → 新舊差異與偵測掃描 → 影響評估 → 腳本快速回歸 → 官方網址實機 → 使用者確認後發布。任何步驟失敗即停，查明並修正後重跑受影響項目；模擬與腳本通過不代表實機完成。新遊戲內容先分析，由使用者決定是否加入。

目前 `verify/auto.cjs` 可能直接發布，且不包含以下人工分析與偵測掃描；不要直接執行。依序分段執行，不得繞過使用者確認。發布前以 `git status --short` 檢查含未追蹤檔案的工作樹，有未提交修改不得發布。

## 1. 官方訊息、新版快照與差異

1. 讀取 `https://d2survivors.lol/changelog.json` 第一筆與官方新聞，逐條建立更新清單；記下新版與舊版 build、官方 `/play/` 載入的 bundle 與雜湊。
2. 執行 `node verify/verify.cjs --update`，等待完成；此指令也會適配檔名、執行部分測試並可能更新版本常數，先檢查工作樹與其改動。快照在 `game-bundles/<build>/`，報告在 `verify/reports/impact.json`、`language.json`、`latest.json`；失敗查 `ticket.json`。同 build 仍須確認官方檔案雜湊；既有快照會被沿用，必要時另行取得並比對官方檔案。
3. 格式化或反編譯新舊 `assets`，比對 Game、itemArt、saveTransfer、record、ui、技能與物品資料、掉落、經驗、選卡、存檔與簽章。逐條對照官方更新，標出未公告的程式變動及公告但尚未找到依據的項目。
4. 評估對防護、輔助器、修改器、中文化的影響，提供新版檔名、位置及依據。`impact.json` 僅在分析完整且有具體證據時標「已完成」；不確定保留待分析。修正受影響功能並補必要測試，不以修改斷言掩蓋失敗。

## 2. 偵測與線上存檔檢查（每次必做）

新版快照完成後，將下列版本替換成實際資料夾名稱：

```powershell
node verify/lib/detection-scan.cjs --build game-bundles/<版本資料夾> --diff
```

掃描與 `verify/detection-baseline.json` 比對新增／移除的 `/api` 端點、`localStorage` 鍵、封印金鑰字串、MOD 診斷檢查的原生 API 清單、受限網址參數、上傳紀錄欄位。工具或基準不存在、執行失敗或輸出不完整時停止，不得當成無差異。

AI 必須精讀每項差異對應的新舊程式、呼叫鏈與用途，在 `AI_HANDOFF.md` 記錄位置、證據、影響及未確認事項；不能只依關鍵字或掃描結果下結論。完成審查並確認基準應更新後才執行：

```powershell
node verify/lib/detection-scan.cjs --build game-bundles/<版本資料夾> --update
```

出現存檔上傳、下載、同步跡象（包括新端點、新鍵或帳號登入）時，遊戲可能推出線上存檔：**停下來向使用者報告，不自動發布**；追查證據、評估 `guard/guard.js` 的 `detectors` 如何辨識及哪些輔助器功能受影響。未確認伺服器行為前，不得聲稱已支援真實線上存檔；手動線上模式測試不代表真實線上存檔驗證。

## 3. 分模組重驗

- **防護 `guard/`（存檔檢查＋反偵測）**：追查 fetch／XHR／sendBeacon 的排行榜非 GET 上傳封鎖、`leaderboard.off` 鎖定、上傳佇列清除與攔截、封印金鑰與簽章、存檔檢查及模式判定。執行 `guard/tests/*` 適用測試，實機執行 `tests/live-harness/toolkit-roles-live.cjs`、`no-upload-live.cjs`；單機與線上模式都須確認上傳封鎖。
- **輔助器 `helper/`（只改記憶體）**：重驗使用的 `Game` 掛接成員及方法、選卡、撿寶與受變更影響的功能；執行 `helper/tests/*` 適用測試及 `node helper/tests/memory-only.cjs`。不得直接讀寫遊戲存檔鍵、簽章或使用 `__d2editBackend`。實機執行 `cheat-restore-live.cjs`、`invincible-live.cjs`，並檢查線上模式受限功能。
- **修改器 `modifier/`（只改單機存檔）**：重驗 `signatures.json`、`patch.mjs`、物品資料與合法性規則、`engine-page.js`、封印與寫入；線上模式必須拒絕寫入。執行 `modifier/tests/*` 適用測試，尤其 `item-db` 與 `drop-ranges`，並在官方遊戲以隔離存檔驗證讀寫。官方 `itemstats.json` 須使用 `/play/` 的 `d2-files` 所帶 `?h=`，避免 CDN 舊資料；新增裝備另查職業屬性。
- **中文化 `lang/`**：檢查 `language.json` 的新增及變更字串、遊戲和新聞未翻譯項，對照官方 D2R 繁中及語境；執行 `node lang/tests/test_lang.cjs`，實機確認遊戲內顯示。字典已有譯文不代表更新影響已分析。

## 4. 快速回歸與平行分析

分析及修正後，執行 `node verify/verify.cjs --update --force`；可用 `node verify/verify.cjs --quick` 快速重跑登記的靜態與隔離整合測試。查看 `latest.json` 的已執行、略過與結果；`verify/suite.cjs` 的 `always` 項目每次更新必跑。按差異增加針對性測試，未變動部分用腳本快速回歸。`--full` 僅在需要長流程時使用；腳本輸出中「自動發布」不是發布授權。

可平行派子代理：不同 bundle 分塊差異、官方更新日誌逐條核對、各模組回歸；要求回報新版檔案位置、證據、指令、結果及未驗證事項。主代理必須親自核實關鍵差異與呼叫鏈、偵測掃描每項差異、線上存檔跡象、跨模組影響、測試結果與官方網址實機證據，並決定是否建議發布。派 Codex 前先確認本機 Ollama 正在執行：

```powershell
Test-NetConnection 127.0.0.1 -Port 11434
```

`TcpTestSucceeded` 為 `False` 時不要派 Codex，避免等待網路；改用其他可用代理或自行處理。

## 5. 官方網址實機

使用 `tests/live-harness` 的隔離 Electron 設定檔開 `https://d2survivors.lol/play/`，以本機伺服器載入待驗證工具包；不可用本地遊戲快照代替官方網址。一般使用 D2S1 存檔副本，多存檔各用獨立設定檔；自動配裝使用新存檔並以修改器解鎖裝備庫。確認載入的 build 與本機來源，依第 3 節及實際改動操作驗證，記錄通過與未覆蓋項目。

```powershell
node verify/live-smoke.cjs --build <版本>
node modifier/tests/write-confirm.cjs
```

煙霧測試只證明其檢查範圍，不能取代各功能實機。Windows 執行個別 Electron 腳本時，以等待結束的方式啟動，並從子行程環境刪除 `ELECTRON_RUN_AS_NODE`（空字串也不行）。以下以防護實機腳本為例；依各腳本參數提供隔離輸出路徑：

```powershell
node -e 'const {spawnSync}=require("node:child_process"); const env={...process.env}; delete env.ELECTRON_RUN_AS_NODE; const r=spawnSync("editor/node_modules/electron/dist/electron.exe",["tests/live-harness/no-upload-live.cjs"],{env,stdio:"inherit",windowsHide:true}); if(r.error) throw r.error; process.exit(r.status ?? 1)'
```

`modifier/tests/write-confirm.cjs` 是 Node 測試，不可用 Electron 執行。檢查個別腳本的輸出與結束碼；測試結束後清理本次測試殘留行程及暫存設定檔，勿刪使用者資料。`verify/reports/live.json` 記錄煙霧測試的 build、fingerprint、網址與證據。

## 6. 發布與回報

確認所有必要分析、回歸與實機通過，更新玩家可讀日誌及 `AI_HANDOFF.md`。再次確認官方最新 build 與實機版本一致，工作樹沒有任何未提交修改；否則停止。執行 `node verify/publish.cjs` 查看發布計畫，**只有使用者確認後**才執行 `node verify/publish.cjs --confirm`。新內容是否加入另由使用者決定。

回報包括：新舊 build、官方更新與未公告差異、各模組影響及證據、偵測差異摘要與線上存檔判斷、已執行測試結果、**實機驗證了什麼／未驗證什麼**、已改檔案及**是否建議發布**。任何未完成或失敗都列出具體阻礙。
