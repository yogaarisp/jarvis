<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AuditController extends Controller
{
    /**
     * GET /api/audit — 100 entri audit terakhir (PRD §12).
     */
    public function index(Request $request): JsonResponse
    {
        $logs = AuditLog::query()
            ->latest()
            ->limit(100)
            ->get();

        return response()->json(['logs' => $logs]);
    }
}
