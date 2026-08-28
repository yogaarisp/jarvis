import type { VoicePrefs } from '../types'
import { getToken } from './api'

const PREFS_KEY = 'jarvis_voice_prefs'
/**
 * Versi skema prefs.
 * v4: default suara → 'jarvis-cloned' (XTTS lokal, fallback Edge TTS).
 */
const PREFS_VERSION = 4

export const DEFAULT_VOICE_PREFS: VoicePrefs = {
  sttEnabled: true,
  ttsEnabled: true,
  ttsRate: 1,
  ttsPitch: 1,
  language: 'id-ID',
  ttsServerVoice: 'jarvis-cloned',
}

export const SERVER_VOICES: Array<{ id: string; label: string; desc?: string; accent?: string; cloned?: boolean; engine?: 'edge' | 'xtts' }> = [
  { id: 'jarvis-cloned', label: 'JARVIS Master (Paul Bettany) ★', desc: 'Suara asli JARVIS film Iron Man via XTTS v2 clone lokal. Production VPS auto fallback ke Edge TTS.', accent: 'AI Clone (XTTS v2) → fallback Edge TTS', engine: 'xtts', cloned: true },
]

export function loadVoicePrefs(): VoicePrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return { ...DEFAULT_VOICE_PREFS, version: PREFS_VERSION }
    const parsed = JSON.parse(raw) as Partial<VoicePrefs>
    const prefs: VoicePrefs = { ...DEFAULT_VOICE_PREFS, ...parsed }
    if ((parsed.version ?? 1) < PREFS_VERSION) {
      prefs.ttsServerVoice = DEFAULT_VOICE_PREFS.ttsServerVoice
      saveVoicePrefs(prefs)
    }
    return prefs
  } catch {
    return { ...DEFAULT_VOICE_PREFS, version: PREFS_VERSION }
  }
}

export function saveVoicePrefs(prefs: VoicePrefs): void {
  localStorage.setItem(PREFS_KEY, JSON.stringify({ ...prefs, version: PREFS_VERSION }))
}

export function isSttAvailable(): boolean {
  return typeof window !== 'undefined' && 'webkitSpeechRecognition' in window
}

export function isTtsAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

/**
 * Deteksi bahasa teks secara ringan di sisi frontend.
 * Return 'id-ID' atau 'en-GB'.
 */
export function detectTextLang(text: string): 'id-ID' | 'en-GB' {
  const t = text.toLowerCase()
  const idWords = ['yang','dengan','untuk','sudah','belum','bisa','tidak','akan','tetapi',
    'karena','jika','dari','ini','itu','saya','kamu','ada','jadi','apa','bagaimana',
    'dong','nih','loh','ya','oke','baik','halo','tolong','makasih','terima','kasih',
    'sekarang','nanti','besok','tadi','kemarin','gimana','gak','nggak','udah','buat',
    'bantu','boleh','minta','kalau','supaya','agar','ketika','setelah','sebelum']
  const enWords = ['the','and','you','that','have','with','this','will','your','from',
    'they','been','their','what','when','how','why','where','yes','okay','hello',
    'please','thanks','thank','ready','completed','system','let','can','could',
    'would','should','here','there','all','just','also','then','but','or','so']

  let idScore = 0
  let enScore = 0
  for (const w of idWords) {
    const re = new RegExp(`\\b${w}\\b`)
    if (re.test(t)) idScore++
  }
  for (const w of enWords) {
    const re = new RegExp(`\\b${w}\\b`)
    if (re.test(t)) enScore++
  }
  // Suffix khas Indonesia
  const words = t.split(/\s+/)
  for (const w of words) {
    if (w.endsWith('nya') || w.endsWith('lah') || w.endsWith('kah') || w.endsWith('kan')) idScore++
  }
  return idScore >= enScore ? 'id-ID' : 'en-GB'
}

const UK_MALE_HINTS = ['uk english male','ryan','george','arthur','daniel','oliver','thomas','liam','james','brian','male']

export function pickBritishMaleVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  if (!voices.length) return undefined
  const gb = voices.filter((v) => v.lang?.toLowerCase().startsWith('en-gb'))
  const pool = gb.length ? gb : voices.filter((v) => v.lang?.toLowerCase().startsWith('en'))
  if (!pool.length) return undefined
  for (const hint of UK_MALE_HINTS) {
    const hit = pool.find((v) => v.name.toLowerCase().includes(hint))
    if (hit) return hit
  }
  return pool[0]
}

