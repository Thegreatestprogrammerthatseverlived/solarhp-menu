import os
import sys
import json
import time
import shutil
import subprocess
import urllib.request

try:
    import psutil
except ImportError:
    print("Installing psutil...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "psutil"])
    import psutil

GAME_DIR = r"C:\Program Files (x86)\Steam\steamapps\common\Animal Company"
SCRIPT_DIR = os.path.dirname(os.path.abspath(sys.argv[0]))
VERSION = "1.5.1"
UPDATE_MANIFEST_URL = "https://raw.githubusercontent.com/Thegreatestprogrammerthatseverlived/solarhp-menu/main/version.json"
UPDATE_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ItzDaTrees-Updater"
VERSION_FILE = os.path.join(SCRIPT_DIR, "version.txt")

# Color scheme
GRAY = "\033[90m"
PURPLE = "\033[38;5;135m"
LPURPLE = "\033[38;5;141m"
DPURPLE = "\033[38;5;98m"
WHITE = "\033[97m"
RESET = "\033[0m"
BOLD = "\033[1m"

def print_box(title, subtitle=None, width=58):
    print()
    print(f"{GRAY}╔{'═' * width}╗{RESET}")
    print(f"{GRAY}║{RESET}{LPURPLE}{BOLD}{title.center(width)}{RESET}{GRAY}║{RESET}")
    if subtitle:
        print(f"{GRAY}║{RESET}{GRAY}{subtitle.center(width)}{RESET}{GRAY}║{RESET}")
    print(f"{GRAY}╚{'═' * width}╝{RESET}")
    print()

def spin_msg(msg, duration=1.2):
    frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
    end = time.time() + duration
    i = 0
    while time.time() < end:
        sys.stdout.write(
            f"\r{PURPLE}{frames[i % len(frames)]}{RESET} {WHITE}{msg}{RESET}"
        )
        sys.stdout.flush()
        time.sleep(0.08)
        i += 1
    sys.stdout.write("\r" + " " * 80 + "\r")
    sys.stdout.flush()

def success_msg(msg):
    print(f"{LPURPLE}✓{RESET} {WHITE}{msg}{RESET}")

def error_msg(msg):
    print(f"{DPURPLE}✗{RESET} {WHITE}{msg}{RESET}")

def info_msg(msg):
    print(f"{PURPLE}●{RESET} {WHITE}{msg}{RESET}")

def action_msg(msg):
    print(f"{PURPLE}▶{RESET} {WHITE}{msg}{RESET}")

def waiting_box(title="Waiting for Game"):
    width = 58
    print()
    print(f"{GRAY}┌{'─' * width}┐{RESET}")
    print(f"{GRAY}│{RESET}{WHITE}{BOLD}{title.center(width)}{RESET}{GRAY}│{RESET}")
    print(f"{GRAY}└{'─' * width}┘{RESET}")
    print()

def is_process_running(name):
    for proc in psutil.process_iter(['name']):
        try:
            if proc.info['name'].lower() == name.lower():
                return True
        except:
            pass
    return False

def http_get(url, timeout=15):
    req = urllib.request.Request(url, headers={"User-Agent": UPDATE_UA})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()

def parse_version(v):
    parts = []
    for p in str(v).strip().split("."):
        try:
            parts.append(int(p))
        except ValueError:
            break
    return tuple(parts or [0])

def read_local_version():
    try:
        with open(VERSION_FILE, "r", encoding="utf-8") as f:
            return f.read().strip()
    except Exception:
        return VERSION

def get_remote_manifest():
    try:
        data = http_get(UPDATE_MANIFEST_URL)
        return json.loads(data.decode("utf-8"))
    except Exception as e:
        error_msg(f"Update check failed: {e}")
        return None

def apply_update(manifest):
    local_ver = read_local_version()
    remote_ver = str(manifest.get("version", "")).strip()
    if parse_version(remote_ver) <= parse_version(local_ver):
        return False

    files = manifest.get("files", {})
    if not files:
        error_msg("No files in update manifest")
        return False

    info_msg(f"Update {local_ver} -> {remote_ver} available, downloading...")
    staging = os.path.join(SCRIPT_DIR, ".update_staging")
    shutil.rmtree(staging, ignore_errors=True)
    os.makedirs(staging, exist_ok=True)

    downloaded = []
    try:
        for rel, url in files.items():
            rel = rel.replace("\\", "/")
            if rel.startswith("/") or ".." in rel:
                error_msg(f"Skipping unsafe path: {rel}")
                continue
            dest = os.path.join(staging, rel)
            os.makedirs(os.path.dirname(dest) or staging, exist_ok=True)
            try:
                data = http_get(url)
            except Exception as e:
                error_msg(f"Download failed: {rel} ({e})")
                raise
            with open(dest, "wb") as f:
                f.write(data)
            downloaded.append((rel, dest))

        if not downloaded:
            error_msg("Nothing downloaded")
            return False

        for rel, dest in downloaded:
            final = os.path.join(SCRIPT_DIR, rel)
            os.makedirs(os.path.dirname(final) or SCRIPT_DIR, exist_ok=True)
            shutil.move(dest, final)
            success_msg(f"Updated {rel}")

        with open(VERSION_FILE, "w", encoding="utf-8") as f:
            f.write(remote_ver)
        shutil.rmtree(staging, ignore_errors=True)
        success_msg(f"Update complete ({remote_ver})")
        return True
    except Exception as e:
        error_msg(f"Update failed: {e}")
        shutil.rmtree(staging, ignore_errors=True)
        return False

def check_for_update():
    if not UPDATE_MANIFEST_URL or "USERNAME/REPO" in UPDATE_MANIFEST_URL:
        return False
    try:
        manifest = get_remote_manifest()
        if not manifest:
            return False
        return apply_update(manifest)
    except Exception as e:
        error_msg(f"Update check failed: {e}")
        return False

def inject_frida():
    bridge = os.path.join(SCRIPT_DIR, "ac_bridge.js")
    bypass = os.path.join(SCRIPT_DIR, "bypass.js")
    quest = os.path.join(SCRIPT_DIR, "quest.ts")
    try:
        action_msg("Game detected! Injecting bypass...")
        print()
        subprocess.Popen(
            ['cmd', '/k', 'frida', '-l', bridge, '-l', bypass, '-l', quest, 'EACLauncher.exe'],
            creationflags=subprocess.CREATE_NEW_CONSOLE,
            cwd=SCRIPT_DIR
        )
        return True
    except Exception as e:
        error_msg(f"Injection failed: {e}")
        return False

def main():
    try:
        kernel32 = __import__('ctypes').windll.kernel32
        kernel32.SetConsoleMode(kernel32.GetStdHandle(-11), 7)
    except:
        pass

    os.system("cls")

    # Title card
    print_box("ITZDATREES EAC BYPASS", "Animal Company • Frida Injector")

    print(f"{PURPLE}   Version  :{RESET} {VERSION}")
    print(f"{PURPLE}   Dev      :{RESET} ItzDaTree & Theautisticone")
    print(f"{PURPLE}   Status   :{RESET} Ready")
    print()

    # Auto update check
    if check_for_update():
        print()
        action_msg("Restarting with updated files...")
        print()
        os.execv(sys.executable, [sys.executable] + sys.argv)
        sys.exit(0)

    print()

    # Waiting section
    waiting_box("Waiting for Game")

    print(f"{WHITE}Launch Animal Company from Steam...{RESET}")
    print(f"{GRAY}This window will inject automatically.{RESET}")
    print(f"{GRAY}Keep this window open!{RESET}")
    print()

    injected = False
    try:
        while True:
            if not injected and is_process_running("EACLauncher.exe"):
                time.sleep(1)
                if inject_frida():
                    injected = True
                    print()
                    print_box("✓  BYPASS SUCCESSFULLY INJECTED", width=58)
                    print(f"{GRAY}Waiting for the game to close...{RESET}")
                    print()

            if injected and not is_process_running("EACLauncher.exe"):
                print(f"{DPURPLE}Game closed. Exiting...{RESET}")
                print()
                break

            time.sleep(0.5)
    except KeyboardInterrupt:
        print()
        print(f"{DPURPLE}Exiting...{RESET}")
        print()

if __name__ == "__main__":
    main()