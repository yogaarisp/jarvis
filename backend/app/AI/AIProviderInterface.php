<?php

namespace App\AI;

use Generator;

interface AIProviderInterface
{
    /**
     * Non-streaming completion. Returns the full reply text.
     *
     * @param  array<int, array{role: string, content: string}>  $messages
     * @param  array{model?: string, temperature?: float}  $options
     */
    public function complete(array $messages, array $options = []): string;

    /**
     * Streaming completion. Yields text deltas as they arrive.
     *
     * @param  array<int, array{role: string, content: string}>  $messages
     * @param  array{model?: string, temperature?: float}  $options
     * @return Generator<string>
     */
    public function stream(array $messages, array $options = []): Generator;

    /**
     * Connectivity check. Returns ['ok' => bool, 'message' => string, 'latency_ms' => ?int].
     */
    public function testConnection(): array;
}
