<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\EnvTelemetry;
use App\Services\SystemTelemetry;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SystemController extends Controller
{
    public function __construct(
        private readonly SystemTelemetry $telemetry,
        private readonly EnvTelemetry $env,
    ) {}

    public function telemetry(): JsonResponse
    {
        return $this->success($this->telemetry->snapshot());
    }

    public function env(Request $request): JsonResponse
    {
        return $this->success($this->env->snapshot($request));
    }
}
