<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Default AI provider
    |--------------------------------------------------------------------------
    |
    | 'local'      -> offline demo responder (tanpa API key)
    | 'nine_router' -> 9Router gateway (butuh 9ROUTER_* env)
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
            'base_url' => env('9ROUTER_BASE_URL'),
            'api_key' => env('9ROUTER_API_KEY'),
            'model' => env('9ROUTER_MODEL'),
            'fallback_model' => env('9ROUTER_FALLBACK_MODEL'),
            'timeout' => (int) env('9ROUTER_TIMEOUT', 120),
        ],

    ],
];
