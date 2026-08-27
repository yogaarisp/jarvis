<?php

namespace App\Agent;

use App\AI\AIProviderManager;
use App\AI\ToolCallingProvider;
use App\Services\SystemControlService;
use App\Services\WebSearchService;
use Generator;
use InvalidArgumentException;
use RuntimeException;
use Throwable;

/**
 * Agent loop: LLM memutuskan sendiri kapan perlu mencari di internet.
 *
 * Alur:
 *  1. Kirim riwayat + definisi tools (web_search, open_page) secara non-streaming.
 *  2. Bila model meminta tool -> eksekusi, lampirkan hasil sebagai pesan `tool`, ulangi.
 *  3. Bila model menjawab langsung -> jawaban di-yield per potongan kecil (efek ketik).
 *  4. Bila jatah putaran habis saat masih butuh tool -> sintesis akhir via stream().
 */
class AgentService
{
    private const MAX_SNIPPET = 280;

    public function __construct(
        private readonly AIProviderManager $providers,
        private readonly WebSearchService $web,
        private readonly SystemControlService $systemControl,
    ) {}

    /**
     * @param  array<int, array<string, mixed>>  $messages  Riwayat chat (sudah termasuk system prompt).
     * @param  (\Closure(string): void)|null  $onStatus  Dipanggil saat agent melakukan aksi (untuk UI).
     * @return Generator<string> Potongan teks jawaban akhir.
     */
    public function run(array $messages, ?\Closure $onStatus = null): Generator
    {
        $provider = $this->providers->provider();

        if (! $provider instanceof ToolCallingProvider) {
            throw new RuntimeException('Provider AI aktif tidak mendukung tool calling.');
        }

        // Fast-path: deteksi apakah pesan butuh internet/tool atau bisa langsung dijawab.
        // Kalau tidak perlu tool, langsung stream agar token pertama muncul secepat mungkin.
        $lastUserMsg = '';
        foreach (array_reverse($messages) as $m) {
            if (($m['role'] ?? '') === 'user') {
                $lastUserMsg = mb_strtolower((string) ($m['content'] ?? ''));
                break;
            }
        }

        if ($this->isDirectAnswer($lastUserMsg)) {
            yield from $provider->stream($messages);
            return;
        }

        $maxRounds = max(1, (int) config('jarvis.agent.max_tool_rounds', 3));
        $tools = self::tools();
        $usedRounds = 0;

        while ($usedRounds < $maxRounds) {
            $response = $provider->completeWithTools($messages, $tools);

            // Model meminta tool -> eksekusi lalu lanjutkan loop.
            if (! empty($response['tool_calls'])) {
                $usedRounds++;
                $messages[] = $response['raw'];

                foreach ($response['tool_calls'] as $call) {
                    [$name, $arguments] = $this->interpretCall($call);

                    if ($onStatus !== null) {
                        $onStatus($this->statusText($name, $arguments));
                    }

                    $result = $this->executeTool($name, $arguments);

                    $messages[] = [
                        'role' => 'tool',
                        'tool_call_id' => (string) ($call['id'] ?? ''),
                        'content' => $result,
                    ];
                }

                continue;
            }

            // Model menjawab langsung tanpa tool.
            if (($response['content'] ?? null) !== null) {
                yield from $this->chunk($response['content']);

                return;
            }

            // Respon kosong total — hentikan agar tidak loop mati.
            throw new RuntimeException('Model memberikan respon kosong.');
        }

        // Jatah riset habis — minta model merangkum temuan sekarang (streaming).
        $messages[] = [
            'role' => 'system',
            'content' => 'Batas riset tercapai. Rumuskan jawaban final SEKARANG berdasarkan semua temuan di atas. Jangan lagi memanggil tool.',
        ];

        yield from $provider->stream($messages);
    }

