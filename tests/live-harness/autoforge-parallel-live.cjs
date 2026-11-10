// 自動淬鍊「同時淬鍊 N 件」實機驗證（由 autoforge-soak-live.cjs 改寫）：序列只跑一輪，記錄同時進行中的 /forge 請求數。
// 用法：electron tests/live-harness/autoforge-parallel-live.cjs [輸出.json]   H_PAR=同時件數(預設 10)
//   H_CLASS=sorceress  H_ITEMQ="Stone of Jordan"  H_N=10  H_SKILL=10  H_MAXMIN=分鐘數上限(預設 240)
// 流程（官方 /play/、全新隔離設定檔、不碰使用者存檔）：
//   1. 全新存檔選職業 → 2. 修改器「裝備庫」造 N 件暗金寫入背包 → 3. 重載遊戲，作弊「精華 99」
//   4. 自動淬鍊序列加入全部，目標「技能 +10」→ 5. 開始，持續記錄每個 /forge 請求的狀態碼、延遲、錯誤，直到結束／逾時。
// 逐筆網路記錄寫到 H_LOG（預設暫存目錄 soak-net.jsonl）。
const { app, BrowserWindow, session, net } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");
const PAGES = "https://nojackno2-ctrl.github.io/d2-survivors-toolkit/";
const OUT = process.argv.slice(2).find((a) => !a.startsWith("--") && !a.endsWith("electron.exe") && a !== ".");
const CLASS = process.env.H_CLASS || "sorceress";
const ITEMQ = process.env.H_ITEMQ || "Stone of Jordan";
const N = Number(process.env.H_N || 10), SKILL = Number(process.env.H_SKILL || 10);
const MAXMIN = Number(process.env.H_MAXMIN || 8);
const PAR = Number(process.env.H_PAR || 10);
let maxInflight = 0; const inflightIds = new Set();
const NETLOG = process.env.H_LOG || path.join(os.tmpdir(), "par-net.jsonl");
const PROGRESS = process.env.H_PROGRESS || path.join(os.tmpdir(), "par-progress.json");
const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".html": "text/html", ".css": "text/css", ".svg": "image/svg+xml" };
app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "d2par-")));
fs.writeFileSync(NETLOG, "");
app.whenReady().then(async () => {
  let finished = false;
  const done = (result, code = 0) => {
    if (finished) return;
    finished = true;
    const json = JSON.stringify(result, null, 2);
    if (OUT) fs.writeFileSync(OUT, json + "\n"); else console.log(json);
    app.exit(code);
  };
  setTimeout(() => done({ error: "整體逾時" }, 1), (MAXMIN + 20) * 60000);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    session.defaultSession.protocol.handle("https", (req) => {
      if (!req.url.startsWith(PAGES)) return net.fetch(req, { bypassCustomProtocolHandlers: true });
      const rel = decodeURIComponent(new URL(req.url).pathname.slice("/d2-survivors-toolkit/".length));
      const file = path.resolve(ROOT, rel);
      if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return new Response("not found", { status: 404 });
      return new Response(fs.readFileSync(file), { headers: { "content-type": (MIME[path.extname(file)] || "application/octet-stream") + "; charset=utf-8", "access-control-allow-origin": "*", "cache-control": "no-store" } });
    });
    // 主程序層級記錄所有非 GET 請求（/forge 等）的完成狀態與耗時
    const t0s = new Map();
    const log = (o) => fs.appendFileSync(NETLOG, JSON.stringify({ t: new Date().toISOString(), ...o }) + "\n");
    session.defaultSession.webRequest.onBeforeRequest((d, cb) => {
      if (d.method !== "GET" && !d.url.startsWith(PAGES)) { t0s.set(d.id, Date.now()); if (/\/forge/.test(d.url)) { inflightIds.add(d.id); maxInflight = Math.max(maxInflight, inflightIds.size); } }
      cb({});
    });
    session.defaultSession.webRequest.onHeadersReceived((d, cb) => {
      if (/forge/.test(d.url) && d.statusCode !== 200) log({ ev: "headers", status: d.statusCode, headers: d.responseHeaders });
      cb({ responseHeaders: d.responseHeaders });
    });
    session.defaultSession.webRequest.onCompleted((d) => {
      inflightIds.delete(d.id); if (t0s.has(d.id)) { log({ ev: "done", url: d.url.replace(/^https?:\/\/[^/]+/, ""), method: d.method, status: d.statusCode, ms: Date.now() - t0s.get(d.id), fromCache: d.fromCache }); t0s.delete(d.id); }
    });
    session.defaultSession.webRequest.onErrorOccurred((d) => {
      inflightIds.delete(d.id); if (t0s.has(d.id)) { log({ ev: "error", url: d.url.replace(/^https?:\/\/[^/]+/, ""), method: d.method, error: d.error, ms: Date.now() - t0s.get(d.id) }); t0s.delete(d.id); }
    });
    const win = new BrowserWindow({ width: 1280, height: 860, show: true, webPreferences: { webSecurity: false, backgroundThrottling: false } });
    const boot = async () => {
      await win.loadURL("https://d2survivors.lol/play/").catch(() => {});
      await sleep(4000);
      await win.webContents.executeJavaScript(`(()=>{const b=[...document.querySelectorAll("button")].find(x=>/hosted/i.test(x.textContent));if(b)b.click()})()`);
      await sleep(12000);
    };
    // 進入遊戲並選職業（共用片段）
    const enter = `
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      await import(${JSON.stringify(PAGES + "d2edit.js?v=")} + Date.now());
      for (let i = 0; i < 120 && !window.__d2autobot?.game; i++) { document.body.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true })); await sleep(500); }
      for (let i = 0; i < 60 && !window.__d2autoforgeUI; i++) await sleep(500);
      const bot = window.__d2autobot, g = bot?.game;
      if (!g) throw new Error("找不到遊戲物件");
      if (g.state === "select") {
        if (g.frontend?.open && !g.plainSelect().onPick) { g.frontend.actions.play(); await sleep(3000); }
        if (!g.plainSelect().onPick) { g.chooseClass(); await sleep(1500); }
        const select = g.plainSelect(), cls = ${JSON.stringify(CLASS)};
        const index = select.cards.findIndex(c => c.dataset?.class === cls);
        if (index < 0) throw new Error("找不到職業：" + cls);
        select.select(index); await sleep(300); select.confirm(false);
      }
      for (let i = 0; i < 120 && !g.world?.player && g.state !== "camp"; i++) await sleep(500);
      const cls = g.kit?.id;
    `;
    const prog = (o) => fs.writeFileSync(PROGRESS, JSON.stringify({ t: new Date().toISOString(), ...o }, null, 1));

    // ---- 階段 1：全新存檔，進入遊戲建立存檔 ----
    await boot();
    const s1 = await win.webContents.executeJavaScript(`(async()=>{${enter}
      await sleep(3000);
      return { cls, state: g.state, hasSave: !!localStorage.getItem("d2-survivors/save/v1"), invLen: (g.save?.inventoryByClass?.[cls]||[]).length };
    })()`);
    prog({ stage: 1, s1 });

    // ---- 階段 2：修改器「裝備庫」造 N 件，放到該職業背包，寫入存檔 ----
    await win.webContents.executeJavaScript(`window.__d2editLauncher.click(); setTimeout(()=>{const it=[...(window.__d2toolkitMenu?.children??[])].find(x=>x.textContent=="修改器"||x.textContent=="Editor");it?.click()},300); 1`);
    await sleep(8000);
    const f = win.webContents.mainFrame.framesInSubtree.find((x) => x.url.includes("editor.html"));
    if (!f) return done({ error: "找不到修改器 iframe", s1 }, 1);
    const editorRes = await f.executeJavaScript(`(async()=>{try{
      const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
      const d=document, w=window; w.confirm=()=>true; w.alert=()=>{};
      for(let i=0;i<40&&!d.querySelector("nav button");i++) await sleep(500);
      const $=(s)=>d.querySelector(s);
      const setv=(el,v)=>{el.value=v;el.dispatchEvent(new w.Event("change",{bubbles:true}));el.dispatchEvent(new w.Event("input",{bubbles:true}))};
      await sleep(3000);
      const out={};
      d.querySelector('nav button[data-page="library"]').click(); await sleep(2000);
      setv($("#cRar"),"unique"); await sleep(500);
      $("#cQ").value=${JSON.stringify(ITEMQ)}; $("#cQ").dispatchEvent(new w.Event("input",{bubbles:true})); await sleep(900);
      const rows=[...d.querySelectorAll("#cList [data-i]")]; out.rows=rows.map(r=>r.textContent.trim().slice(0,60));
      if(!rows.length) return {error:"裝備庫找不到 ${ITEMQ}", out};
      rows[0].click(); await sleep(1500);
      setv($("#pMax"),"1"); await sleep(1500);
      const dd=$("#pDest"); out.dest=[...dd.options].map(o=>o.value+"|"+o.textContent);
      const want=[...dd.options].find(o=>/背包/.test(o.textContent)&&o.value.includes(${JSON.stringify(CLASS)})) || [...dd.options].find(o=>/背包/.test(o.textContent));
      if(want) setv(dd,want.value);
      out.destChosen=dd.value;
      $("#pN").value=${N}; $("#pN").dispatchEvent(new w.Event("input",{bubbles:true}));
      $("#pMake").click(); await sleep(4000); out.makeStatus=$("#status").textContent;
      $("#write").click(); await sleep(7000); out.writeStatus=$("#status").textContent;
      return out;
    }catch(e){return {error:String(e&&e.stack||e)}}})()`);
    prog({ stage: 2, editorRes });
    if (editorRes.error) return done({ stage: 2, editorRes, s1 }, 1);

    // ---- 階段 3：重載遊戲，作弊精華 99，檢查背包 ----
    await boot();
    const s3 = await win.webContents.executeJavaScript(`(async()=>{${enter}
      const essenceName = "Burning Essence of Terror";
      const essences = () => (g.save?.inventoryByClass?.[cls] || []).filter(i => i?.type === "essence" && i.base === essenceName).reduce((s, i) => s + (i.count ?? 1), 0);
      const root = document.querySelector("#d2autobot-panel")?.shadowRoot;
      const toggle = (name, enabled) => { const b = root?.querySelector('[data-setting="' + name + '"]'); if (!b) throw new Error("找不到設定：" + name); if ((b.getAttribute("aria-checked") === "true") !== enabled) b.click(); };
      toggle("cheat.forgeMax", true); toggle("cheat.enabled", true); await sleep(2500); toggle("cheat.enabled", false); await sleep(1000);
      // 修改器的「放到」沒有背包選項（只有共用倉庫等）→ 造在共用倉庫，這裡把它們從共用倉庫移進角色背包（隔離存檔）。
      let moved = 0;
      if (!(g.inventoryOf(cls) || []).some(i => /Jordan/i.test(i?.name || ""))) {
        const pool = [];
        const walk = (v, parent, key) => { if (Array.isArray(v)) v.forEach((x, k) => walk(x, v, k)); else if (v && typeof v === "object") { if (v.rarity === "unique" && /Jordan/i.test(v.name || "")) pool.push({ v, parent, key }); else Object.values(v).forEach(x => walk(x, v, null)); } };
        walk(g.save.stashTabs, null, null);
        g.save.inventoryByClass = g.save.inventoryByClass || {}; g.save.inventoryByClass[cls] = g.save.inventoryByClass[cls] || [];
        for (const p of pool) { g.save.inventoryByClass[cls].push(p.v); moved++; }
        for (const p of pool) { if (Array.isArray(p.parent)) { const k = p.parent.indexOf(p.v); if (k >= 0) p.parent.splice(k, 1); } }
      }
      const sojs = (g.inventoryOf(cls) || []).filter(i => i?.rarity === "unique" && /Jordan/i.test(i.name || ""));
      return { cls, moved, essences: essences(), sojCount: sojs.length, sojIds: sojs.map(i => i.id), sojForge: sojs.map(i => i.forge ?? null) };
    })()`);
    prog({ stage: 3, s3 });
    if (!s3.sojCount) return done({ stage: 3, s3, editorRes, error: "背包沒有喬丹之戒" }, 1);

    // ---- 階段 4：設定目標「技能 +SKILL」、加入序列並開始（不等待結束，由主程序輪詢） ----
    const s4 = await win.webContents.executeJavaScript(`(async()=>{
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      const g = window.__d2autobot.game, cls = g.kit.id, UI = window.__d2autoforgeUI;
      const ids = (g.inventoryOf(cls) || []).filter(i => i?.rarity === "unique" && /Jordan/i.test(i.name || "")).map(i => i.id);
      const lines = UI.lines(ids[0]);
      const skillLine = lines.find(l => /技能|skill/i.test(l.text));
      if (!skillLine) return { error: "找不到技能淬鍊行", lines };
      const targets = {}; for (const l of lines) targets[l.key] = 0; targets[skillLine.key] = ${SKILL};
      const byId = {}; for (const id of ids) byId[id] = targets;
      // 精華 99 作弊保持開啟：精華用掉會被補回 99，才能長時間淬鍊。
      const root = document.querySelector("#d2autobot-panel")?.shadowRoot;
      const cb = root?.querySelector('[data-setting="cheat.enabled"]');
      if (cb && cb.getAttribute("aria-checked") !== "true") cb.click();
      await sleep(1500);
      const rf = window.fetch.bind(window);
      window.fetch = async (u, o) => { const r = await rf(u, o); if (String(u).includes("/forge") && r.status !== 200) { let b = ""; try { b = (await r.clone().text()).slice(0, 300); } catch (e) {} (window.__bad = window.__bad || []).push({ t: Date.now(), status: r.status, body: b }); } return r; };
      window.__soakDone = false;
      window.__rounds = 0;
      UI.state.parallel = ${PAR};
      UI.open();
      window.__t0 = Date.now();
      (async () => { window.__rounds++; await UI.queueRun(ids, byId, cls); window.__elapsed = Date.now() - window.__t0; window.__soakDone = true; })();
      await sleep(3000);
      return { ids, lines: lines.map(l => l.key + "|" + l.text), skillKey: skillLine.key, targets, queue: UI.state.queue.map(q => q.name + " => " + q.status) };
    })()`);
    // 面板快照（淬鍊進行中）：按鈕排列、狀態列、同時件數選單、序列各列狀態；另存截圖。
    const ui = await win.webContents.executeJavaScript(`(()=>{const b=document.getElementById("d2autoforge-panel");if(!b)return null;
      const r=(id)=>{const e=b.querySelector(id);if(!e)return null;const q=e.getBoundingClientRect();return{text:e.textContent.trim().slice(0,40),x:Math.round(q.x),y:Math.round(q.y),w:Math.round(q.width),h:Math.round(q.height),disabled:!!e.disabled}};
      return{start:r("#af-start"),stop:r("#af-stop"),fold:r("#af-fold"),msg:r("#af-msg"),par:b.querySelector("#af-parallel")?.value??null,parDisabled:b.querySelector("#af-parallel")?.disabled??null,rows:[...b.querySelectorAll("[data-qs]")].map(e=>e.textContent)}})()`).catch((e) => ({ evalError: String(e) }));
    if (process.env.H_SHOT) fs.writeFileSync(process.env.H_SHOT, (await win.capturePage()).toPNG());
    prog({ stage: 4, s4, ui });
    // H_FOLD=1：淬鍊中把面板收合成圖示，結束／限流時檢查圖示旁的提示。
    if (process.env.H_FOLD) await win.webContents.executeJavaScript(`document.querySelector("#d2autoforge-panel #af-fold")?.click();1`);
    if (s4.error) return done({ stage: 4, s4 }, 1);

    // ---- 階段 5：輪詢直到結束或逾時，每 30 秒寫一次進度 ----
    const started = Date.now();
    let last = null;
    while (Date.now() - started < MAXMIN * 60000) {
      await sleep(5000);
      last = await win.webContents.executeJavaScript(`(()=>{const UI=window.__d2autoforgeUI,s=UI.state,g=window.__d2autobot.game,cls=g.kit.id;
        const ess=(g.save?.inventoryByClass?.[cls]||[]).filter(i=>i?.type==="essence").reduce((a,i)=>a+(i.count??1),0);
        return { rounds: window.__rounds, bad: (window.__bad||[]).slice(-3), done: window.__soakDone, running: s.running, queueRunning: s.queueRunning, steps: s.steps, msg: s.msg, result: s.result, pauseUntil: s.pauseUntil, essences: ess, elapsedMs: window.__elapsed, queue: s.queue.map(q=>q.status), forge: s.queue.map(q=>{const it=(g.inventoryOf(cls)||[]).find(i=>i.id===q.id);return it?JSON.stringify(it.forge??null):"（已不在背包）"}), panel: !!document.getElementById("d2autoforge-panel"), rowTexts: [...document.querySelectorAll("#d2autoforge-panel [data-qs]")].map(e=>e.textContent), parSel: document.querySelector("#af-parallel")?.value ?? null, tail: s.log.slice(-6) }; })()`).catch((e) => ({ evalError: String(e) }));
      const netLines = fs.readFileSync(NETLOG, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
      const forge = netLines.filter((x) => /forge/i.test(x.url));
      const bad = forge.filter((x) => x.ev === "error" || (x.status && x.status !== 200));
      prog({ stage: 5, elapsedMin: +((Date.now() - started) / 60000).toFixed(1), last, forgeReq: forge.length, badReq: bad.length, lastBad: bad.slice(-3) });
      if (last?.done) break;
      if (process.env.H_UNTIL_LIMIT && last?.pauseUntil > 0) break;
    }
    const netLines = fs.readFileSync(NETLOG, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
    const forge = netLines.filter((x) => /forge/i.test(x.url));
    const byStatus = {}; for (const x of forge) { const k = x.ev === "error" ? "ERR:" + x.error : String(x.status); byStatus[k] = (byStatus[k] || 0) + 1; }
    await sleep(2500);
    const icon = await win.webContents.executeJavaScript(`(()=>{const b=document.getElementById("d2autoforge-panel"),s=window.__d2autoforgeUI.state;return{present:!!b,folded:s.folded,w:b?Math.round(b.getBoundingClientRect().width):null,label:document.getElementById("af-foldlabel")?.textContent??null,labelColor:document.getElementById("af-foldlabel")?.style.color??null,notice:s.notice,pauseKind:s.pauseKind,pauseLeftSec:s.pauseUntil?Math.round((s.pauseUntil-Date.now())/1000):0,queue:s.queue.map(q=>q.status),paused:document.body.classList.contains("frontend-open")}})()`).catch((e) => ({ evalError: String(e) }));
    if (process.env.H_SHOT2) fs.writeFileSync(process.env.H_SHOT2, (await win.capturePage()).toPNG());
    if (!last?.done) await win.webContents.executeJavaScript("window.__d2autoforgeUI.stop();1").catch(() => {});
    done({ par: PAR, maxInflight, ui, icon, editorRes, s3, s4, last, forgeRequests: forge.length, byStatus, firstBad: forge.find((x) => x.ev === "error" || x.status !== 200) || null, elapsedMin: +((Date.now() - started) / 60000).toFixed(1), netlog: NETLOG });
  } catch (e) { done({ error: String(e?.stack || e) }, 1); }
});
