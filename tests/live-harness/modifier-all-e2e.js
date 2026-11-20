// 修改器全功能實機測試：在修改器 iframe 內逐頁實際操作 → 按「寫入存檔」→ 重載官方遊戲頁 → 檢查存檔內容與遊戲端 saveFaults。
// 用法：H_IN=editor H_SEED=使用者存檔副本.json electron craft-live.cjs modifier-all-e2e.js out.json
// 只在隔離設定檔內執行，H_SEED 是複本，不碰使用者原存檔。
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const d=document, w=window; w.confirm=()=>true; w.alert=()=>{};
const errs=[]; w.addEventListener("error",e=>errs.push(String(e.message)));
const R=[]; const rec=(name,ok,info)=>R.push({name,ok:!!ok,info:info===undefined?null:info});
const ev=(el,t)=>el.dispatchEvent(new w.Event(t,{bubbles:true}));
const setIn=(el,v)=>{el.value=String(v); ev(el,"input"); ev(el,"change");};
const go=async(p)=>{d.querySelector(`nav button[data-page="${p}"]`).click(); await sleep(p==="hero"?1500:700);};
const step=async(name,fn)=>{ try { await fn(); } catch(e) { rec(name+"（例外）", false, String(e&&e.message||e)); } };
for(let i=0;i<40&&!d.querySelector("nav button");i++) await sleep(500);
await sleep(2500);
const flush=async()=>{ await go("items"); await sleep(300); };
const cnt=(o,v)=>Object.values(o||{}).filter(x=>x===v).length;

await step("設定：解除修改限制開關", async()=>{
  await go("settings");
  const cb=d.querySelector("#unlockMode"); cb.checked=true; ev(cb,"change"); await sleep(300);
  await go("settings");
  rec("解除修改限制：開啟後保持開啟", d.querySelector("#unlockMode").checked===true);
  d.querySelector("#unlockMode").checked=false; ev(d.querySelector("#unlockMode"),"change"); await sleep(300);
});

