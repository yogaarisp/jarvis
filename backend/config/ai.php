<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Default AI provider
    |--------------------------------------------------------------------------
    |
    | 'local'      -> offline demo responder (tanpa API key)
    | 'nine_router' -> 9Router gateway (butuh NINE_ROUTER_* env)
    |   Catatan: nama env diawali huruf, BUKAN angka (9ROUTER_* tidak terbaca
    |   oleh PHP built-in server / php artisan serve).
    |
    */
    'default' => env('AI_PROVIDER', 'local'),

    'providers' => [

        'local' => [
            'driver' => 'local',
        ],

        'nine_router' => [
            'driver' => 'nine_router',
            // contoh: https://api.9router.com/v1
            'base_url' => env('NINE_ROUTER_BASE_URL'),
            'api_key' => env('NINE_ROUTER_API_KEY'),
            'model' => env('NINE_ROUTER_MODEL'),
            'fallback_model' => env('NINE_ROUTER_FALLBACK_MODEL'),
            'timeout' => (int) env('NINE_ROUTER_TIMEOUT', 120),
        ],

    ],
];
