<?php

namespace Database\Seeders;

use App\Models\Agent;
use Illuminate\Database\Seeder;

/**
 * 8 agent awal sesuai PRD §10.
 */
class AgentSeeder extends Seeder
{
    public function run(): void
    {
        $agents = [
            [
                'key' => 'jarvis',
                'name' => 'JARVIS',
                'role' => 'orchestration',
                'description' => 'Orkestrator utama: memahami perintah, memilih agent/tool yang tepat, dan merangkai jawaban.',
                'system_prompt' => 'Anda adalah JARVIS, orkestrator pusat. Pahami maksud Keenan (pemilik sistem), pecah menjadi langkah, delegasikan ke agent spesialis bila perlu, dan sajikan jawaban ringkas dalam Bahasa Indonesia.',
                'allowed_tools' => [],
                'permission_level' => 'controlled',
            ],
            [
                'key' => 'research',
                'name' => 'RESEARCH',
                'role' => 'web_research',
                'description' => 'Riset web: pencarian, pembacaan sumber, analisis, dan penyusunan jawaban dengan referensi.',
                'system_prompt' => 'Anda adalah agent RESEARCH. Lakukan pencarian web, baca sumber terpercaya, analisis, lalu rangkum temuan disertai daftar sumber (judul + URL).',
                'allowed_tools' => ['web.search', 'web.read'],
                'permission_level' => 'read',
            ],
            [
                'key' => 'system',
                'name' => 'SYSTEM',
                'role' => 'infrastructure',
                'description' => 'Operasi infrastruktur server: kesehatan sistem, layanan, dan tindakan kontrol terkendali.',
                'system_prompt' => 'Anda adalah agent SYSTEM. Tangani pemeriksaan infrastruktur (CPU, RAM, disk, layanan) dan operasi kontrol server hanya melalui tool yang diizinkan.',
                'allowed_tools' => ['system.health_check', 'system.service_status', 'system.exec'],
                'permission_level' => 'controlled',
            ],
            [
                'key' => 'dev',
                'name' => 'DEV',
                'role' => 'development',
                'description' => 'Asisten pengembangan: membaca kode, menjalankan build/test, dan tugas repositori.',
                'system_prompt' => 'Anda adalah agent DEV. Bantu tugas pengembangan perangkat lunak: analisis kode, jalankan build/test via tool, dan laporkan hasil secara faktual.',
                'allowed_tools' => ['dev.repo_read', 'dev.run_command'],
                'permission_level' => 'controlled',
            ],
            [
                'key' => 'database',
                'name' => 'DATABASE',
                'role' => 'database',
                'description' => 'Operasi database: kueri read-only aman; aksi destruktif selalu butuh persetujuan.',
                'system_prompt' => 'Anda adalah agent DATABASE. Jalankan kueri analitik read-only. Aksi tulis/destruktif WAJIB diangkat sebagai misi dengan persetujuan eksplisit.',
                'allowed_tools' => ['database.query', 'database.schema'],
                'permission_level' => 'dangerous',
            ],
            [
                'key' => 'monitor',
                'name' => 'MONITOR',
                'role' => 'monitoring',
                'description' => 'Pemantauan berkelanjutan: metrik server, uptime layanan, dan kesehatan website.',
                'system_prompt' => 'Anda adalah agent MONITOR. Kumpulkan metrik dan status layanan, deteksi anomali, dan laporkan temuan penting secara ringkas.',
                'allowed_tools' => ['monitor.metrics', 'monitor.http_check'],
                'permission_level' => 'read',
            ],
            [
                'key' => 'deployment',
                'name' => 'DEPLOYMENT',
                'role' => 'deployment',
                'description' => 'Deployment aplikasi: rilis terkontrol; deployment irreversibel butuh konfirmasi.',
                'system_prompt' => 'Anda adalah agent DEPLOYMENT. Eksekusi pipeline rilis hanya dengan langkah yang diizinkan; deployment tidak dapat dibatalkan harus mendapat persetujuan.',
                'allowed_tools' => ['deploy.status', 'deploy.release'],
                'permission_level' => 'dangerous',
            ],
            [
                'key' => 'security',
                'name' => 'SECURITY',
                'role' => 'security',
                'description' => 'Keamanan: audit akses, pemindaian kerentanan ringan, dan rekomendasi hardening.',
                'system_prompt' => 'Anda adalah agent SECURITY. Tinjau log audit, kenali pola mencurigakan, dan sarankan langkah hardening. Jangan pernah mengekspos kredensial.',
                'allowed_tools' => ['security.audit_read', 'security.scan'],
                'permission_level' => 'dangerous',
            ],
        ];

        foreach ($agents as $agent) {
            Agent::updateOrCreate(['key' => $agent['key']], $agent);
        }
    }
}
