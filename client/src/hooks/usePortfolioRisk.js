import { useState, useMemo, useEffect, useRef } from 'react'
import {
  buildRiskRows, isCovered, makeCorrLookup, applyWhatIfWeights,
  computeRisk, realCorrelationCoverage, buildBucketModel, applyReturnOverrides,
} from '../utils/portfolioRisk'
import { computeBoundedFrontier } from '../utils/efficientFrontier'

const RF_KEY = 'analysisRiskFreeRate'
const DEFAULT_RF = 4.5
const BAND_KEY = 'analysisFrontierBand'
const DEFAULT_BAND = 15
const N_FRONTIER = 50
const CMA_KEY = 'analysisCMA'

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

  // Capital market assumptions: { "AssetClass|Style": percentString }. Only
  // buckets the user has actually set appear here — an absent key means
  // "use trailing".
  //
  // Stored server-side per user (GET/PUT /api/portfolio/cma) so they survive a
  // cache clear and follow the user across browsers, devices and origins.
  // Local state is the immediate source of truth for typing; writes are
  // debounced so a keystroke doesn't become a request.
  const [cma, setCmaState] = useState({})
  const [cmaLoaded, setCmaLoaded] = useState(false)
  const saveTimer = useRef(null)
  const lastSaved = useRef(null)
  const pendingCma = useRef(null)

  const sameCma = (a, b) => {
    if (!a || !b) return false
    const ak = Object.keys(a), bk = Object.keys(b)
    return ak.length === bk.length && ak.every(k => a[k] === b[k])
  }

  // Only reads its argument and refs, so it stays correct when called from an
  // unmount cleanup that captured an earlier render.
  const saveCmaToServer = (next, keepalive = false) => {
    const assumptions = Object.entries(next)
      .map(([key, v]) => {
        const idx = key.indexOf('|')
        return { asset_class: key.slice(0, idx), style: key.slice(idx + 1), expected_return: parseFloat(v) }
      })
      .filter(a => a.asset_class && a.style && !isNaN(a.expected_return))

    fetch('/api/portfolio/cma', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      keepalive,
      body: JSON.stringify({ assumptions }),
    })
      .then(r => { if (r.ok) { lastSaved.current = next; pendingCma.current = null } })
      .catch(() => { /* keep local state; the next edit retries */ })
  }

  const persistCma = (next) => {
    // Skip no-op writes: a fresh object with identical values would still change
    // the state reference and invalidate every downstream memo — including the
    // Monte Carlo frontier — for no reason.
    if (sameCma(cma, next)) return
    setCmaState(next)
    pendingCma.current = next
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => saveCmaToServer(next), 600)
  }

  // Initial load. If the server has nothing but this browser holds values from
  // before assumptions were stored server-side, lift them up once so earlier
  // work isn't lost, then retire the local copy.
  useEffect(() => {
    let cancelled = false
    fetch('/api/portfolio/cma', { credentials: 'include' })
      .then(r => (r.ok ? r.json() : []))
      .then(list => {
        if (cancelled) return
        const fromServer = {}
        for (const a of list) {
          fromServer[`${a.asset_class}|${a.style}`] = String(a.expected_return)
        }
        if (Object.keys(fromServer).length > 0) {
          setCmaState(fromServer)
          lastSaved.current = fromServer
        } else {
          let legacy = {}
          try { legacy = JSON.parse(localStorage.getItem(CMA_KEY)) || {} } catch { legacy = {} }
          if (Object.keys(legacy).length > 0) {
            setCmaState(legacy)
            saveCmaToServer(legacy)
          }
        }
        localStorage.removeItem(CMA_KEY)
        setCmaLoaded(true)
      })
      .catch(() => { if (!cancelled) setCmaLoaded(true) })
    return () => { cancelled = true }
  }, [])

  // Flush rather than drop a pending debounced save when the panel unmounts —
  // switching tabs within 600ms of an edit would otherwise silently lose it.
  // keepalive lets the request outlive the teardown.
  useEffect(() => {
    const onHide = () => {
      if (pendingCma.current) {
        clearTimeout(saveTimer.current)
        saveCmaToServer(pendingCma.current, true)
      }
    }
    window.addEventListener('pagehide', onHide)
    return () => {
      window.removeEventListener('pagehide', onHide)
      onHide()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [corrData, setCorrData] = useState(null)
  const [corrLoading, setCorrLoading] = useState(false)

  const [whatIfMode, setWhatIfMode] = useState(false)
  const [targets, setTargets] = useState({})

  // `rows` carries the measured trailing figures; `effectiveRows` is the same
  // list with the user's expected returns substituted in. Everything downstream
  // — tiles, table subtotals, bucket model, frontier — reads effectiveRows, so
  // an assumption flows through the whole panel from this one substitution.
  // (When no override is set the two are the same object reference.)
  const rows = useMemo(
    () => buildRiskRows(pivot, researchByTicker, proxyBySymbol),
    [pivot, researchByTicker, proxyBySymbol]
  )

  const cmaNumeric = useMemo(() => {
    const out = {}
    for (const [k, v] of Object.entries(cma)) {
      const n = parseFloat(v)
      if (!isNaN(n)) out[k] = n
    }
    return out
  }, [cma])

  const effectiveRows = useMemo(
    () => applyReturnOverrides(rows, cmaNumeric),
    [rows, cmaNumeric]
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
    () => computeRisk(effectiveRows, currentWeights, corrLookup, rf),
    [effectiveRows, currentWeights, corrLookup, rf]
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
    () => (whatIfWeights ? computeRisk(effectiveRows, whatIfWeights, corrLookup, rf) : null),
    [effectiveRows, whatIfWeights, corrLookup, rf]
  )

  // Per-group risk for the table's subtotal rows, always on current weights.
  // Within-bucket mix is fixed under a what-if, so style-level risk is invariant
  // anyway; asset-class rows stay on current weights to match the Current %
  // column beside them.
  const riskByGroup = useMemo(() => {
    const styleIdx = {}, acIdx = {}
    effectiveRows.forEach((r, i) => {
      ;(styleIdx[r.styleKey] ||= []).push(i)
      ;(acIdx[r.assetClass] ||= []).push(i)
    })
    const byStyle = {}, byAssetClass = {}
    for (const [k, idx] of Object.entries(styleIdx)) {
      byStyle[k] = computeRisk(effectiveRows, currentWeights, corrLookup, rf, idx)
    }
    for (const [k, idx] of Object.entries(acIdx)) {
      byAssetClass[k] = computeRisk(effectiveRows, currentWeights, corrLookup, rf, idx)
    }
    return { byStyle, byAssetClass }
  }, [effectiveRows, currentWeights, corrLookup, rf])

  const realCoverage = useMemo(
    () => realCorrelationCoverage(rows, currentWeights, corrData),
    [rows, currentWeights, corrData]
  )

  // --- Efficient frontier over the asset-class|style buckets ---------------
  // Collapsing to buckets is exact (see buildBucketModel) and drops each draw
  // from N^2 to K^2, so the whole frontier recomputes in a memo without a Run
  // button — the correlations it needs are already fetched for the panel.
  const bucketModel = useMemo(
    () => buildBucketModel(effectiveRows, currentWeights, corrLookup, rf),
    [effectiveRows, currentWeights, corrLookup, rf]
  )

  // Trailing bucket returns, from the measured rows — the CMA editor's defaults
  // and its "vs trailing" reference. Deliberately built from `rows`, not
  // effectiveRows, so the comparison point doesn't move as you type.
  const trailingByBucket = useMemo(() => {
    const model = buildBucketModel(rows, currentWeights, corrLookup, rf)
    return Object.fromEntries(model.buckets.map(b => [b.styleKey, b.ret]))
  }, [rows, currentWeights, corrLookup, rf])

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

    const exact = {}
    for (const b of buckets) exact[b.styleKey] = b.currentPct
    modelBuckets.forEach((b, i) => {
      const uncoveredPct = Math.max(0, (pctByKey[b.styleKey] ?? 0) - b.weight * 100)
      exact[b.styleKey] = point.weights[i] * coveredTotal * 100 + uncoveredPct
    })

    // The editor shows 2 decimals, and rounding each bucket independently leaves
    // a residual of up to ~0.005pp per bucket. Across several buckets that can
    // exceed the editor's own 0.01pp validity tolerance, so a freshly loaded
    // frontier point would flag itself invalid. Absorb the residual into the
    // largest bucket, where it is proportionally invisible.
    const keys = Object.keys(exact)
    const rounded = {}
    for (const k of keys) rounded[k] = Number(exact[k].toFixed(2))
    const residual = Number((100 - keys.reduce((s, k) => s + rounded[k], 0)).toFixed(2))
    if (residual !== 0 && keys.length > 0) {
      const largest = keys.reduce((a, b) => (rounded[b] > rounded[a] ? b : a))
      rounded[largest] = Number((rounded[largest] + residual).toFixed(2))
    }

    setTargets(Object.fromEntries(keys.map(k => [k, rounded[k].toFixed(2)])))
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

  // --- Capital market assumptions ------------------------------------------
  // An empty input clears the override so the bucket falls back to trailing,
  // rather than being pinned at 0%.
  const setCma = (styleKey, value) => {
    const next = { ...cma }
    if (value === '' || value == null) delete next[styleKey]
    else next[styleKey] = value
    persistCma(next)
  }
  const resetCma = () => persistCma({})
  const seedCmaFromTrailing = () => {
    const seeded = {}
    for (const [k, ret] of Object.entries(trailingByBucket)) seeded[k] = (ret * 100).toFixed(2)
    persistCma(seeded)
  }
  const cmaCount = Object.keys(cmaNumeric).length

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
    cma, setCma, resetCma, seedCmaFromTrailing, cmaCount, trailingByBucket,
  }
}
