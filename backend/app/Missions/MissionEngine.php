<?php

namespace App\Missions;

use App\Agents\AgentRegistry;
use App\Audit\AuditLogger;
use App\Hermes\HermesService;
use App\Models\Agent;
use App\Models\Mission;
use App\Models\MissionStep;
use App\Models\ToolExecution;
use App\Models\User;
use App\Permissions\PermissionEngine;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use InvalidArgumentException;

/**
 * Mission Engine (PRD §11) + Permission Engine (PRD §12).
 *
 * Alur: misi berisi langkah berurutan; tiap langkah mengeksekusi satu tool
 * Hermes dengan keputusan izin per-langkah:
 *   - allow        -> jalan otomatis
 *   - confirmation -> misi masuk WAITING_APPROVAL sampai disetujui eksplisit
 *   - deny         -> misi ditolak saat dibuat (tool di luar whitelist agent)
 *
 * Progres dikirim lewat callback $emit(event, payload) agar engine tetap
 * terpisah dari transport (SSE).
 */
class MissionEngine
{
    /** Batas jumlah langkah per misi. */
    public const MAX_STEPS = 10;

    public function __construct(
        protected HermesService $hermes,
        protected AgentRegistry $registry,
        protected PermissionEngine $permissions,
        protected AuditLogger $audit,
    ) {}

    /**
     * Cari agent aktif untuk sebuah key.
     *
     * @throws InvalidArgumentException bila agent tidak ada / tidak aktif
     */
    public function resolveAgent(string $agentKey): Agent
    {
        $agent = $this->registry->find($agentKey);

        if (! $agent || $agent->status !== 'active') {
            throw new InvalidArgumentException("Agent '{$agentKey}' tidak ditemukan atau tidak aktif.");
        }

        return $agent;
    }

    /**
     * Buat misi baru beserta langkah-langkahnya.
     * Keputusan izin dihitung per langkah via PermissionEngine.
     *
     * @param  array<int, array{name: string, tool: string, params?: array}>  $steps
     * @return array{mission: Mission, requires_approval: bool}
     *
     * @throws InvalidArgumentException
     */
    public function create(User $user, string $agentKey, string $title, ?string $instruction, array $steps): array
    {
        $steps = array_slice(array_values($steps), 0, self::MAX_STEPS);

        if ($steps === []) {
            throw new InvalidArgumentException('Misi minimal memiliki satu langkah.');
        }

        $agent = $this->resolveAgent($agentKey);

        foreach ($steps as $step) {
            if (! isset($step['name'], $step['tool']) || trim((string) $step['tool']) === '') {
                throw new InvalidArgumentException('Setiap langkah membutuhkan name dan tool.');
            }

            if ($this->permissions->decide($agent, $step['tool']) === 'deny') {
                $this->audit->log($user, 'permission.denied', [
                    'agent' => $agent->key,
                    'tool' => $step['tool'],
                    'reason' => 'tool di luar whitelist agent',
                ]);

                throw new InvalidArgumentException(
                    "Tool '{$step['tool']}' tidak diizinkan untuk agent {$agent->name}."
                );
            }
        }

        $needsApproval = $this->permissions->missionNeedsApproval($agent, $steps);
        $status = $needsApproval ? 'waiting_approval' : 'queued';

        $mission = DB::transaction(function () use ($user, $agent, $title, $instruction, $steps, $status) {
            $mission = Mission::create([
                'user_id' => $user->id,
                'agent_key' => $agent->key,
                'title' => $title,
                'instruction' => $instruction,
                'status' => $status,
            ]);

            foreach ($steps as $index => $step) {
                $mission->steps()->create([
                    'step_order' => $index + 1,
                    'name' => $step['name'],
                    'tool' => $step['tool'],
                    'params' => $step['params'] ?? null,
                ]);
            }

            return $mission;
        });

        $this->audit->log($user, 'mission.created', [
            'mission_id' => $mission->id,
            'agent' => $agent->key,
            'status' => $status,
            'requires_approval' => $needsApproval,
        ]);

        Log::info('Mission dibuat', [
            'mission_id' => $mission->id,
            'agent' => $agent->key,
            'status' => $status,
        ]);

        return ['mission' => $mission->fresh(['steps']), 'requires_approval' => $needsApproval];
    }

    /**
     * Setujui misi yang menunggu persetujuan (409 bila status tidak valid).
     */
    public function approve(Mission $mission, ?User $approver = null): Mission
    {
        abort_unless($mission->status === 'waiting_approval', 409, 'Misi tidak sedang menunggu persetujuan.');

        $mission->update(['status' => 'queued', 'approved_at' => now()]);

        $this->audit->log($approver, 'mission.approved', ['mission_id' => $mission->id]);
        Log::info('Mission disetujui', ['mission_id' => $mission->id]);

        return $mission->fresh();
    }

