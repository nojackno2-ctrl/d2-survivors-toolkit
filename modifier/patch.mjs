// 在遊戲的程式碼區塊裡找出物品引擎要用的函式，並在該區塊結尾加上 export。
// 桌面版（Node）與網頁版（瀏覽器）共用。
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.D2Patch = factory();
})(typeof self !== "undefined" ? self : this, function () {
  // 遊戲的合法性檢查與讀檔整理函式；舊版遊戲可能沒有，找不到時改用修改器的近似檢查
  const OPTIONAL = new Set(["itemFault", "saveFaults", "sanitize", "makeAffix", "affixes", "affixApplies", "classKits", "modDefs", "rankDefs", "weaponSetActive", "dropItem"]);

  function compile(signatures) {
    return Object.entries(signatures).filter(([k]) => k !== "_")
      .map(([k, v]) => [k, new RegExp(v.replace(/\bN\b/g, "[\\w$]+"))]);
  }

  // files: { 檔名: 原始碼 } → { patched: { 檔名: 加上 export 的原始碼 }, found: { key: 檔名 }, missing: [...] }
  function patch(files, signatures) {
    const sigs = compile(signatures), found = {}, perFile = {};
    for (const [k, re] of sigs) {
      for (const [f, src] of Object.entries(files)) {
        const m = re.exec(src);
        if (m) { found[k] = f; (perFile[f] ??= {})[k] = m[1]; break; }
      }
    }
    const missing = sigs.map(([k]) => k).filter((k) => !found[k] && !OPTIONAL.has(k));
    const patched = {};
    for (const [f, names] of Object.entries(perFile)) {
      patched[f] = files[f] + `
;export{${Object.entries(names).map(([k, v]) => `${v} as __${k}`).join(",")}};`;
    }
    return { patched, found, missing };
  }

  return { patch };
});

export const patch = self.D2Patch.patch;
