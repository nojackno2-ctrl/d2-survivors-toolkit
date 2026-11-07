// 網頁版：修改器跑在遊戲頁面上的 iframe 裡，存檔讀寫交給遊戲頁面（d2edit.js）處理。
// 桌面版已經由 preload.js 提供 window.api，這裡就什麼都不做。
(function () {
  if (window.api || window.parent === window) return;
  const GAME = "https://d2survivors.lol";
  const target = new URLSearchParams(location.search).get("origin") || GAME;
  let seq = 0;
  const waiting = new Map();
  window.addEventListener("message", (e) => {
    if (e.origin !== target || !e.data || e.data.d2edit !== "reply") return;
    const w = waiting.get(e.data.id);
    if (!w) return;
    waiting.delete(e.data.id);
    w(e.data.result);
  });
  const rpc = (fn, args) => new Promise((resolve) => {
    const id = ++seq;
    waiting.set(id, resolve);
    window.parent.postMessage({ d2edit: "call", id, fn, args }, target);
  });

  // 備份在網頁版改成下載檔案（不在遊戲網站留下任何東西）
  function download(name, text) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const BK_PREFIX = "d2edit:backup:", BK_MODES = ["softcore", "hardcore"];
  const bkFile = (mode) => `寫入前備份_${mode === "hardcore" ? "硬核" : "一般"}.json`;
  const bkMode = (file) => BK_MODES.find((mode) => bkFile(mode) === file);
  function readRecord(mode) {
    const key = BK_PREFIX + mode, raw = localStorage.getItem(key);
    if (raw == null) return null;
    const value = JSON.parse(raw);
    if (value?.format === "d2edit-backup-v1") {
      if (!value.save || typeof value.save !== "object" || !Number.isFinite(value.time) || typeof value.seal !== "string") throw new Error("備份紀錄格式錯誤");
      return value;
    }
    return { save: value, time: Number(localStorage.getItem(key + ":time")) || 0, seal: localStorage.getItem(key + ":seal") || "none" };
  }

  const remote = ["load", "save", "assets", "i18n", "engine", "traces", "diag", "gameBuild"];
  const api = Object.fromEntries(remote.map((fn) => [fn, (...args) => rpc(fn, args)]));
  Object.assign(api, {
    web: true,
    async save(mode, save) {
      const original = await rpc("load", [mode]);
      if (original.error || !original.save) return { error: `無法備份原存檔，已取消寫入：${original.error || "找不到存檔"}` };
      try {
        const key = BK_PREFIX + (mode === "hardcore" ? "hardcore" : "softcore");
        const text = JSON.stringify({ format: "d2edit-backup-v1", save: original.save, time: Date.now(), seal: original.seal || "none" });
        localStorage.setItem(key, text);
        if (localStorage.getItem(key) !== text) throw new Error("備份讀回不一致");
      } catch (e) {
        return { error: `無法備份原存檔，已取消寫入：${e.message}` };
      }
      return rpc("save", [mode, save]);
    },
    async snapshot(save, label) {
      const text = await rpc("sealText", [save]);
      download(`D2倖存者_${String(label || "快照").replace(/[\\/:*?"<>|]/g, "_")}_${stamp()}.json`, text);
      return { ok: true };
    },
    async exportSave(save) {
      const text = await rpc("sealText", [save]);
      download(`D2倖存者存檔_${stamp()}.json`, text);
      return { ok: true, path: "下載資料夾" };
    },
    // 要在點擊當下開檔案選擇器，所以不能先 await
    importSave() {
      return new Promise((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json,application/json";
        input.onchange = async () => {
          try {
            const save = JSON.parse(await input.files[0].text());
            resolve(typeof save?.version === "number" ? { save } : { error: "不是 D2 倖存者的存檔。" });
          } catch (e) { resolve({ error: "檔案讀取失敗：" + e.message }); }
        };
        input.click();
      });
    },
    listBackups: async () => BK_MODES.flatMap((mode) => {
      const raw = localStorage.getItem(BK_PREFIX + mode);
      if (raw == null) return [];
      const file = bkFile(mode);
      try {
        const record = readRecord(mode);
        return [{ file, time: record.time, mode, gold: record.save.gold, seal: record.seal }];
      } catch { return [{ file, time: 0, mode, broken: true }]; }
    }),
    readBackup: async (file) => {
      const mode = bkMode(file), raw = mode && localStorage.getItem(BK_PREFIX + mode);
      if (raw == null || !mode) return { error: "找不到這份備份。" };
      try { return { save: readRecord(mode).save }; } catch (e) { return { error: "備份損壞：" + e.message }; }
    },
    deleteBackup: async (file) => {
      const mode = bkMode(file);
      if (!mode) return { error: "找不到這份備份。" };
      localStorage.removeItem(BK_PREFIX + mode);
      localStorage.removeItem(BK_PREFIX + mode + ":time");
      localStorage.removeItem(BK_PREFIX + mode + ":seal");
      return { ok: true };
    },
    openBackups: async () => {},
    close: () => rpc("close", []),
  });
  window.api = api;
})();