    /**
     * Batalkan misi. Misi yang sedang running akan berhenti di antara langkah;
     * langkah tersisa ditandai skipped.
     */
    public function cancel(Mission $mission, ?User $canceller = null): Mission
    {
        abort_unless(
            in_array($mission->status, ['queued', 'waiting_approval', 'running'], true),
            409,
            'Misi tidak dapat dibatalkan.',
        );

        $mission->update(['status' => 'cancelled', 'finished_at' => now()]);

        $this->audit->log($canceller, 'mission.cancelled', ['mission_id' => $mission->id]);
        Log::info('Mission dibatalkan', ['mission_id' => $mission->id]);

        return $mission->fresh();
    }

    /**
     * Eksekusi misi langkah demi langkah. Hanya misi berstatus `queued`
     * (artinya sudah lolos approval bila diperlukan).
     *
     * @param  callable(string, array): void  $emit  callback progres: $emit('step', [...]), dst.
     */
    public function execute(Mission $mission, callable $emit): Mission
    {
        abort_unless($mission->status === 'queued', 409, 'Misi tidak dalam status antrian.');

        $mission->update(['status' => 'running', 'started_at' => now()]);
        $emit('status', ['status' => 'running']);

        $failures = [];
        /** @var User|null $actor */
        $actor = $mission->user()->first();
        $agent = $this->resolveAgent($mission->agent_key);

        /** @var MissionStep $step */
        foreach ($mission->steps as $step) {
            if ($mission->fresh()->status === 'cancelled') {
                $this->skipRemainingSteps($mission);
                $emit('status', ['status' => 'cancelled']);

                return $mission->fresh();
            }

            // Re-check izin saat eksekusi (defense-in-depth).
            if ($this->permissions->decide($agent, $step->tool) === 'deny') {
                $this->audit->log($actor, 'permission.denied', [
                    'mission_id' => $mission->id,
                    'step_id' => $step->id,
                    'tool' => $step->tool,
                ]);

                $failures[] = $step->name;

                $step->update(['status' => 'failed', 'output' => ['error' => 'Tool tidak diizinkan.'], 'finished_at' => now()]);
                $emit('step', ['step' => $step->fresh()]);

                break;
            }

            $step->update(['status' => 'running', 'started_at' => now()]);
            $emit('step', ['step' => $step->fresh()]);

            $execution = ToolExecution::create([
                'mission_id' => $mission->id,
                'mission_step_id' => $step->id,
                'user_id' => $mission->user_id,
                'agent_key' => $mission->agent_key,
                'tool' => $step->tool,
                'params' => $step->params,
                'status' => 'running',
            ]);

            try {
                $result = $this->hermes->executeTool($step->tool, $step->params ?? [], $actor);

                if ($result['ok']) {
                    $execution->update([
                        'status' => 'succeeded',
                        'result' => $result['result'] ?? null,
                        'latency_ms' => $result['latency_ms'],
                    ]);
                    $step->update(['status' => 'completed', 'output' => $result['result'] ?? null, 'finished_at' => now()]);

                    $this->audit->log($actor, 'tool.executed', [
                        'mission_id' => $mission->id,
                        'tool' => $step->tool,
                        'level' => $this->permissions->levelFor($step->tool),
                        'ok' => true,
                    ]);
                } else {
                    $execution->update([
                        'status' => 'failed',
                        'error' => $result['error'] ?? 'Eksekusi gagal.',
                        'latency_ms' => $result['latency_ms'],
                    ]);
                    $step->update(['status' => 'failed', 'output' => ['error' => $result['error'] ?? 'Eksekusi gagal.'], 'finished_at' => now()]);
                    $failures[] = $step->name;
                    $emit('step', ['step' => $step->fresh()]);

                    break;
                }
            } catch (\Throwable $e) {
                report($e);

                $execution->update(['status' => 'failed', 'error' => $e->getMessage()]);
                $step->update(['status' => 'failed', 'output' => ['error' => $e->getMessage()], 'finished_at' => now()]);
                $failures[] = $step->name;
                $emit('step', ['step' => $step->fresh()]);

                break;
            }

            $emit('step', ['step' => $step->fresh()]);
        }

        if ($failures !== []) {
            $mission->update([
                'status' => 'failed',
                'finished_at' => now(),
                'result_summary' => ['failed_steps' => $failures],
            ]);
            $emit('status', ['status' => 'failed']);
        } else {
            $mission->update([
                'status' => 'completed',
                'finished_at' => now(),
                'result_summary' => ['steps_completed' => $mission->steps()->where('status', 'completed')->count()],
            ]);
            $emit('status', ['status' => 'completed']);
        }

        $final = $mission->fresh();

        $this->audit->log($actor, 'mission.finished', [
            'mission_id' => $mission->id,
            'status' => $final->status,
        ]);

        $emit('done', [
            'status' => $final->status,
            'result_summary' => $final->result_summary,
        ]);

        return $final;
    }

    private function skipRemainingSteps(Mission $mission): void
    {
        MissionStep::query()
            ->where('mission_id', $mission->id)
            ->whereIn('status', ['pending', 'running'])
            ->update(['status' => 'skipped', 'finished_at' => now()]);
    }
}
