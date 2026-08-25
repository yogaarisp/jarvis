<?php

namespace App\Research;

use App\AI\AIProviderManager;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * Agent RESEARCH — PRD §13.
 *
 * Alur:
 *   1. Pecah pertanyaan jadi query pencarian (atau pakai langsung query sederhana)
 *   2. Cari web via WebSearch
 *   3. Baca 3 teratas via WebReader
 *   4. Sintesis jawaban + daftar sumber dari LLM
 *
 * Tidak butuh Hermes/Python worker untuk MVP, tapi modul tetap bisa
 * didorong ke worker via `delegate_to_hermes` nantinya (PRD §14).
 */
class ResearchAgent
{
    public function __construct(
        protected AIProviderManager $ai,
        protected WebSearch $search,
        protected WebReader $reader,
    ) {}

    /**
     * Jalankan penelitian topik sampai selesai atau limit tercapai.
     *
     * @param  string  $topic  Topik/pertanyaan utama
     * @param  int  $maxSources  Maksimum sumber yang dibaca
     * @param  int  $maxIterations  Maksimum iterasi pencarian ulang
     * @return array{
     *     summary: string,
     *     sources: array<int, array{url: string, title: string, snippet?: string, read?: bool}>,
     *     steps: array<int, string>,
     *     depth: int
     * }
     */
    public function research(
        string $topic,
        int $maxSources = 3,
        int $maxIterations = 2,
    ): array {
        $topic = trim($topic);

        if ($topic === '') {
            throw new RuntimeException('Topik penelitian kosong.');
        }

        $steps = [];
        $sources = [];
        $readTexts = [];
        $iteration = 0;
        $nextQuery = $topic;

        do {
            $iteration++;
            $steps[] = "Iterasi {$iteration}: mencari \"{$nextQuery}\"…";

            try {
                $results = $this->search->search($nextQuery, $maxSources);
            } catch (RuntimeException $e) {
                $steps[] = 'Pencarian gagal: '.$e->getMessage();
                Log::warning('Research search gagal', ['error' => $e->getMessage(), 'topic' => $topic]);
                break;
            }

            if ($results === []) {
                $steps[] = 'Tidak ada hasil pencarian yang cocok.';
                break;
            }

            $steps[] = 'Mendapat '.count($results).' hasil, akan dibaca '.min(count($results), $maxSources).'…';

            foreach (array_slice($results, 0, $maxSources) as $result) {
                $entry = [
                    'url' => $result['url'],
                    'title' => $result['title'] ?: $result['url'],
                    'snippet' => $result['snippet'],
                    'read' => false,
                ];

                $read = $this->reader->read($result['url']);

                if ($read['ok']) {
                    $entry['read'] = true;
                    $entry['title'] = $read['title'] ?: $entry['title'];
                    $readTexts[] = "--- SUMBER: {$read['url']} ---\n".($read['text'] ?? '');
                }

                $sources[] = $entry;
            }

            // Bila teks sudah cukup atau iterasi maksimum, tidak perlu mencari lagi.
            $totalChars = array_sum(array_map('mb_strlen', $readTexts));

            if ($iteration >= $maxIterations || $totalChars >= 4000) {
                break;
            }

            // Tanya AI apakah perlu pencarian lanjutan dan apa query-nya.
            $nextQuery = $this->askForNextQuery($topic, $readTexts, $steps);

            if ($nextQuery === null) {
                break;
            }
        } while ($iteration < $maxIterations);

        $summary = $this->synthesize($topic, $readTexts, $sources);

        return [
            'summary' => $summary,
            'sources' => $sources,
            'steps' => $steps,
            'depth' => $iteration,
        ];
    }

    /**
     * Setelah pembacaan sumber, tanya apakah perlu pencarian lanjutan.
     * Kembalikan string query atau null bila cukup.
     *
     * @param  array<int, string>  $texts
     * @param  array<int, string>  $steps
     */
    protected function askForNextQuery(string $topic, array $texts, array $steps): ?string
    {
        if ($texts === []) {
            return null;
        }

        $context = implode("\n\n", array_slice($texts, 0, 2));

        $prompt = <<<PROMPT
Anda adalah asisten penelitian. Topik utama: {$topic}

Konteks yang sudah dikumpulkan sejauh ini:
{$context}

Riwayat langkah:
- {implode("\n- ", $steps)}

Jawab HANYA dengan format BARIS TUNGGAL:
- Jika dirasa informasi sudah cukup: CUKUP
- Jika butuh pencarian lanjutan: LANJUT: <query pencarian selanjutnya>
PROMPT;
        $prompt = strtr($prompt, ['{implode("\n- ", $steps)}' => implode("\n- ", $steps)]);

        try {
            $answer = trim($this->ai->chat([
                ['role' => 'user', 'content' => $prompt],
            ]));
        } catch (\Throwable $e) {
            Log::warning('Research next-query gagal', ['error' => $e->getMessage()]);

            return null;
        }

        if (stripos($answer, 'CUKUP') === 0) {
            return null;
        }

        if (preg_match('/LANJUT\s*:\s*(.+)/ui', $answer, $m)) {
            return trim($m[1]);
        }

        return null;
    }

    /**
     * Sintesis jawaban akhir berdasarkan teks yang dibaca.
     *
     * @param  array<int, string>  $texts
     * @param  array<int, array>  $sources
     */
    protected function synthesize(string $topic, array $texts, array $sources): string
    {
        $sourceList = [];

        foreach ($sources as $i => $s) {
            $sourceList[] = '['.($i + 1).'] '.($s['title'] ?: $s['url']).' — '.$s['url'];
        }

        $body = $texts === [] ? '(tidak ada teks yang berhasil dibaca, gunakan hanya judul & cuplikan di daftar sumber)' : implode("\n\n", $texts);

        $prompt = <<<PROMPT
Topik penelitian: {$topic}

Daftar sumber:
{sourceList}

Konten yang dibaca:
{$body}

Tulis jawaban SINTESIS dengan gaya Markdown ringkas, terstruktur, dan OBYEKTIF (jangan klaim
hal yang tidak didukung teks). Cantumkan sitasi inline [1], [2]… sesuai daftar di atas.
PROMPT;
        $prompt = strtr($prompt, ['{sourceList}' => implode("\n", $sourceList)]);

        try {
            return trim($this->ai->chat([
                ['role' => 'system', 'content' => 'Anda JARVIS, asisten penelitian yang tepat dan ringkas.'],
                ['role' => 'user', 'content' => $prompt],
            ]));
        } catch (\Throwable $e) {
            Log::warning('Research synthesize gagal', ['error' => $e->getMessage()]);

            return 'Tidak dapat menyintesis jawaban: '.$e->getMessage();
        }
    }
}
