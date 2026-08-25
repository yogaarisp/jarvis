<?php

namespace App\Services;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

/**
 * Telemetri lingkungan (ENV_TELEMETRY): IP pengunjung real, lokasi via
 * geolokasi IP (ipwho.is, gratis tanpa key), dan cuaca real via Open-Meteo.
 *
 * - IP lokal/private (dev di Laragon) → lokasi diambil dari IP publik server.
 * - Hasil di-cache 10 menit per IP agar tidak spam API eksternal.
 * - Semua nilai null bila API eksternal tidak terjangkau (offline).
 */
class EnvTelemetry
{
    private const CACHE_TTL = 600;

    /** WMO weather interpretation codes → label HUD. */
    private const WMO_LABELS = [
        0 => 'CLEAR', 1 => 'MAINLY CLEAR', 2 => 'PARTLY CLOUDY', 3 => 'OVERCAST',
        45 => 'FOG', 48 => 'RIME FOG',
        51 => 'DRIZZLE', 53 => 'DRIZZLE', 55 => 'DRIZZLE',
        56 => 'FREEZING DRIZZLE', 57 => 'FREEZING DRIZZLE',
        61 => 'LIGHT RAIN', 63 => 'RAIN', 65 => 'HEAVY RAIN',
        66 => 'FREEZING RAIN', 67 => 'FREEZING RAIN',
        71 => 'LIGHT SNOW', 73 => 'SNOW', 75 => 'HEAVY SNOW', 77 => 'SNOW GRAINS',
        80 => 'RAIN SHOWERS', 81 => 'RAIN SHOWERS', 82 => 'VIOLENT SHOWERS',
        85 => 'SNOW SHOWERS', 86 => 'SNOW SHOWERS',
        95 => 'THUNDERSTORM', 96 => 'THUNDERSTORM', 99 => 'THUNDERSTORM',
    ];

    /** @return array<string, string|float|int|null> */
    public function snapshot(Request $request): array
    {
        $visitorIp = $request->ip() ?? 'unknown';
        $isPublicIp = filter_var($visitorIp, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) !== false;

        return Cache::remember('env_telemetry:'.md5($visitorIp), self::CACHE_TTL, function () use ($visitorIp, $isPublicIp): array {
            // Di localhost, geolokasi memakai IP publik server sendiri.
            $geo = $this->geolocate($isPublicIp ? $visitorIp : null);

            $weather = $geo !== null ? $this->weather($geo['latitude'], $geo['longitude']) : null;

            return [
                'visitor_ip' => $isPublicIp ? $visitorIp : $this->serverPublicIp() ?? $visitorIp,
                'city' => $geo['city'] ?? null,
                'country_code' => $geo['country_code'] ?? null,
                'temperature_c' => $weather['temperature_c'] ?? null,
                'condition' => $weather['condition'] ?? null,
            ];
        });
    }

    /**
     * Geolokasi IP via ipwho.is. IP null = deteksi otomatis (IP publik server).
     *
     * @return array{city: string, country_code: string, latitude: float, longitude: float}|null
     */
    private function geolocate(?string $ip): ?array
    {
        try {
            $url = $ip === null ? 'https://ipwho.is/' : 'https://ipwho.is/'.rawurlencode($ip);
            $response = Http::timeout(5)->get($url);

            if (! $response->successful()) {
                return null;
            }

            $data = $response->json();

            if (($data['success'] ?? false) !== true || ! isset($data['latitude'], $data['longitude'])) {
                return null;
            }

            return [
                'city' => (string) ($data['city'] ?? ''),
                'country_code' => (string) ($data['country_code'] ?? ''),
                'latitude' => (float) $data['latitude'],
                'longitude' => (float) $data['longitude'],
            ];
        } catch (\Throwable) {
            return null;
        }
    }

    /** Cuaca saat ini via Open-Meteo (gratis, tanpa key). */
    private function weather(float $latitude, float $longitude): ?array
    {
        try {
            $response = Http::timeout(5)->get('https://api.open-meteo.com/v1/forecast', [
                'latitude' => $latitude,
                'longitude' => $longitude,
                'current' => 'temperature_2m,weather_code',
            ]);

            if (! $response->successful()) {
                return null;
            }

            $current = $response->json('current');

            if (! isset($current['temperature_2m'])) {
                return null;
            }

            return [
                'temperature_c' => round((float) $current['temperature_2m'], 1),
                'condition' => self::WMO_LABELS[(int) ($current['weather_code'] ?? -1)] ?? 'UNKNOWN',
            ];
        } catch (\Throwable) {
            return null;
        }
    }

    private function serverPublicIp(): ?string
    {
        try {
            $response = Http::timeout(5)->get('https://ipwho.is/');

            if ($response->successful() && ($response->json('success') ?? false) === true) {
                $ip = $response->json('ip');

                return is_string($ip) && $ip !== '' ? $ip : null;
            }
        } catch (\Throwable) {
            // biarkan null
        }

        return null;
    }
}
