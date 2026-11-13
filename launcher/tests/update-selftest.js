// 更新提示測試：搭配 static-server.cjs（第一次載入後數秒只改 patch.mjs 的 ETag）與 D2_POLL_SECS=2；
// 等待 #d2UpdateBar 出現，再驗證「稍後」關得掉
(async () => {
  const done = (o) => window.ipc.postMessage(JSON.stringify({ doc: "selftest", id: 1, cmd: "selftest", args: [{ done: true, ...o }] }));
  const t0 = Date.now();
  while (Date.now() - t0 < 40000) {
    const bar = document.getElementById("d2UpdateBar");
    if (bar) {
      const text = bar.textContent;
      const later = [...bar.querySelectorAll("button")].find((b) => b.textContent === "稍後");
      later.click();
      return done({ updateBar: true, afterSec: (Date.now() - t0) / 1000, text, dismissed: !document.getElementById("d2UpdateBar") });
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  done({ updateBar: false });
})();
