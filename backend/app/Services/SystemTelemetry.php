<?php

namespace App\Services;

/**
 * Telemetri hardware server secara real (PRD Phase 10 — System Monitoring).
 *
 * Linux (aaPanel/Proxmox VM): dibaca langsung dari /proc & /sys tanpa eksternal tool.
 * Windows (Laragon dev): fallback via COM WMI bila tersedia, selain itu null.
 * Nilai yang tidak bisa dibaca dikembalikan sebagai null — panel UI menampilkan N/A.
 */
class SystemTelemetry
{
    /** @return array<string, mixed> */
    public function snapshot(): array
    {
        $isWindows = PHP_OS_FAMILY === 'Windows';

        return [
            'hostname' => php_uname('n'),
            'platform' => PHP_OS.' '.php_uname('r'),
            'cores' => $this->cores($isWindows),
            'cpu_percent' => $isWindows ? $this->cpuPercentWindows() : $this->cpuPercentLinux(),
            'ram_total_mb' => null,
            'ram_used_percent' => null,
            'disk_total_gb' => null,
            'disk_used_percent' => null,
            'temperature_c' => $isWindows ? null : $this->temperatureLinux(),
            'uptime_seconds' => $isWindows ? null : $this->uptimeLinux(),
            ...($isWindows ? $this->ramDiskUptimeWindows() : $this->ramDiskLinux()),
        ];
    }

    private function cores(bool $isWindows): ?int
    {
        try {
            if ($isWindows) {
                $n = getenv('NUMBER_OF_PROCESSORS');

                return $n !== false && $n !== '' ? (int) $n : null;
            }

            $stat = @file_get_contents('/proc/cpuinfo');

            if ($stat === false) {
                return null;
            }

            return substr_count($stat, 'processor') ?: null;
        } catch (\Throwable) {
            return null;
        }
    }

    /**
     * Persentase pemakaian CPU via delta /proc/stat (sampel dua kali, 250 ms).
     */
    private function cpuPercentLinux(): ?float
    {
        try {
            $first = $this->procStatCpu();

            if ($first === null) {
                return null;
            }

            usleep(250_000);

            $second = $this->procStatCpu();

            if ($second === null) {
                return null;
            }

            $idleDelta = ($second['idle'] ?? 0) - ($first['idle'] ?? 0);
            $totalDelta = $second['total'] - $first['total'];

            if ($totalDelta <= 0) {
                return null;
            }

            return round(max(0.0, min(100.0, (1 - $idleDelta / $totalDelta) * 100)), 1);
        } catch (\Throwable) {
            return null;
        }
    }

    /** @return array{idle: float, total: float}|null */
    private function procStatCpu(): ?array
    {
        $line = @file_get_contents('/proc/stat');

        if ($line === false || ! preg_match('/^cpu\s+(.+)$/m', $line, $m)) {
            return null;
        }

        $values = array_map('floatval', preg_split('/\s+/', trim($m[1])));
        $idle = ($values[3] ?? 0) + ($values[4] ?? 0); // idle + iowait
        $total = array_sum($values);

        return ['idle' => $idle, 'total' => $total];
    }

    private function cpuPercentWindows(): ?float
    {
        try {
            if (class_exists(\COM::class)) {
                $wmi = new \COM('Win32_PerfFormattedData_PerfOS_Processor');
                $total = 0.0;
                $count = 0;

                foreach ($wmi as $instance) {
                    if (str_starts_with((string) $instance->Name, '_Total')) {
                        return round((float) $instance->PercentProcessorTime, 1);
                    }

                    $total += (float) $instance->PercentProcessorTime;
                    $count++;
                }

                if ($count > 0) {
                    return round($total / $count, 1);
                }
            }
        } catch (\Throwable) {
            // fallback di bawah
        }

        try {
            $out = @shell_exec('wmic cpu get loadpercentage 2>nul');

            if (is_string($out) && preg_match('/(\d+)/', $out, $m)) {
                return (float) $m[1];
            }
        } catch (\Throwable) {
            // biarkan null
        }

        return null;
    }

