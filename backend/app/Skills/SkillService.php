<?php

namespace App\Skills;

use App\Models\Memory;
use App\Models\Skill;
use Illuminate\Support\Collection;

/**
 * Skill & memory engine — PRD §17.
 *
 * Menyimpan keahlian/fakta, lalu melakukan contextual retrieval:
 * hanya potongan yang relevan dengan pesan user yang disuntikkan ke prompt.
 */
class SkillService
{
    /** Kata yang terlalu umum untuk dipakai sebagai keyword pencocokan. */
    private const STOPWORDS = [
        'yang', 'dengan', 'untuk', 'dari', 'pada', 'adalah', 'apa', 'bagaimana', 'kenapa',
        'tolong', 'bisakah', 'coba', 'saya', 'kamu', 'kita', 'dan', 'atau', 'ini', 'itu',
        'the', 'and', 'for', 'with', 'from', 'what', 'how', 'why', 'can', 'you', 'please',
    ];

    /**
     * Ambil konteks skill + memori yang relevan untuk sebuah pesan.
     *
     * @return array{context: string, skill_ids: array<int, int>}
     */
    public function relevantContext(string $message, int $userId, int $limit = 5): array
    {
        $keywords = $this->keywords($message);

        $skills = $this->matchingSkills($userId, $keywords, $limit);
        $memories = $this->matchingMemories($userId, $keywords, $limit);

        // Memori penting (importance >= 3) selalu disertakan meski tak ada keyword cocok.
        $pinned = Memory::query()
            ->where('user_id', $userId)
            ->where('importance', '>=', 3)
            ->orderByDesc('importance')
            ->limit(5)
            ->get()
            ->reject(fn (Memory $m) => $memories->contains(fn (Memory $o) => $o->is($m)));

        $blocks = [];

        if ($skills->isNotEmpty()) {
            $blocks[] = "SKILL TERKAIT:\n".$skills->map(function (Skill $s) {
                $desc = $s->description ? " — {$s->description}" : '';

                return "[SKILL #{$s->id}] {$s->name}{$desc}\n{$s->content}";
            })->implode("\n\n");
        }

        $allMemories = $memories->concat($pinned);

        if ($allMemories->isNotEmpty()) {
            $blocks[] = "MEMORI TENTANG KEENAN:\n".$allMemories
                ->map(fn (Memory $m) => "- [{$m->category}] {$m->key}: {$m->value}")
                ->implode("\n");
        }

        return [
            'context' => implode("\n\n", $blocks),
            'skill_ids' => $skills->pluck('id')->all(),
        ];
    }

    /** Catat fakta baru (update bila key yang sama sudah ada). */
    public function remember(int $userId, string $key, string $value, string $category = 'USER', int $importance = 2): Memory
    {
        return Memory::updateOrCreate(
            ['user_id' => $userId, 'category' => $category, 'key' => $key],
            ['value' => $value, 'importance' => $importance],
        );
    }

    public function storeSkill(int $userId, string $name, string $content, ?string $description = null, string $category = 'GENERAL', array $tags = [], string $source = 'manual'): Skill
    {
        return Skill::create([
            'user_id' => $userId,
            'name' => $name,
            'category' => $category,
            'description' => $description,
            'content' => $content,
            'tags' => $tags ?: null,
            'source' => $source,
        ]);
    }

    /** Tandai skill bahwa ia baru saja dipakai dalam percakapan. */
    public function markUsed(array $skillIds): void
    {
        if ($skillIds === []) {
            return;
        }

        Skill::query()
            ->whereIn('id', $skillIds)
            ->update(['usage_count' => Skill::raw('usage_count + 1'), 'last_used_at' => now()]);
    }

    /** @return Collection<int, Skill> */
    private function matchingSkills(int $userId, array $keywords, int $limit): Collection
    {
        if ($keywords === []) {
            return collect();
        }

        return Skill::query()
            ->where('user_id', $userId)
            ->get()
            ->map(function (Skill $skill) use ($keywords) {
                $haystack = $this->keywords(strtolower($skill->name.' '.$skill->description.' '.$skill->content.' '.implode(' ', $skill->tags ?? [])));
                $score = collect($haystack)->intersect($keywords)->count();

                // Skill yang sering dipakai dapat bonus kecil pada skor sama.
                return [$skill, $score + min($skill->usage_count, 5) * 0.1];
            })
            ->filter(fn (array $pair) => $pair[1] >= 1)
            ->sortByDesc(fn (array $pair) => $pair[1])
            ->take($limit)
            ->pluck(0);
    }

    /** @return Collection<int, Memory> */
    private function matchingMemories(int $userId, array $keywords, int $limit): Collection
    {
        if ($keywords === []) {
            return collect();
        }

        return Memory::query()
            ->where('user_id', $userId)
            ->get()
            ->map(function (Memory $memory) use ($keywords) {
                $haystack = $this->keywords(strtolower($memory->key.' '.$memory->value));
                $score = collect($haystack)->intersect($keywords)->count() + $memory->importance * 0.2;

                return [$memory, $score];
            })
            ->filter(fn (array $pair) => $pair[1] >= 1)
            ->sortByDesc(fn (array $pair) => $pair[1])
            ->take($limit)
            ->pluck(0);
    }

    /** @return list<string> */
    private function keywords(string $text): array
    {
        $words = preg_split('/[^a-z0-9]+/', strtolower($text), -1, PREG_SPLIT_NO_EMPTY) ?: [];

        return collect($words)
            ->reject(fn (string $w) => strlen($w) < 3 || in_array($w, self::STOPWORDS, true))
            ->unique()
            ->values()
            ->all();
    }
}
