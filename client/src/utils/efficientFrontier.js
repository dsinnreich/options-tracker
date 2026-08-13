import { portfolioVariance } from './portfolioRisk'

const N_SIMULATIONS = 5000
const N_FRONTIER = 10
const N_BG_DISPLAY = 300

function randomWeights(n) {
  // Dirichlet distribution via exponential variates
  const vals = Array.from({ length: n }, () => -Math.log(Math.random() + 1e-10))
  const sum = vals.reduce((a, b) => a + b, 0)
  return vals.map(v => v / sum)
}

// Single-factor (S&P 500) correlation proxy using downside capture ratios:
// corr(A,B) ≈ (DC_A/100) * (DC_B/100)
export function buildProxyCorrMatrix(etfs) {
  const dc = etfs.map(e => (e.downside_capture_3y ?? 100) / 100)
  return etfs.map((_, i) =>
    etfs.map((_, j) =>
      i === j ? 1 : Math.max(-1, Math.min(1, dc[i] * dc[j]))
    )
  )
}

// Divide the sampled return range into nFrontier slices and keep the
// minimum-std portfolio from each — the efficient edge of the cloud.
// Shared by the unconstrained (watchlist) and bounded (portfolio) frontiers.
function extractFrontier(all, nFrontier) {
  const rets = all.map(s => s.ret)
  const minRet = Math.min(...rets)
  const maxRet = Math.max(...rets)
  const range = maxRet - minRet

  let frontier = []
  if (range < 0.001) {
    frontier = [...all].sort((a, b) => a.std - b.std).slice(0, nFrontier)
  } else {
    const step = range / nFrontier
    for (let b = 0; b < nFrontier; b++) {
      const lo = minRet + b * step
      const hi = lo + step + (b === nFrontier - 1 ? 1e-6 : 0)
      const bucket = all.filter(s => s.ret >= lo && s.ret < hi)
      if (bucket.length > 0) {
        frontier.push(bucket.reduce((best, p) => (p.std < best.std ? p : best)))
      }
    }
  }

  return frontier.sort((a, b) => a.ret - b.ret)
}

function portfolioStats(weights, returns, stdDevs, corrMatrix, riskFreeRate) {
  const ret = weights.reduce((sum, w, i) => sum + w * returns[i], 0)
  const std = Math.sqrt(Math.max(0, portfolioVariance(weights, stdDevs, corrMatrix)))
  const sharpe = std > 0 ? (ret - riskFreeRate) / std : 0
  return { ret, std, sharpe }
}

// Returns { frontier: Portfolio[], background: Portfolio[] }
// where Portfolio = { weights: number[], ret: number, std: number, sharpe: number }
// All values in decimal form (e.g. 0.08 = 8%)
// corrMatrix: optional pre-computed pairwise correlation matrix (ordered to match etfs).
//   If omitted, falls back to the downside-capture S&P 500 proxy.
export function computeEfficientFrontier(etfs, returnField, riskFreeRate, corrMatrix = null) {
  const returns = etfs.map(e => (e[returnField] ?? 0) / 100)
  const stdDevs = etfs.map(e => (e.std_dev_3y ?? 15) / 100)
  if (!corrMatrix) corrMatrix = buildProxyCorrMatrix(etfs)

  const simulate = weights => portfolioStats(weights, returns, stdDevs, corrMatrix, riskFreeRate)

  // Monte Carlo
  const all = []
  for (let i = 0; i < N_SIMULATIONS; i++) {
    const w = randomWeights(etfs.length)
    all.push({ weights: w, ...simulate(w) })
  }

  // Corner portfolios (100% single ETF) — ensures frontier endpoints are exact
  etfs.forEach((_, i) => {
    const w = etfs.map((_, j) => (i === j ? 1 : 0))
    all.push({ weights: w, ...simulate(w) })
  })

  const frontier = extractFrontier(all, N_FRONTIER)

  // Sample background points for the scatter cloud (excludes frontier portfolios)
  const frontierKeys = new Set(frontier.map(p => p.weights.map(w => w.toFixed(4)).join(',')))
  const background = all
    .filter(p => !frontierKeys.has(p.weights.map(w => w.toFixed(4)).join(',')))
    .sort(() => Math.random() - 0.5)
    .slice(0, N_BG_DISPLAY)

  return { frontier, background }
}

// --- Bounded frontier (portfolio Analysis tab) -----------------------------

// The Pareto-efficient set for (maximize return, minimize std): sort by std
// ascending and keep each portfolio whose return beats everything cheaper.
//
// Used instead of extractFrontier for the bounded frontier because it fixes two
// problems at once. Return-slicing keeps the minimum-std sample per slice, but
// that minimum is a noisy Monte Carlo estimate — an under-sampled slice leaves a
// visible dip where the curve doubles back. It also returns the bottom half of
// the bullet (portfolios below minimum variance, strictly dominated). Pareto
// filtering excludes both by construction: std and return rise together, and
// every point returned is genuinely worth considering.
function paretoFrontier(all, nFrontier) {
  const sorted = [...all].sort((a, b) => a.std - b.std || b.ret - a.ret)
  const efficient = []
  let bestRet = -Infinity
  for (const p of sorted) {
    if (p.ret > bestRet + 1e-12) {
      efficient.push(p)
      bestRet = p.ret
    }
  }
  if (efficient.length <= nFrontier) return efficient

  // Thin evenly along the curve, keeping both endpoints.
  const picked = new Set()
  for (let i = 0; i < nFrontier; i++) {
    picked.add(efficient[Math.round((i * (efficient.length - 1)) / (nFrontier - 1))])
  }
  return [...picked]
}

