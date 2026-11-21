// 從遊戲（真實載入的 saveTransfer 模組匯出）取出技能協同需要的資料，存成 JSON。
// 從遊戲（用 GameLink 啟動，頁面載入的 saveTransfer 模組匯出）取出技能協同需要的資料，寫入 synergy-data.json。
// 用法：node lang/tools/synergy-data.cjs <asar 解開後的 web/assets 資料夾>  （需已安裝遊戲；用來找 saveTransfer 的匯出別名）
const { GameLink } = require("../../editor/game-link.js");
const fs = require("fs"), path = require("path");
(async () => {
  const T = __dirname;
  const D = (process.argv[2] || "").replace(/[\/]*$/, "/");
  if (!process.argv[2]) throw new Error("請提供 web/assets 資料夾路徑");
  const file = fs.readdirSync(D).find((f) => /^saveTransfer-.*\.js$/.test(f));
  const src = fs.readFileSync(D + file, "utf8");
  const exp = new Map(src.match(/export\s*\{([^}]*)\}\s*;?\s*$/)[1].split(",").map((x) => x.trim().split(/\s+as\s+/)));
  const alias = (n) => { const a = exp.get(n); if (!a) throw new Error("export alias missing: " + n); return a; };
  const gl = new GameLink();
  await gl.launch({});
  await new Promise((r) => setTimeout(r, 6000));
  const js = `(async()=>{
    const m=await import("app://game/assets/${file}");
    const F=m.${alias("F")},EG=m.${alias("EG")},X1=m.${alias("X1")},UG=m.${alias("UG")};
    const skills={};for(const id of Object.keys(F)){const s=F[id];skills[id]={name:s.name,maxLevel:s.maxLevel,synergies:s.synergies||null,d2Synergies:!!s.d2Synergies,into:s.evolution&&s.evolution.into||null,evolved:!!s.evolved,cls:UG(id)};}
    const passives={};for(const id of Object.keys(EG))passives[id]={name:EG[id].name,maxLevel:EG[id].maxLevel};
    const x1={};for(const id of Object.keys(X1))x1[id]={name:X1[id].name,maxLevel:X1[id].maxLevel};
    return JSON.stringify({skills,passives,x1});
  })()`;
  const r = await gl.evaluate(js);
  fs.writeFileSync(path.join(T, "synergy-data.json"), r);
  const j = JSON.parse(r);
  console.log("skills", Object.keys(j.skills).length, "passives", Object.keys(j.passives).length, "x1", Object.keys(j.x1).length);
  await gl.close(); process.exit(0);
})().catch((e) => { console.error("FAIL", e.message); process.exit(1); });
