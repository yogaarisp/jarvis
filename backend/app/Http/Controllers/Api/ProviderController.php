<?php

namespace App\Http\Controllers\Api;

use App\AI\AIProviderManager;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;

class ProviderController extends Controller
{
    public function __construct(private readonly AIProviderManager $providers) {}

    public function test(): JsonResponse
    {
        $result = $this->providers->testConnection();

        return response()->json([
            'provider' => $this->providers->defaultProviderName(),
            ...$result,
        ]);
    }
}
