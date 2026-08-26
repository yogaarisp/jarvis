<?php

namespace App\Http\Controllers\Api;

use Afaya\EdgeTTS\Service\EdgeTTS;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * TTS neural sisi server (PRD §7).
 *
 * Engine:
 * - Edge TTS   : gratis tanpa API key (en-GB-RyanNeural ala JARVIS).
 * - XTTS lokal : voice cloning offline via /tts/clone.
 *
 * Hasil sintesis di-cache di storage/app/tts-cache agar frasa berulang
 * (sapaan, wake reply) tidak disintesis ulang.
 */
class TtsController extends Controller
{
    public function speak(Request $request): Response|JsonResponse
    {
        $validated = $request->validate([
            'text' => ['required', 'string', 'max:'.config('jarvis.tts.max_chars', 600)],
            'engine' => ['nullable', 'in:auto,edge'],
            'voice' => ['nullable', 'string', 'max:120'],
            'rate' => ['nullable', 'regex:/^[+-]?\d{1,3}%$/'],
            'pitch' => ['nullable', 'regex:/^[+-]?\d{1,3}Hz$/'],
        ]);

        $text = trim($validated['text']);

        if ($text === '') {
            return response()->json(['success' => false, 'message' => 'Teks kosong.'], 422);
        }

        // ---- Engine Edge TTS ----
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
     * GET /api/tts/clone — Sintesis via XTTS v2 lokal (suara JARVIS Master).
     * Query params: text, language (default: en).
     *
     * Urutan:
     *   1. Server XTTS persisten (ai/xtts_server.py, model warm → ±3-5 dtk).
     *   2. Fallback: spawn speak_clone.py per-request (±45 dtk).
     *   3. Hasil di-cache di storage/app/tts-cache agar frasa berulang instan.
     *
     * Memerlukan XTTS_ENABLED=true.
     */
    public function speakClone(Request $request): Response|JsonResponse
    {
        $cfg = config('jarvis.tts.xtts');

        if (! ($cfg['enabled'] ?? false)) {
            return response()->json([
                'success' => false,
                'message' => 'XTTS local voice clone belum diaktifkan (XTTS_ENABLED=false).',
            ], 503);
        }

        $validated = $request->validate([
            'text' => ['required', 'string', 'max:'.config('jarvis.tts.max_chars', 600)],
            'language' => ['nullable', 'string', 'max:10'],
        ]);

        $text = trim($validated['text']);
        if ($text === '') {
            return response()->json(['success' => false, 'message' => 'Teks kosong.'], 422);
        }

        $language = $validated['language'] ?? 'en';
        // Hanya bahasa yang didukung XTTS v2
        $supported = ['en','es','fr','de','it','pt','pl','tr','ru','nl','cs','ar','zh-cn','hu','ko','ja','hi'];
        if (! in_array($language, $supported, true)) {
            $language = 'en';
        }

        // ---- Cache: frasa yang sama tidak disintesis ulang ----
        $cacheDir = storage_path('app/tts-cache');
        $cacheFile = $cacheDir.DIRECTORY_SEPARATOR.md5('xtts|'.$language.'|'.$text).'.wav';
        if (is_file($cacheFile) && (time() - (int) filemtime($cacheFile)) < (int) config('jarvis.tts.cache_ttl', 86400)) {
            return $this->wavResponse((string) file_get_contents($cacheFile));
        }

        // ---- 1) Server XTTS persisten (utama) ----
        $audio = $this->synthesizeViaServer($cfg, $text, $language);

        // ---- 2) Fallback: spawn proses python per-request ----
        if ($audio === null) {
            $audio = $this->synthesizeViaProcess($cfg, $text, $language);
        }

        if ($audio === null) {
            return response()->json([
                'success' => false,
                'message' => 'XTTS tidak tersedia. Jalankan ai\start_xtts_server.bat lalu coba lagi.',
            ], 502);
        }

        if (! is_dir($cacheDir)) {
            @mkdir($cacheDir, 0775, true);
        }
        @file_put_contents($cacheFile, $audio);

        return $this->wavResponse($audio);
    }

    /**
     * Sintesis via server persisten (http://127.0.0.1:8012/tts). Null bila server mati/gagal.
     */
    private function synthesizeViaServer(array $cfg, string $text, string $language): ?string
    {
        $base = rtrim((string) ($cfg['server_url'] ?? 'http://127.0.0.1:8012'), '/');

        try {
            $resp = \Illuminate\Support\Facades\Http::timeout((int) ($cfg['timeout'] ?? 120))
                ->get($base.'/tts', ['text' => $text, 'language' => $language]);

            if ($resp->successful() && strlen($resp->body()) > 44) { // 44 = header wav minimal
                return $resp->body();
            }
        } catch (\Throwable) {
            // Server tidak berjalan → biarkan fallback ke proses.
        }

        return null;
    }

    /**
     * Sintesis via speak_clone.py (spawn per-request, lambat ±45 dtk karena model dimuat ulang).
     * Env Windows eksplisit — child process dari PHP sering kehilangan SystemRoot
     * sehingga Winsock gagal init (WinError 10106).
     */
    private function synthesizeViaProcess(array $cfg, string $text, string $language): ?string
    {
        $python = $cfg['python'];
        $script = $cfg['script'];
        $refAudio = $cfg['ref_audio'];
        $timeout = (int) ($cfg['timeout'] ?? 120);

        if (! file_exists($script) || ! file_exists($refAudio)) {
            return null;
        }

        $outFile = sys_get_temp_dir().DIRECTORY_SEPARATOR.'jarvis_xtts_'.uniqid().'.wav';

        $cmd = array_map('strval', [
            $python,
            $script,
            $text,
            '--language', $language,
            '--ref', $refAudio,
            '--save', $outFile,
        ]);

        $env = [];
        foreach ([
            'SystemRoot', 'windir', 'SystemDrive', 'PATH', 'TEMP', 'TMP',
            'COMPUTERNAME', 'USERNAME', 'USERDOMAIN', 'USERPROFILE',
            'HOMEDRIVE', 'HOMEPATH', 'LOCALAPPDATA', 'PROGRAMDATA',
            'PROGRAMFILES', 'COMMONPROGRAMFILES',
        ] as $key) {
            $val = getenv($key);
            if (is_string($val) && $val !== '') {
                $env[$key] = $val;
            }
        }
        $env += [
            'SystemRoot' => 'C:\\Windows',
            'windir' => 'C:\\Windows',
            'SystemDrive' => 'C:',
            'TEMP' => sys_get_temp_dir(),
            'TMP' => sys_get_temp_dir(),
        ];

        $process = new \Symfony\Component\Process\Process($cmd, null, $env);
        $process->setTimeout($timeout);

        try {
            $process->run();
        } catch (\Throwable) {
            return null;
        }

        if (! $process->isSuccessful() || ! file_exists($outFile) || filesize($outFile) === 0) {
            @unlink($outFile);

            return null;
        }

        $audio = file_get_contents($outFile);
        @unlink($outFile);

        return $audio === false ? null : $audio;
    }

    private function wavResponse(string $binary): Response
    {
        return response($binary, 200, [
            'Content-Type' => 'audio/wav',
            'Cache-Control' => 'private, max-age=3600',
        ]);
    }

    /**
     * GET /api/tts/previews — daftar file suara sample di folder ai/voice-previews.
     */
    public function previews(): JsonResponse
    {
        $previewDir = base_path('../ai/voice-previews');
        if (! is_dir($previewDir)) {
            $previewDir = base_path('ai/voice-previews');
        }

        if (! is_dir($previewDir)) {
            return response()->json([
                'success' => true,
                'data' => [
                    'directory' => 'ai/voice-previews',
                    'files' => [],
                ],
            ]);
        }

        $files = scandir($previewDir);
        $result = [];

        foreach ($files as $file) {
            if ($file === '.' || $file === '..') {
                continue;
            }
            $fullPath = $previewDir.DIRECTORY_SEPARATOR.$file;
            if (! is_file($fullPath)) {
                continue;
            }

            $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
            if (! in_array($ext, ['mp3', 'wav', 'ogg', 'm4a'])) {
                continue;
            }

            $size = filesize($fullPath);
            $meta = $this->parsePreviewMeta($file);

            $result[] = [
                'filename' => $file,
                'name' => $meta['name'],
                'voice_id' => $meta['voice_id'],
                'group' => $meta['group'],
                'lang' => $meta['lang'],
                'format' => $ext,
                'size_bytes' => $size,
                'size_formatted' => round($size / 1024, 1).' KB',
                'title' => $meta['title'],
                'description' => $meta['description'],
                'accent' => $meta['accent'],
                'url' => '/api/tts/previews/'.$file,
            ];
        }

        return response()->json([
            'success' => true,
            'data' => [
                'directory' => 'ai/voice-previews',
                'files' => $result,
            ],
        ]);
    }

    /**
     * GET /api/tts/previews/{filename} — streaming audio sample dari ai/voice-previews.
     */
    public function streamPreview(string $filename)
    {
        if (! preg_match('/^[a-zA-Z0-9_\-\.]+\.(mp3|wav|ogg|m4a)$/i', $filename)) {
            return response()->json(['success' => false, 'message' => 'Nama file tidak valid.'], 400);
        }

        $previewDir = base_path('../ai/voice-previews');
        if (! is_dir($previewDir)) {
            $previewDir = base_path('ai/voice-previews');
        }

        $filePath = realpath($previewDir.DIRECTORY_SEPARATOR.$filename);
        $previewReal = realpath($previewDir);

        if (! $filePath || ! $previewReal || ! str_starts_with($filePath, $previewReal) || ! is_file($filePath)) {
            return response()->json(['success' => false, 'message' => 'File audio preview tidak ditemukan.'], 404);
        }

        $ext = strtolower(pathinfo($filePath, PATHINFO_EXTENSION));
        $mime = match ($ext) {
            'wav' => 'audio/wav',
            'ogg' => 'audio/ogg',
            'm4a' => 'audio/mp4',
            default => 'audio/mpeg',
        };

        return response()->file($filePath, [
            'Content-Type' => $mime,
            'Cache-Control' => 'public, max-age=86400',
            'Accept-Ranges' => 'bytes',
        ]);
    }

    private function parsePreviewMeta(string $filename): array
    {
        $base = pathinfo($filename, PATHINFO_FILENAME);

        // Kasus 1: 1-Ryan-EN / 1-Ryan-ID
        if (preg_match('/^1-Ryan-(EN|ID)$/i', $base, $m)) {
            $lang = strtoupper($m[1]);
            return [
                'name' => 'Ryan',
                'group' => 'Ryan',
                'voice_id' => 'en-GB-RyanNeural',
                'lang' => $lang,
                'title' => 'Ryan · ' . ($lang === 'EN' ? 'English (JARVIS)' : 'Bahasa Indonesia'),
                'description' => 'Pria British aksen formal, halus & berwibawa ala JARVIS Iron Man.',
                'accent' => 'British English (en-GB)',
            ];
        }

        // Kasus 2: 2-Thomas-EN / 2-Thomas-ID
        if (preg_match('/^2-Thomas-(EN|ID)$/i', $base, $m)) {
            $lang = strtoupper($m[1]);
            return [
                'name' => 'Thomas',
                'group' => 'Thomas',
                'voice_id' => 'en-GB-ThomasNeural',
                'lang' => $lang,
                'title' => 'Thomas · ' . ($lang === 'EN' ? 'English' : 'Bahasa Indonesia'),
                'description' => 'Pria British nada natural, artikulasi jelas dan tenang.',
                'accent' => 'British English (en-GB)',
            ];
        }

        // Kasus 3: 3-Eric-EN / 3-Eric-ID
        if (preg_match('/^3-Eric-(EN|ID)$/i', $base, $m)) {
            $lang = strtoupper($m[1]);
            return [
                'name' => 'Eric',
                'group' => 'Eric',
                'voice_id' => 'en-US-EricNeural',
                'lang' => $lang,
                'title' => 'Eric · ' . ($lang === 'EN' ? 'English' : 'Bahasa Indonesia'),
                'description' => 'Pria Amerika nada modern, energik, tegas & percaya diri.',
                'accent' => 'US English (en-US)',
            ];
        }

        // Kasus 4: 4-Andrew-EN / 4-Andrew-ID
        if (preg_match('/^4-Andrew-(EN|ID)$/i', $base, $m)) {
            $lang = strtoupper($m[1]);
            return [
                'name' => 'Andrew',
                'group' => 'Andrew',
                'voice_id' => 'en-US-AndrewNeural',
                'lang' => $lang,
                'title' => 'Andrew · ' . ($lang === 'EN' ? 'English' : 'Bahasa Indonesia'),
                'description' => 'Pria Amerika bernada hangat, bersahabat dan santai.',
                'accent' => 'US English (en-US)',
            ];
        }

        // Kasus 5: 5-jarvis / 5-jarvis-cloned
        if (preg_match('/^5-jarvis-cloned$/i', $base)) {
            return [
                'name' => 'JARVIS Cloned',
                'group' => 'JARVIS Cloned / Master',
                'voice_id' => 'en-GB-RyanNeural',
                'lang' => 'EN',
                'title' => 'JARVIS Cloned (XTTS Local AI)',
                'description' => 'Hasil sintesis cloning AI lokal (XTTS v2 model) dari suara Paul Bettany.',
                'accent' => 'AI Neural Clone',
            ];
        }

        if (preg_match('/^5-jarvis$/i', $base)) {
            return [
                'name' => 'JARVIS Master Reference',
                'group' => 'JARVIS Cloned / Master',
                'voice_id' => 'en-GB-RyanNeural',
                'lang' => 'EN',
                'title' => 'JARVIS Master (Film Iron Man Reference)',
                'description' => 'Sampel rekaman suara asli Paul Bettany pemeran JARVIS di film Marvel.',
                'accent' => 'JARVIS Original Master',
            ];
        }

        // Fallback dinamis jika ada file lain
        return [
            'name' => ucfirst($base),
            'group' => 'Custom',
            'voice_id' => 'en-GB-RyanNeural',
            'lang' => 'EN',
            'title' => $base,
            'description' => 'Sampel audio preview: ' . $filename,
            'accent' => 'Custom Audio',
        ];
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
