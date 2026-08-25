<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\TelegramService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TelegramWebhookController extends Controller
{
    public function __construct(protected TelegramService $telegram) {}

    /**
     * Endpoint webhook Telegram: POST /api/telegram/webhook
     */
    public function handle(Request $request): JsonResponse
    {
        $update = $request->all();
        if (! empty($update)) {
            $this->telegram->handleUpdate($update);
        }

        return response()->json(['ok' => true]);
    }

    /**
     * Status bot Telegram: GET /api/telegram/status
     */
    public function status(): JsonResponse
    {
        return response()->json($this->telegram->getMe());
    }
}
