<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Skill;
use App\Skills\SkillService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SkillController extends Controller
{
    public function __construct(private readonly SkillService $skills) {}

    public function index(Request $request): JsonResponse
    {
        $skills = Skill::query()
            ->where('user_id', $request->user()->id)
            ->orderByDesc('last_used_at')
            ->orderByDesc('created_at')
            ->get();

        return $this->success($skills);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:150'],
            'content' => ['required', 'string', 'max:20000'],
            'description' => ['nullable', 'string', 'max:500'],
            'category' => ['nullable', 'string', 'max:32', 'in:GENERAL,SERVER,DEV,DATABASE,DEPLOYMENT,RESEARCH'],
            'tags' => ['nullable', 'array', 'max:10'],
            'tags.*' => ['string', 'max:40'],
        ]);

        $skill = $this->skills->storeSkill(
            $request->user()->id,
            $data['name'],
            $data['content'],
            $data['description'] ?? null,
            $data['category'] ?? 'GENERAL',
            $data['tags'] ?? [],
        );

        $this->audit('skill.created', ['skill_id' => $skill->id, 'name' => $skill->name]);

        return $this->success($skill, 'Skill tersimpan.', 201);
    }

    public function update(Request $request, Skill $skill): JsonResponse
    {
        abort_unless($skill->user_id === $request->user()->id, 404);

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:150'],
            'content' => ['sometimes', 'string', 'max:20000'],
            'description' => ['nullable', 'string', 'max:500'],
            'category' => ['nullable', 'string', 'max:32', 'in:GENERAL,SERVER,DEV,DATABASE,DEPLOYMENT,RESEARCH'],
            'tags' => ['nullable', 'array', 'max:10'],
        ]);

        $skill->update($data);

        return $this->success($skill, 'Skill diperbarui.');
    }

    public function destroy(Request $request, Skill $skill): JsonResponse
    {
        abort_unless($skill->user_id === $request->user()->id, 404);

        $skill->delete();

        $this->audit('skill.deleted', ['skill_id' => $skill->id]);

        return $this->success(null, 'Skill dihapus.');
    }
}
