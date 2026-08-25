<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * Pencarian internet gratis tanpa API key.
 *
 * Engine berurutan: Bing (scrape HTML) -> Wikipedia REST API.
 * Dipakai oleh AgentService sebagai tool `web_search` dan `open_page`.
 */
class WebSearchService
{
    private const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

    /**
     * Cari di internet. Return list hasil: [['title','url','snippet'], ...].
     *
     * @return array<int, array{title: string, url: string, snippet: string}>
     */
    public function search(string $query, int $limit = 5): array
    {
        $query = trim($query);

        if ($query === '') {
            return [];
        }

        foreach (['bing' => fn () => $this->searchBing($query, $limit), 'wikipedia' => fn () => $this->searchWikipedia($query, $limit)] as $engine => $fn) {
            try {
                $results = $fn();

                if ($results !== []) {
                    return $results;
                }
            } catch (\Throwable $e) {
                Log::warning("WebSearch engine [{$engine}] gagal", ['error' => $e->getMessage()]);
            }
        }

        return [];
    }

    /**
     * Buka sebuah halaman web dan ekstrak teksnya.
     *
     * @return array{title: string, content: string}
     */
    public function fetchPage(string $url, int $maxChars = 4000): array
    {
        if (! preg_match('#^https?://#i', $url)) {
            throw new RuntimeException('URL harus diawali http:// atau https://');
        }

        $response = Http::withHeaders(['User-Agent' => self::USER_AGENT])
            ->timeout(20)
            ->connectTimeout(10)
            ->followRedirects()
            ->get($url);

        if ($response->failed()) {
            throw new RuntimeException('HTTP '.$response->status().' saat membuka halaman.');
        }

        $html = (string) $response->body();

        return [
            'title' => $this->extractTitle($html),
            'content' => mb_substr($this->htmlToText($html), 0, $maxChars),
        ];
    }

    /* ------------------------------------------------------------------ */

    /** @return array<int, array{title: string, url: string, snippet: string}> */
    private function searchBing(string $query, int $limit): array
    {
        $response = Http::withHeaders(['User-Agent' => self::USER_AGENT,
            'Accept-Language' => 'id-ID,id;q=0.9,en;q=0.8',
        ])
            ->timeout(15)
            ->connectTimeout(10)
            ->get('https://www.bing.com/search', ['q' => $query, 'count' => $limit]);

        if ($response->failed()) {
            return [];
        }

        $dom = new \DOMDocument;

        libxml_use_internal_errors(true);
        $dom->loadHTML((string) $response->body());
        libxml_clear_errors();

        $xpath = new \DOMXPath($dom);
        $results = [];

        foreach ($xpath->query('//li[contains(@class,"b_algo")]') ?: [] as $node) {
            $anchor = $xpath->query('.//h2/a', $node)->item(0);
            $snippetNode = $xpath->query('.//p', $node)->item(0);

            if (! $anchor instanceof \DOMElement) {
                continue;
            }

            $url = trim($anchor->getAttribute('href'));
            $title = $this->textOf($anchor);

            if ($url === '' || $title === '' || ! str_starts_with($url, 'http')) {
                continue;
            }

            $results[] = [
                'title' => $title,
                'url' => $url,
                'snippet' => mb_substr($this->textOf($snippetNode), 0, 300),
            ];

            if (count($results) >= $limit) {
                break;
            }
        }

        return $results;
    }

    /** @return array<int, array{title: string, url: string, snippet: string}> */
    private function searchWikipedia(string $query, int $limit): array
    {
        // Wikipedia Indonesia dulu, lalu Inggris bila kosong.
        foreach (['id.wikipedia.org', 'en.wikipedia.org'] as $host) {
            $response = Http::withHeaders(['User-Agent' => self::USER_AGENT])
                ->timeout(15)
                ->connectTimeout(10)
                ->get("https://{$host}/w/api.php", [
                    'action' => 'query',
                    'list' => 'search',
                    'srsearch' => $query,
                    'srlimit' => $limit,
                    'format' => 'json',
                ]);

            if ($response->failed()) {
                continue;
            }

            $results = [];

            foreach ($response->json('query.search', []) as $hit) {
                $title = (string) ($hit['title'] ?? '');

                if ($title === '') {
                    continue;
                }

                $results[] = [
                    'title' => $title.' — Wikipedia',
                    'url' => "https://{$host}/wiki/".str_replace(' ', '_', $title),
                    'snippet' => mb_substr(strip_tags((string) ($hit['snippet'] ?? '')), 0, 300),
                ];
            }

            if ($results !== []) {
                return $results;
            }
        }

        return [];
    }

    private function extractTitle(string $html): string
    {
        if (preg_match('#<title[^>]*>(.*?)</title>#is', $html, $m)) {
            return mb_substr(trim(html_entity_decode($m[1], ENT_QUOTES, 'UTF-8')), 0, 200);
        }

        return '';
    }

    /** Konversi HTML menjadi teks polos. */
    private function htmlToText(string $html): string
    {
        // Buang bagian non-konten.
        $html = preg_replace('#<(script|style|noscript|svg|iframe|nav|footer|header|form)[^>]*>.*?</\1>#is', ' ', $html) ?? $html;
        $html = preg_replace('#<!--.*?-->#s', ' ', $html) ?? $html;

        // Tambahkan pemisah pada tag blok agar kata tidak menyatu.
        $html = preg_replace('#</?(p|div|br|li|h[1-6]|tr|section|article)[^>]*>#i', "\n", $html) ?? $html;

        $text = strip_tags($html);
        $text = html_entity_decode($text, ENT_QUOTES, 'UTF-8');
        $text = preg_replace('#[ \t]+#', ' ', $text) ?? $text;
        $text = preg_replace("#\n{3,}#", "\n\n", $text) ?? $text;

        return trim($text);
    }

    private function textOf(?\DOMNode $node): string
    {
        if ($node === null) {
            return '';
        }

        return trim(preg_replace('/\s+/', ' ', $node->textContent) ?? '');
    }
}
