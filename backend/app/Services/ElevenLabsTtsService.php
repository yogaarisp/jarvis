<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;

/**
 * Klien ElevenLabs (PRD §7) — TTS kualitas tinggi + voice cloning JARVIS.
 *
 * API key tidak pernah keluar dari server. Endpoint:
 * - synthesize()      : teks -> mp3 bytes (model multilingual, dukung Indonesia)
 * - listVoices()      : daftar voice akun + voice komunitas yang tersimpan
 * - cloneFromSample() : Instant Voice Cloning dari file audio referensi
 */
class ElevenLabsTtsService
{
    private string $baseUrl = 'https://api.elevenlabs.io';

    public function isConfigured(): bool
    {
        return filled(config('jarvis.tts.elevenlabs.api_key'))
            && filled(config('jarvis.tts.elevenlabs.voice_id'));
    }

    /**
     * Sintesis teks menjadi mp3 binary.
     *
     * @throws \RuntimeException bila API gagal
     */
    public function synthesize(string $text, ?string $voiceId = null): string
    {
        $cfg = config('jarvis.tts.elevenlabs');
        $voiceId ??= $cfg['voice_id'];

        if (blank($cfg['api_key']) || blank($voiceId)) {
            throw new \RuntimeException('ElevenLabs belum dikonfigurasi: ELEVENLABS_API_KEY / ELEVENLABS_VOICE_ID kosong.');
        }

        $response = Http::withHeaders(['xi-api-key' => $cfg['api_key']])
            ->timeout($cfg['timeout'])
            ->accept('audio/mpeg')
            ->post(
                "{$this->baseUrl}/v1/text-to-speech/{$voiceId}?output_format={$cfg['output_format']}",
                [
                    'text' => $text,
                    'model_id' => $cfg['model_id'],
                    'voice_settings' => [
                        'stability' => $cfg['stability'],
                        'similarity_boost' => $cfg['similarity_boost'],
                        'style' => $cfg['style'],
                        'use_speaker_boost' => $cfg['speaker_boost'],
                    ],
                ]
            );

        if ($response->failed()) {
            throw new \RuntimeException('ElevenLabs API error '.$response->status().': '.$this->errorMessage($response));
        }

        return $response->body();
    }

    /**
     * Daftar voice pada akun (termasuk hasil cloning dan voice library yang di-add).
     */
    public function listVoices(): array
    {
        $cfg = config('jarvis.tts.elevenlabs');

        $response = Http::withHeaders(['xi-api-key' => $cfg['api_key']])
            ->timeout($cfg['timeout'])
            ->get("{$this->baseUrl}/v1/voices");

        if ($response->failed()) {
            throw new \RuntimeException('ElevenLabs API error '.$response->status().': '.$this->errorMessage($response));
        }

        return collect($response->json('voices', []))
            ->map(fn (array $v) => [
                'voice_id' => $v['voice_id'],
                'name' => $v['name'],
                'category' => $v['category'] ?? null,
                'labels' => $v['labels'] ?? [],
                'preview_url' => $v['preview_url'] ?? null,
            ])
            ->values()
            ->all();
    }

    /**
     * Instant Voice Cloning dari file audio referensi (mis. jarvis-ref.mp3).
     * Butuh plan berbayar; sample 1-3 menit memberi hasil terbaik.
     *
     * @return array{voice_id: string}
     *
     * @throws \RuntimeException bila API gagal
     */
    public function cloneFromSample(string $name, UploadedFile $file): array
    {
        $cfg = config('jarvis.tts.elevenlabs');

        $multipart = [
            ['name' => 'name', 'contents' => $name],
            [
                'name' => 'files',
                'contents' => fopen($file->getRealPath(), 'rb'),
                'filename' => $file->getClientOriginalName(),
            ],
        ];

        $response = Http::withHeaders(['xi-api-key' => $cfg['api_key']])
            ->timeout(max($cfg['timeout'], 60))
            ->asMultipart()
            ->post("{$this->baseUrl}/v1/voices/add", $multipart);

        if ($response->failed()) {
            throw new \RuntimeException('Clone gagal ('.$response->status().'): '.$this->errorMessage($response));
        }

        return ['voice_id' => $response->json('voice_id')];
    }

    /**
     * Simpan sample suara referensi ke storage lokal untuk audit/ulang-clone.
     */
    public function storeSample(UploadedFile $file): string
    {
        $path = "voice-samples/{$file->hashName()}";

        Storage::disk('local')->put($path, $file->getContent());

        return storage_path('app/'.$path);
    }

    private function errorMessage($response): string
    {
        $detail = $response->json('detail');

        return is_string($detail) ? $detail : json_encode($response->json() ?: $response->body());
    }
}
