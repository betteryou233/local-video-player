import http.client
import importlib.util
from pathlib import Path
import tempfile
import threading
import unittest

SOURCE = Path(__file__).resolve().parents[1] / 'player' / 'server.py'


class PlayerTests(unittest.TestCase):
    def setUp(self):
        self.assertTrue(SOURCE.exists(), '需要实现本地视频服务')
        spec = importlib.util.spec_from_file_location('player_server', SOURCE)
        self.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.module)
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        for name in ['10-课/章节10/10：中文 # 视频.mp4', '2-课/章节2/10：后.mp4',
                     '2-课/章节2/2：前.mp4', '2-课/章节10/1：结尾.mp4']:
            target = self.root / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(b'0123456789')
        (self.root / 'private.txt').write_text('not a video')
        self.server = self.module.make_server(self.root, port=0)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)

    def request(self, path, headers=None, method='GET'):
        conn = http.client.HTTPConnection('127.0.0.1', self.server.server_port)
        conn.request(method, path, headers=headers or {})
        response = conn.getresponse()
        result = response.status, dict(response.getheaders()), response.read()
        conn.close()
        return result

    def media(self):
        return '/media/' + self.server.library['courses'][0]['chapters'][0]['videos'][0]['id']

    def test_catalog_natural_order_and_chapters(self):
        library = self.server.library
        self.assertEqual(library['videoCount'], 4)
        self.assertEqual([x['title'] for x in library['courses']], ['2-课', '10-课'])
        chapters = library['courses'][0]['chapters']
        self.assertEqual([x['title'] for x in chapters], ['章节2', '章节10'])
        self.assertEqual([x['title'] for x in chapters[0]['videos']], ['2：前', '10：后'])

    def test_range_requests_for_seeking(self):
        for header, expected in [('bytes=2-5', b'2345'), ('bytes=7-', b'789'), ('bytes=-3', b'789')]:
            status, headers, data = self.request(self.media(), {'Range': header})
            self.assertEqual(status, 206)
            self.assertEqual(data, expected)
            self.assertEqual(int(headers['Content-Length']), len(expected))
            self.assertEqual(headers['Accept-Ranges'], 'bytes')

    def test_invalid_ranges(self):
        for header in ['bytes=50-', 'bytes=8-3', 'bytes=-0', 'bytes=oops', 'bytes=1-2,4-5']:
            status, headers, _ = self.request(self.media(), {'Range': header})
            self.assertEqual(status, 416)
            self.assertEqual(headers['Content-Range'], 'bytes */10')

    def test_head_and_full_media(self):
        self.assertEqual(self.request(self.media())[2], b'0123456789')
        status, headers, data = self.request(self.media(), method='HEAD')
        self.assertEqual(status, 200)
        self.assertEqual(headers['Content-Length'], '10')
        self.assertEqual(data, b'')

    def test_private_files_and_traversal_are_not_served(self):
        for path in ['/private.txt', '/../server.py', '/media/../../private.txt', '/media/unknown']:
            self.assertEqual(self.request(path)[0], 404)

    def test_stable_ids_and_refresh(self):
        original = self.media()
        self.request('/api/library?refresh=1')
        self.assertEqual(original, self.media())


if __name__ == '__main__':
    unittest.main()
