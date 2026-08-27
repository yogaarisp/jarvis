<?php

namespace App\AI;

use InvalidArgumentException;

/**
 * Resolver provider AI berdasarkan config/ai.php.
 */
class AIProviderManager
{
    public function __construct() {}

    public function defaultProviderName(): string
    {
        return (string) config('ai.default', 'local');
    }

    public function provider(?string $name = null): AIProviderInterface
    {
        $name ??= $this->defaultProviderName();

        $config = config("ai.providers.{$name}");

        if (! is_array($config)) {
            throw new InvalidArgumentException("Provider AI [{$name}] tidak dikenal.");
        }

        return match ($config['driver'] ?? null) {
            'nine_router' => new NineRouterProvider(
                baseUrl: $config['base_url'] ?? null,
                apiKey: $config['api_key'] ?? null,
                model: $config['model'] ?? null,
                fallbackModel: $config['fallback_model'] ?? null,
                timeout: (int) ($config['timeout'] ?? 120),
            ),
            'generic' => new GenericAiProvider(
                providerType: $config['provider_type'] ?? 'custom',
                baseUrl: $config['base_url'] ?? null,
                apiKey: $config['api_key'] ?? null,
                model: $config['model'] ?? null,
                fallbackModel: $config['fallback_model'] ?? null,
                timeout: (int) ($config['timeout'] ?? 120),
            ),
            'local' => new LocalProvider,
            default => throw new InvalidArgumentException("Driver AI [{$config['driver']}] tidak dikenal."),
        };
    }

    public function testConnection(?string $name = null): array
    {
        return $this->provider($name)->testConnection();
    }
}
