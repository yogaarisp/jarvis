<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\UserPreference;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class UserPreferenceController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $prefs = UserPreference::forUser($request->user()->id);

        return response()->json([
            'voice_prefs' => $prefs->voice_prefs,
            'updated_at' => $prefs->updated_at?->toIso8601String(),
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'voice_prefs' => ['required', 'array'],
            'voice_prefs.sttEnabled' => ['sometimes', 'boolean'],
            'voice_prefs.ttsEnabled' => ['sometimes', 'boolean'],
            'voice_prefs.ttsRate' => ['sometimes', 'numeric', 'min:0.5', 'max:2'],
            'voice_prefs.ttsPitch' => ['sometimes', 'numeric', 'min:0', 'max:2'],
            'voice_prefs.language' => ['sometimes', 'string', 'max:16'],
            'voice_prefs.ttsEngine' => ['sometimes', 'string', 'in:browser,server'],
            'voice_prefs.ttsServerVoice' => ['sometimes', 'nullable', 'string', 'max:128'],
            'voice_prefs.voiceName' => ['sometimes', 'nullable', 'string', 'max:255'],
        ]);

        $prefs = UserPreference::forUser($request->user()->id);
        $prefs->update($data);

        $fresh = $prefs->fresh();

        return response()->json([
            'voice_prefs' => $fresh->voice_prefs,
            'updated_at' => $fresh->updated_at?->toIso8601String(),
        ]);
    }
}
