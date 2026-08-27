<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Default AI Provider
    |--------------------------------------------------------------------------
    |
    | "local"   = offline demo (cocok untuk test UI tanpa API key)
    | "generic" = generic OpenAI-compatible. Pilih preset: gemini, claude, openai, custom.
    |             Bisa atur PROVIDER + API KEY langsung di UI Settings (disimpan DB).
    |
    */
    'default' => env('AI_PROVIDER', 'local'),

    'providers' => [

        'local' => [
            'driver' => 'local',
        ],

        'generic' => [
            'driver' => 'generic',

            // Provider preset: 'gemini' | 'claude' | 'openai' | 'custom'
            // Menentukan default base URL (jika base_url tidak di-set manual) dan label UI.
            'provider_type' => env('AI_PROVIDER_TYPE', 'custom'),

            // Jika kosong, pakai preset default di atas:
            //   gemini → https://generativelanguage.googleapis.com/v1beta/
            //   claude → https://api.anthropic.com/v1/
            //   openai → https://api.openai.com/v1/
            //   custom → WAJIB diisi user.
            'base_url' => env('AI_BASE_URL'),

            'api_key' => env('AI_API_KEY'),

            // Model utama & fallback (nama model sesuai provider masing-masing,
            // mis. gemini-2.0-flash, claude-sonnet-4-20250514, gpt-4o-mini, hermes, combo-jarvis dll)
            'model' => env('AI_MODEL'),
            'fallback_model' => env('AI_FALLBACK_MODEL'),

            // Timeout detik. Model reasoning (claude think, gemini thinking) butuh tinggi.
            'timeout' => (int) env('AI_TIMEOUT', 120),
        ],

        // Legacy alias nine_router → arahkan ke driver generic (kompatibel backward).
        // Struktur DB ai.providers.nine_router.* tetap bisa terbaca oleh AppSettingsService.
        'nine_router' => [
            'driver' => 'generic',
            'provider_type' => 'custom',
            'base_url' => env('NINE_ROUTER_BASE_URL'),
            'api_key' => env('NINE_ROUTER_API_KEY'),
            'model' => env('NINE_ROUTER_MODEL'),
            'fallback_model' => env('NINE_ROUTER_FALLBACK_MODEL'),
            'timeout' => (int) env('NINE_ROUTER_TIMEOUT', 120),
        ],

    ],

];
