<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // PRD §17 — Memory (skill & memori jangka panjang JARVIS).
        Schema::create('skills', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('category', 32)->default('GENERAL'); // GENERAL|SERVER|DEV|DATABASE|DEPLOYMENT|RESEARCH
            $table->text('description')->nullable();
            $table->text('content');
            $table->json('tags')->nullable();
            $table->string('source', 24)->default('manual'); // manual|chat|research
            $table->unsignedInteger('usage_count')->default(0);
            $table->timestamp('last_used_at')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'category']);
        });

        Schema::create('memories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('category', 32)->default('USER'); // USER|PROJECT|SERVER|MISSION
            $table->string('key');
            $table->text('value');
            $table->unsignedTinyInteger('importance')->default(1); // 3+ = selalu disuntikkan ke prompt
            $table->timestamps();

            $table->unique(['user_id', 'category', 'key']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('memories');
        Schema::dropIfExists('skills');
    }
};
