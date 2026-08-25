<?php

namespace Tests\Feature;

use App\Models\Mission;
use App\Models\User;
use Database\Seeders\AgentSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class MissionTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::factory()->create();
        $this->seed(AgentSeeder::class);
    }

    public function test_missions_require_authentication(): void
    {
        $this->getJson('/api/missions')->assertUnauthorized();
        $this->postJson('/api/missions', [])->assertUnauthorized();
    }

    public function test_create_read_agent_mission_is_queued_immediately(): void
    {
        $response = $this->actingAs($this->user, 'sanctum')->postJson('/api/missions', [
            'agent_key' => 'research',
            'title' => 'Riset cepat',
            'steps' => [
                ['name' => 'Cari referensi', 'tool' => 'web.search', 'params' => ['query' => 'laragon']],
            ],
        ]);

        $response->assertCreated()
            ->assertJsonPath('mission.status', 'queued')
            ->assertJsonPath('requires_approval', false);

        $this->assertDatabaseHas('mission_steps', [
            'mission_id' => $response->json('mission.id'),
            'tool' => 'web.search',
            'status' => 'pending',
        ]);
    }

    public function test_create_dangerous_agent_mission_requires_approval_then_approve(): void
    {
        // Buat misi pada agent DATABASE (dangerous).
        $create = $this->actingAs($this->user, 'sanctum')->postJson('/api/missions', [
            'agent_key' => 'database',
            'title' => 'Audit skema',
            'steps' => [
                ['name' => 'Baca skema', 'tool' => 'database.schema'],
            ],
        ]);

        $create->assertCreated()
            ->assertJsonPath('mission.status', 'waiting_approval')
            ->assertJsonPath('requires_approval', true);

        $id = $create->json('mission.id');

        // Approve -> kembali ke antrian.
        $this->actingAs($this->user, 'sanctum')
            ->postJson("/api/missions/{$id}/approve")
            ->assertOk()
            ->assertJsonPath('mission.status', 'queued');

        // Approve kedua kali -> konflik.
        $this->actingAs($this->user, 'sanctum')
            ->postJson("/api/missions/{$id}/approve")
            ->assertStatus(409);
    }

    public function test_reject_tool_outside_agent_whitelist(): void
    {
        $response = $this->actingAs($this->user, 'sanctum')->postJson('/api/missions', [
            'agent_key' => 'research',
            'title' => 'Izin salah',
            'steps' => [
                ['name' => 'Exec ilegal', 'tool' => 'system.exec'],
            ],
        ]);

        $response->assertStatus(422);
        $this->assertStringContainsString('tidak diizinkan', $response->json('message'));
    }

    public function test_unknown_agent_returns_422(): void
    {
        $response = $this->actingAs($this->user, 'sanctum')->postJson('/api/missions', [
            'agent_key' => 'ghost',
            'title' => 'Agent hantu',
            'steps' => [['name' => 'X', 'tool' => 'web.search']],
        ]);

        $response->assertStatus(422);
    }

    public function test_stream_executes_queued_mission_via_hermes(): void
    {
        config([
            'hermes.base_url' => 'https://hermes.test',
            'hermes.api_key' => 'secret-key',
        ]);

        Http::fake([
            'https://hermes.test/tools/web.search/invoke' => Http::response([
                'results' => [['title' => 'Laragon', 'url' => 'https://laragon.org']],
            ], 200),
        ]);

        $created = $this->actingAs($this->user, 'sanctum')->postJson('/api/missions', [
            'agent_key' => 'research',
            'title' => 'Riset Laragon',
            'steps' => [
                ['name' => 'Cari Laragon', 'tool' => 'web.search', 'params' => ['query' => 'laragon']],
            ],
        ]);
        $id = $created->json('mission.id');

        // Konsumsi stream agar callback eksekusi benar-benar berjalan.
        $body = $this->actingAs($this->user, 'sanctum')
            ->get("/api/missions/{$id}/stream")
            ->assertOk()
            ->streamedContent();

        $this->assertStringContainsString('event: meta', $body);
        $this->assertStringContainsString('event: status', $body);
        $this->assertStringContainsString('"status":"running"', $body);
        $this->assertStringContainsString('event: step', $body);
        $this->assertStringContainsString('"status":"completed"', $body);
        $this->assertStringContainsString('event: done', $body);

        $this->assertDatabaseHas('missions', ['id' => $id, 'status' => 'completed']);
        $this->assertDatabaseHas('mission_steps', ['mission_id' => $id, 'status' => 'completed']);
        $this->assertDatabaseHas('tool_executions', [
            'mission_id' => $id,
            'tool' => 'web.search',
            'status' => 'succeeded',
        ]);
    }

    public function test_stream_marks_failed_when_hermes_unavailable(): void
    {
        config(['hermes.base_url' => null, 'hermes.api_key' => null]);

        $created = $this->actingAs($this->user, 'sanctum')->postJson('/api/missions', [
            'agent_key' => 'research',
            'title' => 'Misi gagal',
            'steps' => [
                ['name' => 'Panggil hermes mati', 'tool' => 'web.search'],
            ],
        ]);
        $id = $created->json('mission.id');

        $body = $this->actingAs($this->user, 'sanctum')
            ->get("/api/missions/{$id}/stream")
            ->streamedContent();

        $this->assertStringContainsString('"status":"failed"', $body);
        $this->assertDatabaseHas('missions', ['id' => $id, 'status' => 'failed']);

        // Langkah tersisa tetap pending (eksekusi berhenti di langkah gagal pertama).
        $this->assertDatabaseHas('mission_steps', ['mission_id' => $id, 'status' => 'failed']);
    }

    public function test_cancel_active_mission(): void
    {
        $created = $this->actingAs($this->user, 'sanctum')->postJson('/api/missions', [
            'agent_key' => 'database',
            'title' => 'Audit dibatalkan',
            'steps' => [['name' => 'Baca skema', 'tool' => 'database.schema']],
        ]);
        $id = $created->json('mission.id');

        $this->actingAs($this->user, 'sanctum')
            ->postJson("/api/missions/{$id}/cancel")
            ->assertOk()
            ->assertJsonPath('mission.status', 'cancelled');

        $this->assertDatabaseHas('missions', ['id' => $id, 'status' => 'cancelled']);
    }

    public function test_other_users_cannot_access_mission(): void
    {
        $mission = Mission::create([
            'user_id' => $this->user->id,
            'agent_key' => 'research',
            'title' => 'Misi milik user asli',
            'status' => 'queued',
        ]);

        $other = User::factory()->create();

        $this->actingAs($other, 'sanctum')
            ->getJson("/api/missions/{$mission->id}")
            ->assertNotFound();
    }
}
