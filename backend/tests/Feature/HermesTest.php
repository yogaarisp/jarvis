<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class HermesTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::factory()->create();
    }

    public function test_hermes_endpoints_require_authentication(): void
    {
        $this->getJson('/api/hermes/status')->assertUnauthorized();
        $this->getJson('/api/hermes/tools')->assertUnauthorized();
        $this->postJson('/api/hermes/invoke', ['tool' => 'system.ping'])->assertUnauthorized();
    }

    public function test_status_reports_unconfigured_hermes(): void
    {
        config(['hermes.base_url' => null, 'hermes.api_key' => null]);

        $response = $this->actingAs($this->user, 'sanctum')
            ->getJson('/api/hermes/status');

        $response->assertOk()
            ->assertJsonPath('ok', false)
            ->assertJsonPath('configured', false);
    }

    public function test_status_with_healthy_hermes(): void
    {
        config([
            'hermes.base_url' => 'https://hermes.test',
            'hermes.api_key' => 'secret-key',
        ]);

        Http::fake(['https://hermes.test/health' => Http::response(['status' => 'ok'], 200)]);

        $response = $this->actingAs($this->user, 'sanctum')
            ->getJson('/api/hermes/status');

        $response->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('configured', true);
    }

    public function test_invoke_validates_tool_name_format(): void
    {
        config([
            'hermes.base_url' => 'https://hermes.test',
            'hermes.api_key' => 'secret-key',
        ]);

        Http::fake(); // tidak boleh ada request keluar

        $response = $this->actingAs($this->user, 'sanctum')
            ->postJson('/api/hermes/invoke', ['tool' => 'BAD TOOL!']);

        $response->assertStatus(422);
        Http::assertNothingSent();
    }

    public function test_invoke_requires_tool_field(): void
    {
        $response = $this->actingAs($this->user, 'sanctum')
            ->postJson('/api/hermes/invoke', []);

        $response->assertStatus(422)->assertJsonValidationErrors('tool');
    }

    public function test_invoke_returns_result_from_hermes(): void
    {
        config([
            'hermes.base_url' => 'https://hermes.test',
            'hermes.api_key' => 'secret-key',
        ]);

        Http::fake([
            'https://hermes.test/tools/system.health_check/invoke' => Http::response([
                'status' => 'healthy',
                'cpu' => 12.5,
            ], 200),
        ]);

        $response = $this->actingAs($this->user, 'sanctum')
            ->postJson('/api/hermes/invoke', [
                'tool' => 'system.health_check',
                'params' => ['target' => 'localhost'],
            ]);

        $response->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('tool', 'system.health_check')
            ->assertJsonPath('result.status', 'healthy');

        Http::assertSent(function ($request) {
            return $request->url() === 'https://hermes.test/tools/system.health_check/invoke'
                && $request->hasHeader('Authorization', 'Bearer secret-key')
                && $request['target'] === 'localhost';
        });
    }

    public function test_invoke_returns_503_when_unconfigured(): void
    {
        config(['hermes.base_url' => null, 'hermes.api_key' => null]);

        $response = $this->actingAs($this->user, 'sanctum')
            ->postJson('/api/hermes/invoke', ['tool' => 'system.health_check']);

        $response->assertStatus(503);
    }
}
