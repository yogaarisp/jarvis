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
        Schema::create('tool_executions', function (Blueprint $table) {
            $table->id();
            // Keduanya nullable: eksekusi tool bisa lepas dari misi di masa depan.
            $table->foreignId('mission_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('mission_step_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('agent_key', 32)->nullable();
            $table->string('tool', 64);
            $table->json('params')->nullable();
            // running | succeeded | failed
            $table->enum('status', ['running', 'succeeded', 'failed'])->default('running');
            $table->json('result')->nullable();
            $table->text('error')->nullable();
            $table->unsignedInteger('latency_ms')->nullable();
            $table->timestamps();

            $table->index(['mission_id']);
            $table->index(['tool']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('tool_executions');
    }
};
