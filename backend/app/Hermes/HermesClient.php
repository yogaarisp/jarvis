<?php

namespace App\Hermes;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * HTTP client untuk Hermes (execution/agent layer).
 *
 * Kontrak endpoint yang diharapkan:
 *   GET  {base_url}/health              -> 200 JSON apapun berarti hidup
 *   GET  {base_url}/tools               -> { "tools": [ { "name": "...", ... }, ... ] }
 *   POST {base_url}/tools/{tool}/invoke -> hasil eksekusi tool (JSON)
 *
 * Autentikasi: header `Authorization: Bearer {api_key}`.
 */
class HermesClient
{
    public function __construct(
        protected ?string $baseUrl = null,
        protected ?string $apiKey = null,
        protected int $timeout = 30,
    ) {
        $this->baseUrl ??= config('hermes.base_url');
        $this->apiKey ??= config('hermes.api_key');
        $this->timeout = (int) ($this->timeout ?: config('hermes.timeout', 30));
    }

    public function configured(): bool
    {
        return filled($this->baseUrl) && filled($this->apiKey);
    }

    /**
     * Cek koneksi ke Hermes. Return: {ok, message, latency_ms}.
     */
    public function testConnection(): array
    {
        if (! $this->configured()) {
            return ['ok' => false, 'message' => 'Hermes belum dikonfigurasi (HERMES_BASE_URL / HERMES_API_KEY).', 'latency_ms' => null];
        }

        $start = microtime(true);

        try {
            $response = $this->request()->get($this->url('/health'));
        } catch (ConnectionException $e) {
            return ['ok' => false, 'message' => 'Tidak dapat terhubung ke Hermes: '.$e->getMessage(), 'latency_ms' => null];
        }

        $latency = (int) ((microtime(true) - $start) * 1000);

        if ($response->status() === 401 || $response->status() === 403) {
            return ['ok' => false, 'message' => 'Autentikasi Hermes ditolak (periksa HERMES_API_KEY).', 'latency_ms' => $latency];
        }

        if (! $response->successful()) {
            return ['ok' => false, 'message' => "Hermes merespons HTTP {$response->status()}.", 'latency_ms' => $latency];
        }

        return ['ok' => true, 'message' => 'Hermes terhubung.', 'latency_ms' => $latency];
    }

    /**
     * Daftar tool yang tersedia di Hermes.
     * Return: {ok, tools, message?}
     */
    public function listTools(): array
    {
        if (! $this->configured()) {
            return ['ok' => false, 'tools' => [], 'message' => 'Hermes belum dikonfigurasi.'];
        }

        try {
            $response = $this->request()->get($this->url('/tools'));
        } catch (ConnectionException $e) {
            return ['ok' => false, 'tools' => [], 'message' => 'Tidak dapat terhubung ke Hermes: '.$e->getMessage()];
        }

        if (! $response->successful()) {
            return ['ok' => false, 'tools' => [], 'message' => "Hermes merespons HTTP {$response->status()}."];
        }

        $payload = $response->json() ?? [];

        return [
            'ok' => true,
            'tools' => array_values($payload['tools'] ?? []),
        ];
    }

    /**
     * Eksekusi satu tool di Hermes.
     * Return normalisasi: {ok, result|error, status}.
     */
    public function invokeTool(string $tool, array $params = []): array
    {
        if (! $this->configured()) {
            return ['ok' => false, 'error' => 'Hermes belum dikonfigurasi.', 'status' => null];
        }

        try {
            $response = $this->request()->post($this->url("/tools/{$tool}/invoke"), $params);
        } catch (ConnectionException $e) {
            Log::warning('Hermes invoke gagal (koneksi).', ['tool' => $tool, 'error' => $e->getMessage()]);

            return ['ok' => false, 'error' => 'Tidak dapat terhubung ke Hermes.', 'status' => null];
        }

        if ($response->status() === 401 || $response->status() === 403) {
            return ['ok' => false, 'error' => 'Autentikasi Hermes ditolak.', 'status' => $response->status()];
        }

        if (! $response->successful()) {
            $message = $response->json('message') ?? $response->json('error') ?? "Hermes merespons HTTP {$response->status()}.";

            return ['ok' => false, 'error' => $message, 'status' => $response->status()];
        }

        return [
            'ok' => true,
            'result' => $response->json() ?? [],
            'status' => $response->status(),
        ];
    }

    /* ------------------------------------------------------------------ */

    protected function request(): PendingRequest
    {
        return Http::timeout($this->timeout)
            ->withToken((string) $this->apiKey)
            ->acceptJson()
            ->withHeaders(['X-Hermes-Source' => 'jarvis-backend']);
    }

    protected function url(string $path): string
    {
        return rtrim((string) $this->baseUrl, '/').$path;
    }
}
