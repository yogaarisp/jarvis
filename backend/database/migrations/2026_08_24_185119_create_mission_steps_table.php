<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('mission_steps', function (Blueprint $table) {
            $table->id();
            $table->foreignId('mission_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('step_order')->default(1);
            $table->string('name');
            // Nama tool Hermes yang dieksekusi pada langkah ini.
            $table->string('tool', 64);
            $table->json('params')->nullable();
            // pending | running | completed | failed | skipped
            $table->enum('status', ['pending', 'running', 'completed', 'failed', 'skipped'])
                ->default('pending')->index();
            $table->json('output')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('finished_at')->nullable();
            $table->timestamps();

            $table->index(['mission_id', 'step_order']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('mission_steps');
    }
};
