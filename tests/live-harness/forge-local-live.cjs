// 用法：electron tests/live-harness/forge-local-live.cjs [輸出.json]
// 驗證「淬鍊與地獄熔爐本地化」在官方 /play/ 實機是否生效：
//   - 隔離環境與全新存檔：使用獨立 userData，官方網址 https://d2survivors.lol/play/。
//   - 工具包由 protocol.handle 攔截至本機檔案，計數所有送往 d2survivors.lol 的 /forge 網路請求。
//   - 階段 A（本地化＋sure）：
//       開啟獨立本地淬鍊與必定成功設定，注入實體測試精華。
//       注入獨特裝備（The Stone of Jordan），連續 temper 10 次（每次結果文字 Raised 開頭、
//       forge.t 累計到 10、精華每次 -1）；第 11 次 temper 應被拒（Temper stops at 10，精華不變）；
//       hellforge（文字含 doubled、總數 20、hf=1）；再 hellforge 應被拒（used）。
//       記錄真實網路 /forge 請求數（期望：0）、__d2forgeLocal.stats、帳本內容。
//   - 階段 B（本地化、未開 sure）：
//       關閉 forgeLocalSure，注入第二件同款新 id 裝備，temper 最多 40 次直到總數 10，
//       記錄成功/失敗次數（有 missed 的可能）；clean（All tempers removed、t 清空）。真實 /forge 請求仍為 0。
//   - 階段 C（重新整理保留）：
//       存檔後 reload 頁面、重新載入工具包（總開關此時為關），等 15 秒讓遊戲同步完成，
//       檢查第一件裝備 forge 仍是總數 20、hf=1，localStorage 存檔一致，
//       記錄 __d2forgeLocal.stats.local.look 與真實 /forge 請求數（期望：look 本機回覆，真實請求 0）。
//   - 階段 D（關閉後放行，選用，環境變數 H_PASS=1）：
//       關閉 forgeLocal，第三件裝備 temper 一次，確認真實 /forge 請求數 >= 1。
//   - 結果輸出 JSON，結束時關閉視窗並 app.quit()，整體逾時保護 5 分鐘。

const { app, BrowserWindow, session, net } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const PAGES = "https://nojackno2-ctrl.github.io/d2-survivors-toolkit/";
const OUT = process.argv.slice(2).find((a) => !a.startsWith("--") && !a.endsWith("electron.exe") && a !== ".");
const CLASS = process.env.H_CLASS || "sorceress";

// 測試用獨特裝備樣本（The Stone of Jordan）
const BASE_ITEM = process.env.H_ITEM
  ? JSON.parse(fs.readFileSync(process.env.H_ITEM, "utf8"))
  : {
      id: "fvqqng8gmw76yr40",
      base: "Ring",
      type: "ring",
      rarity: "unique",
      name: "The Stone of Jordan",
      level: 99,
      stats: [
        { stat: "maxmana", value: 20 },
        { stat: "item_maxmana_percent", value: 25 },
        { stat: "lightmindam", value: 1 },
        { stat: "item_allskills", value: 1 },
        { stat: "lightmaxdam", value: 12 }
      ],
      mods: [
        { stat: "mana", value: 20 },
        { stat: "fcr", value: 6.25 },
        { stat: "lightningMinDamage", value: 1 },
        { stat: "allSkills", value: 1 },
        { stat: "lightningMaxDamage", value: 12 }
      ],
      roll: [1, 1018700716, 99]
    };

const MIME = {
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".json": "application/json",
  ".html": "text/html",
  ".css": "text/css",
  ".svg": "image/svg+xml"
};

// 獨立隔離 userData
app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "d2forgelocal-")));

