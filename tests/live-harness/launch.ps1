param([string]$Classes, [int]$Copies = 1, [int]$Speed = 1, [switch]$NoCheat, [switch]$Resume, [switch]$Local)
# -NoCheat：關閉 boot.js 預設開啟的作弊總開關（驗證真實戰鬥／任務模式時使用，否則結果會被無敵、一擊必殺等影響）。
# -Resume：沿用既有 run 資料夾與 profile 接續原存檔（不清空）；實例仍在執行就略過。未加時維持舊行為：清空後開新存檔。
# -Local：H_LOCAL=1，把 GitHub Pages 的請求改由本機檔案回應（測試未發布的本機修改）。
$h = $PSScriptRoot; $env:ELECTRON_RUN_AS_NODE = $null; $env:H_SPEED = "$Speed"; $env:H_BOT = (Resolve-Path "$h\..\..\helper\autobot.js").Path
$env:H_SETTINGS = if ($NoCheat) { '{"cheat":{"enabled":false}}' } else { $null }
$env:H_LOCAL = if ($Local) { "1" } else { $null }
$electron = "D:\D2倖存者\editor\node_modules\electron\dist\electron.exe"
foreach ($c in $Classes.Split(",")) { foreach ($i in 1..$Copies) {
  $out = if ($Copies -gt 1) { "$h\run-$c-$i" } else { "$h\run-$c" }
  $alive = (Test-Path "$out\pid") -and [bool](Get-Process -Id ([int](Get-Content "$out\pid")) -ErrorAction SilentlyContinue)
  if ($Resume) {
    if ($alive) { Write-Output "$out 仍在執行，略過"; continue }
  } else {
    if ($alive) { Stop-Process -Id (Get-Content "$out\pid") -Force -ErrorAction SilentlyContinue; Start-Sleep 2 }
    Remove-Item -Recurse -Force $out -ErrorAction SilentlyContinue
  }
  $env:H_OUT = $out; $env:H_CLASS = $c
  # 經 WMI（Win32_Process.Create）啟動：新行程不在呼叫端的工作物件（job）裡，呼叫端（例如代理）結束時不會連帶終止遊戲實例。
  # 實測（2026-11-20）：用 Start-Process 從代理啟動的實例在代理結束時被一併終止；改用 Win32_Process.Create 的實例存活。
  # WMI 新行程不繼承本行程的環境變數，所以用 cmd 先 set 再啟動。
  $vars = "H_SPEED", "H_BOT", "H_SETTINGS", "H_LOCAL", "H_OUT", "H_CLASS" | Where-Object { [Environment]::GetEnvironmentVariable($_) } | ForEach-Object { "set `"$_=$([Environment]::GetEnvironmentVariable($_))`"" }
  $cmdLine = "cmd.exe /d /c `"" + (($vars + "set `"ELECTRON_RUN_AS_NODE=`"" + "`"$electron`" `"$h`"") -join " && ") + "`""
  $hidden = New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly -Property @{ ShowWindow = [uint16]0 }
  $r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $cmdLine; CurrentDirectory = $h; ProcessStartupInformation = $hidden }
  if ($r.ReturnValue -ne 0) { Write-Output "$out 啟動失敗（Win32_Process.Create 回傳 $($r.ReturnValue)）"; continue }
  Start-Sleep 3
} }
