import http.server
from pathlib import Path
import socket
import struct
import subprocess
import threading
import unittest


class ReadinessTest(unittest.TestCase):
    def test_connection_reset_during_startup_is_retried(self):
        requests = []

        class Handler(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                requests.append("GET")
                if len(requests) == 1:
                    self.connection.setsockopt(socket.SOL_SOCKET, socket.SO_LINGER, struct.pack("ii", 1, 0))
                    self.connection.close()
                    return
                self.send_response(200)
                self.end_headers()

            def do_POST(self):
                requests.append("POST")
                self.send_response(200)
                self.end_headers()

            def log_message(self, *args):
                pass

        server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        script = (Path(__file__).parents[1] / "deploy/deploy-container.sh").read_text()
        verify = "verify_container() {" + script.split("verify_container() {", 1)[1].split("\n}", 1)[0] + "\n}"
        address = f"127.0.0.1:{server.server_port}"
        try:
            result = subprocess.run(["bash", "-c", f'{verify}\nLISTEN_ADDR={address}\nAPP_ORIGIN=http://{address}\nverify_container'], capture_output=True, text=True, timeout=15)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(requests, ["GET", "GET", "POST"])
        finally:
            server.shutdown()
            server.server_close()


if __name__ == "__main__":
    unittest.main()
