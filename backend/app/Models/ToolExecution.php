<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property string $tool
 * @property string $status running|succeeded|failed
 */
class ToolExecution extends Model
{
    protected $fillable = [
        'mission_id',
        'mission_step_id',
        'user_id',
        'agent_key',
        'tool',
        'params',
        'status',
        'result',
        'error',
        'latency_ms',
    ];

    protected function casts(): array
    {
        return [
            'params' => 'array',
            'result' => 'array',
        ];
    }

    public function mission(): BelongsTo
    {
        return $this->belongsTo(Mission::class);
    }

    public function step(): BelongsTo
    {
        return $this->belongsTo(MissionStep::class, 'mission_step_id');
    }
}
