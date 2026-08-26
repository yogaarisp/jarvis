<?php

namespace App\Http\Controllers\Api;

use App\AI\AIProviderManager;
use App\AI\NineRouterProvider;
use App\Hermes\HermesClient;
use App\Http\Controllers\Controller;
use App\Settings\AppSettingsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Settings UI untuk Keenan — edit AI key, 9Router, Hermes, dan misc.
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
                'ai' => 'AI Provider & 9Router',
                'hermes' => 'Hermes — Agent/Tool Worker',
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
     * Daftar model yang tersedia di gateway 9Router.
     * Base URL / API Key boleh dikirim dari form (belum tersimpan);
     * kalau tidak, pakai nilai config yang sudah di-apply dari DB.
     */
    public function aiModels(Request $request): JsonResponse
    {
        $payload = $request->validate([
            'base_url' => ['sometimes', 'nullable', 'url'],
            'api_key' => ['sometimes', 'nullable', 'string'],
        ]);

        $baseUrl = ($payload['base_url'] ?? null) ?: (string) config('ai.providers.nine_router.base_url');
        $apiKey = ($payload['api_key'] ?? null) ?: (string) config('ai.providers.nine_router.api_key');

        if (! filled($baseUrl) || ! filled($apiKey)) {
            return $this->success([
                'ok' => false,
                'models' => [],
                'message' => 'Isi dulu 9Router Base URL dan API Key.',
            ]);
        }

        try {
            $provider = new NineRouterProvider(baseUrl: $baseUrl, apiKey: $apiKey);

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

    /** Test koneksi Hermes (setelah setting DB di-apply). */
    public function testHermes(): JsonResponse
    {
        $client = app(HermesClient::class);

        return $this->success($client->testConnection());
    }
}
