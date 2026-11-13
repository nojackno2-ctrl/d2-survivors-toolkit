// 物品引擎（對應 Electron 版 editor/engine.js）：直接載入已安裝遊戲的程式碼，用遊戲自己的產生器做
// 暗金／套裝／符文之語，結果與遊戲掉落的物品完全相同，所以能通過遊戲的合法性檢查。
// 遊戲程式從官方 app.asar 唯讀取出，在隱藏的 WebView 裡執行；簽章、patch、引擎頁面都從 GitHub 抓
// （與網頁版共用同一份），熱重載時整個引擎重新準備。
use crate::{asar::Asar, core::{self, lock}, remote};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{atomic::{AtomicU64, Ordering}, mpsc, Mutex},
    time::Duration,
};

pub const ORIGIN: &str = "https://d2engine.localhost";
const RELOADED: &str = "工具包已重新載入，請再試一次。";
const ASSETS: [&str; 4] = ["desktop", "dist", "web", "assets"];

pub enum Cmd { Load(String), Eval(String) }

#[derive(Default)]
struct State { gen: u64, ready: Option<u64>, stamp: Option<String> }

#[derive(Default)]
pub struct Engine {
    files: Mutex<HashMap<String, (&'static str, Vec<u8>)>>,
    state: Mutex<State>,
    start: Mutex<()>,
    boot: Mutex<Option<(u64, mpsc::Sender<Value>)>>,
    pending: Mutex<HashMap<u64, mpsc::Sender<Value>>>,
    seq: AtomicU64,
}

fn archive() -> PathBuf {
    std::env::var_os("D2_GAME_ASAR").map(PathBuf::from).unwrap_or_else(|| {
        PathBuf::from(std::env::var_os("ProgramFiles").unwrap_or_else(|| "C:\\Program Files".into()))
            .join("D2 Survivors").join("resources").join("app.asar")
    })
}
fn archive_stamp() -> Option<String> {
    let meta = std::fs::metadata(archive()).ok()?;
    let mtime = meta.modified().ok()?.duration_since(std::time::UNIX_EPOCH).ok()?.as_nanos();
    Some(format!("{}:{mtime}", meta.len()))
}

const JS: &str = "text/javascript; charset=utf-8";
const JSON: &str = "application/json; charset=utf-8";
const HTML: &str = "text/html; charset=utf-8";

impl Engine {
    // 熱重載：下一次呼叫時重新抓 patch／簽章／引擎頁面並重新載入遊戲程式
    // 並叫醒所有正在等待舊世代結果的呼叫端（啟動中的與已送出的）
    pub fn reset(&self) {
        lock(&self.state).gen += 1;
        if let Some((_, tx)) = lock(&self.boot).take() { let _ = tx.send(json!({ "t": "error", "err": RELOADED })); }
        for (_, tx) in lock(&self.pending).drain() { let _ = tx.send(json!({ "err": RELOADED })); }
    }
    fn current(&self, gen: u64) -> Result<(), String> {
        if lock(&self.state).gen == gen { Ok(()) } else { Err(RELOADED.into()) }
    }

    // 自訂協定 d2engine 的內容（隱藏 WebView 只看得到這裡放的檔案）
    pub fn file(&self, path: &str) -> Option<(&'static str, Vec<u8>)> {
        lock(&self.files).get(path).cloned()
    }

    // 隱藏 WebView 傳回的訊息
    pub fn on_message(&self, msg: &str) {
        let Ok(v) = serde_json::from_str::<Value>(msg) else { return };
        if v["t"] == "res" {
            if let Some(tx) = v["id"].as_u64().and_then(|id| lock(&self.pending).remove(&id)) { let _ = tx.send(v); }
        } else if let Some((gen, tx)) = lock(&self.boot).as_ref() {
            if v["g"].as_u64() == Some(*gen) { let _ = tx.send(v); }
        }
    }

