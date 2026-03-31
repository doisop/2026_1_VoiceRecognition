/**
 * AvatarCharacter — 2D SVG English tutor character
 *
 * States:
 *   idle      — breathing + blink animation
 *   listening — attentive eyes, mouth slightly open
 *   thinking  — eyes glance up, neutral mouth
 *   talking   — mouth opens and closes rhythmically
 */
import { useEffect, useRef, useState } from 'react'

export type AvatarState = 'idle' | 'listening' | 'thinking' | 'talking'

interface Props {
  state: AvatarState
  className?: string
}

// ─── Mouth path shapes ────────────────────────────────────────────────────────

const MOUTH: Record<string, string> = {
  smile:         'M 168 295 Q 200 314 232 295',
  talkOpen:      'M 165 292 Q 200 318 235 292 L 232 295 Q 200 308 168 295 Z',
  talkClosed:    'M 168 293 Q 200 308 232 293',
  neutral:       'M 172 295 Q 200 305 228 295',
  thinkingSmile: 'M 174 296 Q 198 308 224 292',
}

const STATE_MOUTH: Record<AvatarState, string> = {
  idle:      MOUTH.smile,
  listening: MOUTH.neutral,
  thinking:  MOUTH.thinkingSmile,
  talking:   MOUTH.talkOpen,
}

// ─── Eye positions (for look direction) ──────────────────────────────────────

const PUPIL_OFFSET: Record<AvatarState, { dx: number; dy: number }> = {
  idle:      { dx: 0, dy: 0 },
  listening: { dx: 0, dy: -1 },
  thinking:  { dx: -2, dy: -5 },
  talking:   { dx: 0, dy: 0 },
}

