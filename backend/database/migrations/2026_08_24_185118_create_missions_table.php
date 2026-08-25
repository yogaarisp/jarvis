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
        Schema::create('missions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            // Agent penanggung jawab (denormalisasi key agar mission tetap valid walau agent berubah).
            $table->string('agent_key', 32);
            $table->string('title');
            $table->text('instruction')->nullable();
            // PRD §11: queued | running | waiting_approval | completed | failed | cancelled
            $table->enum('status', [
                'queued',
                'running',
                'waiting_approval',
                'completed',
                'failed',
                'cancelled',
            ])->default('queued')->index();
            $table->json('result_summary')->nullable();
            $table->timestamp('approved_at')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('finished_at')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('missions');
    }
};
