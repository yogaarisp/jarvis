<?php

namespace App\Research;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * Pencarian web tanpa API key eksternal (PRD §13).
 *
 * Menggunakan endpoint HTML DuckDuckGo lalu hasilnya di-parse lokal.
 * Abstraksi ini sengaja dipisah agar nantinya bisa ditukar ke provider
 * lain atau didelegasikan ke Hermes/Python worker (PRD §14) tanpa
 * mengubah pemanggil.
 */
class WebSearch
{
    protected const ENDPOINT = 'https://html.duckduckgo.com/html/';

    /**
     * Cari web dan kembalikan daftar hasil ter-normalisasi.
     *
     * @return array<int, array{title: string, url: string, snippet: string}>
     *
     * @throws RuntimeException bila pencarian gagal total
     */
    public function search(string $query, int $limit = 6): array
    {
        $query = trim($query);

        if ($query === '') {
            return [];
        }

        try {
            $response = Http::timeout(15)
                ->withHeaders(['User-Agent' => 'Mozilla/5.0 (compatible; JarvisResearch/1.0)'])
                ->asForm()
                ->post(self::ENDPOINT, ['q' => $query]);
        } catch (\Throwable $e) {
            Log::warning('Web search gagal (koneksi)', ['error' => $e->getMessage()]);

            throw new RuntimeException('Tidak dapat terhubung ke mesin pencari.');
        }

        if (! $response->successful()) {
            throw new RuntimeException("Mesin pencari merespons HTTP {$response->status()}.");
        }

        return $this->parse((string) $response->body(), $limit);
    }

    /**
     * Parse HTML hasil DuckDuckGo menjadi struktur data.
     * Dibuat public untuk kemudahan testing.
     */
    public function parse(string $html, int $limit = 6): array
    {
        $results = [];

        // Pola 1: layout html.duckduckgo.com — anchor result__a + snippet result__snippet.
        if (preg_match_all(
            '#<a[^>]+class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>(.*?)</a>#is',
            $html,
            $anchors,
            PREG_SET_ORDER,
        ) > 0) {
            preg_match_all(
                '#<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>(.*?)</a>#is',
                $html,
                $snippets,
            );

            foreach ($anchors as $index => $anchor) {
                $url = $this->extractUrl($anchor[1]);

                if ($url === null) {
                    continue;
                }

                $results[] = [
                    'title' => $this->text($anchor[2]),
                    'url' => $url,
                    'snippet' => isset($snippets[1][$index]) ? $this->text($snippets[1][$index]) : '',
                ];
            }
        }

        // Pola 2: fallback layout lite.duckduckgo.com.
        if ($results === [] && preg_match_all(
            "#<a[^>]+class='result-link'[^>]*href=\"([^\"]+)\"[^>]*>(.*?)</a>#is",
            $html,
            $liteAnchors,
            PREG_SET_ORDER,
        ) > 0) {
            foreach ($liteAnchors as $anchor) {
                $url = $this->extractUrl($anchor[1]);

                if ($url === null) {
                    continue;
                }

                $results[] = [
                    'title' => $this->text($anchor[2]),
                    'url' => $url,
                    'snippet' => '',
                ];
            }
        }

        return array_slice($results, 0, $limit);
    }

    /**
     * DuckDuckGo membungkus URL asli dalam redirect /l/?uddg=... — buka bila perlu.
     */
    protected function extractUrl(string $raw): ?string
    {
        $raw = html_entity_decode(trim($raw), ENT_QUOTES);

        if (preg_match('#[?&]uddg=([^&]+)#', $raw, $m)) {
            $raw = urldecode($m[1]);
        }

        if (! str_starts_with($raw, 'http://') && ! str_starts_with($raw, 'https://')) {
            return null;
        }

        return filter_var($raw, FILTER_VALIDATE_URL) ?: null;
    }

    /** Buang tag & entitas HTML, rapatkan whitespace. */
    protected function text(string $html): string
    {
        $text = preg_replace('/<[^>]+>/', ' ', $html) ?? '';
        $text = html_entity_decode($text, ENT_QUOTES | ENT_HTML5, 'UTF-8');

        return trim(preg_replace('/\s+/u', ' ', $text) ?? '');
    }
}
