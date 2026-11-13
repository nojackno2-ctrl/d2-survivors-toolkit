// 多實例「任務模式」實機長跑（官方網址 https://d2survivors.lol/play/，隔離設定檔，不碰使用者真實存檔）。
// 用法（控制器，Node）：
//   node tests/live-harness/quest-mode-10x-live.cjs --instances 10 --max-minutes 240 [--stagger-sec 25] [--prepare-only]
// 控制器會：解碼使用者 D2S1 存檔 → 清除通關／任務進度（等級、裝備、技能保留）→ 重新簽章 →
//   為每個實例建立 backups/quest-run-20261111/inst-NN/（profile、seed.json、status.jsonl、log.txt、截圖）→ 依序啟動 Electron 子程序。
// 子程序（Electron，內部使用，--child NN）：載入官方頁面、寫入存檔與輔助器設定（只開：任務模式、自動走位、死亡保護、自動喝水）、
//   讀回記憶體實際開關並與介面比對，每 30 秒寫一行 status.jsonl，錯誤／卡住／死亡時截圖，任務全完成寫 done.json 後自行關閉。
// 環境變數：H_SEED（指定已重設的存檔 JSON；未設則用控制器產生的 seed.json）、H_SRC（來源 D2S1 檔，預設見 SRC_DEFAULT）。
const fs = require("fs"), path = require("path"), os = require("os"), crypto = require("crypto"), zlib = require("zlib");
const ROOT = path.resolve(__dirname, "..", "..");
const OUTROOT = path.join(ROOT, "backups", "quest-run-20261111");
const SRC_DEFAULT = "C:\\Users\\nojac\\.claude\\uploads\\32a78beb-4958-4a4a-b67a-b1342d68372e\\a6e338c6-D2-Survivors-save-2026-11-11-1607.txt";
const SOFT_SEAL = "d2s/save-seal/1:Rakanishu-Bishibosh-Coldcrow-Griswold-Pindleskin"; // 與 d2edit.js MODES.softcore.seal 相同
const PAGES = "https://nojackno2-ctrl.github.io/d2-survivors-toolkit/";
const GAME_URL = "https://d2survivors.lol/play/";
const arg = (name, def) => { const i = process.argv.indexOf("--" + name); return i < 0 ? def : (process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : true); };
const pad = (n) => String(n).padStart(2, "0");

// ───────────── 存檔重設（控制器與測試共用）─────────────
function decodeD2S1(text) {
  const t = text.trim().replace(/^D2S1:/, "").replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(zlib.inflateSync(Buffer.from(t, "base64")).toString("utf8"));
}
const sealOf = (save) => { const { seal, ...rest } = save; return crypto.createHmac("sha256", SOFT_SEAL).update(JSON.stringify(rest)).digest("hex"); };
// 回傳 { save, changes[] }。判斷依據見 backups/quest-run-20261111/RESET_FIELDS.md。
function resetProgress(src) {
  const save = JSON.parse(JSON.stringify(src)), changes = [];
  const note = (field, from, to) => changes.push({ field, from, to });
  const short = (v) => { const s = JSON.stringify(v); return s === undefined ? "（無）" : s.length > 120 ? s.slice(0, 117) + "…" : s; };
  const del = (k) => { if (k in save) { note(k, short(save[k]), "（刪除）"); delete save[k]; } };
  for (const k of ["continuedBest", "baalSlain", "terror", "cain", "climbs", "light", "resets", "searchAsked", "pandemonium", "pandemoniumDone", "waypointFound"]) del(k);
  if (save.bestTimes) { note("bestTimes", short(save.bestTimes), "{normal:0,nightmare:0,hell:0}"); save.bestTimes = { normal: 0, nightmare: 0, hell: 0 }; }
  if (save.unlocked) { note("unlocked", short(save.unlocked), "{}（各職業回到只開普通）"); save.unlocked = {}; }
  // 角色（等級、經驗、技能、被動、屬性）全數保留。實測（官方頁面）：kept 的 act 只能維持原值（改 1 或 2 整筆被丟棄），
  // 「第一幕開頭、普通」只能用 run（進行中的冒險）表達；run 沒有 kept 時也會被丟棄，所以 kept 保留但改成普通難度、拿掉通關後欄位。
  for (const [cls, hero] of Object.entries(save.heroes || {})) {
    const k = hero?.kept; if (!k) continue;
    const before = { difficulty: k.difficulty, act: k.act, time: k.time, pastBaal: k.run?.pastBaal, continuedAt: k.run?.continuedAt };
    const run = JSON.parse(JSON.stringify(k)); run.difficulty = "normal"; run.act = 1; run.time = 0;
    if (run.run) { delete run.run.pastBaal; delete run.run.continuedAt; run.run.buildFullAt = 0; }
    k.difficulty = "normal"; if (k.run) { delete k.run.pastBaal; delete k.run.continuedAt; }
    hero.run = run;
    note("heroes." + cls + ".kept", short(before), "{difficulty:normal,pastBaal:（刪除）,continuedAt:（刪除）}（act 維持 5；等級／build 原樣）");
    note("heroes." + cls + ".run", "（原檔無）", "新增：kept 的複本，difficulty:normal,act:1,time:0,buildFullAt:0，無 pastBaal／continuedAt；level " + (run.run?.level ?? run.build?.level) + "、build 原樣");
  }
  if (save.leaderboard) { note("leaderboard.off", short(save.leaderboard.off), "true（避免實機測試成績上傳到使用者的正式排行榜）"); save.leaderboard.off = true; }
  delete save.seal; save.seal = sealOf(save);
  return { save, changes };
}

