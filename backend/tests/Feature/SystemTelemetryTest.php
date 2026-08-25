<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SystemTelemetryTest extends TestCase
{
    use RefreshDatabase;

    public function test_telemetry_requires_authentication(): void
    {
        $this->getJson('/api/system/telemetry')->assertUnauthorized();
    }

    public function test_telemetry_returns_real_snapshot_structure(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user, 'sanctum')
            ->getJson('/api/system/telemetry');

        $response->assertOk();

        $data = $response->json('data');

        foreach ([
            'hostname',
            'platform',
            'cores',
            'cpu_percent',
            'ram_total_mb',
            'ram_used_percent',
            'disk_total_gb',
            'disk_used_percent',
            'temperature_c',
            'uptime_seconds',
        ] as $key) {
            $this->assertArrayHasKey($key, $data);
        }

        $this->assertNotSame('', $data['hostname']);
        $this->assertNotSame('', $data['platform']);

        // Nilai persentase (bila platform mendukung) harus dalam rentang wajar.
        foreach (['cpu_percent', 'ram_used_percent', 'disk_used_percent'] as $percentKey) {
            if ($data[$percentKey] !== null) {
                $this->assertGreaterThanOrEqual(0, $data[$percentKey]);
                $this->assertLessThanOrEqual(100, $data[$percentKey]);
            }
        }
    }
}
