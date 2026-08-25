<?php

namespace App\Audit;

use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Support\Facades\Log;

/**
 * Pencatat audit trail (PRD §12). Kegagalan pencatatan tidak boleh
 * menggagalkan aksi utama — hanya dilaporkan ke log aplikasi.
 */
class AuditLogger
{
    public function log(?User $user, string $event, array $data = []): ?AuditLog
    {
        try {
            return AuditLog::create([
                'user_id' => $user?->id,
                'event' => $event,
                'data' => $data,
            ]);
        } catch (\Throwable $e) {
            report($e);
            Log::warning('Audit log gagal ditulis', ['event' => $event]);

            return null;
        }
    }
}
