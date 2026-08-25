<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Memory;
use App\Skills\SkillService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MemoryController extends Controller
{
    public function __construct(private readonly SkillService $skills) {}

    public function index(Request $request): JsonResponse
    {
        $memories = Memory::query()
            ->where('user_id', $request->user()->id)
            ->orderByDesc('importance')
            ->orderBy('category')
            ->orderBy('key')
            ->get();

        return $this->success($memories);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'key' => ['required', 'string', 'max:150'],
            'value' => ['required', 'string', 'max:5000'],
            'category' => ['nullable', 'string', 'max:32', 'in:USER,PROJECT,SERVER,MISSION'],
            'importance' => ['nullable', 'integer', 'min:1', 'max:3'],
        ]);

        $memory = $this->skills->remember(
            $request->user()->id,
            $data['key'],
            $data['value'],
            $data['category'] ?? 'USER',
            $data['importance'] ?? 2,
        );

        $this->audit('memory.saved', ['memory_id' => $memory->id, 'key' => $memory->key]);

        return $this->success($memory, 'Memori tersimpan.', 201);
    }

    public function destroy(Request $request, Memory $memory): JsonResponse
    {
        abort_unless($memory->user_id === $request->user()->id, 404);

        $memory->delete();

        return $this->success(null, 'Memori dihapus.');
    }
}
