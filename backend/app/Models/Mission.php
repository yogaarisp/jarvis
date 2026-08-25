<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property string $agent_key
 * @property string $title
 * @property string $status queued|running|waiting_approval|completed|failed|cancelled
 */
class Mission extends Model
{
    protected $fillable = [
        'user_id',
        'agent_key',
        'title',
        'instruction',
        'status',
        'result_summary',
    ];

    protected function casts(): array
    {
        return [
            'result_summary' => 'array',
            'approved_at' => 'datetime',
            'started_at' => 'datetime',
            'finished_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function steps(): HasMany
    {
        return $this->hasMany(MissionStep::class)->orderBy('step_order');
    }

    public function toolExecutions(): HasMany
    {
        return $this->hasMany(ToolExecution::class);
    }
}
