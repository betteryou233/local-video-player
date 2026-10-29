"""Build a video-free Windows x64 archive from an explicit source allowlist."""
import argparse
import hashlib
import json
from pathlib import Path
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
VERSION = '1.0.0'
RUNTIME_VERSION = '3.14.10'
RUNTIME_SHA256 = '90905e64a840557d8c1bc4f5b74db3d7ee85e3ffb217611cac1c7813acea4159'
RUNTIME_URL = f'https://www.python.org/ftp/python/{RUNTIME_VERSION}/python-{RUNTIME_VERSION}-embed-amd64.zip'
SOURCE_FILES = (
    'launch.py', 'Start Player.cmd', 'Stop Player.cmd', 'stop.ps1',
    'README.md', 'README.en.md', 'LICENSE', 'player/server.py',
    'player/web/index.html', 'player/web/app.js', 'player/web/style.css', 'player/web/icon.svg',
)


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def build(runtime_zip=None, output=None):
    output = Path(output) if output else ROOT / 'dist'
    output.mkdir(parents=True, exist_ok=True)
    archive_path = output / f'local-video-player-v{VERSION}-windows-x64.zip'
    if archive_path.exists():
        raise FileExistsError(f'Refusing to replace existing release: {archive_path.name}')
    if runtime_zip:
        runtime_data = Path(runtime_zip).read_bytes()
    else:
        with urllib.request.urlopen(RUNTIME_URL, timeout=120) as response:
            runtime_data = response.read()
    if sha256(runtime_data) != RUNTIME_SHA256:
        raise ValueError('Embedded runtime checksum mismatch; build aborted.')
    import io
    prefix = 'local-video-player/'
    with zipfile.ZipFile(io.BytesIO(runtime_data)) as runtime:
        for item in runtime.infolist():
            path = Path(item.filename)
            if path.is_absolute() or '..' in path.parts or ':' in item.filename:
                raise ValueError('Unsafe runtime archive entry')
        with zipfile.ZipFile(archive_path, 'x', compression=zipfile.ZIP_DEFLATED) as out:
            for name in SOURCE_FILES:
                data = (ROOT / name).read_bytes()
                if name.endswith(('.cmd', '.ps1')):
                    data = data.replace(b'\r\n', b'\n').replace(b'\n', b'\r\n')
                out.writestr(prefix + name, data)
            out.writestr(prefix + 'video-directory.txt', b'videos\r\n')
            out.writestr(prefix + 'videos/', b'')
            for item in runtime.infolist():
                out.writestr(prefix + 'runtime/' + item.filename, runtime.read(item.filename))
            out.writestr(prefix + 'THIRD_PARTY_NOTICES.txt',
                         f'Embedded runtime: Python {RUNTIME_VERSION}\nSource: {RUNTIME_URL}\n'
                         f'SHA-256: {RUNTIME_SHA256}\nLicense: runtime/LICENSE.txt\n')
    with zipfile.ZipFile(archive_path) as check:
        if check.testzip() is not None:
            raise ValueError('Release archive integrity check failed')
    digest = sha256(archive_path.read_bytes())
    checksum = archive_path.with_suffix('.zip.sha256')
    checksum.write_text(f'{digest}  {archive_path.name}\n', encoding='ascii')
    return {'file': archive_path.name, 'bytes': archive_path.stat().st_size, 'sha256': digest}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime-zip', type=Path)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    print(json.dumps(build(args.runtime_zip, args.output), indent=2))
