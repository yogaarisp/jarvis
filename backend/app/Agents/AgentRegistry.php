<?php

namespace App\Agents;

use App\Models\Agent;
use Illuminate\Support\Collection;

/**
 * Registry akses terpusat ke definisi agent (PRD §10).
 * Fase berikutnya (Mission Engine, Permission Engine) akan
 * mengonsumsi registry ini untuk routing & pengecekan izin.
 */
class AgentRegistry
{
    /** Semua agent, diurutkan berdasarkan nama. @return Collection<int, Agent> */
    public function all(): Collection
    {
        return Agent::query()->orderBy('name')->get();
    }

    /** Hanya agent berstatus aktif. @return Collection<int, Agent> */
    public function active(): Collection
    {
        return Agent::query()->where('status', 'active')->orderBy('name')->get();
    }

    /**
     * Cari agent by key atau id numerik.
     */
    public function find(int|string $idOrKey): ?Agent
    {
        if (is_numeric($idOrKey)) {
            return Agent::find((int) $idOrKey);
        }

        return Agent::where('key', $idOrKey)->first();
    }

    /**
     * Tool yang boleh dipakai sebuah agent.
     *
     * @return array<int, string>
     */
    public function allowedTools(Agent $agent): array
    {
        return array_values($agent->allowed_tools ?? []);
    }

    /**
     * Apakah agent tertentu diizinkan memakai tool tertentu.
     */
    public function canUseTool(Agent $agent, string $tool): bool
    {
        return in_array($tool, $this->allowedTools($agent), true);
    }
}
