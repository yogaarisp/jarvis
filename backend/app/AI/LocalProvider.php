<?php

namespace App\AI;

use Generator;

/**
 * Offline demo provider. Dipakai saat API key 9Router belum tersedia
 * agar seluruh pipeline (SSE, persistence, UI) tetap dapat diuji.
 */
class LocalProvider implements AIProviderInterface
{
    public function complete(array $messages, array $options = []): string
    {
        return implode(' ', iterator_to_array($this->stream($messages, $options)));
    }

    public function stream(array $messages, array $options = []): Generator
    {
        $lastUser = '';
        foreach ($messages as $message) {
            if ($message['role'] === 'user') {
                $lastUser = $message['content'];
            }
        }

        $reply = sprintf(
            '[MODE LOKAL] Perintah diterima: "%s". '
            .'Provider 9Router belum dikonfigurasi — set AI_PROVIDER=nine_router '
            .'beserta NINE_ROUTER_BASE_URL, NINE_ROUTER_API_KEY, dan NINE_ROUTER_MODEL di file .env '
            .'untuk mengaktifkan model AI sesungguhnya.',
            mb_substr($lastUser, 0, 120),
        );

        foreach (mb_str_split($reply, 24) as $chunk) {
            yield $chunk;
            usleep(15_000);
        }
    }

    public function testConnection(): array
    {
        return [
            'ok' => true,
            'message' => 'Local provider aktif (mode demo tanpa API key).',
            'latency_ms' => null,
        ];
    }
}
