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
        // PRD §12 — klasifikasi tingkat izin per tool Hermes.
        Schema::create('tool_permissions', function (Blueprint $table) {
            $table->id();
            $table->string('tool', 64)->unique();
            // PRD §12: read | controlled | dangerous
            $table->enum('level', ['read', 'controlled', 'dangerous'])->default('controlled');
            $table->string('description')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('tool_permissions');
    }
};
