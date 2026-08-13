// Portfolio-level risk math.
//
// Portfolio standard deviation is NOT the value-weighted average of holding
// standard deviations — that shortcut is only correct when every pairwise
// correlation is 1.0 (i.e. zero diversification benefit) and it systematically
// overstates risk. The correct form needs the full covariance double sum:
//
//   sigma_p = sqrt( SUM_i SUM_j  w_i * w_j * sigma_i * sigma_j * rho_ij )
//
// which is what portfolioVariance() below implements. Correlations come from
// POST /api/prices/correlations (1Y of daily log returns), with a downside-capture
// single-factor proxy as a per-pair fallback.

// Holdings in these buckets are treated as risk-free: sigma = 0, return = the
// risk-free rate. Their covariance terms vanish regardless of correlation, but
// they still consume portfolio weight — dropping them instead would renormalize
// the risky sleeve up to 100% and overstate portfolio risk.
const CASH_ASSET_CLASSES = new Set(['liquidity', 'cash'])
const CASH_STYLES = new Set(['cash', 'money market'])

export function isCashLike(assetClass, style) {
  return CASH_ASSET_CLASSES.has((assetClass || '').toLowerCase()) ||
         CASH_STYLES.has((style || '').toLowerCase())
}

// sigma_p^2 = SUM_i SUM_j w_i w_j sigma_i sigma_j rho_ij
// Shared with the efficient-frontier optimizer so both use one implementation.
export function portfolioVariance(weights, stdDevs, corrMatrix) {
  let variance = 0
  for (let i = 0; i < weights.length; i++) {
    for (let j = 0; j < weights.length; j++) {
      variance += weights[i] * weights[j] * stdDevs[i] * stdDevs[j] * corrMatrix[i][j]
    }
  }
  return variance
}

// Flatten the Analysis-tab pivot into one row per holding, carrying the inputs
// the risk math needs. Percent-valued research fields are converted to decimals.
export function buildRiskRows(pivot, researchByTicker, proxyBySymbol) {
  const { grandTotal, assetClasses } = pivot
  const rows = []

  for (const acRow of assetClasses) {
    for (const sRow of acRow.children) {
      for (const hRow of sRow.children) {
        const lookupSymbol = hRow.symbol.replace(/\*+$/, '').toUpperCase()
        const proxyTicker = proxyBySymbol[lookupSymbol]
        const research = researchByTicker[lookupSymbol] ?? (proxyTicker ? researchByTicker[proxyTicker] : undefined)
        const cash = isCashLike(acRow.asset_class, sRow.style)

        rows.push({
          symbol: hRow.symbol,
          lookupSymbol,
          // Symbols with no research row of their own (529 funds, share classes)
          // borrow a proxy for both stats and price history.
          priceTicker: proxyTicker ?? lookupSymbol,
          assetClass: acRow.asset_class,
          style: sRow.style,
          styleKey: `${acRow.asset_class}|${sRow.style}`,
          value: hRow.current_value,
          weight: grandTotal > 0 ? hRow.current_value / grandTotal : 0,
          isCash: cash,
          // Distinguishes "no research row in the selected watchlist" from
          // "has a row, but the 3Y fields are blank" — very different fixes.
          hasResearch: !!research,
          sigma: cash ? 0 : (research?.std_dev_3y != null ? research.std_dev_3y / 100 : null),
          ret: cash ? null : (research?.total_return_3y != null ? research.total_return_3y / 100 : null),
          downsideCapture: research?.downside_capture_3y ?? null,
        })
      }
    }
  }

  return rows
}

// A holding contributes to the risk calc only if we know both its volatility
// and its return. Cash qualifies on both counts by definition.
export function isCovered(row) {
  return row.isCash || (row.sigma != null && row.ret != null)
}

