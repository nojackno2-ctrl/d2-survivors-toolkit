// D2倖存者工具包桌面啟動器（Rust 版，取代 Electron 版 editor/）
// 介面、引擎資源都從 GitHub Pages 載入（remote.rs），與網頁版共用同一份工具包；
// 這個 exe 只負責本機存檔讀寫與物品引擎，並隨時可以熱重載（F5、選單，或偵測到 GitHub 更新時提示）。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod asar;
mod core;
mod engine;
mod remote;

use crate::core::lock;
use muda::{CheckMenuItem, Menu, MenuEvent, MenuItem};
use remote::Target;
use serde_json::{json, Value};
use std::{borrow::Cow, path::{Component, Path, PathBuf}, sync::{atomic::{AtomicBool, Ordering}, Arc, Mutex}, thread, time::Duration};
use tao::{
    dpi::LogicalSize,
    event::{Event, WindowEvent},
    event_loop::{ControlFlow, EventLoopBuilder, EventLoopProxy},
    platform::windows::WindowExtWindows,
    window::WindowBuilder,
};
use wry::{http::{Request, Response}, NewWindowResponse, PageLoadEvent, WebContext, WebViewBuilder, WebViewBuilderExtWindows};

// load_html（初始空白頁、離線頁）在 WebView2 回報的網址是 data:text/html;charset=utf-8;base64,…；
// 只在我們自己呼叫 load_html 之前放行一次，其他非工具包網址一律擋下
const HTML_URL: &str = "data:text/html;charset=utf-8;base64,";
static ALLOW_HTML: AtomicBool = AtomicBool::new(true);
const ASSET_ORIGIN: &str = "https://d2asset.localhost";

enum Ev {
    Script(String),         // 在主頁面執行（回覆 IPC、顯示更新提示）
    Navigate(String),
    Offline(String),
    Engine(engine::Cmd),
    Menu(String),
    Loaded(String),
}

// seq：每次載入頁面遞增，慢回來的舊請求（已被新的載入取代）不可再更動狀態；loading：載入準備中
struct Page { target: Target, mode: Option<String>, stamp: Option<String>, notified: bool, offline: bool, auto: bool, seq: u64, loading: bool }

struct App {
    proxy: Mutex<EventLoopProxy<Ev>>,
    page: Mutex<Page>,
    engine: engine::Engine,
}

impl App {
    fn send(&self, ev: Ev) { let _ = lock(&self.proxy).send_event(ev); }
}

fn english() -> bool {
    !sys_locale::get_locale().unwrap_or_default().to_lowercase().starts_with("zh")
}

// 載入（或熱重載）頁面：先向 GitHub 取版本標記當作基準，再帶新的 ?v= 載入；物品引擎一併重新準備
fn load_page(app: &Arc<App>, target: Target, mode: Option<String>) {
    let seq = {
        let mut p = lock(&app.page);
        p.target = target;
        p.mode = mode.clone();
        p.seq += 1;
        p.loading = true;
        p.seq
    };
    app.engine.reset();
    let app = app.clone();
    thread::spawn(move || {
        let res = remote::stamp(target);
        let mut p = lock(&app.page);
        if p.seq != seq { return; } // 已有更新的載入，這一次作廢
        p.loading = false;
        match res {
            Ok(stamp) => {
                p.stamp = Some(stamp);
                p.notified = false;
                p.offline = false;
                drop(p);
                app.send(Ev::Navigate(remote::page_url(target, mode.as_deref())));
            }
            Err(e) => {
                p.offline = true;
                drop(p);
                app.send(Ev::Offline(e));
            }
        }
    });
}

fn reload(app: &Arc<App>) {
    let (target, mode) = { let p = lock(&app.page); (p.target, p.mode.clone()) };
    load_page(app, target, mode);
}

