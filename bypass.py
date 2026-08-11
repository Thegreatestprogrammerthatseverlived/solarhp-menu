import os
import sys
import time
import subprocess

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

def main():
    try:
        kernel32 = __import__('ctypes').windll.kernel32
        kernel32.SetConsoleMode(kernel32.GetStdHandle(-11), 7)
    except:
        pass

    os.system("cls")

    # Title card
    print_box("ITZDATREES EAC BYPASS", "Animal Company • Frida Injector")

    print(f"{PURPLE}   Version  :{RESET} 1.5.1.0")
    print(f"{PURPLE}   Dev      :{RESET} ItzDaTree")
    print(f"{PURPLE}   Status   :{RESET} Ready")
    print()

    # Manual rename notice
    print(f"{LPURPLE}⚠{RESET}  {WHITE}Rename the files first before launching!{RESET}")
    print(f"{GRAY}   If you need help go to:{RESET}")
    print(f"{PURPLE}   https://itzdatreesmenu.lovable.app{RESET}")
    print(f"{GRAY}   and open the {WHITE}Rename{GRAY} tab.{RESET}")
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