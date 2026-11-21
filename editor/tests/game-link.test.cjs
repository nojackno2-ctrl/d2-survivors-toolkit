const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const {
  createLeaderboardStub,
  parseDevToolsActivePort,
} = require("../game-link");
const paths = require("../paths");

test("createLeaderboardStub：GET 回 404，POST 回 204 並計數記錄", async () => {
  const stub = createLeaderboardStub();
  const port = await stub.start();
  try {
    assert.ok(port > 0);
    const getRes = await fetch(`http://127.0.0.1:${port}/api/leaderboard`);
    assert.equal(getRes.status, 404);
    assert.equal(stub.hitCount, 0);

    const payload = JSON.stringify({ score: 999999 });
    const postRes = await fetch(`http://127.0.0.1:${port}/api/leaderboard`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload,
    });
    assert.equal(postRes.status, 204);
    assert.equal(stub.hitCount, 1);

    const reportRes = await fetch(`http://127.0.0.1:${port}/api/report`, {
      method: "POST",
      body: "report-data",
    });
    assert.equal(reportRes.status, 204);
    assert.equal(stub.hitCount, 2);

    const hits = stub.getHits();
    assert.equal(hits.length, 2);
    assert.equal(hits[0].method, "POST");
    assert.equal(hits[0].url, "/api/leaderboard");
    assert.equal(hits[0].bytes, Buffer.byteLength(payload));
    assert.equal(hits[1].url, "/api/report");
  } finally {
    await stub.stop();
  }
});

test("parseDevToolsActivePort：正確解析埠號與路徑並拒絕無效內容", () => {
  assert.deepEqual(
    parseDevToolsActivePort("9222\n/devtools/browser/abc-123\n"),
    { port: 9222, wsPath: "/devtools/browser/abc-123" }
  );
  assert.deepEqual(
    parseDevToolsActivePort("  9347 \r\n"),
    { port: 9347, wsPath: "" }
  );
  assert.equal(parseDevToolsActivePort(""), null);
  assert.equal(parseDevToolsActivePort("0\n/ws"), null);
  assert.equal(parseDevToolsActivePort("70000\n/ws"), null);
  assert.equal(parseDevToolsActivePort("not-a-port"), null);
  assert.equal(parseDevToolsActivePort(null), null);
});

test("paths：開發模式與封裝模式皆能正確解析資源路徑與頁面 URL", () => {
  const repoRoot = path.resolve(__dirname, "..", "..");
  assert.equal(paths.resolveRoot({ isPackaged: false }), repoRoot);
  assert.equal(
    paths.resolveAsset("lang/zh-TW.json", { isPackaged: false }),
    path.join(repoRoot, "lang", "zh-TW.json")
  );

  const editorUrl = paths.pageUrl("editor", { isPackaged: false });
  assert.equal(
    editorUrl,
    pathToFileURL(path.join(repoRoot, "modifier", "editor.html")).toString()
  );

  const guardUrl = paths.pageUrl("guard", { isPackaged: false, mode: "hardcore" });
  const expectedGuard = pathToFileURL(path.join(repoRoot, "guard", "guard.html"));
  expectedGuard.searchParams.set("mode", "hardcore");
  assert.equal(guardUrl, expectedGuard.toString());

  const fakeResources = path.join("C:", "App", "resources");
  assert.equal(
    paths.resolveRoot({ isPackaged: true, resourcesPath: fakeResources }),
    fakeResources
  );
  assert.equal(
    paths.resolveAsset("modifier/signatures.json", {
      isPackaged: true,
      resourcesPath: fakeResources,
    }),
    path.join(fakeResources, "modifier", "signatures.json")
  );
});
