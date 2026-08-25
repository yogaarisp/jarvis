<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Hermes — execution / agent layer
    |--------------------------------------------------------------------------
    |
    | Kredensial TIDAK PERNAH dikirim ke frontend. Seluruh komunikasi
    | ke Hermes dilakukan server-side melalui App\Hermes\HermesClient.
    |
    */

    'base_url' => env('HERMES_BASE_URL'),

    'api_key' => env('HERMES_API_KEY'),

    // detik
    'timeout' => (int) env('HERMES_TIMEOUT', 30),
];
