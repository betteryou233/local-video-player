"""Start the portable player using an optional video-directory.txt setting."""
from pathlib import Path
import sys

BASE = Path(__file__).resolve().parent


def main():
    config = BASE / 'video-directory.txt'
    value = config.read_text(encoding='utf-8-sig').strip() if config.exists() else 'videos'
    folder = Path(value or 'videos').expanduser()
    if not folder.is_absolute():
        folder = BASE / folder
    folder = folder.resolve()
    if not folder.is_dir():
        raise RuntimeError('Video folder not found. Check video-directory.txt. / 视频目录不存在，请检查配置文件。')
    sys.path.insert(0, str(BASE / 'player'))
    import server
    show_browser = '--open' in sys.argv
    sys.argv = [str(BASE / 'player/server.py'), '--root', str(folder), '--port', '18768']
    if show_browser:
        sys.argv.append('--open')
    server.main()


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        message = str(error) + '\nRun Stop Player.cmd before changing folders and restarting.'
        if sys.platform == 'win32':
            import ctypes
            ctypes.windll.user32.MessageBoxW(0, message, 'Local Video Player', 16)
        else:
            print(message, file=sys.stderr)
        sys.exit(1)
