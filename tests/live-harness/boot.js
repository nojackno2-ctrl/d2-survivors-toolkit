// 建檔與監看（不操作遊戲）：進入遊戲、設定輔助器、選職業建立新角色；之後只讀取狀態。
(async () => {
  const CLS = window.__H_CLASS, SPEED = window.__H_SPEED || 1;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const hosted = [...document.querySelectorAll("button")].find((b) => /hosted/i.test(b.textContent));
  // 注意：setup 頁的 hosted 按鈕會先載入遊戲資產；它也會在未選職業時呼叫遊戲 startRun，產生 reading 'id'（堆疊已確認，為 harness 路徑特有、非玩家路徑）。
  if (hosted) { hosted.click(); return "hosted"; }
  if (!window.__d2autobot) {
    const st = JSON.parse(localStorage.getItem("d2autobot:settings") || "{}");
    localStorage.setItem("d2autobot:settings", JSON.stringify({ ...st, version: 4, enabled: true, progressEnabled: true, cheat: { ...(st.cheat || {}), enabled: true, invincible: true, maxCrit: true, oneHitKill: true, maxSkills: true, maxMonsterDensity: true, monsterDensity10x: true, allElites: true, infiniteRerolls: true, maxDropRate: true, maxGoldRate: true, ...((window.__H_SETTINGS || {}).cheat || {}) }, quest: { ...(st.quest || {}), autoProgress: true, autoStart: true, prioritizeBoss: true, farmDifficulty: "off" }, terror: { ...(st.terror || {}), mode: "off", ...((window.__H_SETTINGS || {}).terror || {}) } }));
    // 依使用者要求：用 GitHub 連結實測，像玩家點書籤一樣載入 GitHub Pages 上的 d2edit.js（再載入輔助器）。
    // 新版輔助器重新整理後總開關預設關閉；模擬「玩家打開開關」，先寫入頁面記憶體。
    window.__d2autobotSwitches = { enabled: true, progressEnabled: true, cheat: (window.__H_SETTINGS || {}).cheat?.enabled ?? true };
    // H_BASE 可指定本機伺服器（例如 http://localhost:8766/）測試未發布的本機修改；未指定則用 GitHub Pages。
    await import((window.__H_BASE || "https://nojackno2-ctrl.github.io/d2-survivors-toolkit/") + "d2edit.js?v=" + Date.now());
  }
  for (let i = 0; i < 40 && !window.__d2autobot?.game; i++) { document.body.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true })); await sleep(500); }
  const g = window.__d2autobot.game; if (!g) return "no game";
  if (!window.__hSpeed && SPEED > 1) {
    window.__hSpeed = true; const orig = g.tick.bind(g);
    g.tick = (dt) => { for (let k = 0; k < SPEED; k++) orig(dt); };
  }
  if (g.state === "select" && !window.__hPicked) {
    if (g.frontend?.open && !g.plainSelect().onPick) { g.frontend.actions.play(); await sleep(3000); }
    if (!g.plainSelect().onPick) { g.chooseClass(); await sleep(1500); }
    const s = g.plainSelect(), i = s.cards.findIndex((c) => c.dataset?.class === CLS);
    s.select(i); await sleep(300); s.confirm(false); // false：有存檔進度就接續原角色，沒有才開新角色（原版 confirm 實作） await sleep(1000); window.__hPicked = g.state !== "select";
  }
  // 陣亡畫面很短，status 每 5 秒取樣會漏；改為每 200ms 偵測。
  let deaths = 0, lastState = "";
  setInterval(() => { const g = window.__d2autobot?.game; if (g?.state === "dead" && lastState !== "dead" && !g.tierDone && !g.won) deaths++; lastState = g?.state; }, 200);
  window.__h = { status() {
    const g = window.__d2autobot?.game, w = g?.world, p = w?.player;
    return { t: new Date().toISOString(), state: g?.state, cls: g?.kit?.id, level: p?.level, hp: p ? Math.round(p.life) + "/" + Math.round(p.maxLife) : null, diff: w?.difficulty ?? g?.difficulty, act: w?.act ?? w?.area?.act, area: w?.area?.name ?? w?.area?.id, gold: g?.save?.gold, deaths, baal: g?.baalSlain, diag: window.__d2autobot?.diagnostics() };
  } };
  return "picked " + CLS + " state=" + g.state;
})();
