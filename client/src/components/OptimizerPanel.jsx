import { useState } from 'react'
import { computeEfficientFrontier } from '../utils/efficientFrontier'

const RETURN_OPTIONS = [
  { value: 'total_return_1y', label: '1Y' },
  { value: 'total_return_3y', label: '3Y' },
  { value: 'total_return_5y', label: '5Y' },
]

function portfolioColor(idx, total) {
  const t = total > 1 ? idx / (total - 1) : 0
  const hue = Math.round(220 - t * 220) // blue → red
  return `hsl(${hue}, 72%, 48%)`
}

function pct(v, decimals = 2) {
  return `${(v * 100).toFixed(decimals)}%`
}

// --- Scatter plot ---

function ScatterPlot({ background, frontier, selectedIdx, onSelect }) {
  const W = 600
  const H = 380
  const PAD = { top: 20, right: 24, bottom: 48, left: 62 }
  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom

  const allStds = [...background, ...frontier].map(p => p.std)
  const allRets = [...background, ...frontier].map(p => p.ret)
  const stdMax = Math.max(...allStds) * 1.07
  const retSpan = Math.max(...allRets) - Math.min(...allRets) || 0.01
  const retPad = retSpan * 0.1
  const yMin = Math.min(...allRets) - retPad
  const yMax = Math.max(...allRets) + retPad

  const xScale = std => PAD.left + (std / stdMax) * plotW
  const yScale = ret => PAD.top + plotH - ((ret - yMin) / (yMax - yMin)) * plotH

  const xTicks = Array.from({ length: 6 }, (_, i) => (stdMax * i) / 5)
  const yTicks = Array.from({ length: 6 }, (_, i) => yMin + ((yMax - yMin) * i) / 5)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%' }}>
      {/* Grid */}
      {yTicks.map((t, i) => (
        <line key={i} x1={PAD.left} x2={PAD.left + plotW} y1={yScale(t)} y2={yScale(t)}
          stroke="#e5e7eb" strokeWidth="1" />
      ))}
      {xTicks.map((t, i) => (
        <line key={i} x1={xScale(t)} x2={xScale(t)} y1={PAD.top} y2={PAD.top + plotH}
          stroke="#e5e7eb" strokeWidth="1" />
      ))}

      {/* Axes */}
      <line x1={PAD.left} x2={PAD.left + plotW} y1={PAD.top + plotH} y2={PAD.top + plotH}
        stroke="#9ca3af" strokeWidth="1" />
      <line x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={PAD.top + plotH}
        stroke="#9ca3af" strokeWidth="1" />

      {/* X ticks + labels */}
      {xTicks.map((t, i) => (
        <g key={i}>
          <line x1={xScale(t)} x2={xScale(t)} y1={PAD.top + plotH} y2={PAD.top + plotH + 4}
            stroke="#9ca3af" strokeWidth="1" />
          <text x={xScale(t)} y={PAD.top + plotH + 17} textAnchor="middle" fontSize="10" fill="#6b7280">
            {pct(t, 1)}
          </text>
        </g>
      ))}

      {/* Y ticks + labels */}
      {yTicks.map((t, i) => (
        <g key={i}>
          <line x1={PAD.left - 4} x2={PAD.left} y1={yScale(t)} y2={yScale(t)}
            stroke="#9ca3af" strokeWidth="1" />
          <text x={PAD.left - 8} y={yScale(t) + 4} textAnchor="end" fontSize="10" fill="#6b7280">
            {pct(t, 1)}
          </text>
        </g>
      ))}

      {/* Axis labels */}
      <text x={PAD.left + plotW / 2} y={H - 6} textAnchor="middle" fontSize="11" fill="#374151">
        Risk (Std Dev)
      </text>
      <text
        x={14} y={PAD.top + plotH / 2}
        textAnchor="middle" fontSize="11" fill="#374151"
        transform={`rotate(-90, 14, ${PAD.top + plotH / 2})`}
      >
        Return
      </text>

      {/* Background cloud */}
      {background.map((p, i) => (
        <circle key={i} cx={xScale(p.std)} cy={yScale(p.ret)} r={2} fill="#d1d5db" opacity={0.5} />
      ))}

      {/* Frontier dots */}
      {frontier.map((p, i) => {
        const selected = selectedIdx === i
        const color = portfolioColor(i, frontier.length)
        return (
          <g key={i} style={{ cursor: 'pointer' }} onClick={() => onSelect(selected ? null : i)}>
            {selected && (
              <circle cx={xScale(p.std)} cy={yScale(p.ret)} r={13}
                fill="none" stroke={color} strokeWidth="2" opacity={0.4} />
            )}
            <circle cx={xScale(p.std)} cy={yScale(p.ret)} r={selected ? 9 : 7}
              fill={color} stroke="white" strokeWidth={selected ? 2 : 1.5} />
            <text x={xScale(p.std)} y={yScale(p.ret) + 4}
              textAnchor="middle" fontSize="8" fill="white" fontWeight="bold"
              style={{ pointerEvents: 'none' }}>
              {i + 1}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// --- Portfolio detail sidebar ---

function PortfolioDetails({ portfolio, etfs, idx, total, returnLabel }) {
  const color = portfolioColor(idx, total)
  return (
    <div className="border border-gray-200 rounded-lg p-4 w-56 flex-shrink-0">
      <div className="flex items-center space-x-2 mb-4">
        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: color }} />
        <span className="font-semibold text-gray-900">Portfolio {idx + 1}</span>
      </div>

      <div className="space-y-2 text-sm mb-5">
        <div className="flex justify-between">
          <span className="text-gray-500">{returnLabel} Return</span>
          <span className={`font-medium ${portfolio.ret >= 0 ? 'text-green-700' : 'text-red-600'}`}>
            {pct(portfolio.ret)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Std Dev</span>
          <span className="font-medium text-gray-900">{pct(portfolio.std)}</span>
        </div>
        <div className="flex justify-between items-start">
          <span className="text-gray-500">
            Sharpe Ratio
            {returnLabel !== '3Y' && (
              <span className="ml-1 text-amber-500" title="Sharpe uses 3Y std dev with a different return period — interpret with caution">⚠</span>
            )}
          </span>
          <span className="font-medium text-gray-900">{portfolio.sharpe.toFixed(3)}</span>
        </div>
      </div>

      <div className="space-y-2.5">
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Weights</div>
        {etfs.map((etf, i) => (
          <div key={etf.ticker}>
            <div className="flex justify-between text-sm mb-1">
              <span className="font-medium text-gray-700">{etf.ticker}</span>
              <span className="text-gray-600">{pct(portfolio.weights[i], 1)}</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-1.5">
              <div
                className="h-1.5 rounded-full transition-all"
                style={{ width: pct(portfolio.weights[i], 1), background: color }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// --- Portfolio table ---

function PortfolioTable({ frontier, etfs, selectedIdx, onSelect, returnLabel }) {
  const maxSharpeIdx = frontier.reduce(
    (best, p, i) => p.sharpe > frontier[best].sharpe ? i : best, 0
  )
  const minStdIdx = frontier.reduce(
    (best, p, i) => p.std < frontier[best].std ? i : best, 0
  )

  return (
    <div className="overflow-x-auto border border-gray-200 rounded-lg">
      <table className="min-w-full text-xs">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="px-3 py-2.5 text-left font-medium text-gray-500">#</th>
            <th className="px-3 py-2.5 text-right font-medium text-gray-500">{returnLabel} Return</th>
            <th className="px-3 py-2.5 text-right font-medium text-gray-500">Std Dev</th>
            <th className="px-3 py-2.5 text-right font-medium text-gray-500">
              Sharpe
              {returnLabel !== '3Y' && (
                <span className="ml-1 text-amber-500" title="Sharpe uses 3Y std dev — time period mismatch with selected return">⚠</span>
              )}
            </th>
            {etfs.map(e => (
              <th key={e.ticker} className="px-3 py-2.5 text-right font-medium text-gray-500">
                {e.ticker}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {frontier.map((p, i) => {
            const selected = selectedIdx === i
            const color = portfolioColor(i, frontier.length)
            return (
              <tr
                key={i}
                onClick={() => onSelect(selected ? null : i)}
                className={`cursor-pointer hover:bg-blue-50 transition-colors ${selected ? 'bg-blue-50' : ''}`}
              >
                <td className="px-3 py-2">
                  <div className="flex items-center space-x-1.5">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                    <span className="font-medium text-gray-700">{i + 1}</span>
                    {i === maxSharpeIdx && (
                      <span className="text-[10px] bg-amber-100 text-amber-700 px-1 py-0.5 rounded font-medium">
                        Best Sharpe
                      </span>
                    )}
                    {i === minStdIdx && (
                      <span className="text-[10px] bg-blue-100 text-blue-700 px-1 py-0.5 rounded font-medium">
                        Min Risk
                      </span>
                    )}
                  </div>
                </td>
                <td className={`px-3 py-2 text-right font-medium ${p.ret >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                  {pct(p.ret)}
                </td>
                <td className="px-3 py-2 text-right text-gray-700">{pct(p.std)}</td>
                <td className="px-3 py-2 text-right text-gray-700">{p.sharpe.toFixed(3)}</td>
                {etfs.map((e, ei) => (
                  <td key={e.ticker} className="px-3 py-2 text-right text-gray-600">
                    {pct(p.weights[ei], 1)}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// --- Main component ---

export default function OptimizerPanel({ etfs, onBack }) {
  const [returnField, setReturnField] = useState('total_return_3y')
  const [riskFreeRate, setRiskFreeRate] = useState(4.5)
  const [results, setResults] = useState(null)
  const [selectedIdx, setSelectedIdx] = useState(null)
  const [computing, setComputing] = useState(false)

  const returnLabel = RETURN_OPTIONS.find(o => o.value === returnField)?.label ?? '3Y'

  const validEtfs = etfs.filter(e => e[returnField] != null && e.std_dev_3y != null)
  const excludedEtfs = etfs.filter(e => e[returnField] == null || e.std_dev_3y == null)

  const handleRun = () => {
    if (validEtfs.length < 2) return
    setComputing(true)
    setResults(null)
    setSelectedIdx(null)
    // Allow the UI to repaint before the CPU-heavy computation
    setTimeout(() => {
      try {
        const r = computeEfficientFrontier(validEtfs, returnField, riskFreeRate / 100)
        setResults(r)
      } finally {
        setComputing(false)
      }
    }, 10)
  }

  const handleReturnFieldChange = (value) => {
    setReturnField(value)
    setResults(null)
    setSelectedIdx(null)
  }

  const selectedPortfolio = results && selectedIdx !== null ? results.frontier[selectedIdx] : null

  return (
    <div>
      {/* Header */}
      <div className="flex items-center space-x-4 mb-5">
        <button
          onClick={onBack}
          className="text-sm text-gray-500 hover:text-gray-700 flex items-center space-x-1"
        >
          <span>←</span>
          <span>Back to Research</span>
        </button>
        <h2 className="text-lg font-semibold text-gray-900">Portfolio Optimizer</h2>
        <span className="text-sm text-gray-400">
          {etfs.map(e => e.ticker).join(', ')}
        </span>
      </div>

      {excludedEtfs.length > 0 && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md text-sm text-yellow-800">
          Missing {returnLabel} return or std dev data for{' '}
          <span className="font-medium">{excludedEtfs.map(e => e.ticker).join(', ')}</span>
          {' '}— excluded from optimization.
          {validEtfs.length < 2 && (
            <span className="font-medium"> Need at least 2 ETFs with complete data.</span>
          )}
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-6 mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
        <div className="flex items-center space-x-3">
          <span className="text-sm font-medium text-gray-700">Return Period</span>
          <div className="flex rounded-md border border-gray-300 overflow-hidden">
            {RETURN_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => handleReturnFieldChange(opt.value)}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  returnField === opt.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-sm font-medium text-gray-700">Risk-Free Rate</span>
          <div className="flex items-center space-x-1">
            <input
              type="number"
              value={riskFreeRate}
              onChange={e => setRiskFreeRate(Number(e.target.value))}
              step="0.1"
              min="0"
              max="20"
              className="w-16 px-2 py-1.5 border border-gray-300 rounded-md text-sm text-right focus:ring-blue-500 focus:border-blue-500"
            />
            <span className="text-sm text-gray-500">%</span>
          </div>
        </div>

        <button
          onClick={handleRun}
          disabled={computing || validEtfs.length < 2}
          className="px-5 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
        >
          {computing ? 'Computing…' : 'Run Optimizer'}
        </button>

        <span className="text-xs text-gray-400">5,000 Monte Carlo simulations</span>
      </div>

      {results && (
        <>
          {/* Chart + details */}
          <div className="flex space-x-4 mb-5">
            <div className="flex-1 min-w-0">
              <ScatterPlot
                background={results.background}
                frontier={results.frontier}
                selectedIdx={selectedIdx}
                onSelect={setSelectedIdx}
              />
            </div>
            {selectedPortfolio ? (
              <PortfolioDetails
                portfolio={selectedPortfolio}
                etfs={validEtfs}
                idx={selectedIdx}
                total={results.frontier.length}
                returnLabel={returnLabel}
              />
            ) : (
              <div className="w-56 flex-shrink-0 flex items-center justify-center text-sm text-gray-400 text-center border border-dashed border-gray-200 rounded-lg leading-relaxed">
                Click a portfolio<br />on the chart or table<br />to see details
              </div>
            )}
          </div>

          {/* Table */}
          <PortfolioTable
            frontier={results.frontier}
            etfs={validEtfs}
            selectedIdx={selectedIdx}
            onSelect={setSelectedIdx}
            returnLabel={returnLabel}
          />

          <p className="mt-3 text-xs text-gray-400">
            Pairwise correlations estimated via downside capture ratios (single-factor S&P 500 proxy).
            Returns and standard deviations from Morningstar. This is illustrative, not financial advice.
            {returnLabel !== '3Y' && (
              <span className="text-amber-500"> ⚠ Sharpe ratio uses {returnLabel} return with 3Y std dev — time periods don't match. Switch to 3Y return for a more meaningful Sharpe.</span>
            )}
          </p>
        </>
      )}
    </div>
  )
}
