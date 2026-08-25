<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class EnvTelemetryTest extends TestCase
{
    use RefreshDatabase;

    public function test_env_requires_authentication(): void
    {
        $this->getJson('/api/system/env')->assertUnauthorized();
    }

    public function test_env_returns_geolocation_and_weather_from_external_apis(): void
    {
        Http::fake([
            'https://ipwho.is/8.8.8.8' => Http::response([
                'success' => true,
                'ip' => '8.8.8.8',
                'city' => 'Mountain View',
                'country_code' => 'US',
                'latitude' => 37.386,
                'longitude' => -122.0838,
            ]),
            'https://api.open-meteo.com/*' => Http::response([
                'current' => ['temperature_2m' => 28.4, 'weather_code' => 0],
            ]),
        ]);

        $user = User::factory()->create();

        $response = $this->actingAs($user, 'sanctum')
            ->getJson('/api/system/env', ['X-Forwarded-For' => '8.8.8.8']);

        $response->assertOk();

        $data = $response->json('data');

        $this->assertSame('8.8.8.8', $data['visitor_ip']);
        $this->assertSame('Mountain View', $data['city']);
        $this->assertSame('US', $data['country_code']);
        $this->assertSame(28.4, $data['temperature_c']);
        $this->assertSame('CLEAR', $data['condition']);
    }

    public function test_env_survives_unreachable_external_apis(): void
    {
        Http::fake(['*' => Http::response(null, 500)]);

        $user = User::factory()->create();

        $response = $this->actingAs($user, 'sanctum')
            ->getJson('/api/system/env');

        $response->assertOk();

        $data = $response->json('data');

        foreach (['visitor_ip', 'city', 'country_code', 'temperature_c', 'condition'] as $key) {
            $this->assertArrayHasKey($key, $data);
        }

        $this->assertNull($data['city']);
        $this->assertNull($data['condition']);
    }
}
