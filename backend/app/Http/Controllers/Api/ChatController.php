<?php

namespace App\Http\Controllers\Api;

use App\AI\AIProviderInterface;
use App\AI\AIProviderManager;
use App\Http\Controllers\Controller;
use App\Models\Conversation;
use App\Models\Message;
use App\Skills\SkillService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ChatController extends Controller
{
    private const CONTEXT_WINDOW = 20;

    public function __construct(
        private readonly AIProviderManager $providers,
        private readonly SkillService $skills,
    ) {}

    public function store(Request $request): JsonResponse|StreamedResponse
    {
        $data = $request->validate([
            'message' => ['required', 'string', 'max:8000'],
            'conversation_id' => ['nullable', 'integer', 'exists:conversations,id'],
        ]);

        $user = $request->user();

        [$conversation, $history] = DB::transaction(function () use ($data, $user) {
            if (! empty($data['conversation_id'])) {
                $conversation = Conversation::where('user_id', $user->id)
                    ->findOrFail($data['conversation_id']);
            } else {
                $conversation = Conversation::create([
                    'user_id' => $user->id,
                    'title' => mb_substr($data['message'], 0, 60),
                ]);
            }

            $conversation->messages()->create([
                'role' => 'user',
                'content' => $data['message'],
            ]);

            $conversation->update(['last_message_at' => now()]);

            $history = $conversation->messages()
                ->orderBy('created_at')
                ->get(['role', 'content'])
                ->slice(-self::CONTEXT_WINDOW)
                ->values()
                ->map(fn (Message $m) => ['role' => $m->role, 'content' => $m->content])
                ->all();

            return [$conversation, $history];
        });

        $systemPrompt = (string) config('jarvis.system_prompt');

        $providerName = $this->providers->defaultProviderName();
        $provider = $this->providers->provider();
        $modelLabel = (string) (config("ai.providers.{$providerName}.model") ?? $providerName);

        // Perintah penyimpanan — tidak perlu AI, langsung diproses engine skill.
        if ($command = $this->parseMemoryCommand($data['message'], $user->id)) {
            return $this->streamText($conversation, $command['reply'], $modelLabel);
        }

        // Contextual retrieval (PRD §17) — suntikkan skill & memori yang relevan.
        $retrieval = $this->skills->relevantContext($data['message'], $user->id);
        $usedSkillIds = $retrieval['skill_ids'];

        if ($retrieval['context'] !== '') {
            $systemPrompt .= "\n\n=== KONTEKS SKILL & MEMORI (gunakan bila relevan) ===\n".$retrieval['context'];
        }

        if ($systemPrompt !== '') {
            array_unshift($history, ['role' => 'system', 'content' => $systemPrompt]);
        }

        $headers = [
            'Content-Type' => 'text/event-stream',
            'Cache-Control' => 'no-cache',
            'X-Accel-Buffering' => 'no',
        ];

        return response()->stream(function () use ($conversation, $provider, $history, $modelLabel, $usedSkillIds) {
            // 1. meta
            $this->send('meta', [
                'conversation_id' => $conversation->id,
                'model' => $modelLabel,
            ]);

            $started = microtime(true);
            $content = '';

            try {
                /** @var AIProviderInterface $provider */
                foreach ($provider->stream($history) as $delta) {
                    $content .= $delta;
                    $this->send('delta', ['content' => $delta]);
                }

                $assistantMessage = $conversation->messages()->create([
                    'role' => 'assistant',
                    'content' => $content,
                    'model' => $modelLabel,
                    'latency_ms' => (int) round((microtime(true) - $started) * 1000),
                    'status' => 'completed',
                ]);

                $conversation->update(['model' => $modelLabel]);

                if ($usedSkillIds !== []) {
                    $this->skills->markUsed($usedSkillIds);
                }

                $this->send('done', [
                    'message_id' => $assistantMessage->id,
                    'latency_ms' => $assistantMessage->latency_ms,
                ]);
            } catch (\Throwable $e) {
                if ($content !== '') {
                    $conversation->messages()->create([
                        'role' => 'assistant',
                        'content' => $content,
                        'model' => $modelLabel,
                        'status' => 'failed',
                    ]);
                }

                report($e);

                $this->send('error', [
                    'message' => 'Provider AI gagal memproses permintaan.',
                ]);
            }
        }, 200, $headers);
    }

    private function send(string $event, array $payload): void
    {
        echo "event: {$event}\n";
        echo 'data: '.json_encode($payload, JSON_UNESCAPED_UNICODE)."\n\n";

        if (ob_get_level() > 0) {
            ob_flush();
        }
        flush();
    }

    /**
     * Perintah cepat penyimpanan dari chat (tidak memakai AI).
     * Format:
     *   ingat: kunci = nilai   — atau "ingat: nilai" (kunci otomatis "catatan")
     *   skill: Nama | isi prosedur [| deskripsi]
     */
    private function parseMemoryCommand(string $message, int $userId): ?array
    {
        $trimmed = trim($message);

        if (preg_match('/^ingat\s*:\s*(.+)$/is', $trimmed, $m)) {
            $rest = trim($m[1]);

            if (str_contains($rest, '=')) {
                [$key, $value] = explode('=', $rest, 2);
                $key = trim($key);
                $value = trim($value);
            } else {
                $key = 'catatan';
                $value = $rest;
            }

            if ($value === '') {
                return null;
            }

            $memory = $this->skills->remember($userId, $key, $value);

            return ['reply' => "Tersimpan di memori [{$memory->category}] {$memory->key}: {$memory->value}. Saya ingat, Keenan."];
        }

        if (preg_match('/^skill\s*:\s*(.+)$/is', $trimmed, $m)) {
            $parts = array_map('trim', explode('|', $m[1]));

            if ($parts[0] === '' || ($parts[1] ?? '') === '') {
                return null;
            }

            $skill = $this->skills->storeSkill(
                $userId,
                $parts[0],
                $parts[1],
                $parts[2] ?? null,
                source: 'chat',
            );

            return ['reply' => "Skill \"{$skill->name}\" tersimpan (#{$skill->id}). Akan saya pakai otomatis saat relevan, Keenan."];
        }

        return null;
    }

    /** Stream jawaban sintetis tanpa memanggil provider AI. */
    private function streamText(Conversation $conversation, string $text, string $modelLabel): StreamedResponse
    {
        $headers = [
            'Content-Type' => 'text/event-stream',
            'Cache-Control' => 'no-cache',
            'X-Accel-Buffering' => 'no',
        ];

        return response()->stream(function () use ($conversation, $text, $modelLabel) {
            $this->send('meta', [
                'conversation_id' => $conversation->id,
                'model' => $modelLabel,
            ]);

            $this->send('delta', ['content' => $text]);

            $message = $conversation->messages()->create([
                'role' => 'assistant',
                'content' => $text,
                'model' => $modelLabel,
                'latency_ms' => 0,
                'status' => 'completed',
            ]);

            $this->send('done', ['message_id' => $message->id, 'latency_ms' => 0]);
        }, 200, $headers);
    }
}