// ─────────────────────────────────────────────────────────────────────────────
// STT Engine
// ─────────────────────────────────────────────────────────────────────────────

export class SttEngine {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private recognition: any | null = null
  private active = false
  private manualStop = false
  public finalText = ''
  public interimText = ''

  onFinal?: (text: string) => void
  onInterim?: (text: string) => void
  onError?: (msg: string) => void
  onStart?: () => void
  onStop?: () => void

  lang: string
  continuous: boolean

  constructor(lang: string = 'id-ID', continuous: boolean = false) {
    this.lang = lang
    this.continuous = continuous
  }

  isAvailable(): boolean { return isSttAvailable() }

  start(): void {
    if (this.active) return
    if (!this.isAvailable()) {
      this.onError?.('Speech Recognition tidak didukung browser ini.')
      return
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!Ctor) { this.onError?.('Speech Recognition tidak ditemukan.'); return }

    const rec = new Ctor() as {
      lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number
      onresult: ((ev: unknown) => void) | null; onerror: ((ev: unknown) => void) | null
      onend: (() => void) | null; onstart: (() => void) | null
      start: () => void; stop: () => void; abort: () => void
    }
    rec.lang = this.lang
    rec.continuous = this.continuous
    rec.interimResults = true
    rec.maxAlternatives = 1

    rec.onresult = (ev) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const e = ev as any
      let interim = ''
      let fin = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i] as { isFinal: boolean; 0: { transcript: string } }
        if (r.isFinal) fin += r[0].transcript
        else interim += r[0].transcript
      }
      if (fin) {
        this.finalText += (this.finalText ? ' ' : '') + fin.trim()
        this.onFinal?.(this.finalText)
      }
      this.interimText = interim
      this.onInterim?.(this.interimText)
    }

    rec.onerror = (ev) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const code = ((ev as any)?.error as string) ?? 'unknown'
      if (code === 'no-speech' || code === 'aborted') return
      const msgMap: Record<string, string> = {
        'not-allowed': 'Izin mikrofon ditolak. Periksa izin browser.',
        'service-not-allowed': 'Layanan STT tidak tersedia.',
        network: 'Masalah jaringan saat STT.',
        audio: 'Perangkat audio bermasalah.',
      }
      this.onError?.(msgMap[code] ?? `STT error: ${code}`)
    }

    rec.onstart = () => {
      this.active = true
      this.finalText = ''
      this.interimText = ''
      this.manualStop = false
      this.onStart?.()
    }

    rec.onend = () => {
      const wasActive = this.active
      this.active = false
      if (wasActive) this.onStop?.()
      if (!this.manualStop && this.continuous && this.isAvailable()) {
        setTimeout(() => { if (!this.active) this.start() }, 120)
      }
    }

    this.recognition = rec
    try { rec.start() } catch { /* ignore */ }
  }

  stop(): string {
    this.manualStop = true
    try { this.recognition?.stop() } catch { /* ignore */ }
    return this.finalText.trim()
  }

  cancel(): void {
    this.manualStop = true
    try { this.recognition?.abort() } catch { /* ignore */ }
    this.finalText = ''
    this.interimText = ''
  }

  isListening(): boolean { return this.active }

  hasTranscript(): boolean {
    return this.finalText.trim() !== '' || this.interimText.trim() !== ''
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TTS Engine
//
// Desain baru: queue-based.
// speak(text) → segmen ditambahkan ke antrian. Engine memainkan satu per satu.
// cancel() → bersihkan antrian & hentikan audio yang sedang berjalan.
//
// Ini menyelesaikan masalah "sisa teks terpotong" karena speak() lama
// selalu cancel() audio yang sedang berjalan.
// ─────────────────────────────────────────────────────────────────────────────

export class TtsEngine {
  private prefs: VoicePrefs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private currentAudio: any | null = null
  private queue: string[] = []          // antrian segmen teks
  private playing = false               // sedang memutar audio
  private cancelled = false             // flag cancel
  // Prefetch — sintesis segmen berikutnya di background SELAGI segmen
  // saat ini diputar, agar transisi antar segmen mulus tanpa jeda
  // (menghilangkan efek suara "patah-patah" akibat latensi sintesis XTTS).
  private prefetch = new Map<string, Promise<Blob | null>>()

  onStart?: () => void
  onEnd?: () => void
  /** Dipanggil bila autoplay diblokir browser (belum ada interaksi user). */
  onBlocked?: () => void

  constructor(prefs?: VoicePrefs) {
    this.prefs = prefs ?? loadVoicePrefs()
  }

  updatePrefs(prefs: VoicePrefs): void {
    this.prefs = prefs
    this.prefetch.clear()
  }

  isAvailable(): boolean { return isTtsAvailable() }

  listVoices(): SpeechSynthesisVoice[] {
    if (!this.isAvailable()) return []
    return window.speechSynthesis.getVoices()
  }

  private pickVoice(): SpeechSynthesisVoice | undefined {
    const voices = this.listVoices()
    if (!voices.length) return undefined
    if (this.prefs.voiceName) {
      const match = voices.find((v) => v.name === this.prefs.voiceName)
      if (match) return match
    }
    const uk = pickBritishMaleVoice(voices)
    if (uk) return uk
    const local = voices.find(
      (v) => v.lang && v.lang.toLowerCase().startsWith(this.prefs.language.split('-')[0].toLowerCase()),
    )
    return local ?? voices[0]
  }

  /**
   * Tambahkan teks ke antrian dan mulai putar jika belum berjalan.
   * Tidak membatalkan audio yang sedang berjalan — segmen baru
   * diputar setelah yang sekarang selesai.
   */
  enqueue(text: string): void {
    if (!this.prefs.ttsEnabled) return
    const clean = this.cleanText(text)
    if (!clean) return
    this.queue.push(clean)
    if (!this.playing) {
      this.playNext()
      return
    }
    // Sedang memutar — pastikan segmen berikutnya sudah disintesis di background.
    this.startPrefetch()
  }

  /**
   * speak() — untuk kompatibilitas mundur dengan kode yang memanggil speak() langsung.
   * Jika queue kosong dan tidak sedang play, enqueue biasa.
   * Jika sedang play, tambahkan ke antrian (tidak cancel).
   */
  speak(text: string): void {
    this.enqueue(text)
  }

  private cleanText(text: string): string {
    return text.replace(/\[(\d+)\]/g, '').replace(/```[\s\S]*?```/g, '').trim()
  }

  /** Kosongkan slot prefetch (saat cancel/prefs berubah/antrian habis). */
  private clearPrefetch(): void {
    this.prefetch.clear()
  }

  /**
   * Mulai sintesis 2 segmen terdepan antrian di background.
   * Dipanggil saat playback berjalan — hasilnya langsung siap diputar
   * begitu segmen sekarang selesai, tanpa menunggu sintesis ulang.
   */
  private startPrefetch(): void {
    if (this.prefetch.size >= 2) return
    for (const text of this.queue.slice(0, 2)) {
      if (this.prefetch.has(text)) continue
      if (this.prefetch.size >= 2) break
      this.prefetch.set(text, this.synthesize(text).catch(() => null))
    }
  }

  private async playNext(): Promise<void> {
    if (this.queue.length === 0) {
      this.playing = false
      this.clearPrefetch()
      if (!this.cancelled) this.onEnd?.()
      return
    }

    this.playing = true
    this.cancelled = false
    const text = this.queue.shift()!

    // Pakai hasil prefetch bila tersedia; jika tidak, sintesis sekarang.
    let blob: Blob | null = null
    const pending = this.prefetch.get(text)
    if (pending) {
      blob = await pending
      this.prefetch.delete(text)
    }
    blob ??= await this.synthesize(text)

    if (this.cancelled) return

    if (blob) {
      // Selagi segmen ini diputar, sintesis segmen berikutnya di background.
      this.startPrefetch()
      const ok = await this.playBlob(blob)
      if (this.cancelled) return
      if (!ok) {
        // Gagal memutar blob → coba mesin browser sebagai fallback.
        this.speakBrowser(text, detectTextLang(text))
        return
      }
      this.playNext()
      return
    }

    // Tidak ada blob dari server (XTTS + Edge gagal) → mesin browser.
    this.speakBrowser(text, detectTextLang(text))
  }

  /**
   * Sintesis teks → Blob audio.
   * Coba XTTS clone dulu (lokal GPU) → fallback Edge TTS via backend.
   * Return null bila keduanya tidak tersedia (pemutar browser jadi fallback).
   */
  private async synthesize(text: string): Promise<Blob | null> {
    const lang = detectTextLang(text)
    const token = getToken()
    if (!token) return null
    const isXtts = (this.prefs.ttsServerVoice ?? 'jarvis-cloned') === 'jarvis-cloned'
    if (isXtts) {
      const blob = await this.fetchClone(text, token, lang)
      if (blob) return blob
    }
    return this.fetchEdge(text, token, lang)
  }

  /**
   * XTTS clone — suara JARVIS lokal. Return null bila disabled (503) atau gagal.
   */
  private async fetchClone(text: string, token: string, lang: string): Promise<Blob | null> {
    // XTTS tidak support id-ID → kirim 'en' agar model tidak crash
    const xttsLang = lang.startsWith('id') ? 'en' : lang.split('-')[0]
    const params = new URLSearchParams({ text, language: xttsLang })

    try {
      const resp = await fetch(`/api/tts/clone?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (resp.status === 503) return null   // XTTS disabled di server
      if (!resp.ok) return null
      const blob = await resp.blob()
      return blob.size ? blob : null
    } catch {
      return null
    }
  }

  /**
   * Edge TTS via backend — auto pilih voice sesuai bahasa.
   * Backend: ID → ArdiNeural, EN → RyanNeural.
   */
  private async fetchEdge(text: string, token: string, lang: string): Promise<Blob | null> {
    const rate = Math.round((Math.max(0.6, Math.min(1.6, this.prefs.ttsRate)) - 1) * 100)
    const pitch = Math.round((Math.max(0.6, Math.min(1.6, this.prefs.ttsPitch)) - 1) * 50)
    const params = new URLSearchParams({
      text,
      lang,
      rate: `${rate >= 0 ? '+' : ''}${rate}%`,
      pitch: `${pitch >= 0 ? '+' : ''}${pitch}Hz`,
    })

    try {
      const resp = await fetch(`/api/tts?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!resp.ok) return null
      const blob = await resp.blob()
      return blob.size ? blob : null
    } catch {
      return null
    }
  }

  /**
   * Putar blob audio. Menunggu sampai selesai lalu lanjut ke antrian berikutnya.
   */
  private playBlob(blob: Blob): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.cancelled) { resolve(false); return }

      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      this.currentAudio = audio

      audio.onplay = () => { this.onStart?.() }

      audio.onended = () => {
        URL.revokeObjectURL(url)
        this.currentAudio = null
        if (!this.cancelled) {
          // Jika ini segmen terakhir → onEnd akan dipanggil di playNext()
          this.playNext()
        }
        resolve(true)
      }

      audio.onerror = () => {
        URL.revokeObjectURL(url)
        this.currentAudio = null
        resolve(false)
      }

      audio.play().catch((err: unknown) => {
        if ((err as DOMException | undefined)?.name === 'NotAllowedError') this.onBlocked?.()
        resolve(false)
      })
    })
  }

  private speakBrowser(text: string, lang: string): void {
    if (!this.isAvailable()) {
      this.playing = false
      this.onEnd?.()
      return
    }

    const utter = new SpeechSynthesisUtterance(text)
    utter.lang = lang
    utter.rate = Math.max(0.5, Math.min(2, this.prefs.ttsRate))
    utter.pitch = Math.max(0, Math.min(2, this.prefs.ttsPitch))
    const v = this.pickVoice()
    if (v) utter.voice = v

    utter.onstart = () => { this.onStart?.() }
    utter.onend = () => {
      if (!this.cancelled) this.playNext()
    }
    utter.onerror = (ev) => {
      if (ev?.error === 'not-allowed') this.onBlocked?.()
      this.playing = false
      this.onEnd?.()
    }

    window.speechSynthesis.speak(utter)
  }

  /**
   * Hentikan semua audio dan kosongkan antrian.
   */
  cancel(): void {
    this.cancelled = true
    this.queue = []
    this.playing = false
    this.clearPrefetch()

    if (this.currentAudio) {
      try { this.currentAudio.pause() } catch { /* ignore */ }
      this.currentAudio = null
    }

    if (this.isAvailable()) {
      try { window.speechSynthesis.cancel() } catch { /* ignore */ }
    }
  }

  isSpeaking(): boolean {
    return this.playing
  }
}
