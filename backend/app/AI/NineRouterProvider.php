<?php

namespace App\AI;

use Generator;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Provider untuk 9Router (protokol kompatibel OpenAI: POST {base_url}/chat/completions).
 * API key tidak pernah keluar dari server.
 */
class NineRouterProvider implements AIProviderInterface, ToolCallingProvider
{
    public function __construct(
        private readonly ?string $baseUrl,
        private readonly ?string $apiKey,
        private readonly ?string $model = null,
        private readonly ?string $fallbackModel = null,
        private readonly int $timeout = 120,
    ) {}

    public function configured(): bool
    {
        return filled($this->baseUrl) && filled($this->apiKey) && filled($this->model);
    }

    public function complete(array $messages, array $options = []): string
    {
        $text = '';

        foreach ($this->stream($messages, $options) as $delta) {
            $text .= $delta;
        }

        return $text;
    }

    public function stream(array $messages, array $options = []): Generator
    {
        if (! $this->configured()) {
            throw new RuntimeException(
                '9Router belum dikonfigurasi. Lengkapi NINE_ROUTER_BASE_URL, NINE_ROUTER_API_KEY, dan NINE_ROUTER_MODEL.'
            );
        }

        $models = array_values(array_filter([
            $options['model'] ?? $this->model,
            $options['model'] ?? null ? null : $this->fallbackModel,
        ]));

        if (empty($models)) {
            throw new RuntimeException('Tidak ada model yang dikonfigurasi.');
        }

        $lastException = null;

        foreach ($models as $index => $model) {
            try {
                yield from $this->attemptStream($messages, $model, $options);

                return;
            } catch (ConnectionException|RuntimeException $e) {
                $lastException = $e;

                // Coba fallback model hanya jika tersedia berikutnya.
                continue;
            }
        }

        throw new RuntimeException('Semua model gagal: '.$lastException?->getMessage(), 0, $lastException);
    }

    public function completeWithTools(array $messages, array $tools, array $options = []): array
    {
        if (! $this->configured()) {
            throw new RuntimeException(
                '9Router belum dikonfigurasi. Lengkapi NINE_ROUTER_BASE_URL, NINE_ROUTER_API_KEY, dan NINE_ROUTER_MODEL.'
            );
        }

        $models = array_values(array_filter([
            $options['model'] ?? $this->model,
            ($options['model'] ?? null) ? null : $this->fallbackModel,
        ]));

        $lastException = null;

        foreach ($models as $model) {
            try {
                $response = Http::withToken((string) $this->apiKey)
                    ->timeout($options['timeout'] ?? $this->timeout)
                    ->connectTimeout(15)
                    ->post(rtrim((string) $this->baseUrl, '/').'/chat/completions', [
                        'model' => $model,
                        'messages' => $messages,
                        'tools' => $tools,
                        'stream' => false,
                        'temperature' => $options['temperature'] ?? 0.7,
                    ]);

                if ($response->failed()) {
                    throw new RuntimeException(sprintf(
                        'HTTP %d dari 9Router: %s',
                        $response->status(),
                        mb_substr($response->body(), 0, 300),
                    ));
                }

                $message = $response->json('choices.0.message');

                if (! is_array($message)) {
                    throw new RuntimeException('Respon 9Router tidak mengandung message.');
                }

                return [
                    'content' => isset($message['content']) && is_string($message['content']) && $message['content'] !== ''
                        ? $message['content']
                        : null,
                    'tool_calls' => isset($message['tool_calls']) && is_array($message['tool_calls'])
                        ? array_values($message['tool_calls'])
                        : null,
                    'raw' => $message,
                ];
            } catch (ConnectionException|RuntimeException $e) {
                $lastException = $e;

                continue;
            }
        }

        throw new RuntimeException('Semua model gagal: '.$lastException?->getMessage(), 0, $lastException);
    }