// 定時比對 GitHub 上的版本標記：有新版就提示（或自動重載）；離線頁在網路恢復後自動載入
fn watch(app: Arc<App>) {
    let secs = std::env::var("D2_POLL_SECS").ok().and_then(|s| s.parse().ok()).unwrap_or(30u64).max(2);
    thread::spawn(move || loop {
        thread::sleep(Duration::from_secs(secs));
        let (target, seq, old, notified, offline, auto, loading) = {
            let p = lock(&app.page);
            (p.target, p.seq, p.stamp.clone(), p.notified, p.offline, p.auto, p.loading)
        };
        if loading { continue; }
        let Ok(new) = remote::stamp(target) else { continue };
        let mut p = lock(&app.page);
        if p.seq != seq || p.target != target || p.loading { continue; } // 檢查期間頁面已經換了
        if offline || (auto && !notified && old.as_ref() != Some(&new)) { drop(p); reload(&app); continue; }
        if notified || old.as_ref() == Some(&new) { continue; }
        p.notified = true;
        drop(p);
        app.send(Ev::Script("window.__d2update&&window.__d2update()".into()));
    });
}

fn mode_of(v: Option<&Value>) -> &'static str {
    if v.and_then(Value::as_str) == Some("hardcore") { "hardcore" } else { "softcore" }
}
fn text_of(v: Option<&Value>) -> Result<&str, String> {
    v.and_then(Value::as_str).ok_or_else(|| "參數不正確。".to_string())
}

fn dispatch(app: &Arc<App>, cmd: &str, args: &[Value]) -> Result<Value, String> {
    let en = english();
    let filter = if en { "Save" } else { "存檔" };
    match cmd {
        "load" => core::load(mode_of(args.first())),
        "save" => core::store(mode_of(args.first()), text_of(args.get(1))?),
        "assets" => Ok(core::assets(ASSET_ORIGIN)),
        "engine" => {
            // 函式名稱會直接代入引擎頁面執行，只接受合法識別字，其餘由引擎頁面判定是否存在
            let name = text_of(args.first()).ok().filter(|n| {
                let mut c = n.chars();
                c.next().is_some_and(|f| f.is_ascii_alphabetic() || f == '_') && c.all(|x| x.is_ascii_alphanumeric() || x == '_')
            }).ok_or("不支援的操作")?;
            app.engine.call(name, &args[1..], &|c| app.send(Ev::Engine(c)))
        }
        "i18n" => {
            let game: Value = serde_json::from_str(&remote::text("modifier/gamedata.json")?).map_err(|e| e.to_string())?;
            Ok(match remote::text("lang/zh-TW.json").ok().and_then(|t| serde_json::from_str::<Value>(&t).ok()) {
                Some(dict) => json!({ "dict": dict, "game": game }),
                None => json!({ "dict": {}, "game": game, "missing": true }),
            })
        }
        "openBackups" => {
            let dir = core::backup_dir();
            std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
            open::that(&dir).map_err(|e| e.to_string())?;
            Ok(json!(""))
        }
        "diag" => Ok(core::diag()),
        "traces" => core::traces(mode_of(args.first()), args.get(1).and_then(Value::as_bool).unwrap_or(false)),
        "listBackups" => Ok(core::list_backups()),
        "readBackup" => core::read_backup(text_of(args.first())?),
        "deleteBackup" => core::delete_backup(text_of(args.first())?),
        "snapshot" => core::snapshot(text_of(args.first())?, args.get(1).and_then(Value::as_str).unwrap_or("")),
        "exportSave" => {
            let body = text_of(args.first())?;
            core::seal_text(body)?;
            let picked = rfd::FileDialog::new()
                .set_title(if en { "Export save" } else { "匯出存檔" })
                .set_file_name(if en { "D2Survivors-save.json" } else { "D2倖存者存檔.json" })
                .add_filter(filter, &["json"]).save_file();
            let Some(path) = picked else { return Ok(json!({ "canceled": true })) };
            core::write_file(&path, body)?;
            Ok(json!({ "ok": true, "path": path.to_string_lossy() }))
        }
        "importSave" => {
            let picked = rfd::FileDialog::new().set_title(if en { "Import save" } else { "匯入存檔" })
                .add_filter(filter, &["json"]).pick_file();
            let Some(path) = picked else { return Ok(json!({ "canceled": true })) };
            let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
            Ok(json!({ "saveText": text, "path": path.to_string_lossy() }))
        }
        "guardStatus" => Ok(core::guard_status()),
        "saveMode" => Ok(json!("local")),
        "setSaveMode" => Err("桌面版只處理本機存檔".into()),
        "close" => { load_page(app, Target::Editor, None); Ok(json!({ "ok": true })) }
        "openGuard" => {
            let mode = args.first().and_then(Value::as_str).map(|_| mode_of(args.first()).to_string());
            load_page(app, Target::Guard, mode);
            Ok(json!({ "ok": true }))
        }
        "reload" => { reload(app); Ok(json!({ "ok": true })) }
        // 自我測試（僅在設定 D2_SELFTEST 時可用）：把頁面端的檢查結果寫到指定檔案
        "selftest" => {
            let out = std::env::var_os("D2_SELFTEST").ok_or("不支援的操作")?;
            std::fs::write(out, serde_json::to_vec_pretty(&args.first()).unwrap()).map_err(|e| e.to_string())?;
            Ok(json!({ "ok": true }))
        }
        _ => Err("不支援的操作".into()),
    }
}

