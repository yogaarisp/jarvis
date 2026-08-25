"""JARVIS Voice Clone — TTS dengan cloning suara dari file referensi (gratis & offline).

Model: XTTS v2 (Coqui) berjalan di GPU lokal (RTX 3050).
Referensi suara default: ai/voice-previews/5-jarvis.mp3

Pemakaian:
    python ai/speak_clone.py "Good morning, Keenan."
    python ai/speak_clone.py "Halo" --language id
    python ai/speak_clone.py "Teks" --ref other.mp3 --save out.wav

Catatan: bahasa Indonesia bukan bahasa resmi XTTS v2 — hasil bisa beraksen.
Bahasa resmi: en es fr de it pt pl tr ru nl cs ar zh-cn hu ko ja hi.
"""

import argparse
import os
import sys
import tempfile
from pathlib import Path

# Simpan model & cache di dalam proyek (hindari AppData yang dibatasi sandbox)
_PROJECT_AI = Path(__file__).resolve().parent
os.environ.setdefault("TTS_HOME", str(_PROJECT_AI / ".models"))
os.environ.setdefault("MPLCONFIGDIR", str(_PROJECT_AI / ".cache" / "mpl"))
os.environ.setdefault("CUDA_CACHE_PATH", str(_PROJECT_AI / ".cache" / "cuda"))
os.environ.setdefault("COQUI_TOS_AGREED", "1")

DEFAULT_REF = _PROJECT_AI / "voice-previews" / "5-jarvis.mp3"
MODEL = "tts_models/multilingual/multi-dataset/xtts_v2"
SUPPORTED_LANGS = (
    "en es fr de it pt pl tr ru nl cs ar zh-cn hu ko ja hi".split()
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="TTS voice clone JARVIS")
    parser.add_argument("text", nargs="*", help="Teks yang akan diucapkan")
    parser.add_argument("--ref", default=str(DEFAULT_REF), help="File audio referensi suara")
    parser.add_argument(
        "--language",
        default="en",
        help=f"Kode bahasa teks (default: en). Didukung: {' '.join(SUPPORTED_LANGS)}",
    )
    parser.add_argument("--save", metavar="FILE", help="Simpan ke file wav (tanpa playback)")
    return parser.parse_args()


def synthesize(text: str, ref: str, language: str) -> Path:
    from TTS.api import TTS

    import torch

    device = "cuda" if torch.cuda.is_available() else "cpu"
    tts = TTS(MODEL).to(device)

    out_path = Path(tempfile.gettempdir()) / f"jarvis_clone_{os.getpid()}.wav"
    tts.tts_to_file(
        text=text,
        speaker_wav=ref,
        language=language,
        file_path=str(out_path),
        split_sentences=True,
    )
    return out_path


def play_wav(path: Path) -> None:
    """Putar wav via miniaudio; jika gagal, buka lewat player default OS."""
    import time

    try:
        import miniaudio
    except Exception:
        miniaudio = None

    if miniaudio is not None:
        try:
            decoded = miniaudio.decode_file(str(path))
            duration = decoded.duration

            def sound_gen():
                yield decoded.samples

            gen = sound_gen()
            next(gen)  # prime generator sebelum audio callback

            with miniaudio.PlaybackDevice() as device:
                device.start(gen)
                time.sleep(duration + 0.25)
            return
        except Exception as exc:  # noqa: BLE001 - fallback ke player OS
            print(f"Playback miniaudio gagal ({exc}); membuka player default...",
                  file=sys.stderr)

    os.startfile(str(path))  # noqa: S606 - Windows shell open
    time.sleep(1.0)


def main() -> int:
    os.environ.setdefault("COQUI_TOS_AGREED", "1")
    args = parse_args()

    try:
        text = " ".join(args.text).strip()
        if not text and not sys.stdin.isatty():
            text = sys.stdin.read().strip()
        if not text:
            print("Usage: python ai/speak_clone.py \"teks\"", file=sys.stderr)
            return 1

        if args.language not in SUPPORTED_LANGS:
            print(f"Bahasa '{args.language}' tidak didukung XTTS v2.", file=sys.stderr)
            return 1

        ref = Path(args.ref)
        if not ref.is_file():
            print(f"File referensi tidak ada: {ref}", file=sys.stderr)
            return 1

        out_path = synthesize(text, str(ref), args.language)

        if args.save:
            Path(args.save).write_bytes(out_path.read_bytes())
            print(f"Saved: {args.save}")
            out_path.unlink(missing_ok=True)
            return 0

        try:
            play_wav(out_path)
        finally:
            out_path.unlink(missing_ok=True)

        return 0
    except KeyboardInterrupt:
        return 130
    except Exception as exc:  # noqa: BLE001 - CLI boundary
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
