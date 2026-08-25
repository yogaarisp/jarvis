import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Particles } from '../components/CoreHud'

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await login(email, password)
      navigate('/', { replace: true })
    } catch (err) {
      const message =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (err as any).response?.data?.message ?? 'Autentikasi gagal. Periksa kredensial Anda.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden p-4">
      <Particles />
      <div className="scanline relative z-10 w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="font-display text-3xl font-bold tracking-[0.3em] text-jarvis-cyan text-glow-cyan">
            HAI JARVIS
          </h1>
          <p className="mt-2 text-xs tracking-[0.35em] text-jarvis-gold/70">AI COMMAND CENTER</p>
        </div>

        <form onSubmit={handleSubmit} className="glass box-glow-cyan space-y-4 rounded-2xl p-6">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-[11px] font-semibold tracking-[0.25em] text-cyan-200/60">
              EMAIL
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-jarvis-cyan/20 bg-jarvis-bg/60 px-4 py-3 text-[15px] text-cyan-50 placeholder:text-cyan-200/20 focus:border-jarvis-cyan/60"
              placeholder="admin@jarvis.local"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1.5 block text-[11px] font-semibold tracking-[0.25em] text-cyan-200/60">
              PASSWORD
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-jarvis-cyan/20 bg-jarvis-bg/60 px-4 py-3 text-[15px] text-cyan-50 placeholder:text-cyan-200/20 focus:border-jarvis-cyan/60"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="rounded-xl border border-jarvis-danger/30 bg-jarvis-danger/10 px-4 py-2.5 text-sm text-rose-200">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="font-display w-full rounded-xl border border-jarvis-cyan/60 bg-jarvis-cyan/15 py-3 text-sm font-bold tracking-[0.35em] text-jarvis-cyan transition hover:bg-jarvis-cyan/30 disabled:opacity-40"
          >
            {loading ? 'MENGHUBUNGKAN…' : 'AKSES SISTEM'}
          </button>
        </form>

        <p className="mt-6 text-center text-[11px] tracking-[0.2em] text-cyan-200/30">
          HAI JARVIS v0.1 · PHASE 1
        </p>
      </div>
    </div>
  )
}
