import { useState } from 'react'

// Risk/return scatter for the portfolio's bounded efficient frontier.
//
// Follows the inline-SVG idiom of OptimizerPanel's ScatterPlot (same PAD/scale
// structure) rather than sharing a component with it — that panel works, and the
// two charts differ enough (50 points as a curve, Current/What-If markers,
// hover tooltip) that unifying them would abstract more than it saves.

const W = 640
const H = 400
const PAD = { top: 16, right: 20, bottom: 46, left: 62 }
const plotW = W - PAD.left - PAD.right
const plotH = H - PAD.top - PAD.bottom

const pct = (v, d = 1) => `${(v * 100).toFixed(d)}%`

export default function FrontierChart({ frontier, current, whatIf, bestSharpe, onSelect }) {
  const [hover, setHover] = useState(null)

  const points = frontier?.frontier ?? []
  if (points.length === 0) return null

  // Scale across everything plotted so no marker falls outside the axes.
  const marks = [current, whatIf].filter(Boolean)
  const stds = [...points.map(p => p.std), ...marks.map(m => m.std)]
  const rets = [...points.map(p => p.ret), ...marks.map(m => m.ret)]

  const xMin = Math.max(0, Math.min(...stds) - (Math.max(...stds) - Math.min(...stds) || 0.01) * 0.15)
  const xMax = Math.max(...stds) + (Math.max(...stds) - Math.min(...stds) || 0.01) * 0.15
  const retSpan = Math.max(...rets) - Math.min(...rets) || 0.01
  const yMin = Math.min(...rets) - retSpan * 0.15
  const yMax = Math.max(...rets) + retSpan * 0.15

  const xScale = s => PAD.left + ((s - xMin) / (xMax - xMin)) * plotW
  const yScale = r => PAD.top + plotH - ((r - yMin) / (yMax - yMin)) * plotH

  const xTicks = Array.from({ length: 6 }, (_, i) => xMin + ((xMax - xMin) * i) / 5)
  const yTicks = Array.from({ length: 6 }, (_, i) => yMin + ((yMax - yMin) * i) / 5)

  const curvePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(p.std)} ${yScale(p.ret)}`).join(' ')
  const tip = hover ?? null

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%' }}>
        {/* Grid */}
        {yTicks.map((t, i) => (
          <line key={`gy${i}`} x1={PAD.left} x2={PAD.left + plotW} y1={yScale(t)} y2={yScale(t)}
                stroke="#e5e7eb" strokeWidth="1" />
        ))}
        {xTicks.map((t, i) => (
          <line key={`gx${i}`} x1={xScale(t)} x2={xScale(t)} y1={PAD.top} y2={PAD.top + plotH}
                stroke="#e5e7eb" strokeWidth="1" />
        ))}

        {/* Axes */}
        <line x1={PAD.left} x2={PAD.left + plotW} y1={PAD.top + plotH} y2={PAD.top + plotH}
              stroke="#9ca3af" strokeWidth="1" />
        <line x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={PAD.top + plotH}
              stroke="#9ca3af" strokeWidth="1" />

        {xTicks.map((t, i) => (
          <g key={`tx${i}`}>
            <line x1={xScale(t)} x2={xScale(t)} y1={PAD.top + plotH} y2={PAD.top + plotH + 4}
                  stroke="#9ca3af" strokeWidth="1" />
            <text x={xScale(t)} y={PAD.top + plotH + 17} textAnchor="middle" fontSize="10" fill="#6b7280">
              {pct(t)}
            </text>
          </g>
        ))}
        {yTicks.map((t, i) => (
          <g key={`ty${i}`}>
            <line x1={PAD.left - 4} x2={PAD.left} y1={yScale(t)} y2={yScale(t)}
                  stroke="#9ca3af" strokeWidth="1" />
            <text x={PAD.left - 8} y={yScale(t) + 4} textAnchor="end" fontSize="10" fill="#6b7280">
              {pct(t)}
            </text>
          </g>
        ))}

        <text x={PAD.left + plotW / 2} y={H - 6} textAnchor="middle" fontSize="11" fill="#374151">
          Risk (Std Dev)
        </text>
        <text x={14} y={PAD.top + plotH / 2} textAnchor="middle" fontSize="11" fill="#374151"
              transform={`rotate(-90, 14, ${PAD.top + plotH / 2})`}>
          Return
        </text>

        {/* Frontier curve — a line with small dots reads far better than 50
            numbered circles, which would overlap into noise. */}
        <path d={curvePath} fill="none" stroke="#2563eb" strokeWidth="2" opacity={0.85} />
        {points.map((p, i) => {
          const active = hover?.kind === 'frontier' && hover.i === i
          return (
            <circle
              key={i} cx={xScale(p.std)} cy={yScale(p.ret)} r={active ? 6 : 3.2}
              fill={active ? '#1d4ed8' : '#3b82f6'} stroke="white" strokeWidth={active ? 2 : 1}
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHover({ kind: 'frontier', i, p })}
              onMouseLeave={() => setHover(null)}
              onClick={() => onSelect?.(p)}
            />
          )
        })}

        {/* Tangency (max-Sharpe) portfolio */}
        {bestSharpe && (
          <circle cx={xScale(bestSharpe.std)} cy={yScale(bestSharpe.ret)} r={9}
                  fill="none" stroke="#16a34a" strokeWidth="2" opacity={0.9}
                  style={{ pointerEvents: 'none' }} />
        )}

        {/* Current portfolio — star */}
        {current && (
          <g onMouseEnter={() => setHover({ kind: 'current', p: current })}
             onMouseLeave={() => setHover(null)} style={{ cursor: 'default' }}>
            <circle cx={xScale(current.std)} cy={yScale(current.ret)} r={11} fill="transparent" />
            <text x={xScale(current.std)} y={yScale(current.ret) + 6} textAnchor="middle"
                  fontSize="19" fill="#111827" style={{ pointerEvents: 'none' }}>★</text>
          </g>
        )}

        {/* What-If portfolio — diamond, only while What-If is active */}
        {whatIf && (
          <g onMouseEnter={() => setHover({ kind: 'whatif', p: whatIf })}
             onMouseLeave={() => setHover(null)} style={{ cursor: 'default' }}>
            <circle cx={xScale(whatIf.std)} cy={yScale(whatIf.ret)} r={11} fill="transparent" />
            <text x={xScale(whatIf.std)} y={yScale(whatIf.ret) + 6} textAnchor="middle"
                  fontSize="17" fill="#d97706" style={{ pointerEvents: 'none' }}>◆</text>
          </g>
        )}

        {/* Tooltip */}
        {tip && (() => {
          const bx = xScale(tip.p.std), by = yScale(tip.p.ret)
          const boxW = 132, boxH = 50
          const left = bx + boxW + 14 > W ? bx - boxW - 12 : bx + 12
          const top = Math.max(PAD.top, Math.min(by - boxH / 2, PAD.top + plotH - boxH))
          const label = tip.kind === 'current' ? 'Current'
            : tip.kind === 'whatif' ? 'What-If'
              : `Frontier #${tip.i + 1}`
          return (
            <g style={{ pointerEvents: 'none' }}>
              <rect x={left} y={top} width={boxW} height={boxH} rx={4}
                    fill="white" stroke="#d1d5db" strokeWidth="1" opacity={0.97} />
              <text x={left + 8} y={top + 15} fontSize="10" fontWeight="bold" fill="#111827">{label}</text>
              <text x={left + 8} y={top + 29} fontSize="10" fill="#4b5563">
                Ret {pct(tip.p.ret, 2)} · SD {pct(tip.p.std, 2)}
              </text>
              <text x={left + 8} y={top + 43} fontSize="10" fill="#4b5563">
                Sharpe {tip.p.sharpe == null ? '—' : tip.p.sharpe.toFixed(2)}
              </text>
            </g>
          )
        })()}
      </svg>

      {/* Legend */}
      <div className="flex items-center gap-4 flex-wrap text-xs text-gray-500 mt-1 px-1">
        <span className="flex items-center gap-1"><span className="text-blue-600 text-base leading-none">—</span> Efficient frontier</span>
        <span className="flex items-center gap-1"><span className="text-gray-900">★</span> Current</span>
        <span className="flex items-center gap-1"><span className="text-amber-600">◆</span> What-If</span>
        <span className="flex items-center gap-1"><span className="text-green-600">○</span> Max Sharpe</span>
        <span className="text-gray-400">· click a frontier point to load its weights</span>
      </div>
    </div>
  )
}
