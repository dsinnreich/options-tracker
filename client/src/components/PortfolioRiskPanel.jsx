const fmtPct = (n) => (n == null || isNaN(n) ? '—' : (n * 100).toFixed(2) + '%')
const fmtNum = (n) => (n == null || isNaN(n) ? '—' : n.toFixed(2))

// One metric tile. In what-if mode it shows current → proposed plus the delta,
// coloured by whether the move is an improvement (lower std dev is better,
// higher return and Sharpe are better).
function StatTile({ label, sub, value, whatIfValue, format, higherIsBetter }) {
  const showDelta = whatIfValue != null && value != null
  const delta = showDelta ? whatIfValue - value : null
  const better = delta == null || Math.abs(delta) < 1e-9
    ? null
    : (higherIsBetter ? delta > 0 : delta < 0)

  return (
    <div className="flex-1 min-w-[150px] px-4 py-3 bg-gray-50 rounded-lg border border-gray-200">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
        {label} <span className="font-normal text-gray-400">{sub}</span>
      </div>
      <div className="mt-1 flex items-baseline gap-2 flex-wrap">
        <span className={`text-xl font-semibold ${showDelta ? 'text-gray-400 line-through decoration-gray-300' : 'text-gray-900'}`}>
          {format(value)}
        </span>
        {showDelta && (
          <>
            <span className="text-gray-300">→</span>
            <span className="text-xl font-semibold text-gray-900">{format(whatIfValue)}</span>
          </>
        )}
      </div>
      {showDelta && (
        <div className={`mt-0.5 text-sm font-medium ${
          better === null ? 'text-gray-400' : better ? 'text-green-700' : 'text-red-600'
        }`}>
          {delta > 0 ? '+' : ''}{format(delta)}
        </div>
      )}
    </div>
  )
}

import { useState } from 'react'
import FrontierChart from './FrontierChart'

// Compact "A, B, C +2 more" list so a long exclusion list can't swamp the panel.
function SymbolList({ symbols, max = 8 }) {
  return (
    <>
      {symbols.slice(0, max).join(', ')}
      {symbols.length > max && ` +${symbols.length - max} more`}
    </>
  )
}

