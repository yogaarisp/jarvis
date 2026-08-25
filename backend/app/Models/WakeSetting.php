<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Preferensi Wake Engine per user (PRD §5).
 */
class WakeSetting extends Model
{
    protected $fillable = [
        'user_id',
        'clap_enabled',
        'claps_required',
        'sensitivity',
        'window_ms',
        'cooldown_ms',
    ];

    protected function casts(): array
    {
        return [
            'clap_enabled' => 'boolean',
            'claps_required' => 'integer',
            'window_ms' => 'integer',
            'cooldown_ms' => 'integer',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Ambil setting user; buat baris default bila belum ada.
     */
    public static function forUser(int $userId): self
    {
        return static::query()->firstOrCreate(['user_id' => $userId]);
    }
}
