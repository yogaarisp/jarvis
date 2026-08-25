<?php

namespace App\Research;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Pembaca halaman web untuk agent RESEARCH (PRD §13).
 * Mengambil HTML, membuang script/style, dan menyaring teks utama.
 *
 * Keamanan: hanya http/https publik — localhost, IP privat, dan
 * skema lain diblokir untuk mencegah SSRF.
 */
class WebReader
{
    public const MAX_CHARS = 6000;

    /**
     * Baca satu URL.
     *
     * @return array{ok: bool, url: string, title?: string, text?: string, error?: string}
     */
    public function read(string $url): array
    {
        if (! $this->isAllowed($url)) {
            return ['ok' => false, 'url' => $url, 'error' => 'URL tidak diizinkan (hanya http/https publik).'];
        }

        try {
            $response = Http::timeout(20)
                ->withHeaders(['User-Agent' => 'Mozilla/5.0 (compatible; JarvisResearch/1.0)'])
                ->maxRedirects(5)
                ->get($url);
        } catch (\Throwable $e) {
            Log::warning('Web read gagal', ['url' => $url, 'error' => $e->getMessage()]);

            return ['ok' => false, 'url' => $url, 'error' => 'Gagal mengambil halaman.'];
        }

        if (! $response->successful()) {
            return ['ok' => false, 'url' => $url, 'error' => "Halaman merespons HTTP {$response->status()}."];
        }

        $contentType = (string) $response->header('Content-Type');

        if ($contentType !== '' && ! preg_match('#text/html|text/plain|application/xhtml#i', $contentType)) {
            return ['ok' => false, 'url' => $url, 'error' => 'Konten bukan dokumen HTML/teks.'];
        }

        $html = (string) $response->body();

        return [
            'ok' => true,
            'url' => $url,
            'title' => $this->extractTitle($html),
            'text' => mb_substr($this->extractText($html), 0, self::MAX_CHARS),
        ];
    }

    /**
     * Validasi URL: skema aman & host bukan loopback/private (anti-SSRF).
     */
    public function isAllowed(string $url): bool
    {
        $parts = parse_url($url);

        if (! isset($parts['scheme'], $parts['host'])) {
            return false;
        }

        if (! in_array(strtolower($parts['scheme']), ['http', 'https'], true)) {
            return false;
        }

        $host = strtolower($parts['host']);

        // Blokir host internal yang jelas.
        if (in_array($host, ['localhost'], true) || str_ends_with($host, '.local') || str_ends_with($host, '.internal')) {
            return false;
        }

        // Bila host adalah literal IP, tolak rentang privat/loopback/link-local.
        if (filter_var($host, FILTER_VALIDATE_IP) !== false) {
            return (bool) filter_var(
                $host,
                FILTER_VALIDATE_IP,
                FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE,
            );
        }

        return true;
    }

    protected function extractTitle(string $html): string
    {
        if (preg_match('#<title[^>]*>(.*?)</title>#is', $html, $m)) {
            $title = html_entity_decode(strip_tags($m[1]), ENT_QUOTES | ENT_HTML5, 'UTF-8');

            return trim(preg_replace('/\s+/u', ' ', $title) ?? '');
        }

        return '';
    }

    /** Bersihkan HTML menjadi teks yang layak dianalisis AI. */
    protected function extractText(string $html): string
    {
        $html = preg_replace('#<(script|style|noscript|svg|iframe)[^>]*>.*?</\1>#is', ' ', $html) ?? '';
        $html = preg_replace('#<!--.*?-->#s', ' ', $html) ?? '';

        // Tandai akhir blok agar paragraf tidak menempel.
        $html = preg_replace('#</(p|div|h[1-6]|li|tr|section|article|br)>#i', "\n", $html) ?? '';
        $text = strip_tags($html);
        $text = html_entity_decode($text, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $text = preg_replace('/[ \t]+/u', ' ', $text) ?? '';
        $text = preg_replace('/\n{3,}/u', "\n\n", $text) ?? '';

        return trim($text);
    }
}