    /**
     * Deteksi apakah pesan bisa dijawab langsung tanpa tool (fast-path).
     * Hindari overhead completeWithTools() untuk chat biasa, sapaan, perintah sistem, dll.
     */
    private function isDirectAnswer(string $msg): bool
    {
        $msg = trim($msg);

        // Sapaan & small talk
        $directPatterns = [
            '/^(hai|halo|hi|hey|hello|hei|pagi|siang|malam|selamat)\b/i',
            '/^(apa kabar|how are you|how\'s it going|what\'s up)\b/i',
            '/^(siapa kamu|who are you|apa itu jarvis)\b/i',
            '/^(terima kasih|makasih|thanks|thank you)\b/i',
            '/^(oke|ok|baik|siap|noted|iya|ya|yep|yup)\b/i',
            '/^(selesai|done|lanjut|continue|next)\b/i',
        ];

        foreach ($directPatterns as $pattern) {
            if (preg_match($pattern, $msg)) {
                return true;
            }
        }

        // Topik yang BUTUH internet — jangan di-bypass
        $needsInternetKeywords = [
            'berita', 'news', 'terkini', 'hari ini', 'today', 'sekarang', 'now',
            'harga', 'price', 'cuaca', 'weather', 'jadwal', 'schedule',
            'siapa presiden', 'who is president', 'berapa kurs', 'exchange rate',
            'cari', 'search', 'carikan', 'find', 'lookup',
            'terbaru', 'latest', 'update', 'trending',
        ];

        foreach ($needsInternetKeywords as $kw) {
            if (str_contains($msg, $kw)) {
                return false; // Harus lewat agent
            }
        }

        // Perintah sistem / lokal yang tidak butuh internet
        $noInternetKeywords = [
            'buka ', 'tutup ', 'matikan ', 'nyalakan ', 'putar ', 'stop ',
            'open ', 'close ', 'play ', 'pause ',
            'ingat', 'catat', 'simpan',
            'hitung', 'konversi', 'convert',
            'terjemahkan', 'translate',
            'tulis', 'buatkan', 'bikin', 'generate', 'buat ',
            'jelaskan', 'explain', 'apa itu', 'what is',
            'ringkas', 'summarize', 'rangkum',
            'status sistem', 'system status',
            'tolong ', 'boleh ', 'bisa ',
        ];

        foreach ($noInternetKeywords as $kw) {
            if (str_contains($msg, $kw)) {
                return true;
            }
        }

        // Pesan pendek (<= 8 kata) umumnya tidak butuh browsing
        $wordCount = str_word_count($msg);
        if ($wordCount <= 8) {
            return true;
        }

        // Default: query panjang tanpa kata kunci internet → anggap bisa dijawab langsung
        // Model tetap bisa jawab dari pengetahuannya tanpa browsing
        return true;
    }

    /** Definisi tools format OpenAI function-calling. */
    public static function tools(): array
    {
        return [
            [
                'type' => 'function',
                'function' => [
                    'name' => 'web_search',
                    'description' => 'Cari informasi terkini di internet. Gunakan untuk fakta aktual, berita, cuaca, harga, jadwal, atau hal yang mungkin berubah setelah pengetahuanmu terlatih.',
                    'parameters' => [
                        'type' => 'object',
                        'properties' => [
                            'query' => [
                                'type' => 'string',
                                'description' => 'Kata kunci pencarian. Boleh bahasa Indonesia atau Inggris.',
                            ],
                        ],
                        'required' => ['query'],
                    ],
                ],
            ],
            [
                'type' => 'function',
                'function' => [
                    'name' => 'open_page',
                    'description' => 'Buka URL halaman web dan ambil isi teksnya. Gunakan setelah web_search bila cuplikan tidak cukup.',
                    'parameters' => [
                        'type' => 'object',
                        'properties' => [
                            'url' => ['type' => 'string', 'description' => 'URL lengkap dimulai http:// atau https://'],
                        ],
                        'required' => ['url'],
                    ],
                ],
            ],
            [
                'type' => 'function',
                'function' => [
                    'name' => 'system_control',
                    'description' => 'Kendalikan aplikasi di PC Keenan (hanya saat JARVIS berjalan lokal di PC-nya). '
                        .'open_url = buka situs di browser default (contoh: "buka YouTube" → action=open_url, target=youtube). '
                        .'open_app = buka aplikasi/protokol (contoh: "buka WhatsApp" → action=open_app, target=whatsapp). '
                        .'close_app = tutup aplikasi (contoh: "tutup Chrome" → action=close_app, target=chrome). '
                        .'Untuk close_app, konfirmasi dulu ke Keenan bila permintaannya tidak eksplisit.',
                    'parameters' => [
                        'type' => 'object',
                        'properties' => [
                            'action' => [
                                'type' => 'string',
                                'enum' => ['open_url', 'open_app', 'close_app'],
                                'description' => 'Jenis aksi kontrol sistem.',
                            ],
                            'target' => [
                                'type' => 'string',
                                'description' => 'Alias aplikasi/situs (youtube, whatsapp, chrome, edge, notepad, spotify, vscode, gmail, dll.) atau URL lengkap untuk open_url.',
                            ],
                        ],
                        'required' => ['action', 'target'],
                    ],
                ],
            ],
        ];
    }

