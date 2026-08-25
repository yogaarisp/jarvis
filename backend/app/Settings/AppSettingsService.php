<?php

namespace App\Settings;

use App\Models\AppSetting;

/**
 * Jembatan antara tabel `app_settings` dengan config Laravel runtime.
 *
 * Dipanggil dari AppServiceProvider agar AIProviderManager / HermesClient yang
 * membaca `config('ai.*')` / `config('hermes.*')` otomatis pakai nilai dari DB
 * (kalau user sudah simpan di Settings UI), dengan fallback ke env / default.
 */
class AppSettingsService
{
    /**
     * Mapping key DB => key config Laravel.
     *
     * Kolom `secret` bernilai true untuk kunci API — value tidak akan dikirim
     * ke frontend sebagai teks asli (hanya dikirim boolean "terisi atau belum").
     *
     * @return array<string, array{config: string, type: 'string'|'integer'|'boolean', secret: bool, label: string, group: string, placeholder?: string, help?: string}>
     */
    public function schema(): array
    {
        return [
            // ---- AI / 9Router ----
            'ai.default' => [
                'config' => 'ai.default',
                'type' => 'string',
                'secret' => false,
                'label' => 'Default AI Provider',
                'group' => 'ai',
                'help' => 'local = offline demo responder; nine_router = gateway OpenAI-compatible.',
            ],
            'ai.providers.nine_router.base_url' => [
                'config' => 'ai.providers.nine_router.base_url',
                'type' => 'string',
                'secret' => false,
                'label' => '9Router Base URL',
                'group' => 'ai',
                'placeholder' => 'https://api.9router.com/v1',
                'help' => 'Endpoint base URL gateway OpenAI-compatible.',
            ],
            'ai.providers.nine_router.api_key' => [
                'config' => 'ai.providers.nine_router.api_key',
                'type' => 'string',
                'secret' => true,
                'label' => '9Router API Key',
                'group' => 'ai',
                'placeholder' => 'sk-...',
                'help' => 'Secret — hanya disimpan server, tidak ditampilkan kembali ke UI.',
            ],
            'ai.providers.nine_router.model' => [
                'config' => 'ai.providers.nine_router.model',
                'type' => 'string',
                'secret' => false,
                'label' => '9Router Model Utama',
                'group' => 'ai',
                'placeholder' => 'gpt-4o-mini',
            ],
            'ai.providers.nine_router.fallback_model' => [
                'config' => 'ai.providers.nine_router.fallback_model',
                'type' => 'string',
                'secret' => false,
                'label' => '9Router Fallback Model',
                'group' => 'ai',
                'placeholder' => '(opsional) gpt-4o',
            ],
            'ai.providers.nine_router.timeout' => [
                'config' => 'ai.providers.nine_router.timeout',
                'type' => 'integer',
                'secret' => false,
                'label' => 'Timeout (detik)',
                'group' => 'ai',
            ],

            // ---- Hermes ----
            'hermes.base_url' => [
                'config' => 'hermes.base_url',
                'type' => 'string',
                'secret' => false,
                'label' => 'Hermes Base URL',
                'group' => 'hermes',
                'placeholder' => 'http://hermes.local:8080',
                'help' => 'Eksekusi tool eksternal & agent worker.',
            ],
            'hermes.api_key' => [
                'config' => 'hermes.api_key',
                'type' => 'string',
                'secret' => true,
                'label' => 'Hermes API Key',
                'group' => 'hermes',
                'placeholder' => 'Bearer token Hermes',
                'help' => 'Secret — tidak ditampilkan kembali ke UI.',
            ],
            'hermes.timeout' => [
                'config' => 'hermes.timeout',
                'type' => 'integer',
                'secret' => false,
                'label' => 'Hermes Timeout (detik)',
                'group' => 'hermes',
            ],

            // ---- JARVIS misc ----
            'jarvis.system_prompt' => [
                'config' => 'jarvis.system_prompt',
                'type' => 'string',
                'secret' => false,
                'label' => 'System Prompt Utama',
                'group' => 'jarvis',
                'help' => 'Persona default JARVIS. Bisa diubah kapan saja.',
            ],
            'jarvis.research.max_sources' => [
                'config' => 'jarvis.research.max_sources',
                'type' => 'integer',
                'secret' => false,
                'label' => 'Research — Max Sources',
                'group' => 'jarvis',
            ],
            'jarvis.research.max_iterations' => [
                'config' => 'jarvis.research.max_iterations',
                'type' => 'integer',
                'secret' => false,
                'label' => 'Research — Max Iterations',
                'group' => 'jarvis',
            ],

            // ---- TTS neural server ----
            'jarvis.tts.voice' => [
                'config' => 'jarvis.tts.voice',
                'type' => 'string',
                'secret' => false,
                'label' => 'Suara JARVIS (Edge Neural)',
                'group' => 'jarvis',
                'placeholder' => 'en-GB-RyanNeural',
                'help' => 'Contoh: en-GB-RyanNeural (pria Inggris), en-GB-ThomasNeural, id-ID-ArdiNeural.',
            ],
            'jarvis.tts.rate' => [
                'config' => 'jarvis.tts.rate',
                'type' => 'string',
                'secret' => false,
                'label' => 'Kecepatan Bicara TTS',
                'group' => 'jarvis',
                'placeholder' => '-4%',
            ],
        ];
    }

