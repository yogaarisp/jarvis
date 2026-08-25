<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Klasifikasi izin sebuah tool Hermes (PRD §12).
 *
 * @property string $tool
 * @property string $level read|controlled|dangerous
 */
class ToolPermission extends Model
{
    protected $fillable = [
        'tool',
        'level',
        'description',
    ];
}
