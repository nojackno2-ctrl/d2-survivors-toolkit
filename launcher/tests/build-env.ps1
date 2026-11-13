# 這台機器沒有 MSVC 的 link.exe：先在 PowerShell 執行「. tests/build-env.ps1」再 cargo build（改用 rust-lld）。路徑依本機 Visual Studio／Windows SDK 版本調整。
$msvc='C:\Program Files\Microsoft Visual Studio\18\Community\VC\Tools\MSVC\14.51.36231'; $k='C:\Program Files (x86)\Windows Kits\10'; $sdk='10.0.26100.0'
$env:LIB="$msvc\lib\x64;$k\Lib\$sdk\um\x64;$k\Lib\$sdk\ucrt\x64"
$env:CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_LINKER="$env:USERPROFILE\.rustup\toolchains\stable-x86_64-pc-windows-msvc\lib\rustlib\x86_64-pc-windows-msvc\bin\rust-lld.exe"
$env:RUSTFLAGS="-C linker-flavor=lld-link"
