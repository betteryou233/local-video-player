"""Local course player. Python standard library only; videos are read-only."""
import argparse
import hashlib
import json
import mimetypes
import os
from pathlib import Path
import re
import threading
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit, parse_qs

APP = Path(__file__).resolve().parent
DEFAULT_ROOT = APP.parent / 'videos'
PORT = 18768
IDENTITY = 'portable-video-player-v1'
EXTENSIONS = {'.mp4', '.webm', '.m4v', '.mov', '.mkv', '.ogg'}


def natural_key(value):
    return [int(p) if p.isdigit() else p.casefold() for p in re.split(r'(\d+)', str(value))]


def stable_id(value):
    return hashlib.sha256(value.encode('utf-8')).hexdigest()[:24]


def display_title(value):
    return value.strip()


def scan_library(root):
    root = root.resolve()
    groups, paths = {}, {}
    library_root = root
    sources = [root]
    candidates = (p for source in sources if source.is_dir() for p in source.rglob('*'))
    for path in sorted(candidates, key=lambda p: natural_key(p.relative_to(root).as_posix())):
        if path.suffix.lower() not in EXTENSIONS or not path.is_file():
            continue
        resolved = path.resolve()
        if not resolved.is_relative_to(root):
            continue
        # IDs are relative to the course library, not its physical container.
        # This preserves existing browser progress after the folders are grouped.
        relative = path.relative_to(library_root)
        parts = relative.parts
        course = parts[0] if len(parts) > 1 else '其他课程'
        chapter = '/'.join(parts[1:-1]) if len(parts) > 2 else '课程视频'
        key = stable_id(relative.as_posix())
        video = {'id': key, 'title': display_title(path.stem), 'file': path.relative_to(root).as_posix(),
                 'size': path.stat().st_size}
        groups.setdefault(course, {}).setdefault(chapter, []).append(video)
        paths[key] = resolved
    courses = []
    for name, chapters in groups.items():
        courses.append({'id': stable_id(name), 'title': name,
                        'chapters': [{'id': stable_id(name + '/' + title), 'title': title,
                                      'videos': videos} for title, videos in chapters.items()]})
    return {'courses': courses, 'videoCount': len(paths),
            'chapterCount': sum(len(c['chapters']) for c in courses)}, paths


class PlayerServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, root, port):
        self.root = Path(root).resolve()
        self.scan_lock = threading.Lock()
        self.refresh()
        super().__init__(('127.0.0.1', port), Handler)

    def refresh(self):
        with self.scan_lock:
            self.library, self.media_paths = scan_library(self.root)


class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def log_message(self, *args):
        pass

    def do_HEAD(self):
        self.do_GET()

    def headers_for(self, status, length, content_type, extra=None):
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(length))
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Cache-Control', 'no-cache')
        for name, value in (extra or {}).items():
            self.send_header(name, value)
        self.end_headers()

    def payload(self, data, content_type='application/json; charset=utf-8', status=200):
        if not isinstance(data, bytes):
            data = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.headers_for(status, len(data), content_type)
        if self.command != 'HEAD':
            self.wfile.write(data)

    def do_GET(self):
        try:
            self.route()
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass  # Browser cancels reads when seeking or switching lessons.
        except OSError:
            self.close_connection = True

    def route(self):
        host = self.headers.get('Host', '').split(':')[0]
        if host not in ('127.0.0.1', 'localhost'):
            self.payload({'error': 'Local requests only'}, status=403)
            return
        url = urlsplit(self.path)
        if url.path == '/api/health':
            self.payload({'app': IDENTITY, 'rootId': stable_id(str(self.server.root))})
        elif url.path == '/api/library':
            if parse_qs(url.query).get('refresh') == ['1']:
                self.server.refresh()
            self.payload(self.server.library)
        elif url.path.startswith('/media/'):
            key = url.path[len('/media/'):]
            path = self.server.media_paths.get(key)
            if path and path.is_file() and path.resolve().is_relative_to(self.server.root):
                self.send_media(path)
            else:
                self.payload({'error': '视频已移动或不存在，请刷新目录'}, status=404)
        else:
            files = {'/': 'index.html', '/app.js': 'app.js', '/style.css': 'style.css', '/icon.svg': 'icon.svg'}
            name = files.get(url.path)
            if name and (APP / 'web' / name).is_file():
                mime = {'html': 'text/html', 'js': 'text/javascript', 'css': 'text/css', 'svg': 'image/svg+xml'}[name.rsplit('.', 1)[1]]
                self.payload((APP / 'web' / name).read_bytes(), mime + '; charset=utf-8')
            else:
                self.payload({'error': 'Not found'}, status=404)

    def send_media(self, path):
        with path.open('rb') as source:
            size = os.fstat(source.fileno()).st_size
            start, end, status = 0, size - 1, 200
            range_header = self.headers.get('Range')
            if range_header:
                match = re.fullmatch(r'bytes=(\d*)-(\d*)', range_header.strip())
                valid = match and any(match.groups()) and size > 0
                if valid:
                    first, last = match.groups()
                    if first:
                        start = int(first)
                        end = min(int(last), size - 1) if last else size - 1
                    else:
                        start = max(0, size - int(last))
                    valid = 0 <= start <= end < size
                if not valid:
                    self.headers_for(416, 0, 'video/mp4', {'Content-Range': f'bytes */{size}'})
                    return
                status = 206
            extra = {'Accept-Ranges': 'bytes'}
            if status == 206:
                extra['Content-Range'] = f'bytes {start}-{end}/{size}'
            length = max(0, end - start + 1)
            self.headers_for(status, length, mimetypes.guess_type(path.name)[0] or 'video/mp4', extra)
            if self.command == 'HEAD':
                return
            source.seek(start)
            remaining = length
            while remaining:
                block = source.read(min(256 * 1024, remaining))
                if not block:
                    break
                self.wfile.write(block)
                remaining -= len(block)


def make_server(root=DEFAULT_ROOT, port=PORT):
    return PlayerServer(root, port)


def open_browser(url):
    import webbrowser
    webbrowser.open(url)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=PORT)
    parser.add_argument('--root', type=Path, default=DEFAULT_ROOT)
    parser.add_argument('--open', action='store_true')
    args = parser.parse_args()
    url = f'http://127.0.0.1:{args.port}'
    try:
        with urllib.request.urlopen(url + '/api/health', timeout=1) as response:
            existing = json.load(response)
        if existing.get('app') == IDENTITY and existing.get('rootId') == stable_id(str(args.root.resolve())):
            if args.open:
                open_browser(url)
            return
    except (OSError, ValueError):
        pass
    if not args.root.is_dir():
        raise RuntimeError('找不到配置的视频目录，请检查video-directory.txt。')
    server = make_server(args.root, args.port)
    if args.open:
        threading.Timer(0.3, open_browser, args=(url,)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        message = '课程播放器启动失败：' + str(error) + '\n如果端口被占用，请关闭该播放器的旧服务后重试。'
        if os.name == 'nt':
            import ctypes
            ctypes.windll.user32.MessageBoxW(0, message, '课程播放器', 16)
        else:
            raise
