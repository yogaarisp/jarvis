<?php

namespace App\AI;

use Generator;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Generic AI Provider — protokol kompatibel OpenAI (POST {base_url}/chat/completions).
 * Mendukung provider preset: Gemini, Claude, OpenAI, Custom (OpenAI-compatible gateway).
 *
 * Auth:
 *   - Gemini/OpenAI/Custom → "Authorization: Bearer {api_key}"
 *   - Claude pure (anthropic.com) → "x-api-key: {api_key}" + "anthropic-version: 2023-06-01"
 *
 * API key tidak pernah keluar dari server.
 */
class GenericAiProvider implements AIProviderInterface, ToolCallingProvider
{
    /** Preset default base URLs (dipakai jika `baseUrl` tidak di-override user). */
    public const PROVIDER_PRESETS = [
        // Google AI Studio — OpenAI-compatible endpoint (POST {base}/chat/completions)
        'gemini' => 'https://generativelanguage.googleapis.com/v1beta/openai/',
        // Anthropic Claude — OpenAI-compatible Messages endpoint
        'claude' => 'https://api.anthropic.com/v1/',
        // OpenAI official
        'openai' => 'https://api.openai.com/v1/',
        'custom' => null,
    ];

    /** Default model per preset — cukup isi API Key saja, model auto pakai ini jika kosong. */
    public const DEFAULT_MODELS = [
        'gemini' => 'gemini-2.0-flash',
        'claude' => 'claude-sonnet-4-20250514',
        'openai' => 'gpt-4o-mini',
        'custom' => null,
    ];

    /** @var string label untuk ditampilkan di UI / pesan error. */
    public string $displayName;

    public function __construct(
        private readonly ?string $providerType = 'custom',
        private readonly ?string $baseUrl = null,
        private readonly ?string $apiKey = null,
        private readonly ?string $model = null,
        private readonly ?string $fallbackModel = null,
        private readonly int $timeout = 120,
    ) {
        $this->displayName = match ($this->providerType) {
            'gemini' => 'Google Gemini',
            'claude' => 'Anthropic Claude',
            'openai' => 'OpenAI',
            default => 'AI Provider',
        };
    }

    /** Resolved base URL — preset (jika sesuai) atau baseUrl eksplisit user. */
    public function resolvedBaseUrl(): ?string
    {
        if (filled($this->baseUrl)) {
            return rtrim((string) $this->baseUrl, '/');
        }
        $preset = self::PROVIDER_PRESETS[$this->providerType ?? 'custom'] ?? null;

        return $preset ? rtrim($preset, '/') : null;
    }

    /** Resolved model — jika user tidak isi, pakai default per preset (supaya cuma butuh API Key). */
    public function resolvedModel(): ?string
    {
        if (filled($this->model)) {
            return (string) $this->model;
        }

        return self::DEFAULT_MODELS[$this->providerType ?? 'custom'] ?? null;
    }

