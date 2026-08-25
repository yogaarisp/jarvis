<?php

namespace Tests\Unit;

use App\Agents\AgentRegistry;
use App\Permissions\PermissionEngine;
use Database\Seeders\AgentSeeder;
use Database\Seeders\ToolPermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PermissionEngineTest extends TestCase
{
    use RefreshDatabase;

    private PermissionEngine $engine;

    private AgentRegistry $registry;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(AgentSeeder::class);
        $this->seed(ToolPermissionSeeder::class);

        $this->registry = new AgentRegistry;
        $this->engine = new PermissionEngine($this->registry);
    }

    public function test_read_tool_on_safe_agent_is_allowed(): void
    {
        $agent = $this->registry->find('research');

        $this->assertSame('allow', $this->engine->decide($agent, 'web.search'));
        $this->assertFalse($this->engine->missionNeedsApproval($agent, [
            ['name' => 'Cari', 'tool' => 'web.search'],
            ['name' => 'Baca', 'tool' => 'web.read'],
        ]));
    }

    public function test_tool_outside_whitelist_is_denied_even_if_harmless(): void
    {
        // web.search berlevel read, tapi tidak ada di whitelist SYSTEM.
        $agent = $this->registry->find('system');

        $this->assertSame('deny', $this->engine->decide($agent, 'web.search'));
    }

    public function test_dangerous_tool_on_safe_agent_requires_confirmation(): void
    {
        // system.exec berlevel dangerous, agent SYSTEM hanya controlled.
        $agent = $this->registry->find('system');

        $this->assertSame('confirmation', $this->engine->decide($agent, 'system.exec'));
        $this->assertTrue($this->engine->missionNeedsApproval($agent, [
            ['name' => 'Jalankan build', 'tool' => 'dev.run_command'],
            ['name' => 'Exec sesuatu', 'tool' => 'system.exec'],
        ]));
    }

    public function test_dangerous_agent_requires_confirmation_for_any_tool(): void
    {
        $agent = $this->registry->find('database');

        $this->assertSame('confirmation', $this->engine->decide($agent, 'database.schema'));
    }

    public function test_unregistered_tool_defaults_to_controlled(): void
    {
        $this->assertSame('controlled', $this->engine->levelFor('totally.unknown'));
    }
}
