<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\WakeSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Wake settings (PRD §5): enable/disable clap, pola tepukan,
 * sensitivitas, jendela deteksi, dan cooldown.
 */
class WakeSettingController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $settings = WakeSetting::forUser($request->user()->id);

        return response()->json(['wake_settings' => $settings]);
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'clap_enabled' => ['sometimes', 'boolean'],
            'claps_required' => ['sometimes', 'integer', 'min:2', 'max:3'],
            'sensitivity' => ['sometimes', 'string', 'in:low,medium,high'],
            // PRD §5 default window 500–700ms; rentang diperluas sedikit untuk eksperimen.
            'window_ms' => ['sometimes', 'integer', 'min:300', 'max:1500'],
            'cooldown_ms' => ['sometimes', 'integer', 'min:500', 'max:10000'],
        ]);

        $settings = WakeSetting::forUser($request->user()->id);
        $settings->update($data);

        return response()->json(['wake_settings' => $settings->fresh()]);
    }
}