app.whenReady().then(async () => {
  let finished = false;
  let win = null;
  const consoleErrors = [];
  let realForgeCount = 0;
  const realForgeLogs = [];

  const done = (result, code = 0) => {
    if (finished) return;
    finished = true;
    try {
      if (win && !win.isDestroyed()) win.close();
    } catch (_) {}
    const output = {
      ...result,
      realForgeCountTotal: realForgeCount,
      realForgeLogs,
      consoleErrors
    };
    const json = JSON.stringify(output, null, 2);
    if (OUT) fs.writeFileSync(OUT, json + "\n");
    else console.log(json);
    app.quit();
    process.exit(code);
  };

  // 整體逾時保護 5 分鐘
  setTimeout(() => done({ pass: false, error: "實機測試逾時（5 分鐘）" }, 1), 300000);

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  try {
    // protocol.handle 取代工具包，並攔截計數送往 d2survivors.lol 的 /forge 請求
    session.defaultSession.protocol.handle("https", (req) => {
      if (req.url.startsWith(PAGES)) {
        const rel = decodeURIComponent(new URL(req.url).pathname.slice("/d2-survivors-toolkit/".length));
        const file = path.resolve(ROOT, rel);
        if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
          return new Response("not found", { status: 404 });
        }
        return new Response(fs.readFileSync(file), {
          headers: {
            "content-type": (MIME[path.extname(file)] || "application/octet-stream") + "; charset=utf-8",
            "access-control-allow-origin": "*",
            "cache-control": "no-store"
          }
        });
      }

      // 計數送往官方伺服器的真實 /forge 請求
      if (req.url.includes("d2survivors.lol") && /\/forge(\/|$|\?)/.test(req.url)) {
        realForgeCount++;
        realForgeLogs.push({ url: req.url, method: req.method, time: Date.now() });
      }

      return net.fetch(req, { bypassCustomProtocolHandlers: true });
    });

    // 雙重保險：webRequest 記錄未被 protocol 捕捉到的請求
    session.defaultSession.webRequest.onBeforeRequest((details, cb) => {
      if (details.url.includes("d2survivors.lol") && /\/forge(\/|$|\?)/.test(details.url)) {
        const isRecorded = realForgeLogs.some(
          (r) => Math.abs(r.time - Date.now()) < 500 && r.url === details.url
        );
        if (!isRecorded) {
          realForgeCount++;
          realForgeLogs.push({ url: details.url, method: details.method, time: Date.now(), source: "webRequest" });
        }
      }
      cb({});
    });

    win = new BrowserWindow({
      width: 1200,
      height: 850,
      show: true,
      webPreferences: { webSecurity: false, backgroundThrottling: false }
    });

    win.webContents.on("console-message", (_e, lvl, msg) => {
      if (lvl >= 3 && !/Electron Security/.test(msg)) {
        consoleErrors.push(msg.slice(0, 500));
      }
    });

    // 啟動並進入營地
    const bootAndEnter = async () => {
      await win.loadURL("https://d2survivors.lol/play/").catch(() => {});
      await sleep(4000);
      await win.webContents.executeJavaScript(
        `(()=>{const b=[...document.querySelectorAll("button")].find(x=>/hosted/i.test(x.textContent));if(b)b.click()})()`
      );
      await sleep(12000);

      await win.webContents.executeJavaScript(`(async () => {
        const sleep = ms => new Promise(r => setTimeout(r, ms));
        await import(${JSON.stringify(PAGES + "d2edit.js?v=")} + Date.now());
        for (let i = 0; i < 120 && !window.__d2autobot?.game; i++) {
          document.body.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true }));
          await sleep(500);
        }
        const bot = window.__d2autobot, g = bot?.game;
        if (!g) throw new Error("找不到遊戲物件：" + JSON.stringify(bot?.diagnostics?.()));
        if (g.state === "select") {
          if (!g.plainSelect().onPick) { g.chooseClass(); await sleep(1500); }
          const select = g.plainSelect(), cls = ${JSON.stringify(CLASS)};
          const index = select.cards.findIndex(c => c.dataset?.class === cls);
          if (index < 0) throw new Error("找不到職業：" + cls);
          select.select(index); await sleep(300); select.confirm(false);
        }
        for (let i = 0; i < 120 && !g.world?.player && g.state !== "camp"; i++) await sleep(500);
      })()`);
    };

    await bootAndEnter();

    // 裝備 ID 命名
    const item1Id = "local_item1_" + Date.now().toString(36);
    const item2Id = "local_item2_" + Date.now().toString(36);
    const item3Id = "local_item3_" + Date.now().toString(36);

    const phases = {};

    // ==========================================
    // 階段 A（本地化＋sure）
    // ==========================================
    const netBeforeA = realForgeCount;
    const resA = await win.webContents.executeJavaScript(`(async () => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      const bot = window.__d2autobot, g = bot?.game;
      const cls = g.kit?.id;
      const root = document.querySelector("#d2autobot-panel")?.shadowRoot;

      const toggle = (name, enabled) => {
        const btn = root?.querySelector('[data-setting="' + name + '"]');
        if (btn) {
          if ((btn.getAttribute("aria-checked") === "true") !== enabled) btn.click();
          if ((btn.getAttribute("aria-checked") === "true") !== enabled) throw new Error("設定切換失敗：" + name);
        } else if (bot?.settings) {
          const parts = name.split(".");
          let cur = bot.settings;
          for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]] = cur[parts[i]] || {};
          cur[parts[parts.length - 1]] = enabled;
        } else {
          throw new Error("找不到設定按鈕：" + name);
        }
      };

      const essences = () => {
        const inv = g.save?.inventoryByClass?.[cls] || [];
        const st = inv.filter(i => i?.type === "essence" && (i.base === "Burning Essence of Terror" || i.base === "bet"));
        return st.reduce((s, i) => s + (i.count ?? 1), 0);
      };

      const countT = (item) => Object.values(item?.forge?.t || {}).reduce((s, n) => s + Number(n || 0), 0);

      // 使用獨立設定與實體精華，不依賴虛擬精華。
      toggle("cheat.forgeMax", false);
      window.__d2forgeLocal.set({ enabled: true, sure: true });

      const failures = [];

      // 檢查 __d2forgeLocal 介面
      const forgeLocalObj = window.__d2forgeLocal;
      if (!forgeLocalObj) failures.push("找不到 window.__d2forgeLocal 物件");
      const isEnabled = typeof forgeLocalObj?.enabled === "function" ? forgeLocalObj.enabled() : !!forgeLocalObj?.enabled;
      if (!isEnabled) failures.push("window.__d2forgeLocal.enabled() 回傳非 true");

      // 2. 注入第一件測試裝備
      const base = ${JSON.stringify(BASE_ITEM)};
      const item1 = JSON.parse(JSON.stringify(base));
      item1.id = ${JSON.stringify(item1Id)};
      delete item1.forge;
      g.save.inventoryByClass = g.save.inventoryByClass || {};
      g.save.inventoryByClass[cls] = g.save.inventoryByClass[cls] || [];
      g.save.inventoryByClass[cls].push(item1);
      g.save.inventoryByClass[cls].push({ id: "test_essence_" + Date.now(), base: "Burning Essence of Terror", type: "essence", name: "Burning Essence of Terror", count: 99 });

      g.anvil = item1.id;

      const callForge = async (act) => {
        try {
          const res = await g.forgeTry(cls, 1, act, () => {});
          const text = typeof res === "string" ? res : (res?.text || res?.message || JSON.stringify(res || ""));
          return { ok: true, ret: res, text };
        } catch (err) {
          const text = String(err && (err.message || err) || "");
          return { ok: false, err: text, text };
        }
      };

      const temperSteps = [];
      let prevEssence = essences();

      // 3. 連續 temper 10 次
      for (let i = 1; i <= 10; i++) {
        g.anvil = item1.id;
        const res = await callForge("temper");
        await sleep(200);
        const curEssence = essences();
        const curT = countT(item1);
        temperSteps.push({ step: i, text: res.text, total: curT, essence: curEssence });

        if (!/^Raised/i.test(res.text)) {
          failures.push("第 " + i + " 次 temper 結果文字未以 Raised 開頭：" + res.text);
        }
        if (curT !== i) {
          failures.push("第 " + i + " 次 temper 後 forge.t 總數預期為 " + i + "，實際為 " + curT);
        }
        if (curEssence !== prevEssence - 1) {
          failures.push("第 " + i + " 次 temper 精華未扣 1（前：" + prevEssence + "，後：" + curEssence + "）");
        }
        prevEssence = curEssence;
      }

      // 4. 第 11 次 temper 應被拒絕
      g.anvil = item1.id;
      const essenceBefore11 = essences();
      const res11 = await callForge("temper");
      await sleep(200);
      const essenceAfter11 = essences();
      if (!/Temper stops at 10|stops at 10/i.test(res11.text)) {
        failures.push("第 11 次 temper 未回傳 Temper stops at 10：" + res11.text);
      }
      if (essenceBefore11 !== essenceAfter11) {
        failures.push("第 11 次被拒絕時精華改變了（前：" + essenceBefore11 + "，後：" + essenceAfter11 + "）");
      }

      // 5. hellforge 倍增
      g.anvil = item1.id;
      const resHf1 = await callForge("hellforge");
      await sleep(300);
      const hf1Total = countT(item1);
      const hf1Val = item1.forge?.hf;
      if (!/doubled/i.test(resHf1.text)) {
        failures.push("hellforge 結果文字未包含 doubled：" + resHf1.text);
      }
      if (hf1Total !== 20) {
        failures.push("hellforge 後 forge.t 總數預期為 20，實際為 " + hf1Total);
      }
      if (hf1Val !== 1) {
        failures.push("hellforge 後 forge.hf 預期為 1，實際為 " + hf1Val);
      }

      // 6. 再 hellforge 應被拒絕
      g.anvil = item1.id;
      const resHf2 = await callForge("hellforge");
      await sleep(200);
      if (!/used/i.test(resHf2.text)) {
        failures.push("第 2 次 hellforge 未回傳包含 used 的拒絕訊息：" + resHf2.text);
      }

      // 讀取 stats 與 ledger
      const stats = forgeLocalObj?.stats || null;
      const ledger = typeof forgeLocalObj?.ledger === "function" ? forgeLocalObj.ledger() : (forgeLocalObj?.ledger || null);

      return {
        pass: failures.length === 0,
        failures,
        item1Forge: item1.forge,
        temperSteps,
        res11,
        resHf1,
        resHf2,
        stats,
        ledger
      };
    })()`);

    const netCountA = realForgeCount - netBeforeA;
    if (netCountA !== 0) {
      resA.failures.push("階段 A 期間產生了真實網路 /forge 請求：" + netCountA + " 次");
      resA.pass = false;
    }
    phases.A = { ...resA, netRequests: netCountA };

    // ==========================================
    // 階段 B（本地化、未開 sure，第二件裝備）
    // ==========================================
    const netBeforeB = realForgeCount;
    const resB = await win.webContents.executeJavaScript(`(async () => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      const bot = window.__d2autobot, g = bot?.game;
      const cls = g.kit?.id;
      const root = document.querySelector("#d2autobot-panel")?.shadowRoot;

      const toggle = (name, enabled) => {
        const btn = root?.querySelector('[data-setting="' + name + '"]');
        if (btn) {
          if ((btn.getAttribute("aria-checked") === "true") !== enabled) btn.click();
        } else if (bot?.settings) {
          const parts = name.split(".");
          let cur = bot.settings;
          for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]] = cur[parts[i]] || {};
          cur[parts[parts.length - 1]] = enabled;
        }
      };

      const countT = (item) => Object.values(item?.forge?.t || {}).reduce((s, n) => s + Number(n || 0), 0);
      const failures = [];

      // 關閉 sure
      window.__d2forgeLocal.set({ sure: false });
      await sleep(500);

      // 注入第二件裝備
      const base = ${JSON.stringify(BASE_ITEM)};
      const item2 = JSON.parse(JSON.stringify(base));
      item2.id = ${JSON.stringify(item2Id)};
      delete item2.forge;
      g.save.inventoryByClass = g.save.inventoryByClass || {};
      g.save.inventoryByClass[cls] = g.save.inventoryByClass[cls] || [];
      g.save.inventoryByClass[cls].push(item2);

      const callForge = async (act) => {
        try {
          const res = await g.forgeTry(cls, 1, act, () => {});
          const text = typeof res === "string" ? res : (res?.text || res?.message || JSON.stringify(res || ""));
          return { ok: true, ret: res, text };
        } catch (err) {
          const text = String(err && (err.message || err) || "");
          return { ok: false, err: text, text };
        }
      };

      // temper 最多 40 次直到 total 到 10
      let successCount = 0;
      let failCount = 0;
      const tries = [];

      for (let k = 1; k <= 40 && countT(item2) < 10; k++) {
        g.anvil = item2.id;
        const prevT = countT(item2);
        const res = await callForge("temper");
        await sleep(150);
        const curT = countT(item2);

        if (curT > prevT && /^Raised/i.test(res.text)) {
          successCount++;
        } else {
          failCount++;
        }
        tries.push({ try: k, text: res.text, prevT, curT });
      }

      const totalReached = countT(item2);
      if (totalReached < 10) {
        failures.push("40 次 temper 內未達總數 10，實際總數：" + totalReached);
      }

      // clean 清空
      g.anvil = item2.id;
      const resClean = await callForge("clean");
      await sleep(300);
      const tAfterClean = countT(item2);
      if (!/All tempers removed/i.test(resClean.text)) {
        failures.push("clean 結果文字未包含 All tempers removed：" + resClean.text);
      }
      if (tAfterClean !== 0) {
        failures.push("clean 後 forge.t 未清空，總數：" + tAfterClean);
      }

      const forgeLocalObj = window.__d2forgeLocal;
      return {
        pass: failures.length === 0,
        failures,
        successCount,
        failCount,
        totalTries: tries.length,
        totalReached,
        resClean,
        tAfterClean,
        stats: forgeLocalObj?.stats || null
      };
    })()`);

    const netCountB = realForgeCount - netBeforeB;
    if (netCountB !== 0) {
      resB.failures.push("階段 B 期間產生了真實網路 /forge 請求：" + netCountB + " 次");
      resB.pass = false;
    }
    phases.B = { ...resB, netRequests: netCountB };

    // ==========================================
    // 階段 C（重新整理保留）
    // ==========================================
    // 1. 在頁面中觸發遊戲存檔寫入 localStorage
    await win.webContents.executeJavaScript(`(() => {
      const g = window.__d2autobot?.game;
      // 不自行寫 localStorage（會破壞存檔簽章）；遊戲的 forgeTry 每次操作後已自行存檔。
      void g;
    })()`);

    // 2. 重新整理頁面
    await win.loadURL("https://d2survivors.lol/play/").catch(() => {});
    await sleep(4000);
    await win.webContents.executeJavaScript(
      `(()=>{const b=[...document.querySelectorAll("button")].find(x=>/hosted/i.test(x.textContent));if(b)b.click()})()`
    );
    await sleep(10000);

    const netBeforeC = realForgeCount;

    // 3. 載入工具包（總開關此時為關），等待 15 秒讓遊戲同步跑完
    const resC = await win.webContents.executeJavaScript(`(async () => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      await import(${JSON.stringify(PAGES + "d2edit.js?v=")} + Date.now());

      for (let i = 0; i < 120 && !window.__d2autobot?.game; i++) {
        document.body.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true }));
        await sleep(500);
      }

      const bot = window.__d2autobot, g = bot?.game;
      const cls = ${JSON.stringify(CLASS)};
      const failures = [];
      // 重新整理後再進一次角色營地，觸發遊戲自己的鍛造同步（layCamp → syncForge）
      let enterNote = "state=" + g?.state;
      try {
        if (g.state === "select") {
          if (!g.plainSelect().onPick) { g.chooseClass(); await sleep(1500); }
          const select = g.plainSelect();
          const index = select.cards.findIndex(c => c.dataset?.class === cls);
          if (index >= 0) { select.select(index); await sleep(300); select.confirm(false); }
        }
        for (let i = 0; i < 60 && !g.world?.player && g.state !== "camp"; i++) await sleep(500);
        enterNote += " → " + g.state;
      } catch (e) { enterNote += " 進入角色失敗：" + String(e && e.message || e); }

      // 檢查總開關預設為關閉
      const cheatEnabled = !!bot?.settings?.cheat?.enabled;
      if (cheatEnabled) {
        failures.push("重新載入後 cheat.enabled 預期為關閉，實際為開啟");
      }

      // 等待 15 秒讓遊戲本身的同步跑完
      await sleep(15000);

      // 尋找第一件裝備
      const findItemInSave = (saveObj, id) => {
        const inv = saveObj?.inventoryByClass?.[cls] || [];
        const it = inv.find(x => x?.id === id);
        if (it) return it;
        const eq = Object.values(saveObj?.equippedByClass?.[cls] || {});
        return eq.find(x => x?.id === id) || null;
      };

      const memItem1 = findItemInSave(g?.save, ${JSON.stringify(item1Id)});
      let storedSave = null;
      try {
        storedSave = JSON.parse(localStorage.getItem("d2-survivors/save/v1") || "null");
      } catch (_) {}
      const storedItem1 = findItemInSave(storedSave, ${JSON.stringify(item1Id)});

      const countT = (item) => Object.values(item?.forge?.t || {}).reduce((s, n) => s + Number(n || 0), 0);

      const memTotal = countT(memItem1);
      const memHf = memItem1?.forge?.hf;
      const storedTotal = countT(storedItem1);
      const storedHf = storedItem1?.forge?.hf;

      if (!memItem1) {
        failures.push("記憶體存檔找不到第一件裝備：" + ${JSON.stringify(item1Id)});
      } else {
        if (memTotal !== 20) failures.push("記憶體中第一件裝備 forge.t 預期為 20，實際為 " + memTotal);
        if (memHf !== 1) failures.push("記憶體中第一件裝備 forge.hf 預期為 1，實際為 " + memHf);
      }

      if (!storedItem1) {
        failures.push("localStorage 存檔找不到第一件裝備：" + ${JSON.stringify(item1Id)});
      } else {
        if (storedTotal !== 20) failures.push("localStorage 中第一件裝備 forge.t 預期為 20，實際為 " + storedTotal);
        if (storedHf !== 1) failures.push("localStorage 中第一件裝備 forge.hf 預期為 1，實際為 " + storedHf);
      }

      const forgeLocalObj = window.__d2forgeLocal;
      // 直接以遊戲相同的格式送一次 look（總開關關閉、物品在帳本內）：應由本機回覆帳本內容
      let lookProbe = null;
      try {
        const resp = await fetch("/api/leaderboard/forge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ v: 2, player: "probe", hc: false, act: "look", item: { i: ${JSON.stringify(item1Id)}, b: "Ring", t: "ring", r: "u", n: "The Stone of Jordan", l: 99 } }) });
        lookProbe = { status: resp.status, body: await resp.json() };
      } catch (e) { lookProbe = { error: String(e && e.message || e) }; }
      const probeTotal = Object.values(lookProbe?.body?.forge?.t || {}).reduce((s, n) => s + n, 0);
      if (!(lookProbe?.status === 200 && lookProbe.body?.outcome === "look" && probeTotal === 20 && lookProbe.body.forge?.hf === 1)) failures.push("帳本物品的 look 未由本機正確回覆：" + JSON.stringify(lookProbe));
      const stats = forgeLocalObj?.stats || null;
      const lookCount = stats?.local?.look ?? null;

      return {
        pass: failures.length === 0,
        failures,
        enterNote,
        ledger: forgeLocalObj?.ledger?.() ?? null,
        cheatEnabled,
        memItem1Forge: memItem1?.forge ?? null,
        storedItem1Forge: storedItem1?.forge ?? null,
        stats,
        lookCount
      };
    })()`);

    const netCountC = realForgeCount - netBeforeC;
    if (netCountC !== 0) {
      resC.failures.push("階段 C 期間產生了真實網路 /forge 請求：" + netCountC + " 次");
      resC.pass = false;
    }
    phases.C = { ...resC, netRequests: netCountC };

    // ==========================================
    // 階段 D（關閉後放行，選用，環境變數 H_PASS=1）
    // ==========================================
    if (process.env.H_PASS === "1") {
      const netBeforeD = realForgeCount;
      const resD = await win.webContents.executeJavaScript(`(async () => {
        const sleep = ms => new Promise(r => setTimeout(r, ms));
        const bot = window.__d2autobot, g = bot?.game;
        const cls = g.kit?.id || ${JSON.stringify(CLASS)};
        const root = document.querySelector("#d2autobot-panel")?.shadowRoot;

        const toggle = (name, enabled) => {
          const btn = root?.querySelector('[data-setting="' + name + '"]');
          if (btn) {
            if ((btn.getAttribute("aria-checked") === "true") !== enabled) btn.click();
          } else if (bot?.settings) {
            const parts = name.split(".");
            let cur = bot.settings;
            for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]] = cur[parts[i]] || {};
            cur[parts[parts.length - 1]] = enabled;
          }
        };

        const failures = [];

        // 關閉本地化
        window.__d2forgeLocal.set({ enabled: false });
        toggle("cheat.enabled", true);
        await sleep(500);

        // 注入第三件裝備
        const base = ${JSON.stringify(BASE_ITEM)};
        const item3 = JSON.parse(JSON.stringify(base));
        item3.id = ${JSON.stringify(item3Id)};
        delete item3.forge;
        g.save.inventoryByClass = g.save.inventoryByClass || {};
        g.save.inventoryByClass[cls] = g.save.inventoryByClass[cls] || [];
        g.save.inventoryByClass[cls].push(item3);

        g.anvil = item3.id;
        let ret = null;
        try {
          ret = await g.forgeTry(cls, 1, "temper", () => {});
        } catch (err) {
          ret = { error: String(err && (err.message || err) || "") };
        }
        await sleep(1500);

        return {
          failures,
          ret,
          item3Forge: item3.forge ?? null
        };
      })()`);

      const netCountD = realForgeCount - netBeforeD;
      if (netCountD < 1) {
        resD.failures.push("關閉本地化後對第三件裝備 temper 未送出真實 /forge 請求（計數：" + netCountD + "）");
      }
      resD.pass = resD.failures.length === 0;
      phases.D = { ...resD, netRequests: netCountD };
    } else {
      phases.D = { skipped: true, pass: true };
    }

    // 總結判定
    const allPass = Object.values(phases).every((p) => p.pass);

    done({
      pass: allPass,
      phases,
      testedItemIds: { item1Id, item2Id, item3Id: process.env.H_PASS === "1" ? item3Id : null }
    }, allPass ? 0 : 1);
  } catch (e) {
    done({ pass: false, error: String(e?.stack || e) }, 1);
  }
});