    /**
     * @param  array<string, mixed>  $call
     * @return array{0: string, 1: array<string, mixed>}
     */
    private function interpretCall(array $call): array
    {
        $name = (string) ($call['function']['name'] ?? '');
        $arguments = [];

        $rawArgs = $call['function']['arguments'] ?? [];

        if (is_string($rawArgs) && $rawArgs !== '') {
            $decoded = json_decode($rawArgs, true);
            $arguments = is_array($decoded) ? $decoded : [];
        } elseif (is_array($rawArgs)) {
            $arguments = $rawArgs;
        }

        return [$name, $arguments];
    }

    /**
     * Eksekusi satu tool call dan kembalikan hasil string untuk model.
     *
     * @param  array<string, mixed>  $arguments
     */
    private function executeTool(string $name, array $arguments): string
    {
        try {
            switch ($name) {
                case 'web_search':
                    $results = $this->web->search(
                        (string) ($arguments['query'] ?? ''),
                        (int) config('jarvis.agent.max_sources', 5),
                    );

                    if ($results === []) {
                        return json_encode(['error' => 'Tidak ada hasil ditemukan.'], JSON_UNESCAPED_UNICODE) ?: '{}';
                    }

                    foreach ($results as &$r) {
                        $r['snippet'] = mb_substr($r['snippet'], 0, self::MAX_SNIPPET);
                    }

                    return json_encode(['results' => array_slice($results, 0, (int) config('jarvis.research.max_sources', 5))], JSON_UNESCAPED_UNICODE) ?: '{}';

                case 'open_page':
                    $page = $this->web->fetchPage((string) ($arguments['url'] ?? ''));

                    return json_encode([
                        'title' => $page['title'],
                        'content' => $page['content'],
                    ], JSON_UNESCAPED_UNICODE) ?: '{}';

                case 'system_control':
                    $result = $this->systemControl->execute(
                        (string) ($arguments['action'] ?? ''),
                        (string) ($arguments['target'] ?? ''),
                    );

                    return json_encode($result, JSON_UNESCAPED_UNICODE) ?: '{}';

                default:
                    throw new InvalidArgumentException("Tool [{$name}] tidak dikenal.");
            }
        } catch (Throwable $e) {
            return json_encode(['error' => mb_substr($e->getMessage(), 0, 300)], JSON_UNESCAPED_UNICODE) ?: '{}';
        }
    }

    /**
     * @param  array<string, mixed>  $arguments
     */
    private function statusText(string $name, array $arguments): string
    {
        return match ($name) {
            'web_search' => 'Mencari di internet: '.mb_substr((string) ($arguments['query'] ?? ''), 0, 60),
            'open_page' => 'Membuka halaman: '.mb_substr((string) ($arguments['url'] ?? ''), 0, 60),
            'system_control' => match ((string) ($arguments['action'] ?? '')) {
                'open_url' => 'Membuka di browser: '.mb_substr((string) ($arguments['target'] ?? ''), 0, 60),
                'open_app' => 'Membuka aplikasi: '.mb_substr((string) ($arguments['target'] ?? ''), 0, 60),
                'close_app' => 'Menutup aplikasi: '.mb_substr((string) ($arguments['target'] ?? ''), 0, 60),
                default => 'Kontrol sistem...',
            },
            default => "Menjalankan {$name}...",
        };
    }

    /**
     * Pecah teks menjadi potongan kecil agar efek streaming tetap terasa.
     *
     * @return Generator<string>
     */
    private function chunk(string $text): Generator
    {
        $pieces = preg_split('/(\s+)/u', $text, -1, PREG_SPLIT_DELIM_CAPTURE) ?: [$text];

        $buffer = '';

        foreach ($pieces as $piece) {
            $buffer .= $piece;

            if (mb_strlen($buffer) >= 40 && trim($piece) !== '') {
                yield $buffer;
                $buffer = '';
                // Delay minimal — hanya untuk tidak flood flush terlalu cepat
                usleep(2_000);
            }
        }

        if ($buffer !== '') {
            yield $buffer;
        }
    }
}
