<?php

namespace Tests\Unit;

use App\AI\NineRouterProvider;
use Generator;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class NineRouterProviderTest extends TestCase
{
    private const BASE_URL = 'https://api.example.com/v1';

    /* ------------------------------------------------------------------ */
    /* Helpers */
    /* ------------------------------------------------------------------ */

    private function makeProvider(string $model = 'model-a', ?string $fallbackModel = null): NineRouterProvider
    {
        return new NineRouterProvider(
            baseUrl: self::BASE_URL,
            apiKey: 'sk-test',
            model: $model,
            fallbackModel: $fallbackModel,
        );
    }

    /**
     * Body respons SSE kompatibel OpenAI dari daftar delta teks.
     *
     * @param  array<int, string>  $deltas
     */
    private function sseBody(array $deltas): string
    {
        $chunks = array_map(
            fn (string $text): string => 'data: '.json_encode([
                'choices' => [['delta' => ['content' => $text]]],
            ])."\n\n",
            $deltas,
        );

        $chunks[] = "data: [DONE]\n\n";

        return implode('', $chunks);
    }

    /* ------------------------------------------------------------------ */
    /* Tests */
    /* ------------------------------------------------------------------ */

    public function test_stream_parses_openai_compatible_sse(): void
    {
        Http::fake([
            self::BASE_URL.'/chat/completions' => Http::response(
                $this->sseBody(['Halo', ' dunia']),
                200,
            ),
        ]);

        $stream = $this->makeProvider()->stream([['role' => 'user', 'content' => 'hi']]);

        /** @var Generator $stream */
        $text = '';
        foreach ($stream as $delta) {
            $text .= $delta;
        }

        $this->assertSame('Halo dunia', $text);

        Http::assertSent(
            fn ($request) => $request['model'] === 'model-a'
                && $request['stream'] === true
        );
    }

    public function test_stream_throws_when_http_fails_without_fallback(): void
    {
        Http::fake([
            self::BASE_URL.'/chat/completions' => Http::response(
                ['error' => ['message' => 'quota exceeded']],
                429,
            ),
        ]);

        $provider = $this->makeProvider();

        $this->expectException(\RuntimeException::class);

        iterator_to_array($provider->stream([['role' => 'user', 'content' => 'hi']]));
    }

    public function test_stream_retries_with_fallback_model_when_primary_fails(): void
    {
        Http::fake([
            self::BASE_URL.'/chat/completions' => Http::sequence()
                ->push(['error' => ['message' => 'model overloaded']], 503)
                ->push($this->sseBody(['fallback ok']), 200),
        ]);

        $provider = $this->makeProvider(model: 'primary-model', fallbackModel: 'fallback-model');

        $text = implode(
            '',
            iterator_to_array($provider->stream([['role' => 'user', 'content' => 'hi']])),
        );

        $this->assertSame('fallback ok', $text);

        // Model utama dicoba dulu, lalu fallback — sesuai urutan permintaan.
        $requestedModels = collect(Http::recorded())
            ->map(fn ($pair) => $pair[0]['model'])
            ->all();

        $this->assertSame(['primary-model', 'fallback-model'], $requestedModels);
    }

    public function test_connection_check_fails_when_provider_unconfigured(): void
    {
        $provider = new NineRouterProvider(null, null, null);

        $result = $provider->testConnection();

        $this->assertFalse($result['ok']);
    }
}
