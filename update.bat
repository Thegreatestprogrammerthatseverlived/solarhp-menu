@echo off
setlocal EnableExtensions

title SolarHP Menu - Auto Updater
cd /d "%~dp0"

set "REMOTE_URL=https://raw.githubusercontent.com/Thegreatestprogrammerthatseverlived/solarhp-menu/main/version.json"

echo ============================================
echo   SolarHP Menu - Auto Updater
echo ============================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop';" ^
  "$base=Join-Path (Get-Location) 'version.json';" ^
  "function Get-Tuple($v){$p=@(($v -replace '[^\d\.]','') -split '\.' | ForEach-Object{[int]$_}); while($p.Count -lt 4){$p+=0}; return ,$p};" ^
  "function Is-Newer($r,$l){if(-not $l){return $true}; $a=Get-Tuple $r; $b=Get-Tuple $l; for($i=0;$i -lt 4;$i++){if($a[$i] -gt $b[$i]){return $true}; if($a[$i] -lt $b[$i]){return $false}}; return $false};" ^
  "Write-Host '  Fetching update manifest...';" ^
  "$remote=((New-Object System.Net.WebClient).DownloadString('%REMOTE_URL%')) | ConvertFrom-Json;" ^
  "$localVersion='';" ^
  "if(Test-Path $base){try{$local=Get-Content $base -Raw | ConvertFrom-Json; $localVersion=[string]$local.version}catch{}};" ^
  "if(Is-Newer $remote.version $localVersion){" ^
  "  Write-Host ('  Update available: ' + $localVersion + ' -> ' + $remote.version) -ForegroundColor Yellow;" ^
  "  foreach($rel in $remote.files.PSObject.Properties){" ^
  "    $name=$rel.Name; $url=$rel.Value;" ^
  "    try{" ^
  "      $dest=Join-Path (Get-Location) $name;" ^
  "      $dir=Split-Path -Parent $dest;" ^
  "      if($dir -and -not (Test-Path $dir)){New-Item -ItemType Directory -Path $dir -Force | Out-Null};" ^
  "      (New-Object System.Net.WebClient).DownloadFile($url, $dest);" ^
  "      Write-Host ('  [OK]  ' + $name) -ForegroundColor Green;" ^
  "    }catch{" ^
  "      Write-Host ('  [FAIL] ' + $name + ' : ' + $_.Exception.Message) -ForegroundColor Red;" ^
  "    }" ^
  "  };" ^
  "  $remote | ConvertTo-Json -Depth 5 | Set-Content $base -Encoding UTF8;" ^
  "  Write-Host '  Update complete.' -ForegroundColor Green;" ^
  "}else{" ^
  "  Write-Host ('  Already up to date (' + $localVersion + ').') -ForegroundColor Green;" ^
  "};" ^
  "exit 0"

if %errorlevel% neq 0 (
  echo.
  echo ERROR: Update failed. Check your connection and try again.
)

echo.
exit /b 0
