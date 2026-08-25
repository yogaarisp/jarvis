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
        // PRD §5 — preferensi Wake Engine per user.
        // Deteksi clap selalu berjalan client-side; tabel ini hanya menyimpan setting.
        Schema::create('wake_settings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->boolean('clap_enabled')->default(false);
            // Jumlah tepukan untuk bangunkan JARVIS (double/triple clap).
            $table->unsignedTinyInteger('claps_required')->default(2);
            // low | medium | high — makin tinggi makin sensitif terhadap tepukan.
            $table->enum('sensitivity', ['low', 'medium', 'high'])->default('medium');
            // Jendela antar-tepukan (ms) — default 500–700ms sesuai PRD §5.
            $table->unsignedSmallInteger('window_ms')->default(650);
            // Cooldown setelah wake agar tidak double-trigger.
            $table->unsignedMediumInteger('cooldown_ms')->default(2000);
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('wake_settings');
    }
};
