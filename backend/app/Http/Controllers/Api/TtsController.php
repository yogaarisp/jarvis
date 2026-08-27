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
            'lang' => ['nullable', 'regex:/^[a-z]{2}(-[A-Z]{2})?$/i'],
        ]);

        $text = trim($validated['text']);

        if ($text === '') {
            return response()->json(['success' => false, 'message' => 'Teks kosong.'], 422);
        }

        $lang = strtolower($validated['lang'] ?? '');
        if ($lang === '') {
            $lang = $this->detectLang($text);
        }
        $isId = str_starts_with($lang, 'id');

        // ---- Auto-pick native voice per bahasa (JARVIS clone / British = bagus utk Inggris, Ardi utk Indo) ----
        $voice = $validated['voice'] ?? null;
        $nativeVoice = $isId ? 'id-ID-ArdiNeural' : 'en-GB-RyanNeural';

        // Kalau request voice tidak match bahasa (mis. user pilih jarvis-clone tapi bicara Indo → fallback ke Edge pakai native),
        // atau format voice invalid → paksa native voice.
        if ($voice === null || ! preg_match('/^[a-z]{2}-[A-Z]{2}-[A-Za-z]+Neural$/', $voice)) {
            $voice = $nativeVoice;
        } else {
            $voiceLang = strtolower(substr($voice, 0, 2));
            if ($isId && $voiceLang !== 'id') {
                $voice = $nativeVoice;
            } elseif (! $isId && $voiceLang === 'id') {
                $voice = $nativeVoice;
            }
        }

        // ---- Tuning rate & pitch agar lebih natural & ekspresif ----
        // Bahasa Indo: sedikit lebih cepat & nada lebih cerah, natural ngobrol.
        // Bahasa Inggris (JARVIS): sedikit lebih lambat, tenang & berwibawa.
        if (isset($validated['rate'])) {
            $rate = $validated['rate'];
        } else {
            $rate = $isId ? '+8%' : '-5%';
        }
        if (isset($validated['pitch'])) {
            $pitch = $validated['pitch'];
        } else {
            $pitch = $isId ? '+10Hz' : '+2Hz';
        }

        $text = $this->naturalizeText($text, $isId ? 'id' : 'en');

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
                "|{$rate}|{$pitch}|{$lang}"
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

        // Preprocess teks — sama seperti Edge TTS agar lebih natural
        $text = $this->naturalizeText($text, $language === 'en' ? 'en' : $language);
        $text = $this->prepareForXtts($text);

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

    /**
     * Deteksi sederhana bahasa teks (ID atau EN) berdasarkan kata umum + karakteristik huruf.
     * Dipakai kalau query param `lang` tidak dikirim oleh client.
     */
    private function detectLang(string $text): string
    {
        $textLower = mb_strtolower($text);
        $idHints = [
            'yang','dengan','untuk','sudah','belum','bisa','tidak','akan','tetapi','karena',
            'jika','maka','dari','ke','di','ini','itu','saya','kamu','kami','ada','jadi',
            'apa','siapa','bagaimana','kapan','berapa','dong','nih','loh','ya','dong',
            'oke','baik','siap','halo','pak','bos','bang','mas','mbak','tolong','makasih',
            'terima','kasih','terimakasih','sekarang','nanti','besok','tadi','kemarin',
        ];
        $enHits = 0;
        $idHits = 0;
        foreach ($idHints as $w) {
            if (str_contains($textLower, $w)) $idHits++;
        }
        $enHints = ['the','and','you','that','have','with','this','will','your','from','they','been','their','what','when','how','why','where','yes','okay','hello','please','thanks','thank','sir','system','ready','completed'];
        foreach ($enHints as $w) {
            if (str_contains($textLower, $w)) $enHits++;
        }
        if ($idHits > $enHits) return 'id-ID';
        if ($enHits > $idHits) return 'en-GB';
        $words = preg_split('/\s+/u', trim($textLower));
        $idSuffix = 0;
        foreach ((array) $words as $w) {
            if (str_ends_with($w, 'nya') || str_ends_with($w, 'lah') || str_ends_with($w, 'kah') || str_ends_with($w, 'kan')) $idSuffix++;
        }
        return $idSuffix >= 1 ? 'id-ID' : 'en-GB';
    }

    /**
     * Preprocess teks agar suara lebih natural — gaya bicara sehari-hari,
     * hindari bunyi robot karena titik dua / tanda baca berlebih.
     * Di-apply SEBELUM sintesis TTS & perhitungan hash cache.
     */
    private function naturalizeText(string $text, string $lang): string
    {
        $text = preg_replace('/\s+/u', ' ', trim($text)) ?? '';
        if ($text === '') return '';

        // Bersihkan tag/format token AI thinking: [n], <think>, dll.
        $text = preg_replace('/\[\d+\]/u', '', $text) ?? '';
        $text = preg_replace('/<\/?think[^>]*>/iu', ' ', $text) ?? '';

        // Ubah markdown bold/italic/code → teks biasa
        $text = preg_replace('/\*\*([^*]+)\*\*/u', '$1', $text) ?? '';
        $text = preg_replace('/\*([^*]+)\*/u', '$1', $text) ?? '';
        $text = preg_replace('/`([^`]+)`/u', '$1', $text) ?? '';
        $text = preg_replace('/#{1,6}\s+/u', '', $text) ?? '';

        // Ubah tanda baca tipografi → jeda alami
        // Titik dua setelah kata → beri jeda dengan koma agar tidak datar
        $text = preg_replace('/:\s*/u', ', ', $text) ?? '';
        // Titik koma → jeda sedikit lebih pendek dari titik
        $text = preg_replace('/;\s*/u', ', ', $text) ?? '';
        // Tanda hubung em-dash / en-dash → koma
        $text = preg_replace('/\s*[—–]\s*/u', ', ', $text) ?? '';
        // Kurung buka/tutup → buang (baca isi saja)
        $text = preg_replace('/[()[\]{}]/u', '', $text) ?? '';

        if ($lang === 'id') {
            // Ganti kata baku / formal → gaya santai ngobrol
            $replace = [
                'Saya telah ' => 'Saya sudah ',
                'Saya akan ' => 'Saya bakal ',
                ' saya telah ' => ' saya sudah ',
                ' saya akan ' => ' saya bakal ',
                'Anda ' => 'Keenan ',
                ' anda ' => ' Keenan ',
                ' Tuan.' => '.',
                ' Tuan, ' => ', ',
                ' dimohon ' => ' tolong ',
                ' mohon ' => ' tolong ',
                ' apakah ' => ' apa ',
                ' Apakah ' => ' Apa ',
                'bagaimana cara ' => 'gimana cara ',
                'Bagaimana cara ' => 'Gimana cara ',
                'tidak dapat ' => 'tidak bisa ',
                ' demikian ' => ' begitu ',
            ];
            foreach ($replace as $from => $to) {
                $text = str_replace($from, $to, $text);
            }

            // Tambah jeda sebelum konjungsi panjang agar tidak kecebutan
            $text = preg_replace('/\s+(tetapi|namun|padahal|sedangkan|sehingga|ketika|saat|jika|kalau|bila|setelah|sebelum|supaya|agar)\b/u', ', $1', $text) ?? $text;

            // Sisipkan nama Keenan untuk sapaan pendek
            $words = preg_split('/\s+/u', trim($text));
            $trimmed = rtrim($text, " .,!?");
            if (is_array($words) && count($words) <= 6 && !str_contains(mb_strtolower($text), 'keenan')) {
                $punct = preg_match('/[.!?]$/u', $text, $m) ? $m[0] : '.';
                $text = $trimmed.", Keenan".$punct;
            }
        } else {
            // English: buang sapaan "sir" berulang, ganti dengan nama
            $text = preg_replace('/\bsir\b\.?\s*/iu', '', $text) ?? $text;

            // Tambah jeda sebelum konjungsi agar ritme lebih manusiawi
            $text = preg_replace('/\s+(however|although|though|because|therefore|meanwhile|furthermore|moreover|nevertheless)\b/iu', ', $1', $text) ?? $text;

            // Sisipkan nama Keenan untuk respons pendek
            $words = preg_split('/\s+/u', trim($text));
            $trimmed = rtrim($text, " .,!?");
            if (is_array($words) && count($words) <= 7 && stripos($text, 'Keenan') === false) {
                $punct = preg_match('/[.!?]$/u', $text, $m) ? $m[0] : '.';
                $text = $trimmed.", Keenan".$punct;
            }
        }

        // Cleanup double spaces, trailing koma, & tanda baca ganda
        $text = preg_replace('/\s+/u', ' ', $text) ?? '';
        $text = preg_replace('/\s+([.,!?;:])/u', '$1', $text) ?? '';
        $text = preg_replace('/([.,!?;:]){2,}/u', '$1', $text) ?? '';
        $text = preg_replace('/,\s*([.!?])/u', '$1', $text) ?? '';

        return trim($text);
    }

    /**
     * Persiapkan teks khusus untuk XTTS v2 — model ini sensitif terhadap
     * tanda baca & format teks. Terlalu banyak koma/titik menyebabkan jeda
     * berlebih atau artefak audio.
     */
    private function prepareForXtts(string $text): string
    {
        // XTTS bekerja terbaik dengan kalimat natural tanpa singkatan aneh
        // Expand singkatan umum → kata penuh agar tidak salah baca
        $abbr = [
            'dl.' => 'dan lain-lain.',
            'dll.' => 'dan lain-lain.',
            'dsb.' => 'dan sebagainya.',
            'dst.' => 'dan seterusnya.',
            'yg ' => 'yang ',
            'dgn ' => 'dengan ',
            'utk ' => 'untuk ',
            'krn ' => 'karena ',
            'hrs ' => 'harus ',
            'dpt ' => 'dapat ',
            ' dr ' => ' dari ',
            ' ke ' => ' ke ',
            'e.g.' => 'for example,',
            'i.e.' => 'that is,',
            'etc.' => 'and so on.',
            'vs.' => 'versus',
        ];
        foreach ($abbr as $from => $to) {
            $text = str_ireplace($from, $to, $text);
        }

        // Batasi panjang kalimat — XTTS kurang stabil untuk kalimat > 200 karakter.
        // Pecah di titik/koma jika kalimat terlalu panjang.
        $sentences = preg_split('/(?<=[.!?])\s+/u', $text) ?: [$text];
        $result = [];
        foreach ($sentences as $sentence) {
            if (mb_strlen($sentence) > 200) {
                // Pecah di koma/titik koma
                $parts = preg_split('/(?<=,)\s+/u', $sentence) ?: [$sentence];
                foreach ($parts as $part) {
                    $trimmed = trim($part);
                    if ($trimmed !== '') $result[] = $trimmed;
                }
            } else {
                $trimmed = trim($sentence);
                if ($trimmed !== '') $result[] = $trimmed;
            }
        }
        $text = implode(' ', $result);

        return trim($text);
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