// 頁面只發得出 { id, cmd, args }；只處理工具包網站頁面的呼叫（頁面是遠端載入的，不能讓任何網頁碰到本機檔案）
fn on_ipc(app: &Arc<App>, req: Request<String>) {
    let Ok(msg) = serde_json::from_str::<Value>(req.body()) else { return };
    let Some(cmd) = msg["cmd"].as_str().map(str::to_owned) else { return };
    // 「重試」只在目前是離線頁時接受（離線頁沒有 doc 代號，也不在工具包網址上）
    if cmd == "retry" { if lock(&app.page).offline { reload(app); } return; }
    let Some(id) = msg["id"].as_u64() else { return };
    let Some(doc) = msg["doc"].as_str().filter(|d| d.len() <= 64).and_then(|d| serde_json::to_string(d).ok()) else { return };
    let from = req.uri().to_string();
    let args = msg["args"].as_array().cloned().unwrap_or_default();
    let app = app.clone();
    thread::spawn(move || {
        let res = if remote::trusted(&from) { dispatch(&app, &cmd, &args) } else { Err("不允許的呼叫來源。".into()) };
        let res = res.unwrap_or_else(|e| json!({ "error": e }));
        app.send(Ev::Script(format!("window.__d2r&&window.__d2r({doc},{id},{res})")));
    });
}

// cors：只有 d2asset（工具包頁面載入圖檔）需要，且只開放給工具包網址的 origin
fn respond(status: u16, mime: &str, body: Vec<u8>, cors: bool) -> Response<Cow<'static, [u8]>> {
    let mut res = Response::builder().status(status).header("Content-Type", mime).header("Cache-Control", "no-store");
    if cors { res = res.header("Access-Control-Allow-Origin", remote::origin()); }
    res.body(Cow::Owned(body)).unwrap()
}

// d2asset 網址路徑 -> d2 資料夾內的相對路徑。只接受「每個元件都是一般檔名」的圖檔路徑；
// % 編碼不合法、含 ..、磁碟機／根目錄（含 %5c 解碼出的反斜線）、含 ':'、非圖檔副檔名一律拒絕
fn asset_rel(url_path: &str) -> Option<PathBuf> {
    let raw = url_path.strip_prefix('/')?;
    let (b, mut bytes, mut i) = (raw.as_bytes(), Vec::new(), 0);
    while i < b.len() {
        if b[i] == b'%' {
            let hex = b.get(i + 1..i + 3).filter(|h| h.iter().all(u8::is_ascii_hexdigit))?;
            bytes.push(u8::from_str_radix(std::str::from_utf8(hex).ok()?, 16).ok()?);
            i += 3;
        } else {
            bytes.push(b[i]);
            i += 1;
        }
    }
    let decoded = String::from_utf8(bytes).ok()?;
    let mut rel = PathBuf::new();
    for c in Path::new(&decoded).components() {
        match c {
            Component::Normal(n) => { let n = n.to_str()?; if n.contains([':', '\0']) { return None; } rel.push(n); }
            _ => return None,
        }
    }
    let ext = rel.extension()?.to_str()?.to_ascii_lowercase();
    matches!(ext.as_str(), "png" | "webp" | "jpg" | "jpeg").then_some(rel)
}

