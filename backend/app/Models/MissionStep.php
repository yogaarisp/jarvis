<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property int $step_order
 * @property string $name
 * @property string $tool
 * @property string $status pending|running|completed|failed|skipped
 */
class MissionStep extends Model
{
    protected $fillable = [
        'mission_id',
        'step_order',
        'name',
        'tool',
        'params',
        'status',
        'output',
    ];

    protected function casts(): array
    {
        return [
            'params' => 'array',
            'output' => 'array',
            'started_at' => 'datetime',
            'finished_at' => 'datetime',
        ];
    }

    public function mission(): BelongsTo
    {
        return $this->belongsTo(Mission::class);
    }

    public function toolExecutions(): HasMany
    {
        return $this->hasMany(ToolExecution::class);
    }
}
