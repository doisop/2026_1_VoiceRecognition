/**
 * PitchGraph — Canvas-based pitch contour visualization
 *
 * Overlays user pitch (blue) and reference pitch (orange dashed) on the same
 * time axis. Divergent regions are highlighted in red.
 */
import { useEffect, useRef } from 'react'

interface Props {
  contourUser: number[]
  contourRef?: number[] | null
  divergentRegions?: [number, number][]
}

const PAD = { top: 18, bottom: 28, left: 10, right: 10 }

export default function PitchGraph({
  contourUser,
  contourRef,
  divergentRegions = [],
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const render = () => {
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      // Match backing-store pixels to CSS size * DPR to avoid blurry upscaling.
      const rect = canvas.getBoundingClientRect()
      const cssW = Math.max(1, Math.round(rect.width || 360))
      const cssH = Math.max(1, Math.round(rect.height || 160))
      const dpr = window.devicePixelRatio || 1
      const pixelW = Math.max(1, Math.round(cssW * dpr))
      const pixelH = Math.max(1, Math.round(cssH * dpr))

      if (canvas.width !== pixelW || canvas.height !== pixelH) {
        canvas.width = pixelW
        canvas.height = pixelH
      }
      canvas.style.width = `${cssW}px`
      canvas.style.height = `${cssH}px`

      // Draw in CSS pixel coordinates while rendering at device resolution.
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const W = cssW
      const H = cssH

      // Background
      ctx.fillStyle = '#0f172a'
      ctx.fillRect(0, 0, W, H)

      const allVoiced = [
        ...contourUser,
        ...(contourRef ?? []),
      ].filter((v) => v > 0)

      if (allVoiced.length === 0) {
        ctx.fillStyle = '#475569'
        ctx.font = '12px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText('음성 데이터 없음', W / 2, H / 2)
        return
      }

      const minF = Math.min(...allVoiced) * 0.92
      const maxF = Math.max(...allVoiced) * 1.08
      const plotW = W - PAD.left - PAD.right
      const plotH = H - PAD.top - PAD.bottom

      const toX = (i: number, len: number) =>
        PAD.left + (i / Math.max(len - 1, 1)) * plotW
      const toY = (f: number) =>
        PAD.top + (1 - (f - minF) / (maxF - minF)) * plotH

      // Grid lines (3 horizontal)
      ctx.strokeStyle = 'rgba(255,255,255,0.07)'
      ctx.lineWidth = 1
      for (let k = 0; k <= 2; k++) {
        const y = PAD.top + (k / 2) * plotH
        ctx.beginPath()
        ctx.moveTo(PAD.left, y)
        ctx.lineTo(W - PAD.right, y)
        ctx.stroke()
      }

      // Divergent region highlights
      for (const [s, e] of divergentRegions) {
        const x1 = toX(s, contourUser.length)
        const x2 = toX(e, contourUser.length)
        ctx.fillStyle = 'rgba(239,68,68,0.18)'
        ctx.fillRect(x1, PAD.top, Math.max(x2 - x1, 4), plotH)
      }

      // Reference contour (orange, dashed)
      if (contourRef && contourRef.length > 0) {
        ctx.strokeStyle = '#fb923c'
        ctx.lineWidth = 1.8
        ctx.setLineDash([5, 4])
        drawLine(ctx, contourRef, toX, toY)
        ctx.setLineDash([])
      }

      // User contour (blue, solid)
      ctx.strokeStyle = '#60a5fa'
      ctx.lineWidth = 2.5
      drawLine(ctx, contourUser, toX, toY)

      // F0 range labels
      ctx.fillStyle = '#94a3b8'
      ctx.font = '9px sans-serif'
      ctx.textAlign = 'right'
      ctx.fillText(`${Math.round(maxF)}Hz`, PAD.left - 2, PAD.top + 4)
      ctx.fillText(`${Math.round(minF)}Hz`, PAD.left - 2, PAD.top + plotH)

      // Legend
      const legendY = H - 8
      ctx.font = '10px sans-serif'
      ctx.textAlign = 'left'

      ctx.strokeStyle = '#60a5fa'
      ctx.lineWidth = 2
      ctx.setLineDash([])
      ctx.beginPath()
      ctx.moveTo(PAD.left, legendY - 3)
      ctx.lineTo(PAD.left + 18, legendY - 3)
      ctx.stroke()
      ctx.fillStyle = '#60a5fa'
      ctx.fillText('내 발음', PAD.left + 22, legendY)

      if (contourRef) {
        ctx.strokeStyle = '#fb923c'
        ctx.lineWidth = 1.8
        ctx.setLineDash([4, 3])
        ctx.beginPath()
        ctx.moveTo(PAD.left + 80, legendY - 3)
        ctx.lineTo(PAD.left + 98, legendY - 3)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.fillStyle = '#fb923c'
        ctx.fillText('기준 음성', PAD.left + 102, legendY)
      }
    }

    render()
    const ro = new ResizeObserver(render)
    ro.observe(canvas)
    window.addEventListener('resize', render)

    return () => {
      ro.disconnect()
      window.removeEventListener('resize', render)
    }
  }, [contourUser, contourRef, divergentRegions])

  return (
    <canvas
      ref={canvasRef}
      width={360}
      height={160}
      className="w-full rounded-xl"
    />
  )
}

function drawLine(
  ctx: CanvasRenderingContext2D,
  contour: number[],
  toX: (i: number, len: number) => number,
  toY: (f: number) => number
) {
  let penDown = false
  ctx.beginPath()
  for (let i = 0; i < contour.length; i++) {
    if (contour[i] <= 0) {
      penDown = false
      continue
    }
    const x = toX(i, contour.length)
    const y = toY(contour[i])
    if (!penDown) {
      ctx.moveTo(x, y)
      penDown = true
    } else {
      ctx.lineTo(x, y)
    }
  }
  ctx.stroke()
}