// 遊戲解出來的圖檔（%APPDATA%\D2 Survivors\d2）：https 頁面不能直接讀 file://，改由 d2asset 協定提供（唯讀）
fn asset(path: &str) -> Response<Cow<'static, [u8]>> {
    let Some(rel) = asset_rel(path) else { return respond(403, "text/plain", vec![], true) };
    let root = core::d2_dir().canonicalize();
    let full = root.as_ref().ok().and_then(|r| r.join(&rel).canonicalize().ok());
    // 解析符號連結／捷徑後仍必須在 d2 資料夾底下
    let (Ok(root), Some(full)) = (root, full) else { return respond(404, "text/plain", vec![], true) };
    if !full.starts_with(&root) { return respond(403, "text/plain", vec![], true); }
    let mime = match full.extension().and_then(|e| e.to_str()).map(str::to_ascii_lowercase).as_deref() {
        Some("png") => "image/png", Some("webp") => "image/webp", _ => "image/jpeg",
    };
    match std::fs::read(&full) {
        Ok(body) => respond(200, mime, body, true),
        Err(_) => respond(404, "text/plain", vec![], true),
    }
}

fn offline_html(err: &str) -> String {
    let esc = err.replace('&', "&amp;").replace('<', "&lt;");
    format!(r#"<!doctype html><meta charset="utf-8"><body style="background:#14110d;color:#e8dcc0;font-family:sans-serif;padding:24px">
<h2>無法載入工具包</h2><p>{}</p><p style="color:#9d8f73">{esc}</p>
<p><button style="padding:6px 16px;background:#e8c46a;border:0;border-radius:4px;cursor:pointer" onclick="window.__d2retry&&window.__d2retry()">重新載入 / Retry</button></p></body>"#,
        if english() { "Cannot load the toolkit from GitHub. It will retry automatically when the network is back." } else { "無法從 GitHub 載入工具包，請檢查網路；網路恢復後會自動重試。" })
}