    private function attemptStream(array $messages, string $model, array $options): Generator
    {
        $response = Http::withToken((string) $this->apiKey)
            ->timeout($this->timeout)
            ->connectTimeout(15)
            ->withOptions(['stream' => true])
            ->post(rtrim((string) $this->baseUrl, '/').'/chat/completions', [
                'model' => $model,
                'messages' => $messages,
                'stream' => true,
                'temperature' => $options['temperature'] ?? 0.7,
            ]);

        if ($response->failed()) {
            throw new RuntimeException(sprintf(
                'HTTP %d dari 9Router: %s',
                $response->status(),
                mb_substr($response->body(), 0, 300),
            ));
        }

        $body = $response->toPsrResponse()->getBody();
        $buffer = '';

        while (! $body->eof()) {
            $chunk = $body->read(8192);
            if ($chunk === '') {
                continue;
            }
            $buffer .= $chunk;

            while (($newline = strpos($buffer, "\n")) !== false) {
                $line = trim(substr($buffer, 0, $newline));
                $buffer = substr($buffer, $newline + 1);

                $delta = $this->parseSseLine($line);
                if ($delta !== null && $delta !== '') {
                    yield $delta;
                }
            }
        }
    }

    private function parseSseLine(string $line): ?string
    {
        if ($line === '' || ! str_starts_with($line, 'data:')) {
            return null;
        }

        $payload = trim(substr($line, strlen('data:')));

        if ($payload === '' || $payload === '[DONE]') {
            return null;
        }

        $decoded = json_decode($payload, true);

        if (! is_array($decoded)) {
            return null;
        }

        // Kompatibel OpenAI: choices[0].delta.content
        $content = $decoded['choices'][0]['delta']['content']
            ?? $decoded['choices'][0]['message']['content']
            ?? $decoded['content']
            ?? null;

        return is_string($content) ? $content : null;
    }

    /**
     * Ambil daftar model yang tersedia dari gateway (GET {base_url}/models,
     * protokol OpenAI-compatible). Dipakai Settings UI untuk dropdown
     * model utama & fallback.
     *
     * @return array<int, string> daftar model id
     */
    public function listModels(): array
    {
        if (! filled($this->baseUrl) || ! filled($this->apiKey)) {
            throw new RuntimeException('Base URL dan API Key wajib diisi dulu.');
        }

        $response = Http::withToken((string) $this->apiKey)
            ->timeout(20)
            ->connectTimeout(10)
            ->get(rtrim((string) $this->baseUrl, '/').'/models');

        if ($response->failed()) {
            throw new RuntimeException(sprintf(
                'HTTP %d dari 9Router: %s',
                $response->status(),
                mb_substr($response->body(), 0, 300),
            ));
        }

        $json = $response->json();

        // Format OpenAI: { "data": [ { "id": "model-a" }, ... ] }
        $entries = $json['data'] ?? (is_array($json) ? $json : []);

        $models = [];
        foreach ((array) $entries as $entry) {
            $id = is_string($entry) ? $entry : ($entry['id'] ?? null);

            if (is_string($id) && $id !== '' && ! in_array($id, $models, true)) {
                $models[] = $id;
            }
        }

        sort($models, SORT_NATURAL | SORT_FLAG_CASE);

        return $models;
    }

    public function testConnection(): array
    {
        if (! $this->configured()) {
            return [
                'ok' => false,
                'message' => 'Konfigurasi belum lengkap (NINE_ROUTER_BASE_URL / API_KEY / MODEL).',
                'latency_ms' => null,
            ];
        }

        $start = microtime(true);

        try {
            $response = Http::withToken((string) $this->apiKey)
                ->timeout(20)
                ->connectTimeout(10)
                ->post(rtrim((string) $this->baseUrl, '/').'/chat/completions', [
                    'model' => $this->model,
                    'messages' => [['role' => 'user', 'content' => 'ping']],
                    'max_tokens' => 5,
                    'stream' => false,
                ]);
        } catch (ConnectionException $e) {
            return [
                'ok' => false,
                'message' => 'Koneksi gagal: '.$e->getMessage(),
                'latency_ms' => null,
            ];
        }

        $latency = (int) round((microtime(true) - $start) * 1000);

        if ($response->failed()) {
            return [
                'ok' => false,
                'message' => sprintf('HTTP %d: %s', $response->status(), mb_substr($response->body(), 0, 200)),
                'latency_ms' => $latency,
            ];
        }

        return [
            'ok' => true,
            'message' => sprintf('Terhubung ke 9Router (model %s).', $this->model),
            'latency_ms' => $latency,
        ];
    }
}
