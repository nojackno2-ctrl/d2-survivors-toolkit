const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const {
  parseDevToolsActivePort,
} = require("../game-link");
const paths = require("../paths");

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