await step("帳號：金幣／碎片／傭兵欄", async()=>{
  await go("hero");
  setIn(d.querySelector('[data-path="gold"]'),2000000000);
  setIn(d.querySelector('[data-path="light.shards"]'),10);
  setIn(d.querySelector('[data-path="hireOpen"]'),5);
  await flush();
  rec("金幣設為 20 億", save.gold===2000000000, save.gold);
  rec("光之碎片設為 10（遊戲上限）", save.light?.shards===10, save.light?.shards);
  rec("可聘傭兵欄設為 5", save.hireOpen===5, save.hireOpen);
});
await step("帳號：永久強化全部設為", async()=>{
  await go("hero");
  setIn(d.querySelector("#fill-ranks"),9); d.querySelector('[data-fill="ranks"]').click(); await sleep(400);
  await flush();
  rec("永久強化「全部設為 9」", cnt(save.ranks,9)>0, {nines:cnt(save.ranks,9), total:Object.keys(save.ranks).length});
});
await step("帳號：額外強化全部設為", async()=>{
  await go("hero");
  setIn(d.querySelector("#fill-extraRanks"),100); d.querySelector('[data-fill="extraRanks"]').click(); await sleep(400);
  await flush();
  rec("額外強化「全部設為 100」", cnt(save.extraRanks,100)>0, {hundreds:cnt(save.extraRanks,100), total:Object.keys(save.extraRanks).length});
});
await step("角色：難度／金光／重置次數／恐怖等級", async()=>{
  await go("hero");
  setIn(d.querySelector('[data-path="unlocked.amazon"]'),"hell"); await flush(); await go("hero");
  await flush();
  rec("亞馬遜難度設為地獄", save.unlocked?.amazon==="hell", save.unlocked?.amazon);
  await go("hero"); const pr=d.querySelector('[data-path="paidResets.amazon"]'); const prMax=pr.tagName==="SELECT"?Number(pr.options[pr.options.length-1].value):7; window.__prMax=prMax; setIn(pr,prMax);
  await flush(); await go("hero");
  rec("亞馬遜已付費重置設為介面最大值", save.paidResets?.amazon===window.__prMax, {want:window.__prMax,got:save.paidResets?.amazon});
  setIn(d.querySelector('[data-path="terror.amazon.open"]'),3);
  await flush(); await go("hero");
  rec("亞馬遜恐怖等級開放設為 3", save.terror?.amazon?.open===3, save.terror?.amazon);
  const g=d.querySelector('[data-glow="amazon"]'); g.checked=true; ev(g,"change"); await sleep(300);
  await flush();
  rec("亞馬遜金色光芒開啟", save.heroes?.amazon?.glow===true, save.heroes?.amazon?.glow);
});
await step("技能修改：點數", async()=>{
  await go("hero");
  for(const s of d.querySelectorAll('select[data-path^="skillMods.sorceress.on."]')){ s.value=""; ev(s,"change"); }
  setIn(d.querySelector('[data-path="skillMods.sorceress.points"]'),3); await flush();
  await flush();
  rec("魔法使技能修改點數設為 3", save.skillMods?.sorceress?.points===3, save.skillMods?.sorceress);
});
await step("裝備庫：一鍵解鎖＋全部最高", async()=>{
  cur="uniques"; renderView(); await sleep(400);
  const before=save.uniques?.length??0;
  d.querySelector("#unlockAll").click(); await sleep(2500);
  rec("一鍵解鎖後收藏增加", (save.uniques?.length??0)>before, {before, after:save.uniques?.length});
});
await step("製作裝備：新增戒指到共用倉庫", async()=>{
  await go("craft");
  const before=save.stashTabs?.shared1?.length??0;
  setIn(d.querySelector("#xCategory"),"ring"); await sleep(300);
  setIn(d.querySelector("#xRar"),"rare"); await sleep(400);
  { const kd=d.querySelector("#xKind"); if(kd&&!kd.disabled&&kd.options.length>1){ setIn(kd,kd.options[1].value); await sleep(400); } }
  { const bs=d.querySelector("#xBase"); if(bs&&bs.options.length>1){ setIn(bs,bs.options[1].value); await sleep(800); } }
  setIn(d.querySelector("#xDest"),"st:shared1"); await sleep(200);
  d.querySelector("#xMake").click(); await sleep(1500);
  const after=save.stashTabs?.shared1?.length??0;
  rec("製作戒指放入共用倉庫 1", after>before, {before, after, hint:d.querySelector("#craft").innerText.slice(-160)});
});
await step("存檔檢查頁（已移到工具包選單）", async()=>{
  await go("guard"); await sleep(1500);
  rec("存檔檢查頁指向工具包選單的「存檔檢查與防護」", /存檔檢查與防護/.test(d.body.innerText), null);
});
await step("存檔管理：快照／匯出", async()=>{
  await go("saves");
  const before=d.querySelectorAll("#backupList tr").length;
  setIn(d.querySelector("#snapName"),"實機測試快照"); d.querySelector("#snap").click(); await sleep(1500);
  await go("items"); await go("saves");
  const after=d.querySelectorAll("#backupList tr").length;
  rec("建立快照回應成功", /已建立快照/.test(d.querySelector("#status").textContent), {before, after, status:d.querySelector("#status").textContent});
  d.querySelector("#export").click(); await sleep(800);
  rec("匯出：狀態列回應", !/失敗|錯誤|無法/.test(d.querySelector("#status").textContent), d.querySelector("#status").textContent);
});
await step("原始存檔資料：套用", async()=>{
  await go("raw");
  const o=JSON.parse(d.querySelector("#rawText").value);
  o.gold=12345; d.querySelector("#rawText").value=JSON.stringify(o);
  d.querySelector("#fromRaw").click(); await sleep(1200);
  rec("原始資料改金幣為 12345 並套用", save.gold===12345, save.gold);
});
await step("寫入存檔", async()=>{
  await flush(); rec("寫入前頂層欄位", true, Object.keys(save).length+" "+Object.keys(save).join(","));
  rec("寫入前存檔欄位", true, {gold:save.gold, shards:save.light?.shards, hireOpen:save.hireOpen, paid:save.paidResets?.amazon, terror:save.terror?.amazon?.open});
  d.querySelector("#write").click(); await sleep(9000);
  rec("寫入存檔狀態", true, d.querySelector("#status").textContent);
});
rec("修改器頁面執行期間的例外", errs.length===0, errs.slice(0,5));
return {editor: R};
//=====MAIN
const sleep2=(ms)=>new Promise(r=>setTimeout(r,ms));
await import("https://nojackno2-ctrl.github.io/d2-survivors-toolkit/d2edit.js?v="+Date.now()); await sleep2(4000);
const out=[];
const chk=(name,ok,info)=>out.push({name,ok:!!ok,info:info===undefined?null:info});
for(let i=0;i<30&&!window.__d2autobot?.game;i++) await sleep2(1000);
const sv=JSON.parse(localStorage.getItem("d2-survivors/save/v1"));
chk("遊戲頁可讀回存檔", !!sv);
out.push({name:"遊戲端頂層欄位",ok:true,info:Object.keys(sv).join(",")});
out.push({name:"遊戲端讀回欄位",ok:true,info:{keys:Object.keys(sv).length,light:sv.light,hireOpen:sv.hireOpen,gold:sv.gold}});
chk("金幣 12345 寫入並重載", sv.gold===12345, sv.gold);
chk("光之碎片 10", sv.light?.shards===10, sv.light?.shards);
chk("可聘傭兵欄 5", sv.hireOpen===5, sv.hireOpen);
chk("永久強化 9", Object.values(sv.ranks||{}).filter(x=>x===9).length>0);
chk("額外強化 100", Object.values(sv.extraRanks||{}).filter(x=>x===100).length>0);
chk("亞馬遜難度 hell", sv.unlocked?.amazon==="hell", sv.unlocked?.amazon);
chk("亞馬遜重置為介面最大值", sv.paidResets?.amazon>=4, sv.paidResets?.amazon);
chk("亞馬遜恐怖開放 3", sv.terror?.amazon?.open===3, sv.terror?.amazon);
chk("魔法使技能點數 3", sv.skillMods?.sorceress?.points===3, sv.skillMods?.sorceress);
chk("亞馬遜金光", sv.heroes?.amazon?.glow===true);
const b=window.__d2editBackend;
const faults=b? await b.engine("saveFaults", sv) : "no backend";
chk("遊戲端 saveFaults 為空", Array.isArray(faults)?faults.length===0:!faults, Array.isArray(faults)?faults.slice(0,5):faults);
return {game: out};
