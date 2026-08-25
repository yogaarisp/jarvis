<?php

namespace Tests\Unit;

use App\AI\AIProviderManager;
use App\AI\LocalProvider;
use App\AI\NineRouterProvider;
use InvalidArgumentException;
use Tests\TestCase;

class AIProviderManagerTest extends TestCase
{
    public function test_resolves_local_provider_by_default(): void
    {
        config()->set('ai.default', 'local');
        config()->set('ai.providers', ['local' => ['driver' => 'local']]);

        $manager = new AIProviderManager;

        $this->assertInstanceOf(LocalProvider::class, $manager->provider());
        $this->assertSame('local', $manager->defaultProviderName());
    }

    public function test_resolves_nine_router_provider_with_config(): void
    {
        config()->set('ai.providers.nine_router', [
            'driver' => 'nine_router',
            'base_url' => 'https://api.example.com/v1',
            'api_key' => 'sk-test',
            'model' => 'gpt-test',
            'fallback_model' => 'gpt-fallback',
        ]);

        $manager = new AIProviderManager;
        $provider = $manager->provider('nine_router');

        $this->assertInstanceOf(NineRouterProvider::class, $provider);
        $this->assertTrue($provider->configured());
    }

    public function test_throws_for_unknown_provider(): void
    {
        config()->set('ai.providers', []);

        $this->expectException(InvalidArgumentException::class);

        (new AIProviderManager)->provider('nope');
    }
}
