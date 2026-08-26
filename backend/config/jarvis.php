<?php

return [
    'placeholder_model' => env('JARVIS_PLACEHOLDER_MODEL', 'local-placeholder'),

    // Persona dasar JARVIS (PRD §4). Agent-specific prompts menyusul di Phase 4.
    'system_prompt' => env('JARVIS_SYSTEM_PROMPT',
        'You are JARVIS — Keenan\'s personal AI assistant and companion inside his KEETECH command center. Always address him as Keenan (never "Commander", "Sir", or "User"). '
        .'PERSONALITY: Talk like a brilliant friend, not a rigid military robot. Warm, witty, confident, genuinely helpful — light humor is welcome when it fits. '
        .'STYLE: Mirror Keenan\'s language and energy. He writes casual Indonesian -> reply in natural, relaxed Indonesian. English -> English. Small talk and greetings deserve short, friendly, human replies — NEVER canned lines like "Sistem siap. Perintah?". '
        ."When Keenan greets you, greet him back warmly and offer help, e.g. \"Hai Keenan! Ada yang bisa saya bantu?\" — never cold or curt replies like \"Keenan. Butuh apa?\". "
        .'Technical or urgent topics deserve precise, structured answers. '
        .'Be concise by default, but never at the cost of sounding robotic; expand naturally when the topic deserves depth. '
        .'You may have live internet access through tools — use it automatically whenever facts must be current.'),

    // PRD §6 — batas default agent RESEARCH.
    'research' => [
        'max_sources' => (int) env('JARVIS_RESEARCH_MAX_SOURCES', 3),
        'max_iterations' => (int) env('JARVIS_RESEARCH_MAX_ITERATIONS', 2),
    ],

    // Agent chat dengan akses internet (tool-calling).
    'agent' => [
        'enabled' => env('JARVIS_AGENT_ENABLED', true),
        'max_tool_rounds' => (int) env('JARVIS_AGENT_MAX_ROUNDS', 3),
        'max_sources' => 5,
    ],

    // PRD §7 — TTS neural sisi server.
    // engine: 'auto' = Edge TTS (gratis, tanpa API key);
    //         'edge'  = paksa Edge TTS.
    // Voice default en-GB-RyanNeural = pria Inggris kalem ala JARVIS.
    'tts' => [
        'engine' => env('JARVIS_TTS_ENGINE', 'auto'),
        'voice' => env('JARVIS_TTS_VOICE', 'en-GB-RyanNeural'),
        'rate' => env('JARVIS_TTS_RATE', '-4%'),
        'pitch' => env('JARVIS_TTS_PITCH', '-2Hz'),
        'max_chars' => 600,
        'cache_ttl' => 86400,

        // XTTS Local — voice cloning offline (GPU lokal).
        // Utama: server persisten ai/xtts_server.py (model warm, ±3-5 dtk).
        //   Jalankan ai\start_xtts_server.bat sekali saat PC menyala.
        // Fallback: spawn speak_clone.py per-request (±45 dtk, butuh env Windows lengkap).
        'xtts' => [
            'enabled' => env('XTTS_ENABLED', false),
            'server_url' => env('XTTS_SERVER_URL', 'http://127.0.0.1:8012'),
            'python' => env('XTTS_PYTHON', 'python'),
            'script' => env('XTTS_SCRIPT', base_path('../ai/speak_clone.py')),
            'ref_audio' => env('XTTS_REF_AUDIO', base_path('../ai/voice-previews/5-jarvis.mp3')),
            'timeout' => (int) env('XTTS_TIMEOUT', 120),
        ],
    ],
];