    public function configured(): bool
    {
        return filled($this->resolvedBaseUrl()) && filled($this->apiKey) && filled($this->resolvedModel());
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
                "{$this->displayName} belum dikonfigurasi. Lengkapi API Key (dan Base URL jika Custom)."
            );
        }

        $models = array_values(array_filter([
            $options['model'] ?? $this->resolvedModel(),
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

                continue;
            }
        }

        throw new RuntimeException('Semua model gagal: '.$lastException?->getMessage(), 0, $lastException);
    }

    public function completeWithTools(array $messages, array $tools, array $options = []): array
    {
        if (! $this->configured()) {
            throw new RuntimeException(
                "{$this->displayName} belum dikonfigurasi. Lengkapi API Key (dan Base URL jika Custom)."
            );
        }

        $models = array_values(array_filter([
            $options['model'] ?? $this->resolvedModel(),
            ($options['model'] ?? null) ? null : $this->fallbackModel,
        ]));

        $lastException = null;

        foreach ($models as $model) {
            try {
                $http = $this->httpWithAuth();
                $response = $http
                    ->timeout($options['timeout'] ?? $this->timeout)
                    ->connectTimeout(15)
                    ->post($this->resolvedBaseUrl().'/chat/completions', [
                        'model' => $model,
                        'messages' => $messages,
                        'tools' => $tools,
                        'stream' => false,
                        'temperature' => $options['temperature'] ?? 0.7,
                    ]);

                if ($response->failed()) {
                    throw new RuntimeException(sprintf(
                        'HTTP %d dari %s: %s',
                        $response->status(),
                        $this->displayName,
                        mb_substr($response->body(), 0, 300),
                    ));
                }

                $message = $response->json('choices.0.message');

                if (! is_array($message)) {
                    throw new RuntimeException("Respon {$this->displayName} tidak mengandung message.");
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
        $http = $this->httpWithAuth();
        $response = $http
            ->timeout($this->timeout)
            ->connectTimeout(15)
            ->withOptions(['stream' => true])
            ->post($this->resolvedBaseUrl().'/chat/completions', [
                'model' => $model,
                'messages' => $messages,
                'stream' => true,
                'temperature' => $options['temperature'] ?? 0.7,
            ]);

        if ($response->failed()) {
            throw new RuntimeException(sprintf(
                'HTTP %d dari %s: %s',
                $response->status(),
                $this->displayName,
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

        $content = $decoded['choices'][0]['delta']['content']
            ?? $decoded['choices'][0]['message']['content']
            ?? $decoded['content']
            ?? null;

        return is_string($content) ? $content : null;
    }

    /**
     * Ambil daftar model yang tersedia dari endpoint /models (protokol OpenAI-compatible).
     *
     * @return array<int, string> daftar model id
     */
    public function listModels(): array
    {
        $base = $this->resolvedBaseUrl();
        if (! filled($base) || ! filled($this->apiKey)) {
            throw new RuntimeException('Base URL dan API Key wajib diisi dulu.');
        }

        $http = $this->httpWithAuth();
        $response = $http
            ->timeout(20)
            ->connectTimeout(10)
            ->get($base.'/models');

        if ($response->failed()) {
            throw new RuntimeException(sprintf(
                'HTTP %d dari %s: %s',
                $response->status(),
                $this->displayName,
                mb_substr($response->body(), 0, 300),
            ));
        }

        $json = $response->json();
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
        $resolvedModel = $this->resolvedModel();

        if (! $this->configured()) {
            return [
                'ok' => false,
                'message' => "Konfigurasi belum lengkap (isi API Key dulu untuk {$this->displayName}).",
                'latency_ms' => null,
                'provider' => $this->providerType,
                'provider_label' => $this->displayName,
                'model' => $resolvedModel,
            ];
        }

        $start = microtime(true);

        try {
            $http = $this->httpWithAuth();
            $response = $http
                ->timeout(20)
                ->connectTimeout(10)
                ->post($this->resolvedBaseUrl().'/chat/completions', [
                    'model' => $resolvedModel,
                    'messages' => [['role' => 'user', 'content' => 'ping']],
                    'max_tokens' => 5,
                    'stream' => false,
                ]);
        } catch (ConnectionException $e) {
            return [
                'ok' => false,
                'message' => 'Koneksi gagal: '.$e->getMessage(),
                'latency_ms' => null,
                'provider' => $this->providerType,
                'provider_label' => $this->displayName,
                'model' => $resolvedModel,
            ];
        }

        $latency = (int) round((microtime(true) - $start) * 1000);

        if ($response->failed()) {
            return [
                'ok' => false,
                'message' => sprintf('HTTP %d: %s', $response->status(), mb_substr($response->body(), 0, 200)),
                'latency_ms' => $latency,
                'provider' => $this->providerType,
                'provider_label' => $this->displayName,
                'model' => $resolvedModel,
            ];
        }

        return [
            'ok' => true,
            'message' => sprintf('Terhubung ke %s (model %s).', $this->displayName, $resolvedModel),
            'latency_ms' => $latency,
            'provider' => $this->providerType,
            'provider_label' => $this->displayName,
            'model' => $resolvedModel,
        ];
    }

    /** Build HTTP client dengan auth header sesuai provider type. */
    private function httpWithAuth(): \Illuminate\Http\Client\PendingRequest
    {
        $http = Http::acceptJson();

        // Claude pure (anthropic.com) pakai x-api-key + anthropic-version.
        // Provider lain (Gemini/OpenAI/Custom proxy) pakai Bearer token (standard OpenAI).
        $isPureClaude = $this->providerType === 'claude'
            && str_contains((string) $this->resolvedBaseUrl(), 'anthropic.com');

        if ($isPureClaude) {
            $http = $http->withHeaders([
                'x-api-key' => (string) $this->apiKey,
                'anthropic-version' => '2023-06-01',
            ]);
        } else {
            $http = $http->withToken((string) $this->apiKey);
        }

        return $http;
    }
}
