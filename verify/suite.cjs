// 測試登記表。tier：static（純檢查，秒級）／integration（隔離 Electron，數十秒）／full（實機長流程，預設不跑）。
// kind：node＝一般 node 腳本；electron＝用 editor/ 的 electron 執行（隔離 TEMP 設定檔，不碰真實存檔）。
// file：以根目錄為基準的測試檔路徑（測試跟著它測的模組放，不再集中在 editor/）。
// stale：已確認過時、不納入（原因記在這裡，避免日後再被當成工具包壞掉）。
module.exports = [
  { id: "build-web",          tier: "static",      kind: "node",     file: "tools/tests/build-web.cjs",        timeout: 60 },
  { id: "lang",               tier: "static",      kind: "node",     file: "lang/tests/test_lang.cjs",         timeout: 60 },
  { id: "runeword-class-base",tier: "static",      kind: "node",     file: "modifier/tests/runeword-class-base.cjs", timeout: 60 },
  // 裝備資料庫完整檢查：每次更新必跑（always），逐件驗證一鍵解鎖與製作裝備
  { id: "item-db",            tier: "static",      kind: "node",     file: "modifier/tests/item-db.cjs",       timeout: 300, always: true },
  // 掉落屬性範圍對照：遊戲產生器取樣，逐列對照修改器顯示的範圍與同屬性疊加上限
  { id: "drop-ranges",        tier: "static",      kind: "node",     file: "modifier/tests/drop-ranges.cjs",   timeout: 300, always: true },
  { id: "skill-mods",         tier: "static",     kind: "node",     file: "modifier/tests/skill-mods.cjs",    timeout: 60 },
  { id: "weapon-sets",        tier: "static",      kind: "node",     file: "modifier/tests/weapon-sets.cjs",   timeout: 60 },
  { id: "selfcheck",          tier: "static",      kind: "node",     file: "helper/tests/selfcheck.cjs",       timeout: 60 },
  { id: "autoforge",          tier: "static",      kind: "node",     file: "helper/tests/autoforge.cjs",       timeout: 60 },
  { id: "stash-sort",         tier: "static",      kind: "node",     file: "helper/tests/stash-sort.cjs",      timeout: 60 },
  { id: "forge-local",        tier: "static",      kind: "node",     file: "helper/tests/forge-local.cjs",     timeout: 60 },
  { id: "memory-only",        tier: "static",      kind: "node",     file: "helper/tests/memory-only.cjs",     timeout: 60 },
  { id: "guard",              tier: "static",      kind: "node",     file: "guard/tests/guard.cjs",            timeout: 60 },
  { id: "save-check",         tier: "static",      kind: "node",     file: "guard/tests/save-check.cjs",       timeout: 60 },
  { id: "guard-iframe-ui",    tier: "static",      kind: "electron", file: "guard/tests/guard-iframe-ui.cjs", timeout: 90 },
  { id: "weapon-sets-ui",     tier: "integration", kind: "electron", file: "modifier/tests/weapon-sets-ui.cjs", timeout: 120 },
  { id: "save-faults-ui",     tier: "integration", kind: "electron", file: "modifier/tests/save-faults-ui.cjs", timeout: 120 },
  { id: "craft-affix-ui",     tier: "integration", kind: "electron", file: "modifier/tests/craft-affix-ui.cjs", timeout: 120 },
  { id: "craft-companion-ui", tier: "integration", kind: "electron", file: "modifier/tests/craft-companion-ui.cjs", timeout: 120 },
  { id: "backup-record",     tier: "static", kind: "node", file: "modifier/tests/backup-record.cjs", timeout: 60 },
  { id: "write-confirm",       tier: "static", kind: "node", file: "modifier/tests/write-confirm.cjs", timeout: 60 },
  { id: "autobot",            tier: "integration", kind: "electron", file: "helper/tests/autobot.cjs",         timeout: 180 },
  // 舊測試：遊戲版本封鎖已移除（見 AI_HANDOFF），斷言已不成立。檔案已從 editor/ 移除，不再執行。
  { id: "version-gate",       stale: "版本封鎖已移除，斷言過時", file: "（已移除）version-gate.cjs" },
  { id: "version-gate-web",   stale: "需要手動提供新舊版目錄參數，且封鎖已移除", file: "modifier/tests/version-gate-web.cjs" },
];
