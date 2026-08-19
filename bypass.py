import os
import sys
import time
import subprocess
import shutil

try:
    import psutil
except ImportError:
    print("Installing psutil...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "psutil"])
    import psutil

GAME_DIR = r"C:\Program Files (x86)\Steam\steamapps\common\Animal Company"
SCRIPT_DIR = os.path.dirname(os.path.abspath(sys.argv[0]))

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

def remove_path(path):
    if os.path.isdir(path):
        shutil.rmtree(path)
    else:
        os.remove(path)

def rename_pair(src, dst):
    if os.path.exists(dst):
        if os.path.exists(src):
            try:
                remove_path(dst)
                success_msg(f"Deleted {os.path.basename(dst)}")
                os.rename(src, dst)
                success_msg(f"Renamed {os.path.basename(src)} -> {os.path.basename(dst)}")
                return True
            except OSError as e:
                error_msg(f"Could not refresh {os.path.basename(dst)}: {e}")
                return False
        success_msg(f"{os.path.basename(dst)} already in place")
        return True
    if os.path.exists(src):
        try:
            os.rename(src, dst)
            success_msg(f"Renamed {os.path.basename(src)} -> {os.path.basename(dst)}")
            return True
        except OSError as e:
            error_msg(f"Could not rename {os.path.basename(src)}: {e}")
            return False
    error_msg(f"Neither {os.path.basename(src)} nor {os.path.basename(dst)} found.")
    return False

def ensure_game_renamed():
    ac_exe = os.path.join(GAME_DIR, "AnimalCompany.exe")
    eac_exe = os.path.join(GAME_DIR, "EACLauncher.exe")
    ac_data = os.path.join(GAME_DIR, "AnimalCompany_data")
    eac_data = os.path.join(GAME_DIR, "EACLauncher_data")

    if not os.path.isdir(GAME_DIR):
        error_msg(f"Game directory not found: {GAME_DIR}")
        info_msg("Edit GAME_DIR at the top of bypass.py if your install is elsewhere.")
        return False

    if is_process_running("AnimalCompany.exe") or is_process_running("EACLauncher.exe"):
        error_msg("Close the game before renaming files.")
        return False

    # Already renamed only when the AnimalCompany sources are gone.
    if not os.path.exists(ac_exe) and not os.path.exists(ac_data):
        success_msg("Files already renamed. Skipping.")
        return True

    action_msg("Checking game files...")
    ok = rename_pair(ac_exe, eac_exe)
    ok = rename_pair(ac_data, eac_data) and ok
    return ok

def main():
    try:
        kernel32 = __import__('ctypes').windll.kernel32
        kernel32.SetConsoleMode(kernel32.GetStdHandle(-11), 7)
    except:
        pass

    os.system("cls")

    # Title card
    print_box("ITZDATREES EAC BYPASS", "Animal Company • Frida Injector")

    print(f"{PURPLE}   Version  :{RESET} 1.5.3.2")
    print(f"{PURPLE}   Dev      :{RESET} ItzDaTree & Theautisticone")
    print(f"{PURPLE}   Status   :{RESET} Ready")
    print()

    # Auto-rename check (runs the moment the script starts)
    if not ensure_game_renamed():
        print()
        error_msg("Fix the issue above, then run this again.")
        print()
        input("Press Enter to exit...")
        return

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
    try:
        main()
    except Exception as e:
        print()
        print(f"Unexpected error: {e}")
        input("Press Enter to exit...")
