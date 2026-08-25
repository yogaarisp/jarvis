<?php

namespace App\Http\Controllers\Api;

use Afaya\EdgeTTS\Service\EdgeTTS;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * TTS neural sisi server (PRD §7) — Microsoft Edge TTS, gratis tanpa API key.
 *
 * Suara default en-GB-RyanNeural (pria Inggris kalem ala JARVIS).
 * Hasil sintesis di-cache di storage/app/tts-cache agar frasa yang berulang
 * (sapaan, wake reply) tidak disintesis ulang.
 */
class TtsController extends Controller
{
    public function speak(Request $request): Response|JsonResponse
    {
        $validated = $request->validate([
            'text' => ['required', 'string', 'max:'.config('jarvis.tts.max_chars', 600)],
            'voice' => ['nullable', 'regex:/^[a-z]{2}-[A-Z]{2}-[A-Za-z]+Neural$/'],
            'rate' => ['nullable', 'regex:/^[+-]?\d{1,3}%$/'],
            'pitch' => ['nullable', 'regex:/^[+-]?\d{1,3}Hz$/'],
        ]);

        $voice = $validated['voice'] ?? config('jarvis.tts.voice', 'en-GB-RyanNeural');
        $rate = $validated['rate'] ?? config('jarvis.tts.rate', '-4%');
        $pitch = $validated['pitch'] ?? config('jarvis.tts.pitch', '-2Hz');
        $text = trim($validated['text']);

        if ($text === '') {
            return response()->json(['success' => false, 'message' => 'Teks kosong.'], 422);
        }

        $ttl = (int) config('jarvis.tts.cache_ttl', 86400);
        $hash = md5($text.'|'.$voice.'|'.$rate.'|'.$pitch);
        $cacheDir = storage_path('app/tts-cache');
        $cacheFile = $cacheDir.DIRECTORY_SEPARATOR.$hash.'.mp3';

        if (is_file($cacheFile) && (time() - (int) filemtime($cacheFile)) < $ttl) {
            return $this->audioResponse((string) file_get_contents($cacheFile));
        }

        try {
            $tts = new EdgeTTS;
            $tts->synthesize($text, $voice, ['rate' => $rate, 'pitch' => $pitch]);
            $audio = $tts->toRaw();
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'TTS server gagal: '.$e->getMessage(),
            ], 502);
        }

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
