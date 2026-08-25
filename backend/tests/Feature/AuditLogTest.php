<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\User;
use Database\Seeders\AgentSeeder;
use Database\Seeders\ToolPermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuditLogTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::factory()->create();
        $this->seed(AgentSeeder::class);
        $this->seed(ToolPermissionSeeder::class);
    }

    public function test_audit_requires_authentication(): void
    {
        $this->getJson('/api/audit')->assertUnauthorized();
    }

    public function test_dangerous_tool_on_safe_agent_creates_waiting_approval_and_audits(): void
    {
        // system.exec = dangerous, agent SYSTEM = controlled → perlu approval.
        $response = $this->actingAs($this->user, 'sanctum')->postJson('/api/missions', [
            'agent_key' => 'system',
            'title' => 'Exec terkendali',
            'steps' => [['name' => 'Exec', 'tool' => 'system.exec']],
        ]);

        $response->assertCreated()
            ->assertJsonPath('mission.status', 'waiting_approval')
            ->assertJsonPath('requires_approval', true);

        $missionId = $response->json('mission.id');

        // Approve lalu selesaikan via stream (Hermes mati -> failed, tapi audit tetap terekam).
        $this->actingAs($this->user, 'sanctum')->postJson("/api/missions/{$missionId}/approve")->assertOk();

        config(['hermes.base_url' => null, 'hermes.api_key' => null]);

        $body = $this->actingAs($this->user, 'sanctum')
            ->get("/api/missions/{$missionId}/stream")
            ->streamedContent();
        $this->assertStringContainsString('"status":"failed"', $body);

        $events = AuditLog::query()->orderBy('id')->pluck('event')->all();

        // Hermes mati -> langkah gagal, tapi seluruh peristiwa izin tetap terekam.
        $this->assertContains('mission.created', $events);
        $this->assertContains('mission.approved', $events);
        $this->assertContains('mission.finished', $events);
    }

    public function test_whitelist_violation_is_denied_and_audited(): void
    {
        $response = $this->actingAs($this->user, 'sanctum')->postJson('/api/missions', [
            'agent_key' => 'research',
            'title' => 'Ilegal',
            'steps' => [['name' => 'X', 'tool' => 'system.exec']],
        ]);

        $response->assertStatus(422);

        $denied = AuditLog::query()->where('event', 'permission.denied')->firstOrFail();
        $this->assertSame('research', $denied->data['agent']);
        $this->assertSame($this->user->id, $denied->user_id);
    }

    public function test_audit_endpoint_lists_latest_entries(): void
    {
        AuditLog::create(['user_id' => $this->user->id, 'event' => 'test.event', 'data' => ['a' => 1]]);

        $response = $this->actingAs($this->user, 'sanctum')->getJson('/api/audit');

        $response->assertOk()
            ->assertJsonPath('logs.0.event', 'test.event');
    }
}