// (i, j) => correlation, indexed against `rows`.
// Uses the real Pearson matrix where both tickers have price history, and falls
// back per-pair to the single-factor proxy corr(A,B) ~= DC_A * DC_B otherwise.
// Per-pair (rather than all-or-nothing) fallback matters for a real portfolio,
// where a handful of untradeable symbols shouldn't discard every real correlation.
export function makeCorrLookup(rows, corrData) {
  const symIndex = {}
  if (corrData?.symbols) {
    corrData.symbols.forEach((s, i) => { symIndex[s.toUpperCase()] = i })
  }

  return (i, j) => {
    if (i === j) return 1
    const a = rows[i], b = rows[j]
    // Two holdings resolving to the same underlying are perfectly correlated.
    if (a.priceTicker === b.priceTicker) return 1

    const ia = symIndex[a.priceTicker], ib = symIndex[b.priceTicker]
    if (ia !== undefined && ib !== undefined) return corrData.matrix[ia][ib]

    const da = (a.downsideCapture ?? 100) / 100
    const db = (b.downsideCapture ?? 100) / 100
    return Math.max(-1, Math.min(1, da * db))
  }
}

// Rescale holding weights so each asset-class|style bucket hits its target
// percent, holding the within-bucket mix constant. Because relative weights
// inside a bucket never change, a bucket's own std dev is invariant under the
// what-if — only the blend across buckets moves.
// targets: { 'AssetClass|Style': percentNumber }
export function applyWhatIfWeights(rows, targets) {
  if (!targets) return rows.map(r => r.weight)

  const currentByStyle = {}
  for (const r of rows) {
    currentByStyle[r.styleKey] = (currentByStyle[r.styleKey] || 0) + r.weight
  }

  return rows.map(r => {
    const target = targets[r.styleKey]
    if (target == null) return r.weight
    const current = currentByStyle[r.styleKey]
    // A bucket with no current holdings has nothing to scale up.
    if (!current) return 0
    return r.weight * ((target / 100) / current)
  })
}

// Portfolio (or sub-group) return, std dev and Sharpe.
//
// `subset` limits the calc to a group of row indices (an asset class or style);
// weights are renormalized within whatever set survives, so an asset-class row
// reports that sleeve's standalone risk. `coverage` is the share of the
// requested weight that had usable data — always surface it, since a low number
// means the figures describe only part of the portfolio.
export function computeRisk(rows, weights, corrLookup, riskFreeRate, subset = null) {
  const candidates = subset ?? rows.map((_, i) => i)
  const requestedWeight = candidates.reduce((s, i) => s + weights[i], 0)
  const idx = candidates.filter(i => isCovered(rows[i]))

  const coveredWeight = idx.reduce((s, i) => s + weights[i], 0)
  if (idx.length === 0 || coveredWeight <= 0) return null

  const w = idx.map(i => weights[i] / coveredWeight)
  const sigmas = idx.map(i => rows[i].sigma ?? 0)
  const rets = idx.map(i => (rows[i].isCash ? riskFreeRate : rows[i].ret))

  const corrMatrix = idx.map(i => idx.map(j => corrLookup(i, j)))
  const std = Math.sqrt(Math.max(0, portfolioVariance(w, sigmas, corrMatrix)))
  const ret = w.reduce((sum, wi, a) => sum + wi * rets[a], 0)

  return {
    ret,
    std,
    sharpe: std > 0 ? (ret - riskFreeRate) / std : null,
    coverage: requestedWeight > 0 ? coveredWeight / requestedWeight : 0,
    // Split by cause: a holding absent from the selected watchlist is fixed by
    // switching watchlists, whereas a holding with blank 3Y fields needs a
    // different research import (or is genuinely too young to have 3Y history).
    excludedNoResearch: candidates
      .filter(i => !isCovered(rows[i]) && !rows[i].hasResearch)
      .map(i => rows[i].symbol),
    excludedMissingFields: candidates
      .filter(i => !isCovered(rows[i]) && rows[i].hasResearch)
      .map(i => rows[i].symbol),
  }
}

