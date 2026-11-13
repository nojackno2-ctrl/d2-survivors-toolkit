# 用法：powershell -File run-selftest.ps1 <存檔副本資料夾> <暫存資料夾> [額外環境變數 KEY=VAL ...]
# 在存檔副本上啟動 debug 版（-Exe 可改指定其他 exe） d2-toolkit.exe 跑 selftest.js；結果寫到 <暫存資料夾>\selftest.json，主控台輸出在 run.err.log
param([string]$User, [string]$Tmp, [string[]]$Extra = @(), [int]$Wait = 150, [string]$Js = "$PSScriptRoot\selftest.js", [string]$Exe = "$PSScriptRoot\..\target\debug\d2-toolkit.exe")
$exe = $Exe
$env:D2_USER_DIR = $User; $env:D2_BACKUP_DIR = "$Tmp\backups"; $env:D2_LAUNCHER_DATA = "$Tmp\ldata"
$env:D2_SELFTEST_JS = $Js; $env:D2_SELFTEST = "$Tmp\selftest.json"
foreach ($e in ($Extra -split ",")) { $k, $v = $e -split "=", 2; Set-Item "env:$k" $v }
Remove-Item $env:D2_SELFTEST -ErrorAction SilentlyContinue
$p = Start-Process $exe -PassThru -RedirectStandardError "$Tmp\run.err.log" -RedirectStandardOutput "$Tmp\run.out.log"
for ($i = 0; $i -lt $Wait; $i++) {
  Start-Sleep 1
  if ((Test-Path $env:D2_SELFTEST) -and ((Get-Content $env:D2_SELFTEST -Raw) -match '"done": true')) { break }
  if ($p.HasExited) { break }
}
if (-not $p.HasExited) { Stop-Process $p -Force }
"exited after ~$i s"
