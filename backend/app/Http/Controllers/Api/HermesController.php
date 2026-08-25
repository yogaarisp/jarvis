<?php

namespace App\Http\Controllers\Api;

use App\Hermes\HermesService;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class HermesController extends Controller
{
    public function __construct(protected HermesService $hermes) {}

    /**
     * GET /api/hermes/status — status koneksi ke Hermes.
     */
    public function status(): JsonResponse
    {
        return response()->json($this->hermes->status());
    }

    /**
     * GET /api/hermes/tools — daftar tool yang tersedia di Hermes.
     */
    public function tools(): JsonResponse
    {
        $response = $this->hermes->tools();

        return response()->json($response, $response['ok'] ? 200 : 503);
    }

    /**
     * POST /api/hermes/invoke — eksekusi satu tool di Hermes.
     * Body: { "tool": "system.health_check", "params": { ... } }
     *
     * Catatan: Permission Engine penuh (READ/CONTROLLED/DANGEROUS) menyusul di Phase 6.
     */
    public function invoke(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'tool' => ['required', 'string', 'max:64'],
            'params' => ['nullable', 'array'],
        ]);

        $result = $this->hermes->executeTool(
            tool: $validated['tool'],
            params: $validated['params'] ?? [],
            user: $request->user(),
        );

        if (! $result['ok']) {
            // 422 untuk masalah input, 503 untuk Hermes tidak tersedia.
            $status = str_contains((string) ($result['error'] ?? ''), 'tidak valid') ? 422 : 503;

            return response()->json(['ok' => false, 'error' => $result['error'], 'tool' => $result['tool']], $status);
        }

        return response()->json([
            'ok' => true,
            'tool' => $result['tool'],
            'result' => $result['result'],
            'latency_ms' => $result['latency_ms'],
        ]);
    }
}