export default function PortfolioRiskPanel({ risk, researchWatchlist }) {
  const {
    riskFreeRate, setRiskFreeRate,
    corrLoading, usingRealCorrelations, corrInfo,
    current, whatIf,
    whatIfMode, enterWhatIf, cancelWhatIf, resetWhatIf,
    targets, setTarget, totalTarget, targetValid,
    buckets,
    frontier, bestSharpe, loadFrontierPortfolio,
    frontierBand, setFrontierBand,
    cma, setCma, resetCma, seedCmaFromTrailing, cmaCount, trailingByBucket,
  } = risk

  const [showFrontier, setShowFrontier] = useState(false)
  const [showCma, setShowCma] = useState(false)

  if (!current) {
    return (
      <div className="mb-5 px-4 py-3 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-500">
        Portfolio risk metrics need Std Dev and 3Y Return for at least one holding — import a
        Morningstar XLSX in the ETF Research tab to populate them.
      </div>
    )
  }

  const incomplete = current.coverage < 0.999

  return (
    <div className="mb-5 rounded-lg border border-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap px-4 py-2.5 bg-gray-50 border-b border-gray-200 rounded-t-lg">
        <div className="font-semibold text-gray-800">Portfolio Risk &amp; Return</div>
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-600">
            Risk-free rate:
            <input
              type="number" step="0.1" value={riskFreeRate}
              onChange={e => setRiskFreeRate(parseFloat(e.target.value) || 0)}
              className="ml-2 w-20 border rounded-md px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
            <span className="ml-1 text-gray-400">%</span>
          </label>
          {whatIfMode ? (
            <>
              <button onClick={resetWhatIf}
                className="px-3 py-1 bg-gray-100 text-gray-700 text-sm rounded hover:bg-gray-200">
                Reset
              </button>
              <button onClick={cancelWhatIf}
                className="px-3 py-1 bg-gray-100 text-gray-700 text-sm rounded hover:bg-gray-200">
                Exit What-If
              </button>
            </>
          ) : (
            <button onClick={enterWhatIf}
              className="px-3 py-1 bg-blue-50 text-blue-700 text-sm rounded hover:bg-blue-100 border border-blue-200">
              What-If Weights
            </button>
          )}
        </div>
      </div>

      <div className="p-4">
        {/* Metric tiles */}
        <div className="flex gap-3 flex-wrap">
          <StatTile label="Std Dev" sub="3Y" value={current.std} whatIfValue={whatIf?.std}
                    format={fmtPct} higherIsBetter={false} />
          <StatTile label="Sharpe" sub="3Y" value={current.sharpe} whatIfValue={whatIf?.sharpe}
                    format={fmtNum} higherIsBetter={true} />
          <StatTile label="Return" sub="3Y" value={current.ret} whatIfValue={whatIf?.ret}
                    format={fmtPct} higherIsBetter={true} />
        </div>

        {/* What-if weight editor */}
        {whatIfMode && (
          <div className="mt-4 border-t border-gray-200 pt-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold text-gray-700">What-If Weights</div>
              <span className={`text-sm font-medium ${targetValid ? 'text-green-700' : 'text-red-600'}`}>
                Total: {totalTarget.toFixed(2)}%
                {!targetValid && ' ← must equal 100%'}
              </span>
            </div>
            <div className="grid gap-x-6 gap-y-1 md:grid-cols-2 xl:grid-cols-3">
              {buckets.map(b => {
                const value = targets[b.styleKey] ?? ''
                const changed = Math.abs((parseFloat(value) || 0) - b.currentPct) > 0.005
                return (
                  <div key={b.styleKey} className="flex items-center gap-2 py-0.5">
                    <span className="flex-1 text-sm text-gray-700 truncate" title={`${b.assetClass} — ${b.style}`}>
                      <span className="text-gray-400">{b.assetClass}</span>
                      <span className="mx-1 text-gray-300">›</span>
                      {b.style}
                    </span>
                    <span className="text-xs text-gray-400 tabular-nums w-14 text-right">
                      {b.currentPct.toFixed(2)}%
                    </span>
                    <input
                      type="number" step="0.5" value={value}
                      onChange={e => setTarget(b.styleKey, e.target.value)}
                      className={`w-20 border rounded-md px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-blue-400 ${
                        changed ? 'border-blue-300 bg-blue-50' : ''
                      }`}
                    />
                  </div>
                )
              })}
            </div>
            <p className="text-xs text-gray-400 mt-3">
              Weights are set per asset class and style. Holdings within a bucket keep their
              current relative mix, so a bucket&apos;s own risk is unchanged — only the blend
              across buckets moves.
            </p>
          </div>
        )}

        {/* Capital market assumptions */}
        <div className="mt-4 border-t border-gray-200 pt-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <button
              onClick={() => setShowCma(v => !v)}
              className="text-sm font-semibold text-gray-700 hover:text-gray-900 flex items-center gap-1.5"
            >
              <span className="text-gray-400 text-xs">{showCma ? '▼' : '▶'}</span>
              Capital Market Assumptions
              {cmaCount > 0 ? (
                <span className="ml-1 px-1.5 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700">
                  {cmaCount} override{cmaCount === 1 ? '' : 's'} active
                </span>
              ) : (
                <span className="font-normal text-gray-400">(using trailing 3Y)</span>
              )}
            </button>
            {showCma && (
              <div className="flex items-center gap-2">
                <button onClick={seedCmaFromTrailing}
                  className="px-3 py-1 bg-gray-100 text-gray-700 text-sm rounded hover:bg-gray-200">
                  Fill from trailing
                </button>
                <button onClick={resetCma} disabled={cmaCount === 0}
                  className="px-3 py-1 bg-gray-100 text-gray-700 text-sm rounded hover:bg-gray-200 disabled:opacity-50">
                  Clear all
                </button>
              </div>
            )}
          </div>

          {showCma && (
            <div className="mt-2">
              <div className="grid gap-x-6 gap-y-1 md:grid-cols-2 xl:grid-cols-3">
                {buckets.map(b => {
                  const trailing = trailingByBucket[b.styleKey]
                  const value = cma[b.styleKey] ?? ''
                  const overridden = value !== '' && !isNaN(parseFloat(value))
                  // No trailing figure means no covered holding in this bucket,
                  // so it contributes nothing to the risk model either way.
                  const modelled = trailing != null
                  return (
                    <div key={b.styleKey} className="flex items-center gap-2 py-0.5">
                      <span className={`flex-1 text-sm truncate ${modelled ? 'text-gray-700' : 'text-gray-300'}`}
                            title={`${b.assetClass} — ${b.style}`}>
                        <span className="text-gray-400">{b.assetClass}</span>
                        <span className="mx-1 text-gray-300">›</span>
                        {b.style}
                      </span>
                      <span className="text-xs text-gray-400 tabular-nums w-14 text-right"
                            title="Trailing 3Y return">
                        {modelled ? fmtPct(trailing) : '—'}
                      </span>
                      <input
                        type="number" step="0.5" value={value} disabled={!modelled}
                        placeholder={modelled ? (trailing * 100).toFixed(2) : '—'}
                        onChange={e => setCma(b.styleKey, e.target.value)}
                        className={`w-20 border rounded-md px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-purple-400 disabled:bg-gray-50 disabled:text-gray-300 ${
                          overridden ? 'border-purple-300 bg-purple-50' : ''
                        }`}
                      />
                    </div>
                  )
                })}
              </div>
              <p className="text-xs text-gray-400 mt-3">
                Your expected annual return per bucket, replacing the trailing 3Y figure shown to
                the left of each box. Leave a box empty to keep using trailing. Volatility and
                correlations stay measured — only returns become assumptions, because mean returns
                are by far the least reliable input to estimate from history, and the one the
                optimizer is most sensitive to. Overrides feed the tiles, the table subtotals and
                the efficient frontier. They are saved to your account and shared across all your
                portfolios — an expectation for an asset class doesn&apos;t depend on which account
                holds it.
              </p>
            </div>
          )}
        </div>

        {/* Efficient frontier */}
        {frontier && frontier.frontier.length > 0 && (
          <div className="mt-4 border-t border-gray-200 pt-3">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <button
                onClick={() => setShowFrontier(v => !v)}
                className="text-sm font-semibold text-gray-700 hover:text-gray-900 flex items-center gap-1.5"
              >
                <span className="text-gray-400 text-xs">{showFrontier ? '▼' : '▶'}</span>
                Efficient Frontier
                <span className="font-normal text-gray-400">
                  ({frontier.frontier.length} portfolios)
                </span>
              </button>
              {showFrontier && (
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  Allow each bucket to move ±
                  <input
                    type="range" min="1" max="50" step="1" value={frontierBand}
                    onChange={e => setFrontierBand(Number(e.target.value))}
                    className="w-32"
                  />
                  <span className="tabular-nums w-10">{frontierBand}pp</span>
                </label>
              )}
            </div>

            {showFrontier && (
              <div className="mt-2">
                <FrontierChart
                  frontier={frontier}
                  current={frontier.current}
                  whatIf={whatIfMode ? whatIf : null}
                  bestSharpe={bestSharpe}
                  onSelect={loadFrontierPortfolio}
                />
                <p className="text-xs text-gray-400 mt-2">
                  Each point is the lowest-risk mix of your asset class · style buckets for its
                  level of return, with every bucket held within ±{frontierBand}pp of its current
                  weight. Holdings inside a bucket keep their current relative mix. The band is
                  measured from your current weights, so the curve stays put as you edit the
                  What-If — only the ◆ marker moves. Like the rest of this panel, the frontier is
                  ex-post: it is the optimum of the trailing window, not a forecast.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Method + data-quality footnote */}
        <div className="mt-3 text-xs text-gray-400 space-y-1">
          <p>
            Std Dev is correlation-adjusted: σₚ = √(ΣΣ wᵢwⱼσᵢσⱼρᵢⱼ), not a weighted average of
            holding std devs. Sharpe = (return − risk-free) ÷ std dev. σ is Morningstar 3Y;
            return is {cmaCount > 0 ? 'your capital market assumptions where set, otherwise Morningstar 3Y' : 'Morningstar 3Y'};{' '}
            {corrLoading
              ? 'fetching correlations…'
              : usingRealCorrelations
                ? <>ρ from {corrInfo.tradingDays} trading days of daily price history ({corrInfo.from} – {corrInfo.to}){corrInfo.realCoverage < 0.999 && `, covering ${(corrInfo.realCoverage * 100).toFixed(0)}% of risky weight — remainder uses the downside-capture proxy`}.</>
                : 'ρ estimated via downside capture ratios (single-factor S&P 500 proxy).'}
            {' '}Cash and liquidity holdings are treated as risk-free.
          </p>
          {cmaCount > 0 ? (
            <p>
              Returns are forward-looking where you have set an assumption; σ and ρ remain ex-post
              (trailing 3Y and 1Y daily). Sharpe therefore mixes a forward numerator with a
              historical denominator — reasonable, since volatility persists far better than mean
              returns do, but worth remembering when reading the figure.
            </p>
          ) : (
            <p>
              All figures are ex-post: trailing realized statistics (3Y for σ and return, 1Y of
              daily prices for ρ), not a forecast. The What-If shows what your risk and return
              would have been at these weights over that trailing window — not a prediction of
              what they will be going forward. Set Capital Market Assumptions above to substitute
              your own forward return estimates.
            </p>
          )}
          {incomplete && (
            <div className="text-amber-600 space-y-0.5">
              <p>Based on {(current.coverage * 100).toFixed(1)}% of portfolio value.</p>
              {current.excludedNoResearch.length > 0 && (
                <p>
                  No row in the{' '}
                  <span className="font-medium">{researchWatchlist?.name ?? 'selected'}</span>{' '}
                  watchlist: <SymbolList symbols={current.excludedNoResearch} />. Switching
                  watchlist, or adding these to it, will bring them in.
                </p>
              )}
              {current.excludedMissingFields.length > 0 && (
                <p>
                  In the watchlist but missing Std Dev or 3Y Return:{' '}
                  <SymbolList symbols={current.excludedMissingFields} />.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
