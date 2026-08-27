"""JARVIS XTTS Server — voice cloning persisten (model dimuat SEKALI di memori).

Masalah yang diselesaikan: speak_clone.py per-request memuat ulang model ~2GB
(±45 detik per kalimat) dan sering gagal WinError 10106 saat di-spawn dari PHP.
Dengan server ini model tinggal warm di GPU/RAM → sintesis ±3-5 detik.

Endpoint:
    GET /health                          -> {"ok":true,"device":"cuda","model":"..."}
    GET /tts?text=...&language=en        -> audio/wav (binary)

Jalankan:
    ai\\start_xtts_server.bat
    (atau) ai\\venv\\Scripts\\python.exe ai\\xtts_server.py
"""

import os
import sys
import tempfile
import threading
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

# Simpan model & cache di dalam proyek (hindari AppData yang dibatasi sandbox)
_PROJECT_AI = Path(__file__).resolve().parent
os.environ.setdefault("TTS_HOME", str(_PROJECT_AI / ".models"))
os.environ.setdefault("MPLCONFIGDIR", str(_PROJECT_AI / ".cache" / "mpl"))
os.environ.setdefault("CUDA_CACHE_PATH", str(_PROJECT_AI / ".cache" / "cuda"))
os.environ.setdefault("COQUI_TOS_AGREED", "1")

HOST = "127.0.0.1"
PORT = 8012
DEFAULT_REF = _PROJECT_AI / "voice-previews" / "5-jarvis.mp3"
MODEL = "tts_models/multilingual/multi-dataset/xtts_v2"
SUPPORTED_LANGS = (
    "en es fr de it pt pl tr ru nl cs ar zh-cn hu ko ja hi".split()
)

_lock = threading.Lock()  # GPU tidak aman untuk sintesis paralel
_tts = None
_device = "cpu"


def load_model() -> None:
    global _tts, _device
    import torch
    from TTS.api import TTS

    _device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"[xtts] Memuat {MODEL} ke {_device} ...", flush=True)
    _tts = TTS(MODEL).to(_device)
    print("[xtts] Model siap.", flush=True)


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    # Redam log request default agar konsol bersih
    def log_message(self, fmt, *args):  # noqa: A003
        pass

    def _send_json(self, code: int, payload: dict) -> None:
        import json

        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):  # noqa: N802 - nama API stdlib
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)

        if parsed.path == "/health":
            self._send_json(200, {
                "ok": _tts is not None,
                "device": _device,
                "model": MODEL,
            })
            return

        if parsed.path != "/tts":
            self._send_json(404, {"ok": False, "message": "Endpoint tidak dikenal."})
            return

        text = (params.get("text", [""])[0] or "").strip()
        language = (params.get("language", ["en"])[0] or "en").strip().lower()
        ref = params.get("ref", [str(DEFAULT_REF)])[0]

        if not text:
            self._send_json(422, {"ok": False, "message": "Parameter text kosong."})
            return
        if language not in SUPPORTED_LANGS:
            language = "en"
        if not Path(ref).is_file():
            self._send_json(500, {"ok": False, "message": f"Referensi tidak ada: {ref}"})
            return

        try:
            wav_bytes = synthesize(text, ref, language)
        except Exception as exc:  # noqa: BLE001 - boundary server
            print(f"[xtts] ERROR: {exc}", file=sys.stderr, flush=True)
            self._send_json(502, {"ok": False, "message": f"XTTS gagal: {exc}"})
            return

        self.send_response(200)
        self.send_header("Content-Type", "audio/wav")
        self.send_header("Content-Length", str(len(wav_bytes)))
        self.end_headers()
        self.wfile.write(wav_bytes)


def synthesize(text: str, ref: str, language: str) -> bytes:
    """Sintesis teks → WAV bytes via XTTS v2.

    Preprocessing dilakukan di sini agar suara lebih natural:
    - Kalimat dipecah per titik/koma untuk split_sentences yang lebih akurat.
    - Tanda baca berlebih dirapikan.
    - Tambah sedikit jeda (koma) setelah sapaan agar tidak kecebutan.
    """
    import re

    # Bersihkan token AI: [1], <think>, dst.
    text = re.sub(r'\[\d+\]', '', text)
    text = re.sub(r'</?think[^>]*>', ' ', text, flags=re.IGNORECASE)

    # Markdown → teks biasa
    text = re.sub(r'\*\*([^*]+)\*\*', r'\1', text)
    text = re.sub(r'\*([^*]+)\*', r'\1', text)
    text = re.sub(r'`([^`]+)`', r'\1', text)
    text = re.sub(r'#{1,6}\s+', '', text)

    # Tanda baca yang bikin robot: titik dua, em-dash, tanda kurung
    text = re.sub(r':\s*', ', ', text)
    text = re.sub(r';\s*', ', ', text)
    text = re.sub(r'\s*[—–]\s*', ', ', text)
    text = re.sub(r'[()[\]{}]', '', text)

    # Bersihkan tanda baca ganda
    text = re.sub(r'([.,!?]){2,}', r'\1', text)
    text = re.sub(r',\s*([.!?])', r'\1', text)
    text = re.sub(r'\s+([.,!?])', r'\1', text)
    text = re.sub(r'\s+', ' ', text).strip()

    if not text:
        raise ValueError("Teks kosong setelah preprocessing.")

    out_path = Path(tempfile.gettempdir()) / f"xtts_server_{os.getpid()}.wav"
    with _lock:  # antre agar GPU tidak dipakai bersamaan
        _tts.tts_to_file(
            text=text,
            speaker_wav=ref,
            language=language,
            file_path=str(out_path),
            split_sentences=True,
        )
    data = out_path.read_bytes()
    out_path.unlink(missing_ok=True)
    return data


if __name__ == "__main__":
    load_model()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"[xtts] Server berjalan di http://{HOST}:{PORT}  (Ctrl+C untuk berhenti)", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("[xtts] Dihentikan.", flush=True)
