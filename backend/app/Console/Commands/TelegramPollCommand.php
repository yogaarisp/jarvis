<?php

namespace App\Console\Commands;

use App\Services\TelegramService;
use Illuminate\Console\Command;

class TelegramPollCommand extends Command
{
    protected $signature = 'jarvis:telegram-poll {--timeout=25 : Long-polling timeout in seconds}';

    protected $description = 'Jalankan daemon bot Telegram JARVIS (Long Polling mode)';

    public function handle(TelegramService $telegram): int
    {
        $this->info('Menguji koneksi ke Telegram API...');
        $me = $telegram->getMe();

        if (! ($me['ok'] ?? false)) {
            $this->error('Gagal terhubung ke bot Telegram: '.json_encode($me));

            return Command::FAILURE;
        }

        $botUser = $me['result'] ?? [];
        $botName = $botUser['first_name'] ?? 'JARVIS Bot';
        $botUsername = $botUser['username'] ?? 'bot';

        $this->info("🤖 Bot Aktif: @{$botUsername} ({$botName})");
        $this->info('⚡ Mendengarkan pesan Telegram secara realtime... (Tekan Ctrl+C untuk berhenti)');

        $offset = 0;
        $timeout = (int) $this->option('timeout');

        while (true) {
            $res = $telegram->getUpdates($offset, $timeout);

            if (! ($res['ok'] ?? false)) {
                $this->warn('Gagal mengambil update: '.($res['error'] ?? 'timeout'));
                sleep(2);

                continue;
            }

            $updates = $res['result'] ?? [];

            foreach ($updates as $update) {
                $updateId = $update['update_id'] ?? 0;
                $offset = $updateId + 1;

                $msg = $update['message'] ?? [];
                $from = $msg['from']['first_name'] ?? 'User';
                $text = $msg['text'] ?? '[Non-text message]';

                $this->line('<fg=cyan>['.now()->toTimeString()."]</> <fg=yellow>{$from}:</> {$text}");

                try {
                    $telegram->handleUpdate($update);
                } catch (\Throwable $e) {
                    $this->error('Error processing update: '.$e->getMessage());
                }
            }

            usleep(100000); // 100ms pause
        }

        return Command::SUCCESS;
    }
}
