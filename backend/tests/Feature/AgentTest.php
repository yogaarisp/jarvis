<?php

namespace Tests\Feature;

use App\Models\Agent;
use App\Models\User;
use Database\Seeders\AgentSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AgentTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::factory()->create();
        $this->seed(AgentSeeder::class);
    }

    public function test_agents_require_authentication(): void
    {
        $this->getJson('/api/agents')->assertUnauthorized();
        $this->getJson('/api/agents/research')->assertUnauthorized();
    }

    public function test_index_returns_seeded_agents(): void
    {
        $response = $this->actingAs($this->user, 'sanctum')
            ->getJson('/api/agents');

        $response->assertOk();

        $agents = $response->json('agents');
        $this->assertCount(8, $agents);

        $keys = collect($agents)->pluck('key')->all();
        foreach (['jarvis', 'research', 'system', 'dev', 'database', 'monitor', 'deployment', 'security'] as $expected) {
            $this->assertContains($expected, $keys);
        }

        // Struktur sesuai PRD §10: name, description, allowed tools, permission level, status.
        // system_prompt sengaja tidak diekspos (internal only).
        $research = collect($agents)->firstWhere('key', 'research');
        $this->assertSame('RESEARCH', $research['name']);
        $this->assertSame('read', $research['permission_level']);
        $this->assertContains('web.search', $research['allowed_tools']);
        $this->assertSame('active', $research['status']);
    }

    public function test_show_by_key_returns_agent(): void
    {
        $response = $this->actingAs($this->user, 'sanctum')
            ->getJson('/api/agents/database');

        $response->assertOk()
            ->assertJsonPath('agent.key', 'database')
            ->assertJsonPath('agent.permission_level', 'dangerous');
    }

    public function test_show_by_id_returns_agent(): void
    {
        $first = Agent::query()->firstOrFail();

        $response = $this->actingAs($this->user, 'sanctum')
            ->getJson("/api/agents/{$first->id}");

        $response->assertOk()->assertJsonPath('agent.id', $first->id);
    }

    public function test_show_unknown_agent_returns_404(): void
    {
        $this->actingAs($this->user, 'sanctum')
            ->getJson('/api/agents/nonexistent')
            ->assertNotFound();
    }
}
