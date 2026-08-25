<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Key-value store untuk konfigurasi aplikasi yang bisa diubah via UI Settings.
 * Berbeda dengan env — setting DB bisa diedit Keenan tanpa redeploy.
 *
 *   key       = nama setting (contoh: ai.default, ai.providers.nine_router.api_key)
 *   value     = nilai (string di DB, di-cast sesuai kolom `type`)
 *   secret    = true bila berisi credential (API key) — tidak pernah dikirim ke frontend
 *               sebagai plaintext; frontend hanya tahu apakah field sudah terisi.
 */
class AppSetting extends Model
{
    protected $fillable = ['key', 'value', 'type', 'secret'];

    protected function casts(): array
    {
        return [
            'secret' => 'boolean',
        ];
    }

    /** Ambil nilai setting dari DB atau null. Tidak casting otomatis. */
    public static function raw(string $key): ?string
    {
        /** @var self|null $row */
        $row = static::query()->where('key', $key)->first();

        return $row?->value;
    }

    /** Ambil nilai setting sudah di-cast sesuai type. */
    public static function getValue(string $key, mixed $default = null): mixed
    {
        /** @var self|null $row */
        $row = static::query()->where('key', $key)->first();
        if (! $row) {
            return $default;
        }

        return match ($row->type) {
            'boolean' => (bool) $row->value,
            'integer' => (int) ($row->value ?? 0),
            default => $row->value,
        };
    }

    /**
     * Upsert banyak key sekaligus. Input array berupa key => [value, type, secret?]
     * atau key => scalar.
     *
     * @param  array<string, array{0: mixed, 1: string, 2?: bool}|scalar>  $items
     */
    public static function setMany(array $items): void
    {
        foreach ($items as $key => $spec) {
            if (is_array($spec)) {
                [$value, $type, $secret] = array_pad($spec, 3, false);
                $castValue = match ($type) {
                    'boolean' => $value ? '1' : '0',
                    'integer' => (string) (int) $value,
                    default => $value === null ? null : (string) $value,
                };
                static::query()->updateOrCreate(
                    ['key' => $key],
                    ['value' => $castValue, 'type' => $type, 'secret' => (bool) $secret],
                );
            } else {
                static::query()->updateOrCreate(
                    ['key' => $key],
                    ['value' => $spec === null ? null : (string) $spec, 'type' => 'string', 'secret' => false],
                );
            }
        }
    }
}