// Deterministic PRNG (mulberry32). The bounded frontier recomputes reactively —
// on every risk-free-rate keystroke, band drag, and assumption edit — so drawing
// from Math.random() would resample 40k portfolios each time and visibly reshape
// the curve even when nothing about the inputs changed. Seeding makes the
// frontier a pure function of its inputs: same portfolio, same curve.
function makeRng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Uniform-ish draw from the polytope { lo <= w <= hi, sum(w) = 1 }.
//
// Assigns buckets one at a time in random order. Before each draw, the feasible
// range for w_k is narrowed by what the *remaining* buckets can still absorb,
// so every draw completes at exactly 1.0 — no rejection loop, no renormalizing
// (which would break the bounds). Random ordering keeps the first bucket in the
// list from soaking up the slack every time.
//
// Requires sum(lo) <= 1 <= sum(hi); callers derive bounds from current weights
// (which sum to 1), so that always holds.
export function randomBoundedWeights(lo, hi, rng = Math.random) {
  const K = lo.length
  const order = Array.from({ length: K }, (_, i) => i)
  for (let i = K - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }

  // Suffix sums of the bounds, in visit order.
  const suffixLo = new Array(K + 1).fill(0)
  const suffixHi = new Array(K + 1).fill(0)
  for (let t = K - 1; t >= 0; t--) {
    suffixLo[t] = suffixLo[t + 1] + lo[order[t]]
    suffixHi[t] = suffixHi[t + 1] + hi[order[t]]
  }

  const w = new Array(K).fill(0)
  let assigned = 0
  for (let t = 0; t < K; t++) {
    const k = order[t]
    const remaining = 1 - assigned
    const min = Math.max(lo[k], remaining - suffixHi[t + 1])
    const max = Math.min(hi[k], remaining - suffixLo[t + 1])
    w[k] = max > min ? min + rng() * (max - min) : min
    assigned += w[k]
  }
  return w
}

// Greedy fill: pour weight into buckets ordered by `rank` (best first), taking
// each to its ceiling until the budget runs out. Produces the exact bounded
// max-return and min-volatility corners, so the frontier's endpoints are real
// rather than whatever the random draws happened to reach.
function greedyBounded(lo, hi, rank) {
  const w = [...lo]
  let budget = 1 - lo.reduce((a, b) => a + b, 0)
  for (const k of rank) {
    if (budget <= 1e-12) break
    const room = Math.min(hi[k] - lo[k], budget)
    w[k] += room
    budget -= room
  }
  return w
}

// Efficient frontier over pre-aggregated assets (portfolio buckets), with each
// weight constrained to [lo, hi]. Unlike computeEfficientFrontier this takes raw
// arrays rather than ETF records, since buckets are synthetic assets.
// All values decimal. Returns { frontier, background, current }.
export function computeBoundedFrontier({
  returns, stdDevs, corrMatrix, lo, hi, riskFreeRate,
  currentWeights = null, nFrontier = 50, nSimulations = 40000, seed = 0x5EEDBEEF,
}) {
  // 40k draws is tuned against the band slider, which recomputes on every drag
  // step: it yields ~46 of the 50 requested points in ~45ms. 80k reaches a full
  // 50 but takes ~95ms — visibly janky while dragging. Point count is a cap, not
  // a quota; it also falls naturally when a narrow band leaves fewer genuinely
  // distinct efficient portfolios to find.
  const K = returns.length
  if (K === 0) return { frontier: [], background: [], current: null }

  const simulate = weights => ({
    weights, ...portfolioStats(weights, returns, stdDevs, corrMatrix, riskFreeRate),
  })

  if (K === 1) {
    const only = simulate([1])
    return { frontier: [only], background: [], current: only }
  }

  const rng = makeRng(seed)
  const all = []
  for (let i = 0; i < nSimulations; i++) all.push(simulate(randomBoundedWeights(lo, hi, rng)))

  // Anchor the endpoints: highest-return and lowest-volatility bounded corners.
  const byReturn = Array.from({ length: K }, (_, i) => i).sort((a, b) => returns[b] - returns[a])
  const byRisk = Array.from({ length: K }, (_, i) => i).sort((a, b) => stdDevs[a] - stdDevs[b])
  all.push(simulate(greedyBounded(lo, hi, byReturn)))
  all.push(simulate(greedyBounded(lo, hi, byRisk)))

  const current = currentWeights ? simulate(currentWeights) : null
  if (current) all.push(current)

  const frontier = paretoFrontier(all, nFrontier)
  const frontierSet = new Set(frontier)
  const rest = all.filter(p => !frontierSet.has(p))
  // Deterministic even stride rather than a random shuffle, so the cloud is
  // stable across recomputes like the frontier itself.
  const stride = Math.max(1, Math.floor(rest.length / N_BG_DISPLAY))
  const background = []
  for (let i = 0; i < rest.length && background.length < N_BG_DISPLAY; i += stride) {
    background.push(rest[i])
  }

  return { frontier, background, current }
}