// ───────────── 輔助器設定：只開五項（含自動買藥水）─────────────
const HELPER_SETTINGS = {
  version: 10,
  potion: { autoHp: true },
  movement: { enabled: true },
  deathProtection: { enabled: true, disableAutomation: false },
  terror: { mode: "off", autoReviveOrRestart: false },
  quest: { autoProgress: true, prioritizeBoss: true, autoStart: true, farmDifficulty: "off" },
  loot: { enabled: false, vacuum: false, vacuumXp: false, vacuumGold: false, pickupGold: false, backtrackForLoot: false, kickJars: false, onlyUpgrades: false },
  gear: { autoEquip: false },
  town: { enabled: true, collect: false, stash: false, sellJunk: false, buyPotions: true, charsiUpgrades: false, buyGear: false },
  build: { ladder: false, autoStats: false, redraft: false, autoReroll: false },
  cheat: { enabled: false, invincible: false, maxCrit: false, oneHitKill: false, maxSkills: false, maxMonsterDensity: false, monsterDensity10x: false, allElites: false, forgeMax: false, larzukMax: false, pauseStageTime: false, summonAllBosses: false, infiniteRerolls: false, maxDropRate: false, maxGoldRate: false, maxXp: false, summonCloneOnTerror: false },
};

if (!process.versions.electron) {
  // ───────────── 控制器 ─────────────
  const { spawn, spawnSync } = require("child_process");
  const N = Number(arg("instances", 1)), MAXMIN = Number(arg("max-minutes", 240)), STAGGER = Number(arg("stagger-sec", 25));
  fs.mkdirSync(OUTROOT, { recursive: true });
  const logf = path.join(OUTROOT, "orchestrator.log");
  const log = (...a) => { const l = new Date().toISOString() + " " + a.join(" "); fs.appendFileSync(logf, l + "\n"); console.log(l); };
  const RESUME = !!arg("resume", false);
  // --only 05,10：只啟動指定編號的實例（用於只重跑少數幾個，例如 H4 驗證）。
  const ONLY = typeof arg("only", null) === "string" ? new Set(String(arg("only")).split(",").map((x) => Number(x)).filter((x) => x >= 1)) : null;
  let seedText = "";
  if (RESUME) log("--resume：沿用既有 inst-NN 的 userData 與遊戲存檔，不重灌 seed");
  else {
    const srcFile = process.env.H_SRC || SRC_DEFAULT;
    const src = decodeD2S1(fs.readFileSync(srcFile, "utf8"));
    const orig = sealOf(src) === src.seal;
    const { save, changes } = resetProgress(src);
    log("來源存檔簽章原本有效：" + orig + "；重設欄位 " + changes.length + " 項");
    fs.writeFileSync(path.join(OUTROOT, "reset-changes.json"), JSON.stringify(changes, null, 1));
    seedText = JSON.stringify(save);
    const seedPath = process.env.H_SEED || path.join(OUTROOT, "seed.json");
    if (!process.env.H_SEED) fs.writeFileSync(seedPath, seedText);
    // 自我檢查：kept.build 與原檔相同、簽章正確
    for (const [cls, h] of Object.entries(src.heroes || {})) if (h.kept && JSON.stringify(h.kept.build) !== JSON.stringify(save.heroes[cls].kept.build)) throw new Error("kept.build 被改動：" + cls);
    if (sealOf(save) !== save.seal) throw new Error("簽章不符");
    if (arg("prepare-only", false)) { log("prepare-only：已產生 seed.json"); process.exit(0); }
  }

  const electronExe = path.join(ROOT, "editor", "node_modules", "electron", "dist", "electron.exe");
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const kids = [], exits = new Map();
  const killTree = (pid) => { try { spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" }); } catch {} };
  let cleaned = false;
  const cleanup = (why) => { if (cleaned) return; cleaned = true; log("清理 Electron 子程序：" + why); for (const k of kids) killTree(k.pid); };
  process.on("exit", () => cleanup("exit")); process.on("SIGINT", () => { cleanup("SIGINT"); process.exit(1); }); process.on("SIGTERM", () => { cleanup("SIGTERM"); process.exit(1); });
  const writePids = () => fs.writeFileSync(path.join(OUTROOT, "PIDS.txt"), ["controller " + process.pid, ...kids.map((k) => "inst-" + pad(k.n) + " " + k.pid + (exits.has(k.n) ? " (已結束 code=" + exits.get(k.n) + ")" : ""))].join("\n") + "\n");
  const hard = setTimeout(() => { log("超過硬性逾時，強制結束"); cleanup("hard-timeout"); process.exit(2); }, (MAXMIN + 4) * 60000);
  const mem = setInterval(() => { log("記憶體剩餘 " + Math.round(os.freemem() / 1048576) + "MB／" + Math.round(os.totalmem() / 1048576) + "MB；load " + os.loadavg().map((x) => x.toFixed(1)).join(",") + "；存活 " + (kids.length - exits.size) + "/" + kids.length); }, 60000);
  (async () => {
    log("啟動 " + N + " 個實例，間隔 " + STAGGER + " 秒，上限 " + MAXMIN + " 分鐘；啟動前剩餘記憶體 " + Math.round(os.freemem() / 1048576) + "MB");
    for (let n = 1; n <= N; n++) {
      if (ONLY && !ONLY.has(n)) continue;
      const dir = path.join(OUTROOT, "inst-" + pad(n)); fs.mkdirSync(dir, { recursive: true });
      if (!RESUME) fs.writeFileSync(path.join(dir, "seed.json"), seedText);
      const cls = n % 2 === 1 ? "sorceress" : "paladin";
      const child = spawn(electronExe, [__filename, "--child", String(n), "--max-minutes", String(MAXMIN), "--class", cls, ...(RESUME ? ["--resume"] : [])], { env, stdio: ["ignore", "ignore", "ignore"], windowsHide: false });
      child.n = n; kids.push(child); writePids();
      child.on("exit", (code) => { exits.set(n, code); writePids(); log("inst-" + pad(n) + " 結束 code=" + code); });
      log("inst-" + pad(n) + " PID " + child.pid + " 職業 " + cls);
      if (n < N && (!ONLY || [...ONLY].some((x) => x > n))) await new Promise((r) => setTimeout(r, STAGGER * 1000));
    }
    log("全部已啟動；啟動後剩餘記憶體 " + Math.round(os.freemem() / 1048576) + "MB");
    while (exits.size < kids.length) await new Promise((r) => setTimeout(r, 2000));
    clearTimeout(hard); clearInterval(mem); log("所有實例已結束"); cleanup("all-done"); process.exit(0);
  })().catch((e) => { log("控制器錯誤 " + (e.stack || e)); cleanup("error"); process.exit(1); });
} else {
  // ───────────── 子程序（Electron）─────────────
  const { app, BrowserWindow, session, net } = require("electron");
  const NN = pad(Number(arg("child", 1))), MAXMIN = Number(arg("max-minutes", 240)), CLASS = arg("class", "sorceress");
  const DIR = path.join(OUTROOT, "inst-" + NN); fs.mkdirSync(DIR, { recursive: true });
  const RESUME = !!arg("resume", false);
  const SEED = RESUME ? null : fs.readFileSync(process.env.H_SEED || path.join(DIR, "seed.json"), "utf8");
  const BOT_FILE = path.join(ROOT, "helper", "autobot.js");
  const botMtime = () => { try { return fs.statSync(BOT_FILE).mtimeMs; } catch { return 0; } };
  let helperMtime = botMtime(), reloadCount = 0;
  app.setPath("userData", path.join(DIR, "profile"));
  for (const sw of ["disable-renderer-backgrounding", "disable-background-timer-throttling", "disable-backgrounding-occluded-windows"]) app.commandLine.appendSwitch(sw);
  app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion");
  const T0 = Date.now(), now = () => new Date().toISOString();
  const log = (...a) => fs.appendFileSync(path.join(DIR, "log.txt"), now().slice(11, 19) + " " + a.join(" ") + "\n");
  fs.writeFileSync(path.join(DIR, "pid"), String(process.pid));
  const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".html": "text/html", ".css": "text/css", ".svg": "image/svg+xml" };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // 頁面內計數器與快照（只讀取與包裝計數，不改變遊戲或輔助器行為）。
  const MONITOR = `(() => {
    if (window.__q) return "已安裝";
    const q = window.__q = { deaths: 0, protect: 0, drinks: 0, lastState: "", wrapped: new WeakSet() };
    const lastAction = () => { try { return window.__d2autobot?.diagnostics?.().lastAction || ""; } catch { return ""; } };
    setInterval(() => {
      const g = window.__d2autobot?.game; if (!g) return;
      if (g.state === "dead" && q.lastState !== "dead" && !g.tierDone && !g.won) q.deaths++;
      q.lastState = g.state;
      if (!q.wrapped.has(g)) {
        q.wrapped.add(g);
        for (const [name, fn] of [["drinkFrom", () => { q.drinks++; }], ["leaveRun", () => { if (/^死亡保護/.test(lastAction())) q.protect++; }]]) {
          const orig = g[name]; if (typeof orig !== "function") continue;
          g[name] = function (...a) { try { fn(); } catch {} return orig.apply(this, a); };
        }
      }
    }, 200);
    // 走位取樣（每 1 秒，30 秒彙總一次）：讀法同 helper/autobot.js planMove（w.enemies／w.hostiles／player.damageTaken／e.damage／預測位置）。
    const REACH = { jab: 58, powerStrike: 58, chargedStrike: 58, lightningStrike: 58, impale: 58, fend: 84, tigerStrike: 46, cobraStrike: 46, bladesOfIce: 46, fistsOfFire: 46, clawsOfThunder: 46, dragonClaw: 46, dragonTail: 46, dragonTalon: 90, royalStrike: 128, doubleSwing: 48, bash: 54, stun: 54, frenzy: 66, concentrate: 58, berserk: 58, whirlwind: 200, leapAttack: 340, battleCry: 100, warCry: 100, howl: 100, shout: 0, battleOrders: 0, battleCommand: 0, taunt: 0, grimWard: 0, leap: 0, zeal: 46, smite: 54, sacrifice: 54, vengeance: 54, charge: 90, holyShield: 0, conversion: 220 };
    const mv = q.mv = { n: 0, stay: 0, plan: 0, other: 0, hpMin: 100, near: 0, hurting: 0, maxHit: 0, focusFar: 0, shots: 0, planNoBlock: 0, planHurt: 0, planShot: 0, planFar: 0 };
    setInterval(() => {
      try {
        const b = window.__d2autobot, g = b?.game, w = g?.world, p = w?.player; if (!p || g.state !== "playing" || !b.settings) return;
        const la = lastAction(), ign = b.settings.movement.ignoreDamagePercent, taken = Math.max(1, Number.isFinite(p.damageTaken) ? p.damageTaken : 1), hpNow = Math.max(1, p.life);
        const live = (e) => e && Number.isFinite(e.x) && Number.isFinite(e.y) && !(e.life <= 0) && !e.dead;
        const foes = (Array.isArray(w.enemies) ? w.enemies : []).filter((e) => live(e) && e.rank !== "breakable");
        const dd = (a, c) => Math.hypot(a.x - c.x, a.y - c.y);
        const pf = foes.map((e) => { const d = dd(e, p), ux = d ? (p.x - e.x) / d : 0, uy = d ? (p.y - e.y) / d : 0, sp = Math.min(d, Math.max(40, e.speed || e.moveSpeed || 90) * 0.6); return { x: e.x + ux * sp, y: e.y + uy * sp, e }; });
        const near = pf.filter((f) => dd(f, p) < 900);
        const hitPct = (e) => Math.max(0, e.damage || 0) * taken / hpNow * 100;
        const hurting = near.filter((f) => hitPct(f.e) >= ign).length;
        const shots = (Array.isArray(w.hostiles) ? w.hostiles : []).filter(live).filter((sh) => Math.max(0, sh.damage || 0) * taken >= hpNow * ign / 100).length;
        const reachList = (g.build?.skills || []).map((x) => REACH[x.id] ?? 450).filter((r) => r > 0), reach = Math.min(reachList.length ? Math.max(...reachList) : 450, 450);
        const boss = foes.filter((e) => (["actBoss", "boss", "champion"].includes(e.rank) || typeof e.name === "string") && dd(e, p) < 900).reduce((a, e) => !a || dd(e, p) < dd(a, p) ? e : a, null);
        const focus = boss || near.reduce((a, f) => !a || dd(f, p) < dd(a, p) ? f : a, null)?.e;
        const far = !!focus && dd(focus, p) > reach * 0.9;
        const maxHit = near.reduce((m, f) => Math.max(m, hitPct(f.e)), 0);
        mv.n++; mv.near += near.length; mv.hurting += hurting; mv.shots += shots; mv.maxHit = Math.max(mv.maxHit, maxHit); if (far) mv.focusFar++;
        mv.hpMin = Math.min(mv.hpMin, p.maxLife > 0 ? p.life / p.maxLife * 100 : 100);
        if (/^沒有威脅/.test(la)) mv.stay++; else if (/^全圖走位/.test(la)) { mv.plan++; if (hurting) mv.planHurt++; if (shots) mv.planShot++; if (far) mv.planFar++; if (!hurting && !shots && !far) mv.planNoBlock++; } else mv.other++;
      } catch {}
    }, 1000);
    // 死亡保護事件紀錄：每秒環形緩衝 5 筆事實；lastAction 變成「死亡保護：」開頭（含後續離場結果）就產生事件，由控制迴圈寫入 protect-events.jsonl。
    q.events = []; q.ring = []; q.prevLA = "";
    const meleeGap = (e) => e?.type && Array.isArray(e.type.melee) && !e.type.melee.length ? -Infinity : 6 + (e?.type?.behaviour === "tentacle" ? 28 : 0);
    q.sample = () => {
      const b = window.__d2autobot, g = b?.game, w = g?.world, p = w?.player; if (!p) return null;
      const taken = Math.max(1, Number.isFinite(p.damageTaken) ? p.damageTaken : 1), hpNow = p.life;
      const live = (e) => e && Number.isFinite(e.x) && Number.isFinite(e.y) && !(e.life <= 0) && !e.dead;
      const foes = (Array.isArray(w.enemies) ? w.enemies : []).filter((e) => live(e) && e.rank !== "breakable");
      let meleeN = 0, meleeSum = 0, meleeMax = 0, near900 = 0; const meleeTop = [];
      for (const e of foes) {
        const d = Math.hypot(e.x - p.x, e.y - p.y); if (d <= 900) near900++;
        const gap = meleeGap(e);
        if (gap !== -Infinity && d <= (e.radius || 12) + (p.radius || 12) + gap + 20) { const hit = Math.max(0, e.damage || 0) * taken; meleeN++; meleeSum += hit; meleeMax = Math.max(meleeMax, hit); meleeTop.push({ n: String(e.name || e.type?.id || e.type?.name || "?").slice(0, 24), rank: e.rank || null, dmg: Math.round(hit), d: Math.round(d) }); }
      }
      meleeTop.sort((a, c) => c.dmg - a.dmg);
      const horizon = b.settings?.potion?.lethalLookaheadSec ?? 1; let shotDmg = 0, shotN = 0; const hostiles = (Array.isArray(w.hostiles) ? w.hostiles : []).filter(live);
      for (const sh of hostiles) {
        const vx = sh.vx || 0, vy = sh.vy || 0, v2 = vx * vx + vy * vy, dx = p.x - sh.x, dy = p.y - sh.y;
        const hitR = (sh.radius || 0) + (p.radius || 12) + 10, dot = dx * vx + dy * vy, disc = dot * dot - v2 * (dx * dx + dy * dy - hitR * hitR);
        const enter = v2 > 0 && dot >= 0 && disc >= 0 ? Math.max(0, (dot - Math.sqrt(disc)) / v2) : Math.hypot(dx, dy) <= hitR ? 0 : Infinity;
        if (enter <= horizon && (!Number.isFinite(sh.life) || enter <= sh.life)) { shotN++; shotDmg += (Math.max(0, sh.damage || 0) + Math.max(0, sh.effect?.damage || 0)) * taken * Math.max(1, p.missileTaken || 1); }
      }
      let potions = {}; try { for (const c of (w.belt?.columns || [])) if (Array.isArray(c)) for (const t of c) potions[t] = (potions[t] || 0) + 1; } catch {}
      return { t: Date.now(), hp: Math.round(hpNow), maxHp: Math.round(p.maxLife), hpPct: p.maxLife > 0 ? Math.round(hpNow / p.maxLife * 1000) / 10 : null, potions, meleeN, meleeSum: Math.round(meleeSum), meleeMax: Math.round(meleeMax), meleeX: hpNow > 0 ? Math.round(meleeSum / hpNow * 100) / 100 : null, meleeTop: meleeTop.slice(0, 4), near900, hostilesN: hostiles.length, shotHitN: shotN, shotDmg: Math.round(shotDmg), shotX: hpNow > 0 ? Math.round(shotDmg / hpNow * 100) / 100 : null, damageTaken: taken, lastAction: lastAction() };
    };
    q.defense = () => {
      const p = window.__d2autobot?.game?.world?.player, out = {}; if (!p) return out;
      for (const [k, v] of Object.entries(p)) {
        if (!/block|resist|defense|defence|damageTaken|reduce/i.test(k)) continue;
        if (typeof v === "number") out[k] = v;
        else if (v && typeof v === "object" && !Array.isArray(v)) { for (const [k2, v2] of Object.entries(v)) if (typeof v2 === "number") out[k + "." + k2] = v2; }
      }
      return out;
    };
    setInterval(() => { try { const g = window.__d2autobot?.game; if (!g?.world?.player || g.state !== "playing") return; const s = q.sample(); if (s) { q.ring.push(s); if (q.ring.length > 5) q.ring.shift(); } } catch {} }, 1000);
    setInterval(() => {
      try {
        const la = lastAction(); if (la === q.prevLA) return; q.prevLA = la; if (!/^死亡保護：/.test(la)) return;
        const b = window.__d2autobot, g = b?.game, w = g?.world;
        const first = /正在離開本局/.test(la), now = first ? q.sample() : null;
        q.events.push({ kind: first ? "trigger" : "follow", t: new Date().toISOString(), diff: w?.difficulty ?? g?.difficulty ?? null, act: w?.act ?? null, gstate: g?.state ?? null, lastAction: la, protectCount: q.protect, deaths: q.deaths, hpPctNow: now?.hpPct ?? null, now, prev5s: first ? q.ring.slice() : null, lostHp5s: first && q.ring.length ? Math.max(0, q.ring[0].hp - (now?.hp ?? q.ring[q.ring.length - 1].hp)) : null, maxDropIn1s: first ? q.ring.concat(now ? [now] : []).reduce((m, x, i, a) => i ? Math.max(m, a[i - 1].hp - x.hp) : m, 0) : null, defense: first ? q.defense() : null });
      } catch {}
    }, 100);
    q.mvFlush = () => { const m = q.mv, n = Math.max(1, m.n), r = (x) => Math.round(x * 100) / 100; const out = { n: m.n, stay: m.stay, plan: m.plan, other: m.other, hpMinPct: r(m.hpMin), near: r(m.near / n), hurting: r(m.hurting / n), maxHitPct: r(m.maxHit), focusFar: m.focusFar, shots: r(m.shots / n), planHurt: m.planHurt, planShot: m.planShot, planFar: m.planFar, planNoBlock: m.planNoBlock }; Object.assign(m, { n: 0, stay: 0, plan: 0, other: 0, hpMin: 100, near: 0, hurting: 0, maxHit: 0, focusFar: 0, shots: 0, planNoBlock: 0, planHurt: 0, planShot: 0, planFar: 0 }); return out; };
    // 獎勵使用計數：每秒取樣 lastAction，內容變成「使用任務獎品」「讀取赫拉迪克法典」就 +1（連續相同文字不重複計）。
    q.rewardUses = 0; q.rewardLog = []; q.rewardPrev = "";
    setInterval(() => { try { const la = lastAction(); if (la === q.rewardPrev) return; q.rewardPrev = la; if (/使用任務獎品|讀取赫拉迪克法典/.test(la)) { q.rewardUses++; q.rewardLog.push({ t: new Date().toISOString(), la }); if (q.rewardLog.length > 40) q.rewardLog.shift(); } } catch {} }, 1000);
    // H4（單樹重置）事件：lastAction 含「H4」「單樹」「重置技能」時記錄時間與文字，snap 一併輸出。
    q.h4Log = []; q.h4Prev = "";
    setInterval(() => { try { const la = lastAction(); if (la === q.h4Prev) return; q.h4Prev = la; if (/H4|單樹|重置技能|單一技能樹/.test(la)) { q.h4Log.push({ t: new Date().toISOString(), la }); if (q.h4Log.length > 60) q.h4Log.shift(); } } catch {} }, 500);
    const REWARD_BASES = new Set(["Ring", "hdm", "toa", "bbb", "xyz", "tr2", "ass", "hcx", "Wirt's Leg"]);
    const isReward = (x) => x && (x.type === "quest" || REWARD_BASES.has(x.base));
    q.rewards = () => {
      const g = window.__d2autobot?.game, cls = g?.kit?.id, out = [];
      const pick = (where, list) => { if (Array.isArray(list)) for (const x of list) if (isReward(x)) out.push({ where, base: x.base ?? null, type: x.type ?? null, name: x.name ?? null }); };
      try { pick("inv", g.inventoryOf(cls)); } catch {}
      try { for (const [k, v] of Object.entries(g?.save?.stashTabs || {})) pick("stash:" + k, v); } catch {}
      return out;
    };
    const num = (...v) => v.find((x) => Number.isFinite(x));
    q.snap = () => {
      const b = window.__d2autobot, g = b?.game, w = g?.world, p = w?.player, cls = g?.kit?.id;
      let diag = null; try { diag = b?.diagnostics?.(); } catch {}
      const quests = g?.save?.cain?.quests?.[cls] || {};
      const done = Object.entries(quests).filter(([, v]) => v != null).map(([k, v]) => k + ":" + v);
      const belt = w?.belt?.columns; let potions = null;
      try { if (Array.isArray(belt)) { potions = {}; for (const c of belt) if (Array.isArray(c)) for (const t of c) potions[t] = (potions[t] || 0) + 1; } } catch {}
      return {
        gstate: g?.state ?? null, cls, diff: w?.difficulty ?? g?.difficulty ?? null, act: w?.act ?? null, area: w?.area?.name ?? w?.area?.id ?? null, tristram: !!w?.tristram,
        level: p?.level ?? null, hp: p ? Math.round(p.life) : null, maxHp: p ? Math.round(p.maxLife) : null,
        mp: p ? Math.round(num(p.mana, p.mp, p.energy) ?? NaN) : null, maxMp: p ? Math.round(num(p.maxMana, p.maxMp, p.maxEnergy) ?? NaN) : null,
        x: p ? Math.round(p.x) : null, y: p ? Math.round(p.y) : null,
        questDone: done, questLine: diag?.quests?.line ?? null, questCain: diag?.quests?.cain ?? null, questPending: diag?.quests?.pending ?? null,
        townSmith: !!(g && g.state === "town" && g.trade?.smith && !g.camp), hasCamp: !!g?.camp,
        rewards: q.rewards(), rewardUses: q.rewardUses, questFull: JSON.parse(JSON.stringify(quests)),
        h4: diag?.h4 ?? null, h4Log: q.h4Log,
        potions, deaths: q.deaths, protect: q.protect, drinks: q.drinks, lastAction: diag?.lastAction ?? null, hookNote: diag?.hookNote ?? null, connected: diag?.connected ?? false,
        autoMode: window.__d2autobot?.settings ? (window.__d2autobot.settings.quest.farmDifficulty !== "off" ? "fixedDifficulty:" + window.__d2autobot.settings.quest.farmDifficulty : window.__d2autobot.settings.terror.mode !== "off" ? "terror:" + window.__d2autobot.settings.terror.mode : "quest") : null,
        enabled: window.__d2autobot?.settings?.enabled ?? null, progressEnabled: window.__d2autobot?.settings?.progressEnabled ?? null,
      };
    };
    q.probe = () => { const g = window.__d2autobot?.game, p = g?.world?.player; return { worldKeys: g?.world ? Object.keys(g.world).slice(0, 80) : null, gameKeys: g ? Object.keys(g).filter((k) => /area|zone|level|map|stage|biome|waypoint/i.test(k)).slice(0, 30) : null, belt: JSON.stringify(g?.world?.belt)?.slice(0, 600), saveFaults: (() => { try { return typeof g.saveFaults === "function" ? g.saveFaults() : (g.save?.faults ?? "n/a"); } catch (e) { return "err:" + e.message; } })(), keptAfter: JSON.stringify((() => { const h = g?.save?.heroes?.[g?.kit?.id]; return h ? { kept: h.kept ? { diff: h.kept.difficulty, act: h.kept.act, level: h.kept.run?.level } : null, run: h.run ? { diff: h.run.difficulty, act: h.run.act, level: h.run.run?.level } : null } : null; })()), unlocked: JSON.stringify(g?.save?.unlocked), version: g?.save?.version }; };
    // 開關讀回：記憶體設定 vs 介面（shadowRoot 內 data-setting 元件）。
    q.switches = () => {
      const s = window.__d2autobot?.settings, root = document.querySelector("#d2autobot-panel")?.shadowRoot;
      if (!s) return { error: "沒有 settings" };
      const mem = {}; const walk = (o, pre) => { for (const [k, v] of Object.entries(o)) { if (v && typeof v === "object") walk(v, pre + k + "."); else mem[pre + k] = v; } }; walk(s, "");
      const ui = {}, mismatch = [];
      for (const el of root?.querySelectorAll("[data-setting]") || []) {
        const path = el.getAttribute("data-setting"), checked = el.getAttribute("aria-checked");
        const val = checked != null ? checked === "true" : (el.value ?? el.textContent);
        ui[path] = val;
        let m; try { m = path === "terror.progressEnabled" ? s.terror.mode === "progress" : path === "terror.farmEnabled" ? s.terror.mode === "farm" : path.split(".").reduce((o, k) => o[k], s); } catch { m = undefined; }
        if (checked != null && typeof m === "boolean" && m !== val) mismatch.push({ path, ui: val, memory: m });
      }
      const on = Object.entries(mem).filter(([, v]) => v === true).map(([k]) => k);
      return { version: s.version, on, memory: mem, ui, mismatch, uiCount: Object.keys(ui).length, panelFound: !!root };
    };
    return "已安裝";
  })()`;

  app.whenReady().then(async () => {
    // 攔截所有非 GET 的 /api/ 請求（成績上傳等），避免污染使用者正式排行榜。
    session.defaultSession.webRequest.onBeforeRequest({ urls: ["https://*/api/*"] }, (d, cb) => { if (d.method !== "GET") { log("blocked", d.method, d.url); cb({ cancel: true }); } else cb({}); });
    // 工具包：d2edit.js、helper/、lang/ 以本機倉庫（git HEAD 未修改部分）回應，其餘（modifier/ 等含他人未提交變更）走線上；遊戲本體一律官方網址。
    session.defaultSession.protocol.handle("https", (req) => {
      if (req.url.startsWith(PAGES)) {
        const rel = decodeURIComponent(new URL(req.url).pathname.slice("/d2-survivors-toolkit/".length));
        if (rel === "d2edit.js" || rel.startsWith("helper/") || rel.startsWith("lang/")) {
          const file = path.resolve(ROOT, rel);
          if (file.startsWith(ROOT + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile()) return new Response(fs.readFileSync(file), { headers: { "content-type": (MIME[path.extname(file)] || "application/octet-stream") + "; charset=utf-8", "access-control-allow-origin": "*", "cache-control": "no-store" } });
        }
      }
      return net.fetch(req, { bypassCustomProtocolHandlers: true });
    });
    const win = new BrowserWindow({ width: 800, height: 600, show: true, x: -1900 + (Number(NN) % 5) * 40, y: (Number(NN) % 5) * 30, webPreferences: { webSecurity: false, backgroundThrottling: false } });
    win.webContents.setAudioMuted(true);
    const errors = []; let errTotal = 0;
    // 保留來源網址與行號（舊版只記訊息，查不出錯在哪支檔案）。
    win.webContents.on("console-message", (e, level, msg, line, sourceId) => { if (level >= 3) { errTotal++; const where = (sourceId || "?") + ":" + (line ?? "?"); errors.push(msg.slice(0, 300) + " @ " + where); if (errors.length > 20) errors.shift(); log("console.error", msg.slice(0, 300), "@", where); pendingShot("error"); } });
    // 未捕捉例外／未處理的 Promise 拒絕：用 DevTools 協定 Runtime.exceptionThrown 取得完整堆疊（頁面載入前就掛上，不漏啟動期錯誤）。
    try {
      win.webContents.debugger.attach("1.3");
      win.webContents.debugger.on("message", (ev2, method, params) => {
        if (method !== "Runtime.exceptionThrown") return;
        const d = params.exceptionDetails || {};
        const frames = (d.stackTrace?.callFrames || []).slice(0, 12).map((f) => "    at " + (f.functionName || "<anonymous>") + " (" + f.url + ":" + (f.lineNumber + 1) + ":" + (f.columnNumber + 1) + ")").join("\n");
        log("未捕捉例外", d.text || "", d.exception?.description || d.exception?.value || "", "@", (d.url || "?") + ":" + ((d.lineNumber ?? -1) + 1), "\n" + frames);
      });
      win.webContents.debugger.sendCommand("Runtime.enable").catch((e2) => log("Runtime.enable 失敗", e2.message));
    } catch (e2) { log("debugger 附加失敗", e2.message); }
    win.webContents.on("did-fail-load", (e, c, d, u) => log("FAIL", c, d, u));
    const shotAt = {}, pending = new Set();
    function pendingShot(kind) { pending.add(kind); }
    async function shot(kind) {
      if (Date.now() - (shotAt[kind] || 0) < 60000) return null; shotAt[kind] = Date.now();
      try { const f = "shot-" + kind + "-" + now().replace(/[:.]/g, "-") + ".png"; fs.writeFileSync(path.join(DIR, f), (await track(win.webContents.capturePage())).toPNG()); return f; } catch (e) { log("截圖失敗", e.message); return null; }
    }
    const inflight = new Set();
    const track = (pr) => { inflight.add(pr); const done = () => inflight.delete(pr); pr.then(done, done); return pr; };
    const ev = (code) => track(win.webContents.executeJavaScript(code));
    let finished = false;
    const finish = async (reason, code, extra) => {
      if (finished) return; finished = true;
      let snap = null; try { snap = await ev("window.__q.snap()"); } catch {}
      fs.appendFileSync(path.join(DIR, "status.jsonl"), JSON.stringify({ t: now(), final: true, reason, ...snap }) + "\n");
      if (reason === "done") fs.writeFileSync(path.join(DIR, "done.json"), JSON.stringify({ t: now(), elapsedMin: Math.round((Date.now() - T0) / 600) / 100, ...snap, ...extra }, null, 1));
      log("結束：" + reason);
      // 收尾順序：停計時器 → 等進行中的 capturePage／executeJavaScript（上限 5 秒）→ 關視窗 → app.quit。
      // 舊版直接 app.exit() 會在截圖或腳本還在執行時強殺，產生 0xC0000005 收尾崩潰。
      clearTimeout(maxTimer);
      try { win.webContents.debugger.detach(); } catch {}
      await Promise.race([Promise.allSettled([...inflight]), new Promise((r) => setTimeout(r, 5000))]);
      try { if (!win.isDestroyed()) win.destroy(); } catch {}
      process.exitCode = code;
      app.quit();
      setTimeout(() => process.exit(code), 8000).unref(); // app.quit 沒結束時的最後保險
    };
    win.webContents.on("render-process-gone", (e, d) => { log("GONE", JSON.stringify(d)); pendingShot("crash"); });
    const maxTimer = setTimeout(() => finish("max-minutes", 0), MAXMIN * 60000);

    async function bootstrap() {
      await win.loadURL(GAME_URL).catch((e) => log("loadURL", e.message)); await sleep(4000);
      await ev(`${RESUME ? "" : `localStorage.setItem("d2-survivors/save/v1", ${JSON.stringify(SEED)});`} localStorage.setItem("d2autobot:settings", ${JSON.stringify(JSON.stringify(HELPER_SETTINGS))}); localStorage.removeItem("d2autoforge.memory"); window.__d2autobotSwitches = undefined; 1`);
      await win.loadURL(GAME_URL).catch((e) => log("loadURL", e.message)); await sleep(4000);
      await ev(`(()=>{const b=[...document.querySelectorAll("button")].find(x=>/hosted/i.test(x.textContent));if(b)b.click()})()`);
      await sleep(12000);
      const r = await ev(`(async () => {
        const sleep = ms => new Promise(r => setTimeout(r, ms));
        window.__d2autobotSwitches = { enabled: true, progressEnabled: true, cheat: false };
        await import(${JSON.stringify(PAGES + "d2edit.js?v=")} + Date.now());
        for (let i = 0; i < 120 && !window.__d2autobot?.game; i++) { document.body.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true })); await sleep(500); }
        const g = window.__d2autobot?.game; if (!g) return { error: "找不到遊戲物件" };
        return { ok: true, state: g.state };
      })()`);
      log("bootstrap", JSON.stringify(r));
      await ev(MONITOR);
      const sel = await ev(`(async () => {
        const sleep = ms => new Promise(r => setTimeout(r, ms)); const g = window.__d2autobot.game;
        if (g.state === "select") {
          // 不可無參數呼叫 frontend.actions.play()：遊戲內部會 e.startRun(undefined) → Game-*.js startRun 讀 e.id 丟出 Uncaught (in promise) TypeError。直接走 chooseClass。
          if (!g.plainSelect().onPick) { g.chooseClass(); await sleep(1500); }
          const select = g.plainSelect(), cls = ${JSON.stringify(CLASS)};
          const index = select.cards.findIndex(c => c.dataset?.class === cls);
          if (index < 0) return { error: "找不到職業：" + cls };
          select.select(index); await sleep(300); select.confirm(false);
        }
        for (let i = 0; i < 120 && !g.world?.player && g.state !== "camp"; i++) await sleep(500);
        return { state: g.state, cls: g.kit?.id, level: g.world?.player?.level ?? null };
      })()`);
      log("select", JSON.stringify(sel));
      return sel;
    }
    try {
      const sel = await bootstrap();
      await sleep(5000);
      const sw = await ev("window.__q.switches()");
      fs.writeFileSync(path.join(DIR, "switches.json"), JSON.stringify(sw, null, 1));
      log("開關讀回：版本 " + sw.version + "；開啟 " + (sw.on || []).join(",") + "；介面元件 " + sw.uiCount + "；不一致 " + JSON.stringify(sw.mismatch));
      log("probe", JSON.stringify(await ev("window.__q.probe()")));
      // 熱重載：helper/autobot.js 的 mtime 變動就重新注入本機新版（像玩家再點書籤；同頁沿用遊戲物件與進度）。
      let lastBotCheck = 0;
      const hotReload = async () => {
        const m = botMtime(); await sleep(1000); if (botMtime() !== m) return;
        helperMtime = m; reloadCount++;
        log("偵測到 helper/autobot.js 變動（mtime " + new Date(m).toISOString() + "），熱重載 #" + reloadCount);
        try {
          const r = await ev(`(async () => {
            window.__d2autobotSwitches = { enabled: true, progressEnabled: true, cheat: false };
            localStorage.setItem("d2autobot:settings", ${JSON.stringify(JSON.stringify(HELPER_SETTINGS))});
            const before = window.__d2autobot;
            await import(${JSON.stringify(PAGES + "d2edit.js?v=")} + Date.now());
            for (let i = 0; i < 240 && window.__d2editLoading; i++) await new Promise((r) => setTimeout(r, 500));
            for (let i = 0; i < 40 && (!window.__d2autobot || window.__d2autobot === before); i++) await new Promise((r) => setTimeout(r, 500));
            return { replaced: !!window.__d2autobot && window.__d2autobot !== before, game: !!window.__d2autobot?.game, state: window.__d2autobot?.game?.state ?? null };
          })()`);
          log("熱重載結果", JSON.stringify(r));
          await sleep(3000);
          const sw2 = await ev("window.__q.switches()");
          fs.writeFileSync(path.join(DIR, "switches.json"), JSON.stringify(sw2, null, 1));
          log("重載後開關讀回：開啟 " + (sw2.on || []).join(",") + "；介面元件 " + sw2.uiCount + "；不一致 " + JSON.stringify(sw2.mismatch));
        } catch (e) { log("熱重載失敗", e.message); }
      };
      let lastSig = "", lastChange = Date.now(), lastStuckShot = 0, stuckFlag = false, tick = 0, lastDeaths = 0, lastProtect = 0, gones = 0;
      const needed = []; for (const p of "NMH") for (let n = 1; n <= 6; n++) if (p + n !== "H4") needed.push(p + n); // H4 預設略過（難度高、會失敗；輔助器 build.h4Reset 預設關），未完成不阻擋 done。
      for (;;) {
        await sleep(1000); tick++;
        let snap; try { snap = await ev("window.__q.snap()"); } catch (e) { log("snap err", e.message); if (++gones > 30) await finish("snap-failed", 4); continue; }
        if (Date.now() - lastBotCheck >= 5000) { lastBotCheck = Date.now(); if (botMtime() !== helperMtime) { await hotReload(); continue; } }
        if (snap.deaths > lastDeaths) { lastDeaths = snap.deaths; await shot("death"); }
        try { const evs = await ev("window.__q.events.splice(0)"); for (const x of evs || []) fs.appendFileSync(path.join(DIR, "protect-events.jsonl"), JSON.stringify({ n: NN, cls: snap.cls, level: snap.level, ...x, followAfter: x.kind === "follow" ? { diff: snap.diff, act: snap.act, gstate: snap.gstate } : undefined }) + String.fromCharCode(10)); } catch {}
        if (snap.protect > lastProtect) { lastProtect = snap.protect; await shot("protect"); }
        const doneIds = new Set(snap.questDone.map((s) => s.split(":")[0]));
        const sig = [snap.x, snap.y, snap.questDone.length, snap.questCain, snap.gstate, snap.diff, snap.act].join("|");
        if (sig !== lastSig) { lastSig = sig; lastChange = Date.now(); stuckFlag = false; }
        const still = (Date.now() - lastChange) / 1000;
        const playing = snap.gstate === "playing";
        stuckFlag = playing ? still >= 60 : still >= 120;
        if (stuckFlag && Date.now() - lastStuckShot > 300000) { lastStuckShot = Date.now(); await shot("stuck"); }
        for (const k of [...pending]) { pending.delete(k); await shot(k); }
        if (tick % 30 === 0) {
          const line = { t: now(), elapsedMin: Math.round((Date.now() - T0) / 600) / 100, ...snap, move: await ev("window.__q.mvFlush && window.__q.mvFlush()").catch(() => null), reloadCount, helperMtime: new Date(helperMtime).toISOString(), resumed: RESUME, stuck: stuckFlag, stuckSec: Math.round(still), errTotal, errors: errors.splice(0) };
          fs.appendFileSync(path.join(DIR, "status.jsonl"), JSON.stringify(line) + "\n");
        }
        if (needed.every((id) => doneIds.has(id) && !String(snap.questDone.find((s) => s.startsWith(id + ":"))).endsWith(":o")) && (snap.level ?? 0) >= 99
          // 任務獎品要用掉才算完成（屬性書、生命藥水、抗性卷軸、技能書、赦免徽章；鐵鎚持有即生效、戒指靠配裝不算）。
          && !(snap.rewards || []).some((r) => r.where === "inv" && ["bbb", "xyz", "tr2", "ass", "toa"].includes(r.base))) { await finish("done", 0, { completed: needed.length }); }
        if (finished) break;
      }
    } catch (e) { log("致命錯誤", e.stack || e); await finish("error:" + e.message, 1); }
  });
}
