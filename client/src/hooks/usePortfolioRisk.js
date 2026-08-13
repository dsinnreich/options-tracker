import { useState, useMemo, useEffect } from 'react'
import {
  buildRiskRows, isCovered, makeCorrLookup, applyWhatIfWeights,
  computeRisk, realCorrelationCoverage, buildBucketModel,
} from '../utils/portfolioRisk'
import { computeBoundedFrontier } from '../utils/efficientFrontier'

const RF_KEY = 'analysisRiskFreeRate'
const DEFAULT_RF = 4.5
const BAND_KEY = 'analysisFrontierBand'
const DEFAULT_BAND = 15
const N_FRONTIER = 50

// Portfolio-level Sharpe / std dev for the Analysis tab, plus the what-if
// weight editor state. Volatility and return come from the Morningstar 3Y
// research fields (so they tie out to the Std Dev / Return columns in the
// table); correlations come from 1Y of daily price history.
export default function usePortfolioRisk(pivot, researchByTicker, proxyBySymbol) {
  const [riskFreeRate, setRiskFreeRateState] = useState(() => {
    const saved = localStorage.getItem(RF_KEY)
    return saved != null ? Number(saved) : DEFAULT_RF
  })
  const setRiskFreeRate = (v) => {
    setRiskFreeRateState(v)
    localStorage.setItem(RF_KEY, String(v))
  }

  const [frontierBand, setFrontierBandState] = useState(() => {
    const saved = localStorage.getItem(BAND_KEY)
    return saved != null ? Number(saved) : DEFAULT_BAND
  })
  const setFrontierBand = (v) => {
    setFrontierBandState(v)
    localStorage.setItem(BAND_KEY, String(v))
  }

  const [corrData, setCorrData] = useState(null)
  const [corrLoading, setCorrLoading] = useState(false)

  const [whatIfMode, setWhatIfMode] = useState(false)
  const [targets, setTargets] = useState({})

  const rows = useMemo(
    () => buildRiskRows(pivot, researchByTicker, proxyBySymbol),
    [pivot, researchByTicker, proxyBySymbol]
  )

  const rf = riskFreeRate / 100

  // Tickers worth requesting price history for: risky holdings we can otherwise
  // price. Cash contributes no variance, so its correlations are irrelevant.
  const priceTickers = useMemo(() => {
    const set = new Set()
    for (const r of rows) {
      if (!r.isCash && isCovered(r)) set.add(r.priceTicker)
    }
    return [...set].sort()
  }, [rows])

  const tickerKey = priceTickers.join(',')

  useEffect(() => {
    if (priceTickers.length < 2) {
      setCorrData(null)
      return
    }
    let cancelled = false
    setCorrLoading(true)

    fetch('/api/prices/correlations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ symbols: priceTickers }),
    })
      .then(resp => (resp.ok ? resp.json() : null))
      .then(data => { if (!cancelled) setCorrData(data?.matrix ? data : null) })
      // Network or API failure — the per-pair proxy fallback covers it.
      .catch(() => { if (!cancelled) setCorrData(null) })
      .finally(() => { if (!cancelled) setCorrLoading(false) })

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickerKey])

  const corrLookup = useMemo(() => makeCorrLookup(rows, corrData), [rows, corrData])

  const currentWeights = useMemo(() => rows.map(r => r.weight), [rows])

  // Distinct asset-class|style buckets, in portfolio order — the rows of the
  // what-if editor.
  const buckets = useMemo(() => {
    const byKey = new Map()
    for (const r of rows) {
      if (!byKey.has(r.styleKey)) {
        byKey.set(r.styleKey, {
          styleKey: r.styleKey, assetClass: r.assetClass, style: r.style, currentPct: 0,
        })
      }
      byKey.get(r.styleKey).currentPct += r.weight * 100
    }
    return [...byKey.values()]
  }, [rows])

  const current = useMemo(
    () => computeRisk(rows, currentWeights, corrLookup, rf),
    [rows, currentWeights, corrLookup, rf]
  )

  const whatIfWeights = useMemo(() => {
    if (!whatIfMode) return null
    const numeric = {}
    for (const [k, v] of Object.entries(targets)) {
      const n = parseFloat(v)
      if (!isNaN(n)) numeric[k] = n
    }
    return applyWhatIfWeights(rows, numeric)
  }, [whatIfMode, targets, rows])

  const whatIf = useMemo(
    () => (whatIfWeights ? computeRisk(rows, whatIfWeights, corrLookup, rf) : null),
    [rows, whatIfWeights, corrLookup, rf]
  )

  // Per-group risk for the table's subtotal rows, always on current weights.
  // Within-bucket mix is fixed under a what-if, so style-level risk is invariant
  // anyway; asset-class rows stay on current weights to match the Current %
  // column beside them.
  const riskByGroup = useMemo(() => {
    const styleIdx = {}, acIdx = {}
    rows.forEach((r, i) => {
      ;(styleIdx[r.styleKey] ||= []).push(i)
      ;(acIdx[r.assetClass] ||= []).push(i)
    })
    const byStyle = {}, byAssetClass = {}
    for (const [k, idx] of Object.entries(styleIdx)) {
      byStyle[k] = computeRisk(rows, currentWeights, corrLookup, rf, idx)
    }
    for (const [k, idx] of Object.entries(acIdx)) {
      byAssetClass[k] = computeRisk(rows, currentWeights, corrLookup, rf, idx)
    }
    return { byStyle, byAssetClass }
  }, [rows, currentWeights, corrLookup, rf])

  const realCoverage = useMemo(
    () => realCorrelationCoverage(rows, currentWeights, corrData),
    [rows, currentWeights, corrData]
  )

  // --- Efficient frontier over the asset-class|style buckets ---------------
  // Collapsing to buckets is exact (see buildBucketModel) and drops each draw
  // from N^2 to K^2, so the whole frontier recomputes in a memo without a Run
  // button — the correlations it needs are already fetched for the panel.
  const bucketModel = useMemo(
    () => buildBucketModel(rows, currentWeights, corrLookup, rf),
    [rows, currentWeights, corrLookup, rf]
  )

  const frontier = useMemo(() => {
    const { buckets, corrMatrix, coveredTotal } = bucketModel
    if (buckets.length < 2 || coveredTotal <= 0) return null
    // Normalize onto the simplex; the frontier only allocates covered weight.
    const cur = buckets.map(b => b.weight / coveredTotal)
    const band = frontierBand / 100
    return computeBoundedFrontier({
      returns: buckets.map(b => b.ret),
      stdDevs: buckets.map(b => b.std),
      corrMatrix,
      lo: cur.map(c => Math.max(0, c - band)),
      hi: cur.map(c => Math.min(1, c + band)),
      riskFreeRate: rf,
      currentWeights: cur,
      nFrontier: N_FRONTIER,
    })
  }, [bucketModel, frontierBand, rf])

  // Highest-Sharpe point on the frontier — the tangency portfolio.
  const bestSharpe = useMemo(() => {
    if (!frontier?.frontier.length) return null
    return frontier.frontier.reduce((best, p) => (p.sharpe > best.sharpe ? p : best))
  }, [frontier])

  // Load a frontier portfolio into the What-If editor.
  //
  // Frontier weights allocate the covered sleeve only, so scale them back by
  // coveredTotal. A bucket can be PARTIALLY covered (say an equity bucket where
  // one holding has no research row); its uncovered share must be added back on
  // top, otherwise that weight vanishes and the editor's total falls below 100%.
  // Fully-uncovered buckets simply keep their current weight.
  const loadFrontierPortfolio = (point) => {
    const { buckets: modelBuckets, coveredTotal } = bucketModel
    const pctByKey = Object.fromEntries(buckets.map(b => [b.styleKey, b.currentPct]))
    const next = {}
    for (const b of buckets) next[b.styleKey] = b.currentPct.toFixed(2)
    modelBuckets.forEach((b, i) => {
      const uncoveredPct = Math.max(0, (pctByKey[b.styleKey] ?? 0) - b.weight * 100)
      next[b.styleKey] = (point.weights[i] * coveredTotal * 100 + uncoveredPct).toFixed(2)
    })
    setTargets(next)
    setWhatIfMode(true)
  }

  const totalTarget = useMemo(
    () => Object.values(targets).reduce((s, v) => s + (parseFloat(v) || 0), 0),
    [targets]
  )

  const enterWhatIf = () => {
    const seeded = {}
    for (const b of buckets) seeded[b.styleKey] = b.currentPct.toFixed(2)
    setTargets(seeded)
    setWhatIfMode(true)
  }
  const cancelWhatIf = () => { setWhatIfMode(false); setTargets({}) }
  const resetWhatIf = () => {
    const seeded = {}
    for (const b of buckets) seeded[b.styleKey] = b.currentPct.toFixed(2)
    setTargets(seeded)
  }
  const setTarget = (styleKey, value) => setTargets(prev => ({ ...prev, [styleKey]: value }))

  return {
    rows,
    riskFreeRate, setRiskFreeRate,
    corrLoading,
    usingRealCorrelations: !!corrData,
    corrInfo: corrData
      ? { tradingDays: corrData.tradingDays, from: corrData.from, to: corrData.to, realCoverage }
      : null,
    current,
    whatIf,
    whatIfMode, enterWhatIf, cancelWhatIf, resetWhatIf,
    targets, setTarget, totalTarget,
    targetValid: Math.abs(totalTarget - 100) < 0.01,
    buckets,
    riskByGroup,
    frontier, bestSharpe, loadFrontierPortfolio,
    frontierBand, setFrontierBand,
    bucketModel,
  }
}
