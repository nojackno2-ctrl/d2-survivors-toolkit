// 啟動器自我測試腳本：設 D2_SELFTEST_JS=<本檔>、D2_SELFTEST=<輸出檔> 啟動 d2-toolkit.exe，
// 頁面載入後會執行本檔。第一次載入跑全部檢查、再熱重載；第二次載入確認引擎仍可用並寫出最終結果。
// 只能搭配存檔副本（D2_USER_DIR）使用。
(async () => {
  const S = sessionStorage, run = Number(S.d2run || 0) + 1;
  S.d2run = run;
  const R = JSON.parse(S.d2res || "{}");
  const rec = (name, ok, detail) => { R[name] = { ok: !!ok, detail: detail === undefined ? null : detail }; };
  const guard = async (name, f) => { try { await f(); } catch (e) { rec(name, false, String(e && e.stack || e)); } };
  const finish = (done) => {
    S.d2res = JSON.stringify(R);
    window.ipc.postMessage(JSON.stringify({ doc: "selftest", id: 999999, cmd: "selftest", args: [{ run, done, url: location.href, results: R }] }));
  };
  const api = window.api;
  if (run === 1) {
    rec("page.loaded", location.href.startsWith("https://"), location.href);
    rec("api.launcher.rust", api.launcher && api.launcher.rust === true, api.launcher);
    let before;
    await guard("load.softcore", async () => {
      const r = await api.load("softcore");
      before = r.save;
      rec("load.softcore", r.seal === "sealed" && !!r.save, { seal: r.seal, source: r.source, keys: Object.keys(r.save || {}).length, error: r.error });
    });
    await guard("save.roundtrip", async () => {
      const w = await api.save("softcore", before);
      const r = await api.load("softcore");
      rec("save.roundtrip", w.ok === true && r.seal === "sealed" && JSON.stringify(r.save) === JSON.stringify(before), { write: w, seal: r.seal, same: JSON.stringify(r.save) === JSON.stringify(before) });
    });
    await guard("guardStatus", async () => { const g = await api.guardStatus(); rec("guardStatus", g && g.seals && g.seals.softcore === "sealed", g); });
    await guard("diag", async () => { const d = await api.diag(); rec("diag", d && d.localStorage === true, d); });
    let list;
    await guard("listBackups", async () => { list = await api.listBackups(); rec("listBackups", Array.isArray(list) && list.length > 0, list.slice(0, 3)); });
    await guard("readBackup", async () => { const r = await api.readBackup(list[0].file); rec("readBackup", !!(r && r.save), { file: list[0].file, hasSave: !!(r && r.save) }); });
    await guard("snapshot", async () => { const r = await api.snapshot(before, "selftest"); rec("snapshot", r.ok === true, r); });
    await guard("i18n", async () => { const r = await api.i18n(); rec("i18n", r && r.game && Object.keys(r.dict || {}).length > 0, { dict: Object.keys(r.dict || {}).length, game: Object.keys(r.game || {}).length, missing: r.missing }); });
    await guard("assets", async () => {
      const a = await api.assets();
      const file = Object.values(a.uniques).find((l) => l.length)?.[0]?.[0] || Object.values(a.bases).find((l) => l.length)?.[0]?.[0];
      const url = a.dir + "/" + file;
      const img = await new Promise((ok) => { const i = new Image(); i.onload = () => ok({ w: i.naturalWidth, h: i.naturalHeight }); i.onerror = () => ok(null); i.src = url; });
      rec("assets", a.dir === "https://d2asset.localhost" && !!img, { dir: a.dir, url, img });
    });
    // 迷你瀏覽框（srcdoc）冒用 IPC：Rust 端看到的來源是什麼、會不會被當成受信任
    await guard("iframe.ipc", async () => {
      let got;
      const orig = window.__d2r;
      window.__d2r = (d, id, res) => { if (id === 999) got = res; else orig(d, id, res); };
      const f = document.createElement("iframe");
      f.srcdoc = '<script>window.ipc.postMessage(JSON.stringify({doc:"x",id:999,cmd:"iframeprobe",args:[]}))<\/script>';
      document.body.appendChild(f);
      await new Promise((r) => setTimeout(r, 2500));
      const first = !!got;
      // 再由父頁直接呼叫 iframe 內的 ipc（about:blank 與 srcdoc 兩種）
      const probe = { srcdocHasIpc: typeof f.contentWindow.ipc, srcdocHasWebview: typeof f.contentWindow.chrome?.webview };
      try { f.contentWindow.ipc.postMessage(JSON.stringify({ doc: "x", id: 999, cmd: "iframeprobe2", args: [] })); } catch (e) { probe.err = String(e); }
      const b = document.createElement("iframe");
      b.src = "about:blank";
      document.body.appendChild(b);
      await new Promise((r) => setTimeout(r, 300));
      probe.blankHasIpc = typeof b.contentWindow.ipc;
      try { b.contentWindow.ipc.postMessage(JSON.stringify({ doc: "x", id: 999, cmd: "iframeprobe3", args: [] })); } catch (e) { probe.err3 = String(e); }
      await new Promise((r) => setTimeout(r, 1500));
      rec("iframe.ipc", true, { iframeScriptAnswered: first, anyAnswered: !!got, answer: got, probe });
    });
    await guard("engine.capabilities", async () => { const c = await api.engine("capabilities"); rec("engine.capabilities", !!c && !c.error, c); });
    await guard("engine.catalog", async () => {
      const c = await api.engine("catalog");
      rec("engine.catalog", !!c && !c.error && JSON.stringify(c).length > 1000, c && c.error ? c : { type: typeof c, keys: Object.keys(c || {}).slice(0, 8), bytes: JSON.stringify(c).length });
    });
    finish(false);
    api.reload();
  } else {
    await guard("reload.engine.catalog", async () => {
      const c = await api.engine("catalog");
      rec("reload.engine.catalog", !!c && !c.error && JSON.stringify(c).length > 1000, c && c.error ? c : { bytes: JSON.stringify(c).length });
    });
    rec("reload.pageReloaded", run === 2, { run });
    finish(true);
  }
})();