// Collapse the holding-level model down to one synthetic asset per
// asset-class|style bucket, for the efficient frontier.
//
// Because holdings inside a bucket hold their relative mix constant (the same
// rule applyWhatIfWeights follows), each bucket behaves as a fixed sub-portfolio
// and the ticker-level covariance aggregates EXACTLY — this is not an
// approximation:
//
//   C_ab = SUM_{i in a} SUM_{j in b} u_i u_j sigma_i sigma_j rho_ij
//   sigma_a = sqrt(C_aa)        rho_ab = C_ab / (sigma_a sigma_b)
//
// where u is the within-bucket normalized weight. Simulating over K buckets
// instead of N holdings is therefore free accuracy-wise, and cheap enough
// (K^2 vs N^2 per draw) to recompute the whole frontier on every render.
export function buildBucketModel(rows, weights, corrLookup, riskFreeRate) {
  // Group covered holdings by bucket, preserving portfolio order.
  const order = []
  const byKey = new Map()
  rows.forEach((r, i) => {
    if (!isCovered(r)) return
    if (!byKey.has(r.styleKey)) {
      byKey.set(r.styleKey, {
        styleKey: r.styleKey, assetClass: r.assetClass, style: r.style,
        idx: [], weight: 0,
      })
      order.push(r.styleKey)
    }
    const b = byKey.get(r.styleKey)
    b.idx.push(i)
    b.weight += weights[i]
  })

  const groups = order.map(k => byKey.get(k)).filter(b => b.weight > 0)
  if (groups.length === 0) return { buckets: [], corrMatrix: [], coveredTotal: 0 }

  // Bucket weights are shares of the WHOLE portfolio, so they sum to the covered
  // fraction rather than to 1. Callers needing simplex weights divide through by
  // coveredTotal — and must scale back by it before writing weights into the
  // What-If editor, whose rows span uncovered buckets too.
  const coveredTotal = groups.reduce((s, b) => s + b.weight, 0)

  // Within-bucket normalized weights.
  const u = groups.map(b => b.idx.map(i => weights[i] / b.weight))
  const sigmaOf = i => rows[i].sigma ?? 0
  const retOf = i => (rows[i].isCash ? riskFreeRate : rows[i].ret)

  // Bucket covariance C_ab.
  const C = groups.map((ba, a) =>
    groups.map((bb, b) =>
      ba.idx.reduce((sum, i, ii) =>
        sum + bb.idx.reduce((inner, j, jj) =>
          inner + u[a][ii] * u[b][jj] * sigmaOf(i) * sigmaOf(j) * corrLookup(i, j), 0), 0)
    )
  )

  const stds = C.map((row, a) => Math.sqrt(Math.max(0, row[a])))
  // Deliberately NOT clamped to [-1, 1]. The downside-capture proxy matrix is
  // not positive semi-definite, so aggregated bucket "correlations" can exceed
  // 1 (measured up to 1.05 on real data). This matrix is really a covariance
  // decomposition — clamping would quietly change the variance and break the
  // identity with computeRisk, making the chart's Current marker disagree with
  // the Std Dev tile above it. portfolioVariance is guarded against the
  // negative variance a non-PSD matrix could otherwise produce.
  //
  // A zero-volatility bucket (all cash) makes rho 0/0. Any value works since it
  // is multiplied by sigma = 0, but it must not be NaN.
  const corrMatrix = C.map((row, a) =>
    row.map((c, b) => {
      if (a === b) return 1
      if (stds[a] <= 0 || stds[b] <= 0) return 0
      return c / (stds[a] * stds[b])
    })
  )

  const buckets = groups.map((b, a) => ({
    styleKey: b.styleKey,
    assetClass: b.assetClass,
    style: b.style,
    weight: b.weight,
    std: stds[a],
    ret: b.idx.reduce((sum, i, ii) => sum + u[a][ii] * retOf(i), 0),
  }))

  return { buckets, corrMatrix, coveredTotal }
}

// Share of risky (non-cash) covered weight backed by real price history rather
// than the downside-capture proxy — reported so the user knows how much of the
// correlation structure is measured vs. estimated.
export function realCorrelationCoverage(rows, weights, corrData) {
  if (!corrData?.symbols) return 0
  const have = new Set(corrData.symbols.map(s => s.toUpperCase()))
  let total = 0, real = 0
  rows.forEach((r, i) => {
    if (r.isCash || !isCovered(r)) return
    total += weights[i]
    if (have.has(r.priceTicker)) real += weights[i]
  })
  return total > 0 ? real / total : 0
}
