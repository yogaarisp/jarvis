<?php

namespace App\Permissions;

use App\Agents\AgentRegistry;
use App\Models\Agent;
use App\Models\ToolPermission;

/**
 * Permission Engine (PRD §12).
 *
 * Keputusan izin = interseksi dua aturan:
 *  1. Whitelist agent (AgentRegistry::canUseTool) — tool di luar whitelist DENY.
 *  2. Klasifikasi tool (tool_permissions) — dangerous butuh konfirmasi eksplisit.
 *
 * Default klasifikasi tool tak terdaftar: CONTROLLED.
 */
class PermissionEngine
{
    public function __construct(protected AgentRegistry $registry) {}

    /** Tingkat izin sebuah tool; default `controlled` bila belum terdaftar. */
    public function levelFor(string $tool): string
    {
        return ToolPermission::query()
            ->where('tool', $tool)
            ->value('level') ?? 'controlled';
    }

    /**
     * Keputusan final untuk pasangan agent+tool.
     * allow | confirmation | deny
     */
    public function decide(Agent $agent, string $tool): string
    {
        if (! $this->registry->canUseTool($agent, $tool)) {
            return 'deny';
        }

        // Agent ber-permission dangerous: seluruh aksinya butuh persetujuan.
        $agentDangerous = $agent->permission_level === 'dangerous';
        $toolDangerous = $this->levelFor($tool) === 'dangerous';

        return ($agentDangerous || $toolDangerous) ? 'confirmation' : 'allow';
    }

    /**
     * Apakah salah satu langkah misi membutuhkan konfirmasi eksplisit?
     *
     * @param  array<int, array{name?: string, tool?: string}>  $steps
     */
    public function missionNeedsApproval(Agent $agent, array $steps): bool
    {
        foreach ($steps as $step) {
            if (($step['tool'] ?? null) !== null && $this->decide($agent, $step['tool']) === 'confirmation') {
                return true;
            }
        }

        return false;
    }
}
