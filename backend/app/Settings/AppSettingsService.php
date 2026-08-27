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
            // ---- AI Provider (Generic: Gemini / Claude / OpenAI / Custom) ----
            'ai.default' => [
                'config' => 'ai.default',
                'type' => 'string',
                'secret' => false,
                'label' => 'Default AI Provider',
                'group' => 'ai',
                'help' => 'local = offline demo responder; generic = API key langsung (Gemini/Claude/OpenAI/Custom).',
            ],
            'ai.providers.generic.provider_type' => [
                'config' => 'ai.providers.generic.provider_type',
                'type' => 'string',
                'secret' => false,
                'label' => 'Provider AI',
                'group' => 'ai',
                'help' => 'Pilih preset — Base URL otomatis terisi sesuai provider. Custom = isi Base URL sendiri.',
            ],
            'ai.providers.generic.base_url' => [
                'config' => 'ai.providers.generic.base_url',
                'type' => 'string',
                'secret' => false,
                'label' => 'Base URL (Endpoint)',
                'group' => 'ai',
                'placeholder' => '(otomatis sesuai provider) — Custom: https://your-gateway.com/v1',
                'help' => 'Preset Gemini/Claude/OpenAI: otomatis terisi. Pilih Custom untuk gateway lain (OpenRouter, 9Router, dst).',
            ],
            'ai.providers.generic.api_key' => [
                'config' => 'ai.providers.generic.api_key',
                'type' => 'string',
                'secret' => true,
                'label' => 'API Key',
                'group' => 'ai',
                'placeholder' => 'sk-... / AIza... / antpk-...',
                'help' => 'Secret — hanya disimpan server, tidak ditampilkan kembali ke UI.',
            ],
            'ai.providers.generic.model' => [
                'config' => 'ai.providers.generic.model',
                'type' => 'string',
                'secret' => false,
                'label' => 'Model Utama',
                'group' => 'ai',
                'placeholder' => 'gemini-2.0-flash / claude-sonnet-4 / gpt-4o-mini / ...',
                'help' => 'Nama model persis. Contoh: gemini-2.0-flash, claude-sonnet-4-20250514, gpt-4o-mini, hermes. Jika provider mendukung /models — daftar model muncul otomatis setelah Base URL + API Key terisi.',
            ],
            'ai.providers.generic.fallback_model' => [
                'config' => 'ai.providers.generic.fallback_model',
                'type' => 'string',
                'secret' => false,
                'label' => 'Fallback Model (Opsional)',
                'group' => 'ai',
                'placeholder' => '(kosong = tanpa fallback)',
                'help' => 'Otomatis dipakai jika model utama gagal/timeout. Kosongkan jika tidak perlu fallback.',
            ],
            'ai.providers.generic.timeout' => [
                'config' => 'ai.providers.generic.timeout',
                'type' => 'integer',
                'secret' => false,
                'label' => 'Timeout (detik)',
                'group' => 'ai',
                'help' => 'Detik. Model reasoning (Claude Think, Gemini Thinking) disarankan 120+ detik.',
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
