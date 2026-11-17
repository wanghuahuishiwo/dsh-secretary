import importlib.util
import socket
import socketserver
import threading
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).with_name("gh-with-proxy-fallback.py")
SPEC = importlib.util.spec_from_file_location("gh_proxy_fallback", MODULE_PATH)
assert SPEC and SPEC.loader
gh_proxy_fallback = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(gh_proxy_fallback)


class _AcceptHandler(socketserver.BaseRequestHandler):
    def handle(self):
        self.request.recv(1)


class _Server(socketserver.TCPServer):
    allow_reuse_address = True


class ProxyEnvironmentTests(unittest.TestCase):
    def test_no_proxy_preserves_environment(self):
        env = {"PATH": "/bin"}
        actual, warning = gh_proxy_fallback.prepare_environment(env)
        self.assertEqual(actual, env)
        self.assertIsNone(warning)

    def test_unreachable_loopback_proxy_enables_direct_connection(self):
        probe = socket.socket()
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
        probe.close()
        url = f"http://127.0.0.1:{port}"
        env = {
            "PATH": "/bin",
            "http_proxy": url,
            "https_proxy": url,
            "all_proxy": url,
            "HTTP_PROXY": url,
            "HTTPS_PROXY": url,
            "ALL_PROXY": url,
        }
        actual, warning = gh_proxy_fallback.prepare_environment(env)
        self.assertEqual(actual, {"PATH": "/bin"})
        self.assertIn("direct connection", warning)

    def test_reachable_loopback_proxy_is_preserved(self):
        server = _Server(("127.0.0.1", 0), _AcceptHandler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            url = f"http://127.0.0.1:{server.server_address[1]}"
            env = {"https_proxy": url, "PATH": "/bin"}
            actual, warning = gh_proxy_fallback.prepare_environment(env)
            self.assertEqual(actual, env)
            self.assertIsNone(warning)
        finally:
            server.shutdown()
            server.server_close()
            thread.join()

    def test_unreachable_non_loopback_proxy_is_not_bypassed(self):
        env = {"https_proxy": "http://192.0.2.10:8080", "PATH": "/bin"}
        actual, warning = gh_proxy_fallback.prepare_environment(
            env, probe=lambda host, port: False
        )
        self.assertEqual(actual, env)
        self.assertIsNone(warning)


if __name__ == "__main__":
    unittest.main()
