import http.client
import http.server
import mimetypes
import os
import socket
import ssl
import urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB_ROOT = os.path.join(ROOT, "dist-web")
DESIGN_ROOT = os.path.join(ROOT, "storage", "designs")
LOG_ROOT = os.path.join(ROOT, "logs")
ACCESS_LOG = os.path.join(LOG_ROOT, "https-access.log")
API_HOST = os.environ.get("ROOMMUSE_API_HOST", "127.0.0.1")
API_PORT = int(os.environ.get("ROOMMUSE_API_PORT", "3201"))
HTTPS_PORT = int(os.environ.get("ROOMMUSE_HTTPS_PORT", "8443"))
os.makedirs(DESIGN_ROOT, exist_ok=True)
os.makedirs(LOG_ROOT, exist_ok=True)
os.chdir(WEB_ROOT)


def detect_lan_ip():
    override = os.environ.get("ROOMMUSE_HTTPS_HOST")
    if override:
        return override
    probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        probe.connect(("8.8.8.8", 80))
        return probe.getsockname()[0]
    except OSError:
        return "localhost"
    finally:
        probe.close()


class RoomMuseHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        line = "%s %s\n" % (self.log_date_time_string(), format % args)
        with open(ACCESS_LOG, "a", encoding="utf-8") as log_file:
            log_file.write(line)
        super().log_message(format, *args)
    def do_GET(self):
        if self.path.startswith("/designs/"):
            name = os.path.basename(urllib.parse.unquote(self.path.split("?", 1)[0]))
            path = os.path.join(DESIGN_ROOT, name)
            if not os.path.isfile(path):
                self.send_error(404)
                return
            with open(path, "rb") as image_file:
                payload = image_file.read()
            self.send_response(200)
            self.send_header("Content-Type", mimetypes.guess_type(path)[0] or "application/octet-stream")
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("Cache-Control", "private, max-age=86400")
            self.end_headers()
            self.wfile.write(payload)
            return
        super().do_GET()

    def do_POST(self):
        if self.path != "/api/design":
            self.send_error(404)
            return

        length = int(self.headers.get("Content-Length", "0"))
        if length > 50_000_000:
            payload = b'{"error":"The room scan is too large. Retake it and try again."}'
            self.send_response(413)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        body = self.rfile.read(length)
        connection = http.client.HTTPConnection(API_HOST, API_PORT, timeout=300)
        try:
            connection.request("POST", "/api/design", body=body, headers={"Content-Type": "application/json"})
            response = connection.getresponse()
            payload = response.read()
            self.send_response(response.status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
        except (ConnectionError, TimeoutError, OSError) as error:
            payload = ('{"error":"RoomMuse AI studio is not running: %s"}' % str(error)).encode("utf-8")
            self.send_response(503)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
        finally:
            connection.close()


server = http.server.ThreadingHTTPServer(("0.0.0.0", HTTPS_PORT), RoomMuseHandler)
context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
context.load_cert_chain(
    os.path.join(ROOT, ".certs", "server.crt"),
    os.path.join(ROOT, ".certs", "server.key"),
)
server.socket = context.wrap_socket(server.socket, server_side=True)
print(f"RoomMuse HTTPS server: https://{detect_lan_ip()}:{HTTPS_PORT}", flush=True)
server.serve_forever()
