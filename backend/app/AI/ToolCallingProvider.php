<?php

namespace App\AI;

/**
 * Kontrak untuk provider yang mendukung OpenAI-style tool calling (non-streaming).
 * Dipakai oleh AgentService untuk loop pencarian internet.
 */
interface ToolCallingProvider
{
    /**
     * @param  array<int, array<string, mixed>>  $messages  Pesan format OpenAI.
     * @param  array<int, array<string, mixed>>  $tools     Definisi tools format OpenAI.
     * @return array{content: ?string, tool_calls: ?array<int, array<string, mixed>>, raw: array<string, mixed>}
     *               `raw` adalah message asli dari model (untuk diteruskan kembali ke API).
     */
    public function completeWithTools(array $messages, array $tools, array $options = []): array;
}
