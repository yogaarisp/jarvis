<?php

namespace App\Http\Controllers\Api;

use App\Agents\AgentRegistry;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;

class AgentController extends Controller
{
    public function __construct(protected AgentRegistry $registry) {}

    /**
     * GET /api/agents — daftar seluruh agent.
     */
    public function index(): JsonResponse
    {
        return response()->json([
            'agents' => $this->registry->all(),
        ]);
    }

    /**
     * GET /api/agents/{id|key} — detail satu agent.
     */
    public function show(string $agent): JsonResponse
    {
        $found = $this->registry->find($agent);

        if (! $found) {
            return response()->json(['message' => 'Agent tidak ditemukan.'], 404);
        }

        return response()->json(['agent' => $found]);
    }
}