    /** @return array<string, float|int|null> */
    private function ramDiskLinux(): array
    {
        try {
            $meminfo = @file_get_contents('/proc/meminfo');
            $ramTotal = null;
            $ramUsedPercent = null;

            if (is_string($meminfo)
                && preg_match('/^MemTotal:\s+(\d+)\s*kB/m', $meminfo, $mt)
                && preg_match('/^MemAvailable:\s+(\d+)\s*kB/m', $meminfo, $ma)) {
                $totalKb = (int) $mt[1];
                $availableKb = (int) $ma[1];
                $ramTotal = (int) round($totalKb / 1024);
                $ramUsedPercent = $totalKb > 0
                    ? round((($totalKb - $availableKb) / $totalKb) * 100, 1)
                    : null;
            }

            $diskPath = '/';
            $diskTotal = @disk_total_space($diskPath);
            $diskFree = @disk_free_space($diskPath);
            $diskTotalGb = $diskTotal !== false ? round($diskTotal / 1024 ** 3, 1) : null;
            $diskUsedPercent = ($diskTotal !== false && $diskFree !== false && $diskTotal > 0)
                ? round((($diskTotal - $diskFree) / $diskTotal) * 100, 1)
                : null;

            return [
                'ram_total_mb' => $ramTotal,
                'ram_used_percent' => $ramUsedPercent,
                'disk_total_gb' => $diskTotalGb,
                'disk_used_percent' => $diskUsedPercent,
            ];
        } catch (\Throwable) {
            return [
                'ram_total_mb' => null,
                'ram_used_percent' => null,
                'disk_total_gb' => null,
                'disk_used_percent' => null,
            ];
        }
    }

    /** @return array<string, float|int|null> */
    private function ramDiskUptimeWindows(): array
    {
        $result = [
            'ram_total_mb' => null,
            'ram_used_percent' => null,
            'disk_total_gb' => null,
            'disk_used_percent' => null,
            'uptime_seconds' => null,
        ];

        try {
            $diskTotal = @disk_total_space('C:');
            $diskFree = @disk_free_space('C:');

            if ($diskTotal !== false && $diskFree !== false && $diskTotal > 0) {
                $result['disk_total_gb'] = round($diskTotal / 1024 ** 3, 1);
                $result['disk_used_percent'] = round((($diskTotal - $diskFree) / $diskTotal) * 100, 1);
            }
        } catch (\Throwable) {
            // biarkan null
        }

        try {
            if (class_exists(\COM::class)) {
                $os = new \COM('Win32_OperatingSystem');

                foreach ($os as $instance) {
                    $result['ram_total_mb'] = (int) round(((int) $instance->TotalVisibleMemorySize) / 1024);
                    $freeKb = (int) $instance->FreePhysicalMemory;
                    $totalKb = (int) $instance->TotalVisibleMemorySize;

                    if ($totalKb > 0) {
                        $result['ram_used_percent'] = round((($totalKb - $freeKb) / $totalKb) * 100, 1);
                    }

                    $lastBoot = (string) $instance->LastBootUpTime;

                    if (preg_match('/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/', $lastBoot, $m)) {
                        $bootTs = mktime((int) $m[4], (int) $m[5], (int) $m[6], (int) $m[2], (int) $m[3], (int) $m[1]);

                        if ($bootTs > 0) {
                            $result['uptime_seconds'] = max(0, time() - $bootTs);
                        }
                    }

                    break;
                }
            }
        } catch (\Throwable) {
            // fallback wmic di bawah
        }

        if ($result['ram_total_mb'] === null) {
            $out = @shell_exec('wmic OS get TotalVisibleMemorySize,FreePhysicalMemory /value 2>nul');

            if (is_string($out)
                && preg_match('/FreePhysicalMemory=(\d+)/', $out, $free)
                && preg_match('/TotalVisibleMemorySize=(\d+)/', $out, $total)) {
                $totalKb = (int) $total[1];
                $freeKb = (int) $free[1];
                $result['ram_total_mb'] = (int) round($totalKb / 1024);

                if ($totalKb > 0) {
                    $result['ram_used_percent'] = round((($totalKb - $freeKb) / $totalKb) * 100, 1);
                }
            }
        }

        if ($result['uptime_seconds'] === null) {
            $out = @shell_exec('wmic OS get LastBootUpTime /value 2>nul');

            if (is_string($out) && preg_match('/LastBootUpTime=(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/', $out, $m)) {
                $bootTs = mktime((int) $m[4], (int) $m[5], (int) $m[6], (int) $m[2], (int) $m[3], (int) $m[1]);

                if ($bootTs > 0) {
                    $result['uptime_seconds'] = max(0, time() - $bootTs);
                }
            }
        }

        return $result;
    }

    private function temperatureLinux(): ?float
    {
        try {
            foreach (glob('/sys/class/thermal/thermal_zone*/temp') ?: [] as $file) {
                $raw = @file_get_contents($file);

                if ($raw !== false && (int) $raw > 0) {
                    return round(((int) $raw) / 1000, 1);
                }
            }
        } catch (\Throwable) {
            // biarkan null
        }

        return null;
    }

    private function uptimeLinux(): ?int
    {
        try {
            $raw = @file_get_contents('/proc/uptime');

            if ($raw === false || ! preg_match('/^(\d+)/', $raw, $m)) {
                return null;
            }

            return (int) $m[1];
        } catch (\Throwable) {
            return null;
        }
    }
}