    /**
     * Ambil semua setting untuk dikirim ke frontend.
     * Secret hanya ditandai "terisi atau tidak" (is_filled) — value asli dihapus.
     *
     * @return array<string, array{
     *     key: string,
     *     value: string|int|bool|null,
     *     is_filled: bool,
     *     type: 'string'|'integer'|'boolean',
     *     secret: bool,
     *     label: string,
     *     group: string,
     *     placeholder?: string,
     *     help?: string
     * }>
     */
    public function allForFrontend(): array
    {
        $schema = $this->schema();
        $out = [];

        foreach ($schema as $key => $meta) {
            $raw = AppSetting::raw($key);
            $configured = $raw !== null && $raw !== '';
            $value = $meta['secret'] ? null : AppSetting::getValue($key);
            $out[$key] = [
                'key' => $key,
                'value' => $value,
                'is_filled' => $configured,
                'type' => $meta['type'],
                'secret' => $meta['secret'],
                'label' => $meta['label'],
                'group' => $meta['group'],
            ] + array_filter([
                'placeholder' => $meta['placeholder'] ?? null,
                'help' => $meta['help'] ?? null,
            ]);
        }

        return $out;
    }

    /**
     * Simpan banyak key sekaligus dari input UI.
     * Input kosong (string kosong) pada field secret diartikan "jangan rubah".
     *
     * @param  array<string, mixed>  $payload
     * @return array<string> key yang berhasil disimpan
     */
    public function updateMany(array $payload): array
    {
        $schema = $this->schema();
        $saved = [];

        foreach ($payload as $key => $incoming) {
            if (! isset($schema[$key])) {
                continue;
            }
            $meta = $schema[$key];

            if ($meta['secret'] && $incoming === '') {
                // User tidak mengirim apa-apa ke field secret = skip.
                // Ini memungkinkan update group AI tanpa kirim API key berulang.
                continue;
            }

            if ($meta['secret']) {
                $value = $incoming === null ? null : (string) $incoming;
            } else {
                $value = match ($meta['type']) {
                    'boolean' => (bool) $incoming ? '1' : '0',
                    'integer' => (string) (int) ($incoming ?? 0),
                    default => $incoming === null ? null : (string) $incoming,
                };
            }

            AppSetting::query()->updateOrCreate(
                ['key' => $key],
                [
                    'value' => $value,
                    'type' => $meta['type'],
                    'secret' => $meta['secret'],
                ],
            );
            $saved[] = $key;
        }

        return $saved;
    }

    /**
     * Terapkan nilai DB ke config Laravel runtime.
     * Dipanggil oleh AppServiceProvider boot().
     */
    public function applyToConfig(): void
    {
        foreach ($this->schema() as $key => $meta) {
            if (! AppSetting::query()->where('key', $key)->exists()) {
                continue;
            }
            $value = AppSetting::getValue($key);
            config()->set($meta['config'], $value);
        }
    }
}
