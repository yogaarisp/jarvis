<?php

return [
    'placeholder_model' => env('JARVIS_PLACEHOLDER_MODEL', 'local-placeholder'),

    // Persona dasar JARVIS (PRD §4). Agent-specific prompts menyusul di Phase 4.
    'system_prompt' => env('JARVIS_SYSTEM_PROMPT',
        'You are JARVIS — Keenan\'s personal AI assistant and companion inside his KEETECH command center. Always address him as Keenan (never "Commander", "Sir", or "User"). '
        .'PERSONALITY: Talk like a brilliant friend, not a rigid military robot. Warm, witty, confident, genuinely helpful — light humor is welcome when it fits. '
        .'STYLE: Mirror Keenan\'s language and energy. He writes casual Indonesian -> reply in natural, relaxed Indonesian. English -> English. Small talk and greetings deserve short, friendly, human replies — NEVER canned lines like "Sistem siap. Perintah?". Technical or urgent topics deserve precise, structured answers. '
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
    // engine: 'auto' = ElevenLabs bila key+voice tersedia, fallback Edge TTS;
    //         'elevenlabs' = paksa ElevenLabs; 'edge' = paksa Edge TTS (gratis).
    // Voice default en-GB-RyanNeural = pria Inggris kalem ala JARVIS.
    'tts' => [
        'engine' => env('JARVIS_TTS_ENGINE', 'auto'),
        'voice' => env('JARVIS_TTS_VOICE', 'en-GB-RyanNeural'),
        'rate' => env('JARVIS_TTS_RATE', '-4%'),
        'pitch' => env('JARVIS_TTS_PITCH', '-2Hz'),
        'max_chars' => 600,
        'cache_ttl' => 86400,

        // XTTS Local — voice cloning offline via speak_clone.py (GPU lokal).
        // Set XTTS_PYTHON ke path Python venv jika bukan 'python'.
        'xtts' => [
            'enabled' => env('XTTS_ENABLED', false),
            'python' => env('XTTS_PYTHON', 'python'),
            'script' => env('XTTS_SCRIPT', base_path('../ai/speak_clone.py')),
            'ref_audio' => env('XTTS_REF_AUDIO', base_path('../ai/voice-previews/5-jarvis.mp3')),
            'timeout' => (int) env('XTTS_TIMEOUT', 90),
        ],

        // ElevenLabs — suara JARVIS hasil voice cloning / voice komunitas.
        // Model multilingual mendukung bahasa Indonesia.
        'elevenlabs' => [
            'api_key' => env('ELEVENLABS_API_KEY'),
            'voice_id' => env('ELEVENLABS_VOICE_ID'),
            'model_id' => env('ELEVENLABS_MODEL_ID', 'eleven_multilingual_v2'),
            'output_format' => env('ELEVENLABS_OUTPUT_FORMAT', 'mp3_44100_128'),
            'stability' => (float) env('ELEVENLABS_STABILITY', 0.5),
            'similarity_boost' => (float) env('ELEVENLABS_SIMILARITY', 0.75),
            'style' => (float) env('ELEVENLABS_STYLE', 0.0),
            'speaker_boost' => (bool) env('ELEVENLABS_SPEAKER_BOOST', true),
            'timeout' => (int) env('ELEVENLABS_TIMEOUT', 30),
        ],
    ],
];
