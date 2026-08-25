<?php

namespace Database\Seeders;

use App\Models\ToolPermission;
use Illuminate\Database\Seeder;

/**
 * Klasifikasi izin awal tool Hermes (PRD §12).
 * Tool yang belum terdaftar di sini default CONTROLLED (PermissionEngine).
 */
class ToolPermissionSeeder extends Seeder
{
    public function run(): void
    {
        $tools = [
            // RESEARCH — read-only web.
            ['tool' => 'web.search', 'level' => 'read', 'description' => 'Pencarian web.'],
            ['tool' => 'web.read', 'level' => 'read', 'description' => 'Baca isi halaman web.'],

            // SYSTEM.
            ['tool' => 'system.health_check', 'level' => 'read', 'description' => 'Cek kesehatan sistem.'],
            ['tool' => 'system.service_status', 'level' => 'read', 'description' => 'Status layanan server.'],
            ['tool' => 'system.exec', 'level' => 'dangerous', 'description' => 'Eksekusi perintah shell pada server.'],

            // DEV.
            ['tool' => 'dev.repo_read', 'level' => 'read', 'description' => 'Baca kode repositori.'],
            ['tool' => 'dev.run_command', 'level' => 'controlled', 'description' => 'Jalankan build/test proyek.'],

            // DATABASE.
            ['tool' => 'database.query', 'level' => 'controlled', 'description' => 'Kueri database.'],
            ['tool' => 'database.schema', 'level' => 'read', 'description' => 'Inspeksi skema database.'],

            // MONITOR.
            ['tool' => 'monitor.metrics', 'level' => 'read', 'description' => 'Ambil metrik server.'],
            ['tool' => 'monitor.http_check', 'level' => 'read', 'description' => 'Cek uptime/HTTP endpoint.'],

            // DEPLOYMENT.
            ['tool' => 'deploy.status', 'level' => 'read', 'description' => 'Status rilis terakhir.'],
            ['tool' => 'deploy.release', 'level' => 'dangerous', 'description' => 'Eksekusi deployment aplikasi.'],

            // SECURITY.
            ['tool' => 'security.audit_read', 'level' => 'read', 'description' => 'Baca log audit.'],
            ['tool' => 'security.scan', 'level' => 'controlled', 'description' => 'Pindai kerentanan ringan.'],
        ];

        foreach ($tools as $entry) {
            ToolPermission::updateOrCreate(['tool' => $entry['tool']], $entry);
        }
    }
}
