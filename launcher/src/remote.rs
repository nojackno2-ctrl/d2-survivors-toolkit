// 遠端資源：修改器頁面與引擎需要的檔案都從 GitHub Pages 抓，抓到就存進快取；離線時改用快取。
// 工具包與遊戲相容性更新不必重新打包 exe。測試時可用環境變數 D2_TOOLKIT_BASE 指向本機伺服器（需以 / 結尾）。
use std::{fs, path::PathBuf, sync::OnceLock, time::{Duration, SystemTime, UNIX_EPOCH}};

const DEFAULT_BASE: &str = "https://nojackno2-ctrl.github.io/d2-survivors-toolkit/";

pub fn base() -> &'static str {
    static BASE: OnceLock<String> = OnceLock::new();
    BASE.get_or_init(|| {
        let b = std::env::var("D2_TOOLKIT_BASE").unwrap_or_else(|_| DEFAULT_BASE.into());
        assert!(b.ends_with('/'), "D2_TOOLKIT_BASE 結尾要有 /");
        b
    })
}

#[derive(Clone, Copy, PartialEq)]
pub enum Target { Editor, Guard }

impl Target {
    pub fn path(self) -> &'static str {
        match self { Target::Editor => "modifier/editor.html", Target::Guard => "guard/guard.html" }
    }
}

pub fn now_ms() -> u128 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0)
}

// ?v= 避開 Pages 約 10 分鐘的快取，避免舊的修改器頁面搭配新的引擎檔
pub fn page_url(target: Target, mode: Option<&str>) -> String {
    let mut url = format!("{}{}?v={}", base(), target.path(), now_ms());
    if let Some(m) = mode.filter(|m| *m == "hardcore" || *m == "softcore") {
        url.push_str("&mode=");
        url.push_str(m);
    }
    url
}

// 只接受來自工具包網站的呼叫端（IPC 與導覽都要檢查）。
// 只比對整個工具包的路徑前綴（BASE 結尾有 /），同一網域下其他 repo 的頁面不信任
pub fn trusted(url: &str) -> bool {
    url.starts_with(base())
}

// 啟動器自己的資料（遠端快取、WebView2 設定檔）放在 %LOCALAPPDATA%，不放進遊戲資料夾
pub fn data_dir() -> PathBuf {
    let root = std::env::var_os("D2_LAUNCHER_DATA").map(PathBuf::from).unwrap_or_else(|| {
        PathBuf::from(std::env::var_os("LOCALAPPDATA").unwrap_or_default()).join("D2SurvivorsToolkit")
    });
    let _ = fs::create_dir_all(&root);
    root
}

fn agent() -> ureq::Agent {
    // 使用系統 TLS（Windows Schannel），不需要額外的 C 編譯器
    ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(20)))
        .tls_config(
            ureq::tls::TlsConfig::builder()
                .provider(ureq::tls::TlsProvider::NativeTls)
                .root_certs(ureq::tls::RootCerts::PlatformVerifier)
                .build(),
        )
        .build()
        .into()
}

pub fn text(rel: &str) -> Result<String, String> {
    let dir = data_dir().join("remote-cache");
    let file = dir.join(rel.replace(['\\', '/'], "__"));
    let fetched = (|| -> Result<String, String> {
        let url = format!("{}{}?v={}", base(), rel, now_ms());
        let mut res = agent().get(&url).call().map_err(|e| e.to_string())?;
        res.body_mut().with_config().limit(64 * 1024 * 1024).read_to_string().map_err(|e| e.to_string())
    })();
    match fetched {
        Ok(body) => {
            let _ = fs::create_dir_all(&dir);
            let _ = fs::write(&file, &body);
            Ok(body)
        }
        Err(e) => fs::read_to_string(&file)
            .map_err(|_| format!("無法下載 {rel}（{e}），請檢查網路後重新開啟工具包。")),
    }
}

// 熱重載用：目前頁面與引擎相關檔案的版本標記合併成一個字串（任何一個變了就算有更新）。
// GitHub Pages 每次部署都會換掉 ETag；ETag 與 Last-Modified 都記，避免兩種值互比。
pub fn stamp(target: Target) -> Result<String, String> {
    let files = [target.path(), "modifier/engine-page.js", "modifier/patch.mjs", "modifier/signatures.json", "version.json"];
    let mut out = Vec::new();
    for f in files {
        let res = agent().head(&format!("{}{}?v={}", base(), f, now_ms())).call().map_err(|e| e.to_string())?;
        let header = |name: &str| res.headers().get(name).and_then(|v| v.to_str().ok()).unwrap_or("").to_owned();
        out.push(format!("{}|{}", header("etag"), header("last-modified")));
    }
    Ok(out.join(";"))
}

// 網址的 origin（協定＋主機＋埠），用於自訂協定的 CORS 標頭
pub fn origin() -> &'static str {
    let b = base();
    let start = b.find("://").map_or(0, |i| i + 3);
    &b[..b[start..].find('/').map_or(b.len(), |i| start + i)]
}
