<?php

namespace App\Hermes;

use App\Models\User;
use Illuminate\Support\Facades\Log;

/**
 * Layer service di atas HermesClient.
 *
 * Alur PRD: JARVIS Backend -> Permission Engine -> Hermes Client -> Hermes -> Tool -> Result.
 * Permission Engine penuh menyusul di Phase 6; untuk saat service ini
 * memvalidasi format nama tool dan mencatat audit dasar (log).
 */
class HermesService
{
    /** Format nama tool: huruf kecil/angka, dipisah titik, titik dua, atau garis bawah. Contoh: system.health_check */
    protected const TOOL_NAME_PATTERN = '/^[a-z0-9][a-z0-9_.:-]{0,63}$/';

    public function __construct(protected HermesClient $client) {}

    /**
     * Eksekusi tool dengan validasi + pencatatan.
     *
     * @return array{ok: bool, tool: string, result?: mixed, error?: string, latency_ms: int}
     */
    public function executeTool(string $tool, array $params = [], ?User $user = null): array
    {
        $tool = trim($tool);

        if ($tool === '' || ! preg_match(self::TOOL_NAME_PATTERN, $tool)) {
            return ['ok' => false, 'tool' => $tool, 'error' => 'Format nama tool tidak valid.', 'latency_ms' => 0];
        }

        $start = microtime(true);
        $response = $this->client->invokeTool($tool, $params);
        $latency = (int) ((microtime(true) - $start) * 1000);

        Log::info('Hermes tool invocation', [
            'tool' => $tool,
            'user_id' => $user?->id,
            'ok' => $response['ok'],
            'latency_ms' => $latency,
        ]);

        return [
            'ok' => $response['ok'],
            'tool' => $tool,
            ...$response['ok']
                ? ['result' => $response['result']]
                : ['error' => $response['error']],
            'latency_ms' => $latency,
        ];
    }

    /**
     * Daftar tool yang tersedia di Hermes.
     *
     * @return array{ok: bool, tools: array, message?: string}
     */
    public function tools(): array
    {
        return $this->client->listTools();
    }

    /**
     * Status koneksi Hermes.
     *
     * @return array{ok: bool, message: string, latency_ms: ?int, configured: bool}
     */
    public function status(): array
    {
        $result = $this->client->testConnection();

        return [...$result, 'configured' => $this->client->configured()];
    }
}