fn main() -> wry::Result<()> {
    let en = english();
    let event_loop = EventLoopBuilder::<Ev>::with_user_event().build();
    let app = Arc::new(App {
        proxy: Mutex::new(event_loop.create_proxy()),
        page: Mutex::new(Page { target: Target::Editor, mode: None, stamp: None, notified: false, offline: false, auto: false, seq: 0, loading: false }),
        engine: engine::Engine::default(),
    });

    let window = WindowBuilder::new()
        .with_title(if en { "D2 Survivors Toolkit" } else { "D2倖存者工具包" })
        .with_inner_size(LogicalSize::new(1240.0, 880.0))
        .build(&event_loop).expect("無法建立視窗");
    let hidden = WindowBuilder::new().with_visible(false).with_title("d2-engine").build(&event_loop).expect("無法建立視窗");

    let menu = Menu::new();
    let auto = CheckMenuItem::with_id("auto", if en { "Auto reload on update" } else { "有更新時自動重新載入" }, true, false, None);
    menu.append_items(&[
        &MenuItem::with_id("editor", if en { "Save Editor" } else { "存檔修改器" }, true, None),
        &MenuItem::with_id("guard", if en { "Save Check & Guard" } else { "存檔檢查與防護" }, true, None),
        &MenuItem::with_id("reload", if en { "Reload (F5)" } else { "重新載入（F5）" }, true, None),
        &auto,
    ]).expect("無法建立選單");
    unsafe { menu.init_for_hwnd(window.hwnd() as _).expect("無法建立選單") };
    {
        let app = app.clone();
        MenuEvent::set_event_handler(Some(move |e: MenuEvent| app.send(Ev::Menu(e.id.0))));
    }

    let mut context = WebContext::new(Some(remote::data_dir().join("webview")));
    let shim = include_str!("shim.js").replace("__BASE__", remote::base());
    let (a1, a2, a3) = (app.clone(), app.clone(), app.clone());
    let webview = WebViewBuilder::new_with_web_context(&mut context)
        .with_https_scheme(true)
        .with_background_color((0x14, 0x11, 0x0d, 0xff))
        .with_initialization_script(shim)
        .with_custom_protocol("d2asset".into(), |_, req| asset(req.uri().path()))
        .with_ipc_handler(move |req| on_ipc(&a1, req))
        // 頁面只能停留在工具包網站；其他連結交給系統瀏覽器
        .with_navigation_handler(|url| {
            if remote::trusted(&url) || (url.starts_with(HTML_URL) && ALLOW_HTML.swap(false, Ordering::SeqCst)) { return true; }
            if url.starts_with("http:") || url.starts_with("https:") { let _ = open::that(&url); }
            false
        })
        .with_new_window_req_handler(|url, _| {
            if url.starts_with("http:") || url.starts_with("https:") { let _ = open::that(&url); }
            NewWindowResponse::Deny
        })
        .with_on_page_load_handler(move |e, url| if matches!(e, PageLoadEvent::Finished) { a2.send(Ev::Loaded(url)) })
        .with_html("<body style=\"background:#14110d\"></body>")
        .build(&window)?;
    // 隱藏的物品引擎頁面：只載入 d2engine 協定的內容（官方遊戲程式＋工具包引擎），不連外
    let engine_view = WebViewBuilder::new_with_web_context(&mut context)
        .with_https_scheme(true)
        .with_custom_protocol("d2engine".into(), move |_, req| match a3.engine.file(req.uri().path()) {
            Some((mime, body)) => respond(200, mime, body, false),
            None => respond(404, "text/plain", vec![], false),
        })
        .with_ipc_handler({
            let app = app.clone();
            move |req| if req.uri().to_string().starts_with(engine::ORIGIN) { app.engine.on_message(req.body()) }
        })
        .with_navigation_handler(|url| url.starts_with(engine::ORIGIN) || url.starts_with("about:") || url.starts_with("data:"))
        .with_new_window_req_handler(|_, _| NewWindowResponse::Deny)
        .with_html("<body></body>")
        .build(&hidden)?;

    load_page(&app, Target::Editor, None);
    watch(app.clone());
    let selftest = std::env::var_os("D2_SELFTEST_JS").and_then(|p| std::fs::read_to_string(p).ok());

    let main_id = window.id();
    event_loop.run(move |event, _, flow| {
        *flow = ControlFlow::Wait;
        let _keep = (&hidden, &context, &menu);
        match event {
            Event::WindowEvent { event: WindowEvent::CloseRequested, window_id, .. } if window_id == main_id => *flow = ControlFlow::Exit,
            Event::UserEvent(ev) => match ev {
                Ev::Script(js) => { let _ = webview.evaluate_script(&js); }
                Ev::Navigate(url) => { ALLOW_HTML.store(false, Ordering::SeqCst); let _ = webview.load_url(&url); }
                Ev::Offline(err) => { ALLOW_HTML.store(true, Ordering::SeqCst); let _ = webview.load_html(&offline_html(&err)); }
                Ev::Engine(engine::Cmd::Load(url)) => { let _ = engine_view.load_url(&url); }
                Ev::Engine(engine::Cmd::Eval(js)) => { let _ = engine_view.evaluate_script(&js); }
                Ev::Loaded(url) => if let Some(js) = selftest.as_deref().filter(|_| remote::trusted(&url)) { let _ = webview.evaluate_script(js); },
                Ev::Menu(id) => match id.as_str() {
                    "editor" => load_page(&app, Target::Editor, None),
                    "guard" => load_page(&app, Target::Guard, None),
                    "reload" => reload(&app),
                    "auto" => lock(&app.page).auto = auto.is_checked(),
                    _ => {}
                },
            },
            _ => {}
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn asset_paths() {
        let ok = |p: &str| asset_rel(p).map(|r| r.to_string_lossy().into_owned());
        assert_eq!(ok("/items/a.png").as_deref(), Some("items\\a.png"));
        assert_eq!(ok("/items/%E4%B8%AD.WEBP").as_deref(), Some("items\\中.WEBP"));
        for bad in [
            "/%5cWindows%5cwin.ini", "/%5CWindows%5Cwin.png", "/..%5c..%5ca.png", "/../a.png", "/a/../../b.png", "/C:/a.png", "/a%3Ab.png",
            "/a.png:stream", "/%zz.png", "/%2", "/%+1.png", "/a.json", "/a.png.exe", "/a", "/", "", "/a%00.png", "/%ff.png",
            "//server/share/a.png", "/a/", "/./a.png",
        ] {
            assert!(asset_rel(bad).is_none(), "{bad}");
        }
    }
}