export default function AvatarCharacter({ state, className = '' }: Props) {
  const [mouthPath, setMouthPath] = useState(MOUTH.smile)
  const [blinkScale, setBlinkScale] = useState(1)
  const talkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const blinkTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const talkToggleRef = useRef(false)

  // ── Mouth animation ──
  useEffect(() => {
    if (talkIntervalRef.current) clearInterval(talkIntervalRef.current)

    if (state === 'talking') {
      talkIntervalRef.current = setInterval(() => {
        talkToggleRef.current = !talkToggleRef.current
        setMouthPath(talkToggleRef.current ? MOUTH.talkOpen : MOUTH.talkClosed)
      }, 140)
    } else {
      setMouthPath(STATE_MOUTH[state])
    }

    return () => {
      if (talkIntervalRef.current) clearInterval(talkIntervalRef.current)
    }
  }, [state])

  // ── Blink animation ──
  useEffect(() => {
    function scheduleBlink() {
      const delay = 2500 + Math.random() * 3000
      blinkTimeoutRef.current = setTimeout(() => {
        setBlinkScale(0.05)
        setTimeout(() => {
          setBlinkScale(1)
          scheduleBlink()
        }, 100)
      }, delay)
    }
    scheduleBlink()
    return () => {
      if (blinkTimeoutRef.current) clearTimeout(blinkTimeoutRef.current)
    }
  }, [])

  const pupil = PUPIL_OFFSET[state]

  return (
    <div className={`select-none ${className}`}>
      <svg
        viewBox="0 0 400 480"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full drop-shadow-2xl"
        style={{ animation: 'avatarFloat 3.5s ease-in-out infinite' }}
      >
        <defs>
          {/* Face gradient */}
          <radialGradient id="faceGrad" cx="45%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#ffe8d6" />
            <stop offset="100%" stopColor="#f5c9a8" />
          </radialGradient>
          {/* Eye white gradient */}
          <radialGradient id="eyeGrad" cx="40%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#f0f0f0" />
          </radialGradient>
          {/* Background glow */}
          <radialGradient id="bgGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
          </radialGradient>
          {/* Iris gradient */}
          <radialGradient id="irisGrad" cx="38%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#7c6054" />
            <stop offset="100%" stopColor="#3d2b1f" />
          </radialGradient>
          {/* Cheek gradient */}
          <radialGradient id="cheekGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffb3b3" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#ffb3b3" stopOpacity="0" />
          </radialGradient>
          {/* Shirt gradient */}
          <linearGradient id="shirtGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#4338ca" />
          </linearGradient>
          <clipPath id="leftEyeClip">
            <ellipse cx="158" cy="216" rx="23" ry="24" />
          </clipPath>
          <clipPath id="rightEyeClip">
            <ellipse cx="242" cy="216" rx="23" ry="24" />
          </clipPath>
        </defs>

        {/* ── Background glow ── */}
        <circle cx="200" cy="240" r="190" fill="url(#bgGlow)" />

        {/* ── Shirt / Body ── */}
        <path
          d="M 80 480 L 80 400 Q 100 370 140 360 L 160 380 L 200 395 L 240 380 L 260 360 Q 300 370 320 400 L 320 480 Z"
          fill="url(#shirtGrad)"
        />
        {/* Collar V */}
        <path
          d="M 160 380 L 200 405 L 240 380 L 235 375 L 200 398 L 165 375 Z"
          fill="#4338ca"
        />
        {/* Neck */}
        <rect x="178" y="355" width="44" height="40" rx="10" fill="url(#faceGrad)" />

        {/* ── Ears ── */}
        <ellipse cx="82" cy="232" rx="16" ry="20" fill="url(#faceGrad)" />
        <ellipse cx="82" cy="232" rx="9" ry="12" fill="#f0b898" opacity="0.5" />
        <ellipse cx="318" cy="232" rx="16" ry="20" fill="url(#faceGrad)" />
        <ellipse cx="318" cy="232" rx="9" ry="12" fill="#f0b898" opacity="0.5" />

        {/* ── Face ── */}
        <ellipse cx="200" cy="238" rx="118" ry="138" fill="url(#faceGrad)" />

        {/* ── Hair (back layer) ── */}
        <path
          d="M 88 210 Q 82 130 130 95 Q 165 72 200 68 Q 235 72 270 95 Q 318 130 312 210 Q 295 130 260 108 Q 235 96 200 94 Q 165 96 140 108 Q 105 130 88 210 Z"
          fill="#1c1c2e"
        />
        {/* Hair sides */}
        <path
          d="M 88 210 Q 80 260 85 310 Q 88 280 95 250 Q 100 220 88 210 Z"
          fill="#1c1c2e"
        />
        <path
          d="M 312 210 Q 320 260 315 310 Q 312 280 305 250 Q 300 220 312 210 Z"
          fill="#1c1c2e"
        />
        {/* Hair top detail */}
        <path
          d="M 140 108 Q 165 88 200 84 Q 235 88 260 108 Q 240 95 200 93 Q 160 95 140 108 Z"
          fill="#2d2d4a"
          opacity="0.6"
        />

        {/* ── Eyebrows ── */}
        <path
          d={state === 'thinking'
            ? 'M 137 187 Q 157 178 178 183'
            : 'M 137 190 Q 157 182 178 186'}
          stroke="#1c1c2e"
          strokeWidth="4.5"
          strokeLinecap="round"
          fill="none"
          style={{ transition: 'd 0.3s ease' }}
        />
        <path
          d={state === 'thinking'
            ? 'M 222 183 Q 243 178 263 187'
            : 'M 222 186 Q 243 182 263 190'}
          stroke="#1c1c2e"
          strokeWidth="4.5"
          strokeLinecap="round"
          fill="none"
          style={{ transition: 'd 0.3s ease' }}
        />

        {/* ── Left eye ── */}
        <ellipse cx="158" cy="216" rx="23" ry="24" fill="url(#eyeGrad)" />
        <g clipPath="url(#leftEyeClip)" style={{ transform: `scaleY(${blinkScale})`, transformOrigin: '158px 216px', transition: 'transform 0.06s ease' }}>
          <circle cx={158 + pupil.dx} cy={216 + pupil.dy} r="15" fill="url(#irisGrad)" />
          <circle cx={158 + pupil.dx} cy={216 + pupil.dy} r="9" fill="#0a0a0a" />
          <circle cx={163 + pupil.dx} cy={210 + pupil.dy} r="4" fill="white" opacity="0.9" />
          <circle cx={154 + pupil.dx} cy={220 + pupil.dy} r="2" fill="white" opacity="0.5" />
        </g>
        {/* Eyelash top left */}
        <path d="M 135 200 Q 158 192 181 200" stroke="#1c1c2e" strokeWidth="3" strokeLinecap="round" fill="none" />

        {/* ── Right eye ── */}
        <ellipse cx="242" cy="216" rx="23" ry="24" fill="url(#eyeGrad)" />
        <g clipPath="url(#rightEyeClip)" style={{ transform: `scaleY(${blinkScale})`, transformOrigin: '242px 216px', transition: 'transform 0.06s ease' }}>
          <circle cx={242 + pupil.dx} cy={216 + pupil.dy} r="15" fill="url(#irisGrad)" />
          <circle cx={242 + pupil.dx} cy={216 + pupil.dy} r="9" fill="#0a0a0a" />
          <circle cx={247 + pupil.dx} cy={210 + pupil.dy} r="4" fill="white" opacity="0.9" />
          <circle cx={238 + pupil.dx} cy={220 + pupil.dy} r="2" fill="white" opacity="0.5" />
        </g>
        {/* Eyelash top right */}
        <path d="M 219 200 Q 242 192 265 200" stroke="#1c1c2e" strokeWidth="3" strokeLinecap="round" fill="none" />

        {/* ── Nose ── */}
        <path d="M 196 252 Q 200 258 204 252" stroke="#e8a882" strokeWidth="2.5" strokeLinecap="round" fill="none" />

        {/* ── Cheeks ── */}
        <ellipse cx="140" cy="260" rx="28" ry="16" fill="url(#cheekGrad)" />
        <ellipse cx="260" cy="260" rx="28" ry="16" fill="url(#cheekGrad)" />

        {/* ── Mouth ── */}
        {state === 'talking' ? (
          <path
            d={mouthPath}
            fill="#d46060"
            stroke="#c04040"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ transition: 'd 0.08s ease' }}
          />
        ) : (
          <path
            d={mouthPath}
            stroke="#e07070"
            strokeWidth="3.5"
            strokeLinecap="round"
            fill="none"
            style={{ transition: 'd 0.3s ease' }}
          />
        )}

        {/* ── State indicator light ── */}
        {state === 'listening' && (
          <circle cx="200" cy="452" r="8" fill="#22c55e" opacity="0.9">
            <animate attributeName="opacity" values="0.9;0.3;0.9" dur="1.2s" repeatCount="indefinite" />
          </circle>
        )}
        {state === 'talking' && (
          <circle cx="200" cy="452" r="8" fill="#6366f1" opacity="0.9">
            <animate attributeName="r" values="8;11;8" dur="0.28s" repeatCount="indefinite" />
          </circle>
        )}
        {state === 'thinking' && (
          <>
            <circle cx="188" cy="452" r="4" fill="#f59e0b" opacity="0.8">
              <animate attributeName="opacity" values="0.8;0.2;0.8" dur="0.6s" begin="0s" repeatCount="indefinite" />
            </circle>
            <circle cx="200" cy="452" r="4" fill="#f59e0b" opacity="0.8">
              <animate attributeName="opacity" values="0.8;0.2;0.8" dur="0.6s" begin="0.2s" repeatCount="indefinite" />
            </circle>
            <circle cx="212" cy="452" r="4" fill="#f59e0b" opacity="0.8">
              <animate attributeName="opacity" values="0.8;0.2;0.8" dur="0.6s" begin="0.4s" repeatCount="indefinite" />
            </circle>
          </>
        )}
      </svg>

      <style>{`
        @keyframes avatarFloat {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-8px); }
        }
      `}</style>
    </div>
  )
}
