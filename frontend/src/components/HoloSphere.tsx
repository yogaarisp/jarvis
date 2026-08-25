import { useEffect, useRef } from 'react'
import type { JarvisState } from '../types'

interface HoloSphereProps {
  state: JarvisState
  micLevel?: number
  onClickMic?: () => void
}

interface Point3D {
  x: number
  y: number
  z: number
  baseX: number
  baseY: number
  baseZ: number
  size: number
  alpha: number
}

export function HoloSphere({ state, micLevel = 0 }: HoloSphereProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const animFrameRef = useRef<number | null>(null)
  const angleRef = useRef({ x: 0.25, y: 0 })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let width = (canvas.width = canvas.parentElement?.clientWidth || 500)
    let height = (canvas.height = canvas.parentElement?.clientHeight || 500)

    const handleResize = () => {
      if (!canvas || !canvas.parentElement) return
      width = canvas.width = canvas.parentElement.clientWidth
      height = canvas.height = canvas.parentElement.clientHeight
    }
    window.addEventListener('resize', handleResize)

    // Generate 3D spherical point cloud (Fibonacci sphere algorithm)
    const numPoints = 1450
    const points: Point3D[] = []
    const radius = Math.min(width, height) * 0.38

    const phi = Math.PI * (3 - Math.sqrt(5)) // Golden angle

    for (let i = 0; i < numPoints; i++) {
      const y = 1 - (i / (numPoints - 1)) * 2 // y goes from 1 to -1
      const radiusAtY = Math.sqrt(1 - y * y) // Radius at y
      const theta = phi * i // Golden angle increment

      const x = Math.cos(theta) * radiusAtY
      const z = Math.sin(theta) * radiusAtY

      // Realistic holographic point cloud distribution
      const variance = 0.94 + Math.random() * 0.12
      const px = x * radius * variance
      const py = y * radius * variance
      const pz = z * radius * variance

      points.push({
        x: px,
        y: py,
        z: pz,
        baseX: px,
        baseY: py,
        baseZ: pz,
        size: Math.random() < 0.2 ? 2.5 : Math.random() < 0.6 ? 1.6 : 1.0,
        alpha: 0.35 + Math.random() * 0.65,
      })
    }

    let time = 0

    const render = () => {
      time += 0.018
      ctx.clearRect(0, 0, width, height)

      const centerX = width / 2
      const centerY = height / 2

      // Dynamic rotation speed based on Jarvis core state
      let speedY = 0.009
      let speedX = 0.003
      let waveAmpl = 0

      if (state === 'THINKING') {
        speedY = 0.026
        speedX = 0.01
        waveAmpl = 10
      } else if (state === 'SPEAKING') {
        speedY = 0.016
        waveAmpl = 16
      } else if (state === 'LISTENING') {
        speedY = 0.012
        waveAmpl = 8 + (micLevel || 0) * 45
      }

      angleRef.current.y += speedY
      angleRef.current.x += speedX

      const cosY = Math.cos(angleRef.current.y)
      const sinY = Math.sin(angleRef.current.y)
      const cosX = Math.cos(angleRef.current.x)
      const sinX = Math.sin(angleRef.current.x)

      const fov = 480

      let primaryR = 0
      let primaryG = 229
      let primaryB = 255

      if (state === 'SPEAKING') {
        primaryR = 212
        primaryG = 175
        primaryB = 55
      } else if (state === 'ERROR') {
        primaryR = 244
        primaryG = 63
        primaryB = 94
      } else if (state === 'THINKING') {
        primaryR = 59
        primaryG = 130
        primaryB = 246
      }

      const transformedPoints = points.map((p) => {
        let wave = 0
        if (waveAmpl > 0) {
          wave = Math.sin(time * 6.5 + p.baseY * 0.08) * waveAmpl
        }

        const currentRadiusRatio = (radius + wave) / radius
        const bx = p.baseX * currentRadiusRatio
        const by = p.baseY * currentRadiusRatio
        const bz = p.baseZ * currentRadiusRatio

        // Y-axis rotation
        const x1 = bx * cosY - bz * sinY
        const z1 = bz * cosY + bx * sinY

        // X-axis rotation
        const y2 = by * cosX - z1 * sinX
        const z2 = z1 * cosX + by * sinX

        const scale = fov / (fov + z2 + radius * 0.3)
        const projX = centerX + x1 * scale
        const projY = centerY + y2 * scale

        const depthRatio = (z2 + radius) / (radius * 2)

        return {
          projX,
          projY,
          depthRatio: Math.max(0, Math.min(1, depthRatio)),
          z: z2,
          size: p.size * scale,
          alpha: p.alpha,
        }
      })

      transformedPoints.sort((a, b) => a.z - b.z)

      // Draw points with glowing core depth
      for (const p of transformedPoints) {
        const alpha = Math.max(0.18, (0.25 + p.depthRatio * 0.75) * p.alpha)
        const r = primaryR
        const g = primaryG
        const b = primaryB

        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`
        ctx.beginPath()
        ctx.arc(p.projX, p.projY, Math.max(0.9, p.size * (0.7 + p.depthRatio * 0.6)), 0, Math.PI * 2)
        ctx.fill()

        // Give glowing halo to front particles
        if (p.depthRatio > 0.75 && p.size > 1.3) {
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha * 0.45})`
          ctx.beginPath()
          ctx.arc(p.projX, p.projY, p.size * 2.8, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      animFrameRef.current = requestAnimationFrame(render)
    }

    render()

    return () => {
      window.removeEventListener('resize', handleResize)
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [state, micLevel])

  return (
    <div className="relative flex h-full w-full items-center justify-center">
      {/* Outer Rotating HUD Rings & Target Reticles */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="relative h-[min(27rem,52vw)] w-[min(27rem,52vw)] max-h-[480px] max-w-[480px]">
          <svg viewBox="0 0 400 400" className="h-full w-full animate-spin-slower">
            <circle
              cx="200"
              cy="200"
              r="192"
              fill="none"
              stroke="#00e5ff"
              strokeOpacity="0.4"
              strokeWidth="1.2"
              strokeDasharray="40 18 120 18 40 18 20 18"
            />
            <circle
              cx="200"
              cy="200"
              r="184"
              fill="none"
              stroke="#00e5ff"
              strokeOpacity="0.2"
              strokeWidth="0.8"
              strokeDasharray="6 8"
            />
            <text x="200" y="16" fill="#00e5ff" opacity="0.6" fontSize="8" fontFamily="monospace" textAnchor="middle">000°</text>
            <text x="390" y="203" fill="#00e5ff" opacity="0.6" fontSize="8" fontFamily="monospace" textAnchor="middle">090°</text>
            <text x="200" y="396" fill="#00e5ff" opacity="0.6" fontSize="8" fontFamily="monospace" textAnchor="middle">180°</text>
            <text x="12" y="203" fill="#00e5ff" opacity="0.6" fontSize="8" fontFamily="monospace" textAnchor="middle">270°</text>
          </svg>

          <svg viewBox="0 0 400 400" className="absolute inset-0 h-full w-full animate-spin-slow-reverse">
            <circle
              cx="200"
              cy="200"
              r="170"
              fill="none"
              stroke="#00e5ff"
              strokeOpacity="0.3"
              strokeWidth="1"
              strokeDasharray="20 40 80 40"
            />
            {Array.from({ length: 16 }).map((_, i) => (
              <line
                key={i}
                x1="200"
                y1="34"
                x2="200"
                y2="42"
                stroke="#00e5ff"
                strokeOpacity={i % 4 === 0 ? '0.8' : '0.3'}
                strokeWidth={i % 4 === 0 ? '1.5' : '0.8'}
                transform={`rotate(${i * 22.5} 200 200)`}
              />
            ))}
          </svg>

          <svg viewBox="0 0 400 400" className="absolute inset-0 h-full w-full opacity-50">
            <line x1="20" y1="200" x2="60" y2="200" stroke="#00e5ff" strokeWidth="1" strokeDasharray="3 3" />
            <line x1="340" y1="200" x2="380" y2="200" stroke="#00e5ff" strokeWidth="1" strokeDasharray="3 3" />
            <line x1="200" y1="20" x2="200" y2="60" stroke="#00e5ff" strokeWidth="1" strokeDasharray="3 3" />
            <line x1="200" y1="340" x2="200" y2="380" stroke="#00e5ff" strokeWidth="1" strokeDasharray="3 3" />
          </svg>
        </div>
      </div>

      {/* 3D Particle Canvas */}
      <canvas ref={canvasRef} className="relative z-10 h-full w-full max-h-[520px] max-w-[520px]" />
    </div>
  )
}
