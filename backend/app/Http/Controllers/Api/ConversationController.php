<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Conversation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ConversationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $conversations = Conversation::where('user_id', $request->user()->id)
            ->orderByDesc('last_message_at')
            ->orderByDesc('id')
            ->limit(50)
            ->get(['id', 'title', 'model', 'last_message_at', 'created_at']);

        return response()->json(['conversations' => $conversations]);
    }

    public function show(Request $request, Conversation $conversation): JsonResponse
    {
        abort_unless($conversation->user_id === $request->user()->id, 404);

        return response()->json([
            'conversation' => $conversation->only(['id', 'title', 'model', 'last_message_at', 'created_at']),
            'messages' => $conversation->messages()
                ->orderBy('created_at')
                ->get(['id', 'role', 'content', 'model', 'tokens', 'latency_ms', 'status', 'created_at']),
        ]);
    }

    public function destroy(Request $request, Conversation $conversation): JsonResponse
    {
        abort_unless($conversation->user_id === $request->user()->id, 404);

        $conversation->delete();

        return response()->json(['message' => 'Conversation deleted.']);
    }
}
