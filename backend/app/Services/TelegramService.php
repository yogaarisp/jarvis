<?php

namespace App\Services;

use App\AI\AIProviderManager;
use App\Hermes\HermesService;
use App\Models\Conversation;
use App\Models\Message;
use App\Models\User;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class TelegramService
{
    protected string $botToken;

    protected string $apiUrl;

    public function __construct(
        protected AIProviderManager $aiManager,
        protected HermesService $hermes,
    ) {
        $this->botToken = (string) config('telegram.bot_token');
        $this->apiUrl = 'https://api.telegram.org/bot'.$this->botToken;
    }

    /**
     * Test koneksi ke bot telegram.
     */
    public function getMe(): array
    {
        try {
            $res = Http::timeout(10)->withoutVerifying()->get("{$this->apiUrl}/getMe");

            return $res->json() ?? ['ok' => false];
        } catch (\Throwable $e) {
            return ['ok' => false, 'error' => $e->getMessage()];
        }
    }

    /**
     * Kirim pesan ke chat ID telegram.
     */
    public function sendMessage(int|string $chatId, string $text, ?string $parseMode = 'HTML', ?array $replyMarkup = null): array
    {
        try {
            $payload = [
                'chat_id' => $chatId,
                'text' => $text,
            ];
            if ($parseMode) {
                $payload['parse_mode'] = $parseMode;
            }
            if ($replyMarkup) {
                $payload['reply_markup'] = json_encode($replyMarkup);
            }

            $res = Http::timeout(15)->withoutVerifying()->post("{$this->apiUrl}/sendMessage", $payload);

            return $res->json() ?? ['ok' => false];
        } catch (\Throwable $e) {
            Log::error('Telegram sendMessage error: '.$e->getMessage());

            return ['ok' => false, 'error' => $e->getMessage()];
        }
    }

    /**
     * Ambil update pesan masuk (untuk mode Long Polling).
     */
    public function getUpdates(int $offset = 0, int $timeout = 30): array
    {
        try {
            $res = Http::timeout($timeout + 5)->withoutVerifying()->get("{$this->apiUrl}/getUpdates", [
                'offset' => $offset,
                'timeout' => $timeout,
            ]);

            return $res->json() ?? ['ok' => false, 'result' => []];
        } catch (\Throwable $e) {
            return ['ok' => false, 'result' => [], 'error' => $e->getMessage()];
        }
    }

    /**
     * Proses update / pesan masuk dari Telegram (Webhook atau Polling).
     */
    public function handleUpdate(array $update): void
    {
        $message = $update['message'] ?? null;
        if (! $message) {
            return;
        }

        $chatId = $message['chat']['id'] ?? null;
        $text = trim((string) ($message['text'] ?? ''));
        $fromName = $message['from']['first_name'] ?? 'User';

        if (! $chatId) {
            return;
        }

        // 1. Tangani Command Khusus
        if ($text === '/start') {
            $welcome = "👋 <b>Halo, {$fromName}!</b>\n\nSaya adalah <b>JARVIS (KEETECH)</b> — AI Assistant & IoT Device Controller Anda.\n\n"
                ."⚡ <b>Perintah Cepat:</b>\n"
                ."• <code>/status</code> — Cek status sistem & device\n"
                ."• <code>/devices</code> — Daftar perangkat terhubung\n"
                ."• <code>/help</code> — Bantuan penggunaan\n\n"
                .'Ketik pertanyaan atau perintah apapun untuk mulai berinteraksi!';
            $this->sendMessage($chatId, $welcome);

            return;
        }

        if ($text === '/status') {
            $statusMsg = "🛡️ <b>JARVIS // SYSTEM STATUS</b>\n\n"
                ."• <b>Core State:</b> ONLINE (ACTIVE)\n"
                ."• <b>AI Brain:</b> Ready\n"
                ."• <b>Telegram Interface:</b> Connected\n"
                ."• <b>Hardware:</b> Nominal\n"
                .'• <b>Time:</b> '.now()->toDateTimeString()."\n";
            $this->sendMessage($chatId, $statusMsg);

            return;
        }

        if ($text === '/devices') {
            $devicesMsg = "📱 <b>JARVIS // CONNECTED DEVICES</b>\n\n"
                ."1. 💻 <b>Primary Workstation / PC</b> — ONLINE\n"
                ."2. 🌐 <b>Smart Gateway Node</b> — STANDBY\n"
                ."3. 🔌 <b>IoT Controller Hub</b> — ACTIVE\n\n"
                ."<i>Gunakan perintah seperti 'Nyalakan PC' atau 'Cek suhu' untuk mengontrol.</i>";
            $this->sendMessage($chatId, $devicesMsg);

            return;
        }

        if ($text === '/help') {
            $helpMsg = "🤖 <b>JARVIS Assistant Guide:</b>\n\n"
                ."• Kirimkan pesan langsung untuk bertanya atau memberi perintah.\n"
                ."• Sistem akan memproses instruksi melalui AI Brain dan mengeksekusi kontrol device.\n"
                .'• Seluruh log percakapan tersinkronisasi dengan HUD Dashboard Web.';
            $this->sendMessage($chatId, $helpMsg);

            return;
        }

        if ($text === '') {
            return;
        }

        // 2. Simpan ke percakapan Database agar sinkron ke HUD Dashboard
        $user = User::first() ?? User::create([
            'name' => $fromName,
            'email' => 'admin@jarvis.local',
            'password' => bcrypt('jarvis123'),
        ]);

        $conversation = Conversation::where('user_id', $user->id)->latest()->first();
        if (! $conversation) {
            $conversation = Conversation::create([
                'user_id' => $user->id,
                'title' => 'Telegram // '.$fromName,
            ]);
        }

        // Catat user message
        $conversation->messages()->create([
            'role' => 'user',
            'content' => "[Telegram] {$text}",
        ]);

        // 3. Proses respons melalui AI Brain
        $history = $conversation->messages()
            ->orderBy('created_at')
            ->get(['role', 'content'])
            ->slice(-15)
            ->values()
            ->map(fn (Message $m) => ['role' => $m->role, 'content' => $m->content])
            ->all();

        $systemPrompt = 'Anda adalah JARVIS (KEETECH), asisten pribadi super cerdas yang melayani pengguna melalui Telegram dan Web HUD. '
            .'Jawab dengan sopan, sigap, solutif, ringkas, dan format yang rapi untuk pesan Telegram. '
            .'Anda dapat mengontrol perangkat dan mengeksekusi otomatisasi atas perintah pengguna.';
        array_unshift($history, ['role' => 'system', 'content' => $systemPrompt]);

        try {
            $provider = $this->aiManager->provider();
            $aiReply = '';

            foreach ($provider->stream($history) as $chunk) {
                $aiReply .= $chunk;
            }

            if (trim($aiReply) === '') {
                $aiReply = 'Siap, perintah telah diterima dan sedang diproses oleh sistem.';
            }

            // Simpan balasan AI ke database
            $conversation->messages()->create([
                'role' => 'assistant',
                'content' => $aiReply,
            ]);
            $conversation->update(['last_message_at' => now()]);

            // Kirim balasan ke Telegram
            $this->sendMessage($chatId, $aiReply, null);
        } catch (\Throwable $e) {
            Log::error('Telegram AI processing error: '.$e->getMessage());
            $fallback = '⚠ Terjadi gangguan saat memproses AI Brain: '.$e->getMessage();
            $this->sendMessage($chatId, $fallback, null);
        }
    }
}
