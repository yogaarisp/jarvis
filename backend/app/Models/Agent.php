<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * @property string $key
 * @property string $name
 * @property string $role
 * @property string|null $description
 * @property string|null $system_prompt
 * @property array<int, string>|null $allowed_tools
 * @property string $permission_level read|controlled|dangerous
 * @property string $status active|inactive
 */
class Agent extends Model
{
    protected $fillable = [
        'key',
        'name',
        'role',
        'description',
        'system_prompt',
        'allowed_tools',
        'permission_level',
        'status',
    ];

    /** system_prompt hanya untuk pemakaian internal (orchestrator), tidak diekspos ke API/UI. */
    protected $hidden = ['system_prompt'];

    protected function casts(): array
    {
        return [
            'allowed_tools' => 'array',
        ];
    }
}
