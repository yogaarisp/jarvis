<?php

namespace App\Http\Controllers\Api;

use App\AI\AIProviderManager;
use App\AI\GenericAiProvider;
use App\Http\Controllers\Controller;
use App\Settings\AppSettingsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Settings UI — edit AI Provider (Gemini/Claude/OpenAI/Custom) via API Key langsung.
 * Semua secret (API key) tidak pernah dikirim sebagai teks ke UI; hanya ditandai is_filled.
 */
class SettingController extends Controller
{
    public function __construct(
        protected AppSettingsService $settings,
    ) {}

    public function index(): JsonResponse
    {
        return $this->success([
            'groups' => [
                'ai' => 'AI Provider — Gemini / Claude / OpenAI / Custom',
                'jarvis' => 'JARVIS Umum',
            ],
            'items' => $this->settings->allForFrontend(),
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $schema = $this->settings->schema();

        // Validasi dinamis sesuai schema.
        // Key schema mengandung titik (mis. "ai.default"); dalam rules Laravel titik
        // berarti array bersarang, sehingga harus di-escape ("\.") agar divalidasi
        // sebagai key literal dari body JSON datar yang dikirim UI.
        $rules = [];
        foreach ($schema as $key => $meta) {
            $field = str_replace('.', '\\.', $key);

            switch ($meta['type']) {
                case 'integer':
                    $rules[$field] = ['sometimes', 'nullable', 'integer', 'min:0'];
                    break;
                case 'boolean':
                    $rules[$field] = ['sometimes', 'boolean'];
                    break;
                default:
                    if (str_ends_with($key, 'base_url')) {
                        $rules[$field] = ['sometimes', 'nullable', 'url'];
                    } else {
                        $rules[$field] = ['sometimes', 'nullable', 'string', 'max:2000'];
                    }
            }
        }

        $payload = $request->validate($rules);
        $saved = $this->settings->updateMany($payload);

        return $this->success([
            'saved' => $saved,
            'items' => $this->settings->allForFrontend(),
        ], 'Pengaturan disimpan.');
    }

    /** Test koneksi provider AI saat ini (sesuai DB setting). */
    public function testAi(AIProviderManager $manager): JsonResponse
    {
        try {
            $result = $manager->testConnection();
        } catch (\Throwable $e) {
            return $this->success([
                'provider' => $manager->defaultProviderName(),
                'ok' => false,
                'message' => $e->getMessage(),
                'latency_ms' => null,
            ]);
        }

        return $this->success([
            'provider' => $manager->defaultProviderName(),
            ...$result,
        ]);
    }

    /**
     * Daftar model dari provider AI (endpoint /models — protokol OpenAI-compatible).
     * Base URL / API Key boleh dikirim dari form (belum tersimpan);
     * kalau tidak, pakai nilai config yang sudah di-apply dari DB.
     * Parameter `provider_type` (opsional) untuk preset auth header (khusus Claude pure).
     */
    public function aiModels(Request $request): JsonResponse
    {
        $payload = $request->validate([
            'base_url' => ['sometimes', 'nullable', 'url'],
            'api_key' => ['sometimes', 'nullable', 'string'],
            'provider_type' => ['sometimes', 'nullable', 'string', 'in:gemini,claude,openai,custom'],
        ]);

        $providerType = ($payload['provider_type'] ?? null)
            ?: (string) config('ai.providers.generic.provider_type', 'custom');
        $baseUrl = ($payload['base_url'] ?? null)
            ?: (string) config('ai.providers.generic.base_url');
        $apiKey = ($payload['api_key'] ?? null)
            ?: (string) config('ai.providers.generic.api_key');

        if (! filled($baseUrl) || ! filled($apiKey)) {
            return $this->success([
                'ok' => false,
                'models' => [],
                'message' => 'Isi dulu Base URL dan API Key.',
            ]);
        }

        try {
            $provider = new GenericAiProvider(
                providerType: $providerType,
                baseUrl: $baseUrl,
                apiKey: $apiKey,
            );

            return $this->success([
                'ok' => true,
                'models' => $provider->listModels(),
            ]);
        } catch (\Throwable $e) {
            return $this->success([
                'ok' => false,
                'models' => [],
                'message' => $e->getMessage(),
            ]);
        }
    }
}
