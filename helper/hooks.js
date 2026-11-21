// 輔助器「使用者核可的例外掛接」登錄與還原工具（頁內小模組，也可在 node 中 require 測試）。
// 設計原則：預設不裝任何掛接、不包裝官方函式；對應開關開啟才 install(name)，關閉 uninstall(name) 即還原為原參照。
// 使用者核可的四組例外（2026-11-21）：
//   1. 無敵（p.life 存取器）＋停止關卡時間（tick 後對齊）        → 名稱 "invincible"、"stageTime"
//   2. 經驗倍率（gainXp）＋虛擬淬鍊精華（forgeTry/forgeActions）  → 名稱 "xp"、"forgeEssence"
//   3. 升級選卡重抽預判（暫改 Array.prototype.sort/push）         → 名稱 "levelPool"（只在預判呼叫期間暫時生效）
//   4. 雇傭兵雇用／營地整備（hud.showNpcMenu/showTown、offerLevelUp/showLevelUp/showCampMenu） → 名稱 "camp"
// autobot.js 以 define(name, {install, uninstall}) 登錄各組的實作；本模組負責狀態、冪等與 wrapMethod 還原規則。
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else { root.__d2hooksKit = api; }
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  function keepFunctionName(original, replacement) {
    if (typeof original === "function" && typeof replacement === "function" && replacement.name !== original.name) {
      try { Object.defineProperty(replacement, "name", { configurable: true, value: original.name }); } catch { /* 名稱不可改就算了 */ }
    }
    return replacement;
  }

  // 包裝 object[name]：記住「原本是否為自有屬性」與原參照。
  // restore() 只在目前值仍是自己的包裝時才還原（避免覆蓋其他程式之後再包的一層）；原本不是自有屬性（來自原型）就 delete，是就放回原參照。
  function wrapMethod(object, name, factory) {
    if (!object || typeof object[name] !== "function") return null;
    const own = Object.prototype.hasOwnProperty.call(object, name), original = object[name];
    const wrapper = keepFunctionName(original, factory(original));
    object[name] = wrapper;
    let done = false;
    return {
      object, name, original, wrapper, own,
      restore() {
        if (done) return true;
        if (object[name] !== wrapper) return false;
        if (own) object[name] = original; else delete object[name];
        done = true; return true;
      },
    };
  }

  // 玩家欄位存取器（無敵用）：寫入較低的值一律忽略。restore() 還原原描述子（含目前值）。
  function guardMinimum(object, name) {
    if (!object || typeof object[name] !== "number") return null;
    const descriptor = Object.getOwnPropertyDescriptor(object, name);
    const state = { value: object[name] };
    Object.defineProperty(object, name, {
      configurable: true, enumerable: descriptor?.enumerable ?? true,
      get() { return state.value; },
      set(v) { if (typeof v === "number" && v < state.value) return; state.value = v; },
    });
    return {
      object, name, descriptor,
      restore() {
        const cur = Object.getOwnPropertyDescriptor(object, name);
        if (!cur || typeof cur.get !== "function") return false;
        if (descriptor) { const d = { ...descriptor }; if ("value" in d) d.value = state.value; Object.defineProperty(object, name, d); }
        else delete object[name];
        return true;
      },
    };
  }

  function createRegistry() {
    const defs = new Map(), on = new Set();
    return {
      define(name, def) { defs.set(name, def); },
      names: () => [...defs.keys()],
      install(name, ...args) {
        const def = defs.get(name); if (!def) throw new Error("未知的掛接：" + name);
        if (on.has(name)) return true;
        const ok = def.install(...args);
        if (ok === false) return false;
        on.add(name); return true;
      },
      uninstall(name) {
        const def = defs.get(name); if (!def || !on.has(name)) return true;
        const ok = def.uninstall();
        if (ok === false) return false;
        on.delete(name); return true;
      },
      uninstallAll() { for (const n of [...on]) this.uninstall(n); return on.size === 0; },
      installed: () => [...on],
      has: (name) => on.has(name),
    };
  }

  return { keepFunctionName, wrapMethod, guardMinimum, createRegistry };
});
