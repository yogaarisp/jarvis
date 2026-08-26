<?php

namespace App\Services;

/**
 * Kontrol aplikasi & URL di PC Keenan via agent tool `system_control`.
 *
 * Hanya efektif saat backend berjalan di mesin yang sama dengan pengguna
 * (Laragon/localhost, Windows). Di server Linux akan dikembalikan pesan
 * error yang jelas — bukan error diam-diam.
 */
class SystemControlService
{
    /**
     * Registry alias populer.
     *
     * type:
     *  - url       → dibuka di browser default
     *  - protocol  → URI scheme aplikasi (whatsapp:, spotify:, tg://)
     *  - app       → nama eksekusi/App Paths Windows (`start <name>`)
     *
     * kill: daftar proses untuk close_app (boleh lebih dari satu).
     */
    private const ALIASES = [
        // Web populer → browser default
        'youtube'    => ['type' => 'url', 'open' => 'https://www.youtube.com'],
        'instagram'  => ['type' => 'url', 'open' => 'https://www.instagram.com'],
        'facebook'   => ['type' => 'url', 'open' => 'https://www.facebook.com'],
        'tiktok'     => ['type' => 'url', 'open' => 'https://www.tiktok.com'],
        'twitter'    => ['type' => 'url', 'open' => 'https://x.com'],
        'x'          => ['type' => 'url', 'open' => 'https://x.com'],
        'gmail'      => ['type' => 'url', 'open' => 'https://mail.google.com'],
        'google'     => ['type' => 'url', 'open' => 'https://www.google.com'],
        'maps'       => ['type' => 'url', 'open' => 'https://maps.google.com'],
        'translate'  => ['type' => 'url', 'open' => 'https://translate.google.com'],
        'github'     => ['type' => 'url', 'open' => 'https://github.com'],
        'chatgpt'    => ['type' => 'url', 'open' => 'https://chat.openai.com'],

        // Aplikasi desktop / protokol
        'whatsapp'   => ['type' => 'protocol', 'open' => 'whatsapp:', 'kill' => ['WhatsApp.exe']],
        'telegram'   => ['type' => 'protocol', 'open' => 'tg://', 'kill' => ['Telegram.exe']],
        'spotify'    => ['type' => 'protocol', 'open' => 'spotify:', 'kill' => ['Spotify.exe']],
        'discord'    => ['type' => 'protocol', 'open' => 'discord://', 'kill' => ['Discord.exe']],

        // Browser
        'chrome'     => ['type' => 'app', 'open' => 'chrome', 'kill' => ['chrome.exe']],
        'edge'       => ['type' => 'app', 'open' => 'msedge', 'kill' => ['msedge.exe']],
        'firefox'    => ['type' => 'app', 'open' => 'firefox', 'kill' => ['firefox.exe']],
        'brave'      => ['type' => 'app', 'open' => 'brave', 'kill' => ['brave.exe']],

        // Aplikasi bawaan & umum
        'notepad'    => ['type' => 'app', 'open' => 'notepad', 'kill' => ['notepad.exe']],
        'calculator' => ['type' => 'app', 'open' => 'calc', 'kill' => ['CalculatorApp.exe', 'calc.exe', 'ApplicationFrameHost.exe']],
        'kalkulator' => ['type' => 'app', 'open' => 'calc', 'kill' => ['CalculatorApp.exe', 'calc.exe', 'ApplicationFrameHost.exe']],
        'explorer'   => ['type' => 'app', 'open' => 'explorer'],
        'paint'      => ['type' => 'app', 'open' => 'mspaint', 'kill' => ['mspaint.exe']],
        'vscode'     => ['type' => 'app', 'open' => 'code', 'kill' => ['Code.exe']],
        'word'       => ['type' => 'app', 'open' => 'winword', 'kill' => ['WINWORD.EXE']],
        'excel'      => ['type' => 'app', 'open' => 'excel', 'kill' => ['EXCEL.EXE']],
        'powerpoint' => ['type' => 'app', 'open' => 'powerpnt', 'kill' => ['POWERPNT.EXE']],
        'cmd'        => ['type' => 'app', 'open' => 'cmd'],
        'terminal'   => ['type' => 'app', 'open' => 'wt'],
    ];

    /**
     * Eksekusi satu aksi kontrol sistem.
     *
     * @return array{ok: bool, message: string}
     */
    public function execute(string $action, string $target): array
    {
        if (PHP_OS_FAMILY !== 'Windows') {
            return [
                'ok' => false,
                'message' => 'Kontrol aplikasi hanya tersedia saat JARVIS berjalan di PC Windows kamu (localhost), bukan di server.',
            ];
        }

        $target = trim($target);

        if ($target === '') {
            return ['ok' => false, 'message' => 'Target kosong.'];
        }

        return match ($action) {
            'open_url' => $this->openUrl($target),
            'open_app' => $this->openApp($target),
            'close_app' => $this->closeApp($target),
            default => ['ok' => false, "message" => "Aksi [{$action}] tidak dikenal."],
        };
    }

    /** @return array{ok: bool, message: string} */
    private function openUrl(string $target): array
    {
        $alias = strtolower($target);
        $url = self::ALIASES[$alias]['open'] ?? null;

        if ($url === null || ! is_string($url)) {
            $url = $target;
        }

        if (! preg_match('#^https?://#i', $url)) {
            return ['ok' => false, 'message' => "Bukan URL yang valid: {$url}"];
        }

        $this->shellStart($url);

        return ['ok' => true, 'message' => "Membuka {$url} di browser."];
    }

    /** @return array{ok: bool, message: string} */
    private function openApp(string $target): array
    {
        $alias = strtolower($target);
        $entry = self::ALIASES[$alias] ?? null;

        $open = is_array($entry) ? ($entry['open'] ?? $target) : $target;
        $this->shellStart((string) $open);

        return ['ok' => true, 'message' => 'Membuka '.(is_array($entry) ? $alias : $target).'.'];
    }

    /**
     * Tutup aplikasi berdasarkan nama proses.
     *
     * @return array{ok: bool, message: string}
     */
    private function closeApp(string $target): array
    {
        $alias = strtolower($target);
        $processes = self::ALIASES[$alias]['kill'] ?? null;

        if (! is_array($processes) || $processes === []) {
            // Izinkan nama proses eksplisit, mis. close_app "spotify.exe".
            $processes = [preg_match('/\.exe$/i', $target) ? $target : ucfirst($target).'.exe'];
        }

        $closed = [];
        $missing = [];

        foreach ($processes as $proc) {
            exec('tasklist /FI "IMAGENAME eq '.escapeshellarg($proc).'" /NH 2>NUL', $out, $code);

            $running = $code === 0 && collect($out)->contains(
                fn (string $line) => stripos($line, $proc) !== false,
            );

            if (! $running) {
                $missing[] = $proc;

                continue;
            }

            exec('taskkill /F /IM '.escapeshellarg($proc).' >NUL 2>&1', $kOut, $kCode);

            if ($kCode === 0) {
                $closed[] = $proc;
            } else {
                $missing[] = $proc;
            }
        }

        if ($closed !== []) {
            return ['ok' => true, 'message' => 'Menutup '.implode(', ', array_unique(array_map('basename', $closed))).'.'];
        }

        return ['ok' => false, 'message' => "{$alias} tidak ditemukan sedang berjalan."];
    }

    /** Buka target (URL/protokol/app) tanpa membuka jendela cmd. */
    private function shellStart(string $target): void
    {
        pclose(popen('start "" '.escapeshellarg($target), 'r'));
    }
}
