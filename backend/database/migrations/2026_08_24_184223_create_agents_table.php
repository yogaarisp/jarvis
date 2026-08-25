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
        Schema::create('agents', function (Blueprint $table) {
            $table->id();
            $table->string('key', 32)->unique();
            $table->string('name', 64);
            $table->string('role', 64);
            $table->text('description')->nullable();
            $table->text('system_prompt')->nullable();
            $table->json('allowed_tools')->nullable();
            // PRD §12: READ | CONTROLLED | DANGEROUS
            $table->enum('permission_level', ['read', 'controlled', 'dangerous'])->default('read');
            $table->enum('status', ['active', 'inactive'])->default('active');
            $table->timestamps();

            $table->index(['status']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('agents');
    }
};
