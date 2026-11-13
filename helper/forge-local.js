(function (root) {
  "use strict";
  const KEY = "d2forgeLocal.ledger", limit = 2000;
  const stats = { local: { temper: 0, clean: 0, hellforge: 0, upgrade: 0, look: 0, claim: 0 }, passed: 0 };
  let wantFn = null;
  const copy = (x) => JSON.parse(JSON.stringify(x));
  function ledger() { try { const x = JSON.parse(root.localStorage.getItem(KEY) || "{}"); return x && typeof x === "object" && !Array.isArray(x) ? x : {}; } catch { return {}; } }
  function write(x) { try { root.localStorage.setItem(KEY, JSON.stringify(x)); } catch {} }
  function remember(id, forge) { if (id == null) return; const x = ledger(); delete x[id]; x[id] = copy(forge); while (Object.keys(x).length > limit) delete x[Object.keys(x)[0]]; write(x); }
  function forget(id) { const x = ledger(); if (Object.hasOwn(x, id)) { delete x[id]; write(x); } }
  function cleanForge(f) {
    const out = {}, t = {};
    for (const [k, v] of Object.entries(f?.t || {})) if (/^[sm]\d{1,3}$/.test(k) && Number.isInteger(v) && v >= 1) t[k] = v;
    if (Object.keys(t).length) out.t = t;
    if (f?.up === 1 || f?.up === 2) out.up = f.up;
    if (f?.hf === 1) out.hf = 1;
    if (typeof f?.h === "string" && /^[0-9a-f]{16,64}$/.test(f.h)) out.h = f.h;
    return out;
  }
  const reject = (why) => ({ status: 400, body: { ok: false, why } });
  function decide(act, forge, lines, opts = {}) {
    const f = cleanForge(forge), rng = opts.rng || Math.random;
    const keys = [...new Set((lines || []).map((x) => typeof x === "string" ? x : x?.key).filter((x) => /^[sm]\d{1,3}$/.test(x)))];
    const total = Object.values(f.t || {}).reduce((a, b) => a + b, 0);
    let outcome, line;
    if (act === "temper") {
      if (opts.magic) return reject("magic");
      if (!keys.length) return reject("no_lines");
      if (total >= 10) return reject("full");
      if (opts.sure || rng() < (total <= 0 ? 1 : 1 / (1 + total / 4))) {
        const wanted = Array.isArray(opts.want) ? keys.filter((k) => opts.want.includes(k)) : [];
        const pool = wanted.length ? wanted : keys;
        line = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
        f.t ||= {}; f.t[line] = (f.t[line] || 0) + 1; outcome = "took";
      } else outcome = "missed";
    } else if (act === "clean") {
      if (!total) return reject("nothing");
      delete f.t; outcome = "cleaned";
    } else if (act === "hellforge") {
      if (f.hf) return reject("used");
      if (total < 10) return reject("not_yet");
      if (opts.sure || rng() < 0.4) { for (const k of Object.keys(f.t)) f.t[k] *= 2; outcome = "god"; }
      else { delete f.t; outcome = "brick"; }
      f.hf = 1;
    } else if (act === "upgrade") {
      if (f.up >= 2) return reject("no_upgrade");
      f.up = (f.up || 0) + 1; outcome = "upgraded";
    } else if (act === "look") return { status: 200, body: { ok: true, outcome: "look", forge: f, owed: 0 } };
    else if (act === "claim") return { status: 200, body: { ok: true, outcome: "claimed", owed: 0 } };
    else return reject("refused");
    return { status: 200, body: { ok: true, outcome, ...(line ? { line } : {}), forge: f } };
  }
  const SETTINGS = "d2forgeLocal.settings", LEGACY = "d2autobot:settings";
  let config = { enabled: false, sure: false };
  try {
    const saved = root.localStorage.getItem(SETTINGS);
    const old = JSON.parse(root.localStorage.getItem(LEGACY) || "{}");
    const source = saved === null ? { enabled: old.cheat?.forgeLocal, sure: old.cheat?.forgeLocalSure } : JSON.parse(saved);
    config = { enabled: source?.enabled === true, sure: source?.sure === true };
    if (saved === null) root.localStorage.setItem(SETTINGS, JSON.stringify(config));
    if (old.cheat && ("forgeLocal" in old.cheat || "forgeLocalSure" in old.cheat)) {
      delete old.cheat.forgeLocal; delete old.cheat.forgeLocalSure;
      root.localStorage.setItem(LEGACY, JSON.stringify(old));
    }
  } catch {}
  const settings = () => ({ ...config });
  const set = (patch) => { for (const key of ["enabled", "sure"]) if (typeof patch?.[key] === "boolean") config[key] = patch[key]; try { root.localStorage.setItem(SETTINGS, JSON.stringify(config)); } catch {} return settings(); };
  const online = () => { try { if (root.__d2autobot?.onlineSave?.()) return true; } catch {} try { return root.__d2guard?.saveMode?.() === "online"; } catch { return false; } };
  const available = () => !online();
  const enabled = () => available() && config.enabled;
  function items(save) {
    const found = [], seen = new WeakSet();
    function visit(x) { if (!x || typeof x !== "object" || seen.has(x)) return; seen.add(x); if (x.id != null && (x.base || x.type) && (x.rarity || x.forge)) found.push(x); for (const v of Object.values(x)) visit(v); }
    visit(save); // 掃整份存檔：容器名稱隨遊戲改版會變，漏掃會讓帳本被誤刪
    return found;
  }
  function handle(body) {
    try {
      if (online()) return null;
      const act = body.act, item = body.item || {}, id = item.i, book = ledger();
      if ((act === "look" || act === "claim") && !enabled() && !Object.hasOwn(book, id)) return null;
      if (!["look", "claim"].includes(act) && !enabled()) return null;
      const g = root.__d2autobot?.game, real = items(g?.save).find((x) => x.id === id);
      let lines;
      if (real && g?.forgeActions) {
        const old = g.anvil;
        try { g.anvil = id; lines = g.forgeActions(g.kit?.id, g.world?.player?.level || 1, () => {})?.view?.()?.anvil?.lines; }
        finally { g.anvil = old; }
      }
      if (!Array.isArray(lines)) lines = root.__d2autoforgeUI?.lines?.(id) || Object.keys(item.f?.t || {});
      const f = act === "look" && Object.hasOwn(book, id) ? book[id] : item.f;
      const result = decide(act, f, lines, { sure: config.sure, want: wantFn?.(id), magic: item.r === "m" || real?.rarity === "magic" });
      if (result.status === 200) { stats.local[act]++; if (!["look", "claim"].includes(act)) remember(id, result.body.forge); }
      return result;
    } catch { return reject("refused"); }
  }
  async function restore() {
    if (online()) return false;
    const g = root.__d2autobot?.game; if (!g?.save) return false;
    const book = ledger(), all = items(g.save), found = new Set(); let changed = false, touched = null;
    for (const item of all) if (Object.hasOwn(book, item.id)) { found.add(String(item.id)); if (JSON.stringify(cleanForge(item.forge)) !== JSON.stringify(book[item.id])) { item.forge = copy(book[item.id]); changed = true; touched = item; } }
    for (const id of Object.keys(book)) if (!found.has(id)) delete book[id];
    write(book);
    // 只改記憶體中 g.save 物品的 forge 欄位，不自行簽章或寫入存檔鍵；有 g.moved 時交由遊戲方法落盤，否則由遊戲下次自動存檔帶出。
    if (changed && touched && typeof g.moved === "function") { try { g.moved(touched); } catch {} }
    return changed;
  }
  function fetchHook(input, init, origFetch) {
    const url = typeof input === "string" || input instanceof URL ? String(input) : input?.url;
    const method = init?.method || input?.method || "GET";
    if (!/\/api\/leaderboard\/forge(?:\?|$)/.test(url || "") || String(method).toUpperCase() !== "POST") return null;
    if (online()) { stats.passed++; return origFetch(input, init); } // 線上存檔：一律交給真伺服器，不假造任何回應（含無法解析的請求）
    return (async () => {
      let body; try { body = JSON.parse(init?.body != null ? String(init.body) : await input.clone().text()); } catch { body = null; }
      const result = body ? handle(body) : reject("refused");
      if (result) return new Response(JSON.stringify(result.body), { status: result.status, headers: { "Content-Type": "application/json" } });
      stats.passed++; const response = await origFetch(input, init);
      if (response.status === 200 || response.status === 409) try { const data = await response.clone().json(); if (data && Object.hasOwn(data, "forge")) forget(body?.item?.i); } catch {}
      return response;
    })();
  }
  const api = { version: 1, settings, set, available, enabled, handle, decide, restore, ledger: () => copy(ledger()), stats, setWant(fn) { wantFn = typeof fn === "function" ? fn : null; }, fetchHook };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root && typeof window !== "undefined") { root.__d2forgeLocal = api; const start = Date.now(); const wait = setInterval(() => { if (root.__d2autobot?.game?.save) { clearInterval(wait); for (const ms of [0, 6000, 25000]) setTimeout(() => restore().catch(() => {}), ms); /* 工具包載入前送出的伺服器同步可能晚到，再還原兩次 */ } else if (Date.now() - start > 30000) clearInterval(wait); }, 250); }
})(typeof window !== "undefined" ? window : globalThis);
