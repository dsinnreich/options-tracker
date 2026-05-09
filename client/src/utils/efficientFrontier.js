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

function portfolioStats(weights, returns, stdDevs, corrMatrix, riskFreeRate) {
  const ret = weights.reduce((sum, w, i) => sum + w * returns[i], 0)
  let variance = 0
  for (let i = 0; i < weights.length; i++) {
    for (let j = 0; j < weights.length; j++) {
      variance += weights[i] * weights[j] * stdDevs[i] * stdDevs[j] * corrMatrix[i][j]
    }
  }
  const std = Math.sqrt(Math.max(0, variance))
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

  // Efficient frontier: divide return range into N_FRONTIER buckets,
  // select the minimum-std portfolio from each bucket
  const rets = all.map(s => s.ret)
  const minRet = Math.min(...rets)
  const maxRet = Math.max(...rets)
  const range = maxRet - minRet

  let frontier = []
  if (range < 0.001) {
    frontier = [...all].sort((a, b) => a.std - b.std).slice(0, N_FRONTIER)
  } else {
    const step = range / N_FRONTIER
    for (let b = 0; b < N_FRONTIER; b++) {
      const lo = minRet + b * step
      const hi = lo + step + (b === N_FRONTIER - 1 ? 1e-6 : 0)
      const bucket = all.filter(s => s.ret >= lo && s.ret < hi)
      if (bucket.length > 0) {
        frontier.push(bucket.reduce((best, p) => (p.std < best.std ? p : best)))
      }
    }
  }

  frontier.sort((a, b) => a.ret - b.ret)

  // Sample background points for the scatter cloud (excludes frontier portfolios)
  const frontierKeys = new Set(frontier.map(p => p.weights.map(w => w.toFixed(4)).join(',')))
  const background = all
    .filter(p => !frontierKeys.has(p.weights.map(w => w.toFixed(4)).join(',')))
    .sort(() => Math.random() - 0.5)
    .slice(0, N_BG_DISPLAY)

  return { frontier, background }
}
