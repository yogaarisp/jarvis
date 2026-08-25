<?php

namespace App\Http\Controllers\Api;

use Afaya\EdgeTTS\Service\EdgeTTS;
use App\Http\Controllers\Controller;
use App\Services\ElevenLabsTtsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * TTS neural sisi server (PRD §7).
 *
 * Engine:
 * - ElevenLabs : suara JARVIS hasil cloning/komunitas (butuh ELEVENLABS_API_KEY).
 * - Edge TTS   : gratis tanpa API key (en-GB-RyanNeural ala JARVIS).
 *
 * engine 'auto' memakai ElevenLabs bila terkonfigurasi, fallback Edge.
 * Hasil sintesis di-cache di storage/app/tts-cache agar frasa berulang
 * (sapaan, wake reply) tidak disintesis ulang.
 */
class TtsController extends Controller
{
    public function __construct(private readonly ElevenLabsTtsService $elevenlabs)
    {
    }

    public function speak(Request $request): Response|JsonResponse
    {
        $validated = $request->validate([
            'text' => ['required', 'string', 'max:'.config('jarvis.tts.max_chars', 600)],
            'engine' => ['nullable', 'in:auto,elevenlabs,edge'],
            'voice' => ['nullable', 'string', 'max:120'],
            'rate' => ['nullable', 'regex:/^[+-]?\d{1,3}%$/'],
            'pitch' => ['nullable', 'regex:/^[+-]?\d{1,3}Hz$/'],
        ]);

        $requested = $validated['engine'] ?? config('jarvis.tts.engine', 'auto');
        $text = trim($validated['text']);

        if ($text === '') {
            return response()->json(['success' => false, 'message' => 'Teks kosong.'], 422);
        }

        if ($requested === 'auto' && $this->elevenlabs->isConfigured()) {
            try {
                return $this->respondSynthesized(
                    'elevenlabs',
                    fn () => $this->elevenlabs->synthesize($text, $validated['voice'] ?? null),
                    $text,
                    $validated['voice'] ?? null
                );
            } catch (\Throwable $e) {
                report($e);
                // auto: lanjut fallback ke Edge bila ElevenLabs gagal
            }
        } elseif ($requested === 'elevenlabs') {
            if (! $this->elevenlabs->isConfigured()) {
                return response()->json([
                    'success' => false,
                    'message' => 'ElevenLabs belum dikonfigurasi. Isi ELEVENLABS_API_KEY dan ELEVENLABS_VOICE_ID.',
                ], 503);
            }

            try {
                return $this->respondSynthesized(
                    'elevenlabs',
                    fn () => $this->elevenlabs->synthesize($text, $validated['voice'] ?? null),
                    $text,
                    $validated['voice'] ?? null
                );
            } catch (\Throwable $e) {
                report($e);

                return response()->json([
                    'success' => false,
                    'message' => 'TTS ElevenLabs gagal: '.$e->getMessage(),
                ], 502);
            }
        }

        // ---- Engine Edge TTS ----
        if ($requested === 'elevenlabs') {
            return response()->json(['success' => false, 'message' => 'Unreachable.'], 500);
        }

        $voice = $validated['voice'] ?? config('jarvis.tts.voice', 'en-GB-RyanNeural');
        if (! preg_match('/^[a-z]{2}-[A-Z]{2}-[A-Za-z]+Neural$/', $voice)) {
            $voice = config('jarvis.tts.voice', 'en-GB-RyanNeural');
        }
        $rate = $validated['rate'] ?? config('jarvis.tts.rate', '-4%');
        $pitch = $validated['pitch'] ?? config('jarvis.tts.pitch', '-2Hz');

        try {
            return $this->respondSynthesized(
                "edge|{$voice}",
                function () use ($text, $voice, $rate, $pitch) {
                    $tts = new EdgeTTS;
                    $tts->synthesize($text, $voice, ['rate' => $rate, 'pitch' => $pitch]);

                    return $tts->toRaw();
                },
                $text,
                null,
                "|{$rate}|{$pitch}"
            );
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'TTS server gagal: '.$e->getMessage(),
            ], 502);
        }
    }

    /**
     * GET /api/tts/voices — daftar voice ElevenLabs pada akun.
     */
    public function voices(): JsonResponse
    {
        if (! filled(config('jarvis.tts.elevenlabs.api_key'))) {
            return response()->json([
                'success' => false,
                'message' => 'ELEVENLABS_API_KEY belum diisi.',
            ], 503);
        }

        try {
            return response()->json([
                'success' => true,
                'data' => ['voices' => $this->elevenlabs->listVoices()],
                'active_voice_id' => config('jarvis.tts.elevenlabs.voice_id'),
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 502);
        }
    }

    /**
     * POST /api/tts/clone-voice — Instant Voice Cloning dari sample audio.
     * Body multipart: name (string), sample (file mp3/wav).
     */
    public function cloneVoice(Request $request): JsonResponse
    {
        if (! filled(config('jarvis.tts.elevenlabs.api_key'))) {
            return response()->json([
                'success' => false,
                'message' => 'ELEVENLABS_API_KEY belum diisi.',
            ], 503);
        }

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:60'],
            'sample' => ['required', 'file', 'mimes:mp3,wav,mpeg,x-wav', 'max:20480'],
        ]);

        $storedPath = $this->elevenlabs->storeSample($validated['sample']);

        try {
            $result = $this->elevenlabs->cloneFromSample(
                $validated['name'],
                new \Illuminate\Http\UploadedFile($storedPath, basename($storedPath), null, 0, true)
            );

            return response()->json([
                'success' => true,
                'message' => 'Voice berhasil dibuat. Set ELEVENLABS_VOICE_ID='.$result['voice_id'].' untuk mengaktifkannya.',
                'data' => $result,
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 502);
        }
    }

    private function respondSynthesized(
        string $engineKey,
        callable $synth,
        string $text,
        ?string $voiceId = null,
        string $extraHash = ''
    ): Response {
        $ttl = (int) config('jarvis.tts.cache_ttl', 86400);
        $hash = md5($engineKey.'|'.$voiceId.$extraHash.'|'.$text);
        $cacheDir = storage_path('app/tts-cache');
        $cacheFile = $cacheDir.DIRECTORY_SEPARATOR.$hash.'.mp3';

        if (is_file($cacheFile) && (time() - (int) filemtime($cacheFile)) < $ttl) {
            return $this->audioResponse((string) file_get_contents($cacheFile));
        }

        $audio = $synth();

        if (! is_dir($cacheDir)) {
            @mkdir($cacheDir, 0775, true);
        }
        @file_put_contents($cacheFile, $audio);

        return $this->audioResponse($audio);
    }

    private function audioResponse(string $binary): Response
    {
        return response($binary, 200, [
            'Content-Type' => 'audio/mpeg',
            'Cache-Control' => 'private, max-age=86400',
        ]);
    }
}
