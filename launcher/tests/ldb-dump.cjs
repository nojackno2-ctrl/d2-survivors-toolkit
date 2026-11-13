// 用真正的 LevelDB（classic-level，與 Chromium 同一份 C++ 實作）列出資料庫所有 key 與內容雜湊
// 用法：node ldb-dump.cjs <leveldb 資料夾> [輸出 json]；對真實存檔資料夾請勿使用，只用副本
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");
const { ClassicLevel } = require(path.resolve(__dirname, "../../editor/node_modules/classic-level"));
(async () => {
  const db = new ClassicLevel(process.argv[2], { keyEncoding: "buffer", valueEncoding: "buffer", createIfMissing: false });
  await db.open();
  const rows = {};
  for await (const [k, v] of db.iterator()) {
    rows[k.toString("latin1")] = crypto.createHash("sha256").update(v).digest("hex") + ":" + v.length;
  }
  await db.close();
  const out = { count: Object.keys(rows).length, rows };
  if (process.argv[3]) fs.writeFileSync(process.argv[3], JSON.stringify(out, null, 1));
  console.log("keys", out.count);
})().catch((e) => { console.error("FAIL", e.message); process.exit(1); });
