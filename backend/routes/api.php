<?php

use App\Http\Controllers\Api\AgentController;
use App\Http\Controllers\Api\AuditController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\ChatController;
use App\Http\Controllers\Api\ConversationController;
use App\Http\Controllers\Api\HermesController;
use App\Http\Controllers\Api\MemoryController;
use App\Http\Controllers\Api\MissionController;
use App\Http\Controllers\Api\ProviderController;
use App\Http\Controllers\Api\ResearchController;
use App\Http\Controllers\Api\SettingController;
use App\Http\Controllers\Api\SkillController;
use App\Http\Controllers\Api\SystemController;
use App\Http\Controllers\Api\TelegramWebhookController;
use App\Http\Controllers\Api\TtsController;
use App\Http\Controllers\Api\WakeSettingController;
use Illuminate\Support\Facades\Route;

Route::get('/auth/unauthenticated', fn () => response()->json(['message' => 'Unauthenticated.'], 401))->name('login');
Route::post('/auth/login', [AuthController::class, 'login'])->middleware('throttle:10,1');
Route::post('/telegram/webhook', [TelegramWebhookController::class, 'handle']);
Route::get('/telegram/status', [TelegramWebhookController::class, 'status']);
Route::get('/tts/previews', [TtsController::class, 'previews']);
Route::get('/tts/previews/{filename}', [TtsController::class, 'streamPreview']);

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/me', [AuthController::class, 'me']);
    Route::post('/auth/logout', [AuthController::class, 'logout']);

    Route::post('/chat', [ChatController::class, 'store']);

    Route::post('/providers/test', [ProviderController::class, 'test']);

    Route::get('/hermes/status', [HermesController::class, 'status']);
    Route::get('/hermes/tools', [HermesController::class, 'tools']);
    Route::post('/hermes/invoke', [HermesController::class, 'invoke']);

    Route::get('/agents', [AgentController::class, 'index']);
    Route::get('/agents/{agent}', [AgentController::class, 'show']);

    Route::get('/missions', [MissionController::class, 'index']);
    Route::post('/missions', [MissionController::class, 'store']);
    Route::get('/missions/{mission}', [MissionController::class, 'show']);
    Route::post('/missions/{mission}/approve', [MissionController::class, 'approve']);
    Route::post('/missions/{mission}/cancel', [MissionController::class, 'cancel']);
    Route::get('/missions/{mission}/stream', [MissionController::class, 'stream']);

    Route::get('/audit', [AuditController::class, 'index']);

    Route::get('/conversations', [ConversationController::class, 'index']);
    Route::get('/conversations/{conversation}', [ConversationController::class, 'show']);
    Route::delete('/conversations/{conversation}', [ConversationController::class, 'destroy']);

    // Phase 8 — Wake Engine preferences (PRD §5).
    Route::get('/wake-settings', [WakeSettingController::class, 'show']);
    Route::put('/wake-settings', [WakeSettingController::class, 'update']);

    // Phase 9 — Agent RESEARCH (PRD §13).
    Route::post('/research', [ResearchController::class, 'run']);

    // Settings UI — AI keys, 9Router, Hermes, JARVIS misc.
    Route::get('/settings', [SettingController::class, 'index']);
    Route::put('/settings', [SettingController::class, 'update']);
    Route::post('/settings/test-ai', [SettingController::class, 'testAi']);
    Route::post('/settings/test-hermes', [SettingController::class, 'testHermes']);

    // PRD §7 — TTS neural server (Edge TTS gratis + XTTS clone lokal).
    Route::get('/tts', [TtsController::class, 'speak']);
    Route::get('/tts/clone', [TtsController::class, 'speakClone']);

    // PRD §17 — Memory: skill & memori jangka panjang JARVIS.
    Route::get('/skills', [SkillController::class, 'index']);
    Route::post('/skills', [SkillController::class, 'store']);
    Route::put('/skills/{skill}', [SkillController::class, 'update']);
    Route::delete('/skills/{skill}', [SkillController::class, 'destroy']);

    Route::get('/memories', [MemoryController::class, 'index']);
    Route::post('/memories', [MemoryController::class, 'store']);
    Route::delete('/memories/{memory}', [MemoryController::class, 'destroy']);

    // Phase 10 — Telemetri hardware server (CPU, RAM, disk, suhu).
    Route::get('/system/telemetry', [SystemController::class, 'telemetry']);

    // Phase 10 — Telemetri lingkungan (IP pengunjung, lokasi, cuaca real).
    Route::get('/system/env', [SystemController::class, 'env']);
});
