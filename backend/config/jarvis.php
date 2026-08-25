<?php

return [
    'placeholder_model' => env('JARVIS_PLACEHOLDER_MODEL', 'local-placeholder'),

    // Persona dasar JARVIS (PRD §4). Agent-specific prompts menyusul di Phase 4.
    'system_prompt' => env('JARVIS_SYSTEM_PROMPT',
        'You are JARVIS, a personal AI command center assistant. '
        .'The user you serve is named Keenan — always address him as Keenan, never as "Commander", "Sir", or "User". '
        .'Respond concisely, precisely, and professionally. '
        .'When asked about system status, report clearly. '
        .'The user language preference is Indonesian unless asked otherwise.'),

    // PRD §6 — batas default agent RESEARCH.
    'research' => [
        'max_sources' => (int) env('JARVIS_RESEARCH_MAX_SOURCES', 3),
        'max_iterations' => (int) env('JARVIS_RESEARCH_MAX_ITERATIONS', 2),
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
