$Host.UI.RawUI.BackgroundColor = 'Black'
$Host.UI.RawUI.ForegroundColor = 'White'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$Host.UI.RawUI.WindowTitle = '🌳 ItzDaTrees Injector'
Clear-Host

function Write-Purple($text) {
    Write-Host $text -ForegroundColor Magenta
}

function Write-DarkPurple($text) {
    Write-Host $text -ForegroundColor DarkMagenta
}

function Write-Gray($text) {
    Write-Host $text -ForegroundColor DarkGray
}

function Write-White($text) {
    Write-Host $text -ForegroundColor White
}

function Draw-Header {
    Write-Host ''
    Write-Purple  '  ╔══════════════════════════════════════════════════════════╗'
    Write-Purple  '  ║                                                          ║'
    Write-Purple  '  ║               🌳  ITZDATREES INJECTOR                    ║'
    Write-Purple  '  ║                  Animal Company • Frida                  ║'
    Write-Purple  '  ║                                                          ║'
    Write-Purple  '  ╚══════════════════════════════════════════════════════════╝'
    Write-Host ''
    Write-DarkPurple '     Version : 1.5.2.5'
    Write-DarkPurple '     Status  : Ready'
    Write-Host ''
}

function Draw-Menu {
    param($selected)

    $menuItems = @(
        @{ Label = 'Inject Menu';   Desc = 'Inject SolarHPs Menu into the game' },
        @{ Label = 'Exit';          Desc = 'Close this loader' }
    )

    Clear-Host
    Draw-Header

    Write-Gray '  ┌──────────────────────────────────────────────────────────┐'
    Write-Gray '  │                     MAIN MENU                            │'
    Write-Gray '  └──────────────────────────────────────────────────────────┘'
    Write-Host ''

    for ($i = 0; $i -lt $menuItems.Count; $i++) {
        $item = $menuItems[$i]

        if ($i -eq $selected) {
            Write-Host -NoNewline '  ▶  ' -ForegroundColor Magenta
            Write-Host -NoNewline ($item.Label.PadRight(20)) -BackgroundColor Magenta -ForegroundColor Black
            Write-Host ('  ' + $item.Desc) -ForegroundColor DarkMagenta
        }
        else {
            Write-Host -NoNewline '  ○  ' -ForegroundColor DarkGray
            Write-Host -NoNewline ($item.Label.PadRight(20)) -ForegroundColor White
            Write-Host ('  ' + $item.Desc) -ForegroundColor DarkGray
        }
    }

    return $menuItems
}

function Run-Inject {
    Clear-Host
    Draw-Header

    Write-Gray '  ┌──────────────────────────────────────────────────────────┐'
    Write-Gray '  │                      INJECTING                           │'
    Write-Gray '  └──────────────────────────────────────────────────────────┘'
    Write-Host ''

    $ok = $true

    # Check required files
    foreach ($f in @('solarhp.js')) {
        if (-not (Test-Path $f)) {
            Write-Host "  ✗  $f not found!" -ForegroundColor Magenta
            $ok = $false
        }
        else {
            Write-Host "  ✓  $f found" -ForegroundColor Magenta
        }
    }

    Write-Host ''

    if (-not $ok) {
        Write-Host '  ✗  Missing files. Cannot inject.' -ForegroundColor Magenta
        Write-Host ''
        Read-Host '  Press Enter to go back'
        return
    }

    # Check Frida
    $fridaCheck = Get-Command frida -ErrorAction SilentlyContinue
    if (-not $fridaCheck) {
        Write-Host '  ✗  Frida not found in PATH.' -ForegroundColor Magenta
        Write-DarkPurple '     Install from: https://frida.re/docs/installation/'
        Write-Host ''
        Read-Host '  Press Enter to go back'
        return
    }
    else {
        Write-Host '  ✓  Frida found' -ForegroundColor Magenta
    }

    # Check if game is running
    $game = Get-Process -Name 'EACLauncher' -ErrorAction SilentlyContinue
    if (-not $game) {
        Write-Host '  ✗  EACLauncher.exe is not running!' -ForegroundColor Magenta
        Write-DarkPurple '     Please start the game first.'
        Write-Host ''
        Read-Host '  Press Enter to go back'
        return
    }
    else {
        Write-Host '  ✓  Game detected' -ForegroundColor Magenta
    }

    Write-Host ''
    Write-Host '  ▶  All checks passed. Injecting...' -ForegroundColor Magenta
    Write-Host ''

    & frida -l solarhp.js 'EACLauncher.exe'
    $ec = $LASTEXITCODE

    Write-Host ''
    if ($ec -ne 0) {
        Write-Host "  ✗  Injection failed (Exit code: $ec)" -ForegroundColor Magenta
    }
    else {
        Write-Host '  ✓  Menu injected successfully!' -ForegroundColor Magenta
        Write-DarkPurple '     Check the game for the menu.'
    }

    Write-Host ''
    Read-Host '  Press Enter to go back'
}

# Main loop
$sel = 0
$items = Draw-Menu $sel

while ($true) {
    $key = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
    $vk  = $key.VirtualKeyCode

    if ($vk -eq 38) {          # Up
        if ($sel -gt 0) { $sel-- } else { $sel = $items.Count - 1 }
        $items = Draw-Menu $sel
    }
    elseif ($vk -eq 40) {     # Down
        if ($sel -lt ($items.Count - 1)) { $sel++ } else { $sel = 0 }
        $items = Draw-Menu $sel
    }
    elseif ($vk -eq 13) {     # Enter
        switch ($sel) {
            0 { Run-Inject }
            1 { Clear-Host; exit 0 }
        }
        $items = Draw-Menu $sel
    }
    elseif ($vk -eq 27) {     # Escape
        Clear-Host
        exit 0
    }
}