<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Research\ResearchAgent;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Endpoint agent RESEARCH (PRD §13).
 */
class ResearchController extends Controller
{
    public function __construct(protected ResearchAgent $research) {}

    /**
     * Jalankan penelitian synchronously (MVP).
     * Untuk topik berat nanti bisa dialihkan ke Hermes worker via `delegate_to_hermes`.
     */
    public function run(Request $request): JsonResponse
    {
        $request->validate([
            'topic' => ['required', 'string', 'min:2', 'max:500'],
            'max_sources' => ['sometimes', 'integer', 'min:1', 'max:8'],
            'max_iterations' => ['sometimes', 'integer', 'min:1', 'max:3'],
        ]);

        $topic = (string) $request->input('topic');
        $maxSources = (int) $request->input('max_sources', 3);
        $maxIterations = (int) $request->input('max_iterations', 2);

        try {
            $result = $this->research->research($topic, $maxSources, $maxIterations);
        } catch (\Throwable $e) {
            $this->audit('research.failed', [
                'topic' => $topic,
                'error' => $e->getMessage(),
            ]);

            return $this->error('Penelitian gagal: '.$e->getMessage(), 500);
        }

        $this->audit('research.succeeded', [
            'topic' => $topic,
            'sources_count' => count($result['sources']),
            'depth' => $result['depth'],
        ]);

        return $this->success($result, 'Penelitian selesai.');
    }
}
