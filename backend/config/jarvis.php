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

    // PRD §7 — TTS neural sisi server (Microsoft Edge TTS, gratis tanpa API key).
    // Voice default en-GB-RyanNeural = pria Inggris kalem ala JARVIS.
    'tts' => [
        'voice' => env('JARVIS_TTS_VOICE', 'en-GB-RyanNeural'),
        'rate' => env('JARVIS_TTS_RATE', '-4%'),
        'pitch' => env('JARVIS_TTS_PITCH', '-2Hz'),
        'max_chars' => 600,
        'cache_ttl' => 86400,
    ],
];