    fn wait(&self, rx: &mpsc::Receiver<Value>, want: &str, secs: u64, timeout: &str) -> Result<Value, String> {
        let v = rx.recv_timeout(Duration::from_secs(secs)).map_err(|_| timeout.to_string())?;
        if v["t"] == want { Ok(v) } else { Err(v["err"].as_str().unwrap_or("物品引擎啟動失敗。").to_string()) }
    }

    fn prepare(&self, gen: u64, run: &dyn Fn(Cmd)) -> Result<(), String> {
        let result = self.prepare_gen(gen, run);
        let mut boot = lock(&self.boot);
        if boot.as_ref().is_some_and(|(g, _)| *g == gen) { *boot = None; }
        result
    }

    fn prepare_gen(&self, gen: u64, run: &dyn Fn(Cmd)) -> Result<(), String> {
        let signatures = remote::text("modifier/signatures.json")?;
        let patch = remote::text("modifier/patch.mjs")?;
        let page = remote::text("modifier/engine-page.js")?;
        let stamp = archive_stamp().ok_or("找不到遊戲程式，請確認 D2 Survivors 安裝在預設位置。")?;
        let mut asar = Asar::open(&archive())?;
        let mut sources = serde_json::Map::new();
        for f in asar.list(&ASSETS).into_iter().filter(|f| f.ends_with(".js")) {
            let text = asar.read_text(&[&ASSETS[..], &[f.as_str()]].concat())?;
            sources.insert(f, Value::String(text));
        }
        if sources.is_empty() { return Err("找不到遊戲程式，請確認 D2 Survivors 安裝在預設位置。".into()); }
        let build = asar.read_text(&["desktop", "dist", "web", "changelog.json"]).ok()
            .and_then(|t| serde_json::from_str::<Value>(&t).ok()).map(|v| v[0]["build"].clone()).unwrap_or(Value::Null);
        let itemstats = std::fs::read(core::d2_dir().join("itemstats.json")).map_err(|e| format!("讀不到遊戲的物品資料：{e}"))?;

        let (tx, rx) = mpsc::channel();
        *lock(&self.boot) = Some((gen, tx));
        // 第一階段：在頁面裡執行 patch（與網頁版同一份 patch.mjs），找出引擎函式並加上 export
        {
            let mut files = lock(&self.files);
            files.clear();
            files.insert("/patch.mjs".into(), (JS, patch.into_bytes()));
            files.insert("/signatures.json".into(), (JSON, signatures.into_bytes()));
            files.insert("/files.json".into(), (JSON, serde_json::to_vec(&sources).unwrap()));
            files.insert("/prepare.html".into(), (HTML, format!(r#"<!doctype html><meta charset="utf-8"><script type="module">
const post = (o) => window.ipc.postMessage(JSON.stringify({{ ...o, g: {gen} }}));
try {{
  const {{ patch }} = await import("./patch.mjs");
  const [files, signatures] = await Promise.all(["./files.json", "./signatures.json"].map((u) => fetch(u).then((r) => r.json())));
  post({{ t: "patched", ...patch(files, signatures) }});
}} catch (e) {{ post({{ t: "error", err: String(e?.message ?? e) }}); }}
</script>"#).into_bytes()));
        }
        run(Cmd::Load(format!("{ORIGIN}/prepare.html?g={gen}")));
        let r = self.wait(&rx, "patched", 40, "物品引擎啟動逾時。")?;
        self.current(gen)?;
        let missing: Vec<&str> = r["missing"].as_array().map(|a| a.iter().filter_map(Value::as_str).collect()).unwrap_or_default();
        if !missing.is_empty() { return Err(format!("遊戲版本不相容：找不到 {}", missing.join("、"))); }
        let patched = r["patched"].as_object().cloned().unwrap_or_default();
        let mods: Vec<&String> = patched.keys().collect();
        let game_scripts: Vec<&String> = sources.keys().filter(|f| f.starts_with("Game-")).collect();
        if archive_stamp().as_deref() != Some(stamp.as_str()) { return Err("遊戲程式正在更新，請重新開啟工具包。".into()); }
        let identity = json!({
            "source": "desktop", "build": build,
            "gameScript": if game_scripts.len() == 1 { json!(game_scripts[0]) } else { Value::Null },
            "items": r["found"]["setData"], "save": r["found"]["rankDefs"],
        });
        // 第二階段：全部放在同一個資料夾，區塊之間的相對 import 會指向加過 export 的同一份
        {
            // 嵌進 <script> 的 JSON 不能含 '<'；檔名用 JSON 字串常值
            let identity = identity.to_string().replace('<', "\\u003c");
            let imports: String = mods.iter().enumerate()
                .map(|(i, f)| format!("import * as G{i} from {};\n", serde_json::to_string(&format!("./assets/{f}")).unwrap())).collect();
            let names = (0..mods.len()).map(|i| format!("G{i}")).collect::<Vec<_>>().join(", ");
            let mut files = lock(&self.files);
            files.clear();
            for (f, src) in &sources {
                let text = patched.get(f).unwrap_or(src).as_str().unwrap_or_default();
                files.insert(format!("/assets/{f}"), (JS, text.as_bytes().to_vec()));
            }
            files.insert("/engine-page.js".into(), (JS, page.into_bytes()));
            files.insert("/itemstats.json".into(), (JSON, itemstats));
            files.insert("/engine.html".into(), (HTML, format!(r#"<!doctype html><meta charset="utf-8"><script>
const post = (o) => window.ipc.postMessage(JSON.stringify({{ ...o, g: {gen} }}));
window.addEventListener("error", (e) => post({{ t: "error", err: String(e.message || "遊戲程式載入失敗：" + (e.target?.src ?? "")) }}), true);
window.addEventListener("unhandledrejection", (e) => post({{ t: "error", err: String(e.reason?.message ?? e.reason) }}));
</script><script type="module">
{imports}import {{ boot }} from "./engine-page.js";
const itemstats = await (await fetch("./itemstats.json")).text();
window.engine = boot(Object.assign({{}}, {names}), itemstats, {identity});
post({{ t: "ready" }});
</script>"#).into_bytes()));
        }
        run(Cmd::Load(format!("{ORIGIN}/engine.html?g={gen}")));
        self.wait(&rx, "ready", 40, "物品引擎啟動逾時。")?;
        self.current(gen)?;
        let mut state = lock(&self.state);
        state.stamp = Some(stamp);
        state.ready = Some(gen);
        Ok(())
    }

    // 在引擎頁面裡呼叫 window.engine[name](...args)；整個過程持有 start 鎖，引擎呼叫一次只跑一個
    pub fn call(&self, name: &str, args: &[Value], run: &dyn Fn(Cmd)) -> Result<Value, String> {
        let _serial = lock(&self.start);
        let (gen, ready) = { let s = lock(&self.state); (s.gen, s.ready) };
        if ready != Some(gen) { self.prepare(gen, run)?; }
        let stamp = lock(&self.state).stamp.clone();
        if stamp.is_none() || archive_stamp() != stamp {
            if name == "capabilities" { return Ok(json!({ "supported": false, "weaponSets": false })); }
            return Err("遊戲程式已變更，已封鎖物品引擎；請重新開啟工具包。".into());
        }
        let id = self.seq.fetch_add(1, Ordering::Relaxed) + 1;
        let (tx, rx) = mpsc::channel();
        lock(&self.pending).insert(id, tx);
        let args = serde_json::to_string(args).unwrap();
        run(Cmd::Eval(format!(
            "(async()=>{{const p=(o)=>window.ipc.postMessage(JSON.stringify({{t:'res',id:{id},...o}}));             try{{const r=await window.engine.{name}(...{args});p({{ok:r===undefined?null:r}})}}catch(e){{p({{err:String(e&&e.message||e)}})}}}})()"
        )));
        let res = rx.recv_timeout(Duration::from_secs(120));
        lock(&self.pending).remove(&id);
        let v = res.map_err(|_| "物品引擎沒有回應。".to_string())?;
        match v.get("err").and_then(Value::as_str) {
            Some(e) => Err(e.to_string()),
            None => Ok(v.get("ok").cloned().unwrap_or(Value::Null)),
        }
    }
}
