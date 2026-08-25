<?php

namespace App\Http\Controllers\Api;

use App\AI\AIProviderManager;
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

        // Validasi dinamis sesuai schema
        $rules = [];
        foreach ($schema as $key => $meta) {
            switch ($meta['type']) {
                case 'integer':
                    $rules[$key] = ['sometimes', 'nullable', 'integer', 'min:0'];
                    break;
                case 'boolean':
                    $rules[$key] = ['sometimes', 'boolean'];
                    break;
                default:
                    if (str_ends_with($key, 'base_url')) {
                        $rules[$key] = ['sometimes', 'nullable', 'url'];
                    } else {
                        $rules[$key] = ['sometimes', 'nullable', 'string', 'max:2000'];
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

    /** Test koneksi Hermes (setelah setting DB di-apply). */
    public function testHermes(): JsonResponse
    {
        $client = app(HermesClient::class);

        return $this->success($client->testConnection());
    }
}
