"""JARVIS Voice Output — TTS untuk AI Agent.

AI Agent dapat memanggil script ini untuk berbicara lewat speaker:

    python ai/speak.py "Halo, saya Jarvis."
    python ai/speak.py "Halo" --voice id-ID-GadisNeural
    python ai/speak.py "Simpan ini" --save out.mp3   # tanpa playback

Butuh koneksi internet (Microsoft Edge neural voices).
"""

import argparse
import asyncio
import sys
import tempfile
from pathlib import Path

DEFAULT_VOICE = "id-ID-ArdiNeural"  # pria Indonesia; alternatif: id-ID-GadisNeural


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="TTS voice output untuk AI Agent")
    parser.add_argument("text", nargs="*", help="Teks yang akan diucapkan")
    parser.add_argument("--voice", default=DEFAULT_VOICE, help=f"Voice Edge TTS (default: {DEFAULT_VOICE})")
    parser.add_argument("--rate", default="+0%", help="Kecepatan bicara, contoh +10%% atau -20%%")
    parser.add_argument("--volume", default="+0%", help="Volume, contoh +30%% atau -50%%")
    parser.add_argument("--save", metavar="FILE", help="Simpan audio ke file mp3 (tanpa playback)")
    parser.add_argument("--list-voices", action="store_true", help="Daftar voice Indonesia yang tersedia")
    return parser.parse_args()


async def synth(text: str, voice: str, rate: str, volume: str) -> bytes:
    import edge_tts

    communicate = edge_tts.Communicate(text, voice=voice, rate=rate, volume=volume)
    chunks = [chunk["data"] async for chunk in communicate.stream() if chunk["type"] == "audio"]
    if not chunks:
        raise RuntimeError("Tidak ada audio dihasilkan dari TTS provider")
    return b"".join(chunks)


def play_mp3(path: Path) -> None:
    import time

    import miniaudio

    decoded = miniaudio.decode_file(str(path))
    duration = getattr(decoded, "duration", None) or (
        decoded.num_frames / decoded.sample_rate
    )

    def sound_gen():
        yield decoded.samples

    gen = sound_gen()
    next(gen)  # prime generator sebelum audio callback

    with miniaudio.PlaybackDevice() as device:
        device.start(gen)
        time.sleep(duration + 0.25)


def main() -> int:
    args = parse_args()

    try:
        if args.list_voices:
            import edge_tts

            voices = asyncio.run(edge_tts.list_voices())
            indo = [
                f"{v['ShortName']:28s} {v['Gender']}"
                for v in voices
                if v["Locale"].startswith("id-")
            ]
            print("\n".join(indo))
            return 0

        text = " ".join(args.text).strip()
        if not text and not sys.stdin.isatty():
            text = sys.stdin.read().strip()
        if not text:
            print("Usage: python ai/speak.py \"teks\"", file=sys.stderr)
            return 1

        audio = asyncio.run(synth(text, args.voice, args.rate, args.volume))

        if args.save:
            Path(args.save).write_bytes(audio)
            print(f"Saved: {args.save} ({len(audio)} bytes)")
            return 0

        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
            tmp.write(audio)
            tmp_path = Path(tmp.name)

        try:
            play_mp3(tmp_path)
        finally:
            tmp_path.unlink(missing_ok=True)

        return 0
    except KeyboardInterrupt:
        return 130
    except Exception as exc:  # noqa: BLE001 - CLI boundary
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
