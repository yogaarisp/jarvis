<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Missions\MissionEngine;
use App\Models\Mission;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use InvalidArgumentException;
use Symfony\Component\HttpFoundation\Response;

class MissionController extends Controller
{
    public function __construct(protected MissionEngine $engine) {}

    /**
     * GET /api/missions — daftar misi milik user.
     */
    public function index(Request $request): JsonResponse
    {
        $missions = Mission::query()
            ->where('user_id', $request->user()->id)
            ->latest()
            ->limit(50)
            ->get();

        return response()->json(['missions' => $missions]);
    }

    /**
     * GET /api/missions/{mission} — detail misi + langkah + eksekusi tool.
     */
    public function show(Request $request, Mission $mission): JsonResponse
    {
        $this->authorizeOwnership($request, $mission);

        return response()->json([
            'mission' => $mission->load(['steps.toolExecutions']),
        ]);
    }

    /**
     * POST /api/missions — buat misi baru.
     * Body: { agent_key, title, instruction?, steps: [{ name, tool, params? }] }
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'agent_key' => ['required', 'string', 'max:32'],
            'title' => ['required', 'string', 'max:120'],
            'instruction' => ['nullable', 'string', 'max:2000'],
            'steps' => ['required', 'array', 'min:1', 'max:'.MissionEngine::MAX_STEPS],
            'steps.*.name' => ['required', 'string', 'max:120'],
            'steps.*.tool' => ['required', 'string', 'max:64'],
            'steps.*.params' => ['nullable', 'array'],
        ]);

        try {
            $result = $this->engine->create(
                user: $request->user(),
                agentKey: $validated['agent_key'],
                title: $validated['title'],
                instruction: $validated['instruction'] ?? null,
                steps: $validated['steps'],
            );
        } catch (InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json($result, 201);
    }

    /**
     * POST /api/missions/{mission}/approve — setujui misi waiting_approval.
     */
    public function approve(Request $request, Mission $mission): JsonResponse
    {
        $this->authorizeOwnership($request, $mission);

        return response()->json(['mission' => $this->engine->approve($mission, $request->user())]);
    }

    /**
     * POST /api/missions/{mission}/cancel — batalkan misi aktif.
     */
    public function cancel(Request $request, Mission $mission): JsonResponse
    {
        $this->authorizeOwnership($request, $mission);

        return response()->json(['mission' => $this->engine->cancel($mission)]);
    }

    /**
     * GET /api/missions/{mission}/stream — progres misi via SSE.
     *
     * Misi berstatus queued dieksekusi di dalam stream ini; event:
     *   meta   -> snapshot misi awal
     *   status -> perubahan status misi (running/completed/failed/cancelled)
     *   step   -> snapshot langkah (running/completed/failed)
     *   done   -> penanda selesai { status, result_summary }
     * Untuk status lain hanya meta + done yang dikirim lalu stream ditutup.
     */
    public function stream(Request $request, Mission $mission): Response
    {
        $this->authorizeOwnership($request, $mission);
        $mission->load('steps');

        return response()->stream(function () use ($mission): void {
            $send = function (string $event, array $payload): void {
                echo 'event: '.$event."\n";
                echo 'data: '.json_encode($payload)."\n\n";

                if (ob_get_level() > 0) {
                    ob_flush();
                }
                flush();
            };

            $send('meta', ['mission' => $mission->load('steps')]);

            try {
                if ($mission->status === 'queued') {
                    $this->engine->execute($mission, $send);
                } else {
                    // Status lain (running/waiting_approval/dll.) cukup dilaporkan.
                    $send('status', ['status' => $mission->status]);
                    $send('done', [
                        'status' => $mission->status,
                        'result_summary' => $mission->result_summary,
                    ]);
                }
            } catch (\Throwable $e) {
                report($e);

                $mission->update(['status' => 'failed']);
                $send('error', ['message' => 'Eksekusi misi gagal: '.$e->getMessage()]);
            }
        }, 200, [
            'Content-Type' => 'text/event-stream',
            'Cache-Control' => 'no-cache',
            'X-Accel-Buffering' => 'no',
        ]);
    }

    /* ------------------------------------------------------------------ */

    private function authorizeOwnership(Request $request, Mission $mission): void
    {
        abort_unless($mission->user_id === $request->user()->id, 404, 'Misi tidak ditemukan.');
    }
}
