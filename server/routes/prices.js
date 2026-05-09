import { Router } from 'express'
import db from '../db.js'

const router = Router()
const MARKETDATA_API = 'https://api.marketdata.app/v1'

async function fetchWithAuth(url) {
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${process.env.MARKETDATA_API_TOKEN}`
    }
  })
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`)
  }
  return response.json()
}

// Get stock quote
router.get('/stock/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params
    const data = await fetchWithAuth(`${MARKETDATA_API}/stocks/quotes/${symbol.toUpperCase()}/`)

    if (data.s !== 'ok') {
      return res.status(404).json({ error: 'Stock not found' })
    }

    res.json({
      symbol: data.symbol[0],
      price: data.last[0],
      bid: data.bid[0],
      ask: data.ask[0],
      change: data.change[0],
      changePct: data.changepct[0]
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get option quote
router.get('/option/:optionSymbol', async (req, res) => {
  try {
    const { optionSymbol } = req.params
    const data = await fetchWithAuth(`${MARKETDATA_API}/options/quotes/${optionSymbol}/`)

    if (data.s !== 'ok') {
      return res.status(404).json({ error: 'Option not found' })
    }

    res.json({
      optionSymbol: data.optionSymbol[0],
      price: data.mid ? data.mid[0] : data.last[0],
      bid: data.bid[0],
      ask: data.ask[0],
      last: data.last[0],
      iv: data.iv ? data.iv[0] : null,
      delta: data.delta ? data.delta[0] : null,
      underlyingPrice: data.underlyingPrice ? data.underlyingPrice[0] : null
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Refresh all open positions
router.post('/refresh-all', async (req, res) => {
  try {
    const positions = db.prepare("SELECT * FROM positions WHERE status = 'Open'").all()
    const results = { updated: 0, errors: [] }

    for (const position of positions) {
      try {
        // Fetch stock price
        const stockData = await fetchWithAuth(
          `${MARKETDATA_API}/stocks/quotes/${position.ticker.toUpperCase()}/`
        )

        let newStockPrice = position.stock_price
        let newOptionPrice = position.current_option_price

        if (stockData.s === 'ok') {
          newStockPrice = stockData.last[0]
        }

        // Fetch option price if we have an option ticker
        if (position.option_ticker) {
          try {
            const optionData = await fetchWithAuth(
              `${MARKETDATA_API}/options/quotes/${position.option_ticker}/`
            )
            if (optionData.s === 'ok') {
              newOptionPrice = optionData.mid ? optionData.mid[0] : optionData.last[0]
            }
          } catch (optErr) {
            results.errors.push(`Option ${position.option_ticker}: ${optErr.message}`)
          }
        }

        // Update the position
        db.prepare(`
          UPDATE positions
          SET stock_price = ?, current_option_price = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(newStockPrice, newOptionPrice, position.id)

        results.updated++
      } catch (err) {
        results.errors.push(`${position.ticker}: ${err.message}`)
      }
    }

    res.json(results)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// POST /api/prices/correlations
// Body: { symbols: string[] }
// Returns: { symbols, matrix, tradingDays, from, to, skipped? }
router.post('/correlations', async (req, res) => {
  try {
    const { symbols } = req.body
    if (!Array.isArray(symbols) || symbols.length < 2) {
      return res.status(400).json({ error: 'At least 2 symbols required' })
    }

    const toDate = new Date().toISOString().split('T')[0]
    const fromDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    // Fetch daily candles for each symbol in parallel
    const skipped = []
    const seriesMap = {} // symbol → Map<timestamp, close>

    await Promise.all(symbols.map(async (symbol) => {
      try {
        const data = await fetchWithAuth(
          `${MARKETDATA_API}/stocks/candles/D/${symbol.toUpperCase()}/?from=${fromDate}&to=${toDate}&adjustsplits=true`
        )
        if (data.s !== 'ok' || !data.t || data.t.length < 20) {
          skipped.push(symbol)
          return
        }
        const m = new Map()
        for (let i = 0; i < data.t.length; i++) {
          m.set(data.t[i], data.c[i])
        }
        seriesMap[symbol] = m
      } catch {
        skipped.push(symbol)
      }
    }))

    const validSymbols = symbols.filter(s => seriesMap[s])
    if (validSymbols.length < 2) {
      return res.status(400).json({ error: 'Could not fetch price data for enough symbols', skipped })
    }

    // Find timestamps present in every symbol's data
    const sets = validSymbols.map(s => new Set(seriesMap[s].keys()))
    const commonTimestamps = [...sets[0]]
      .filter(t => sets.every(s => s.has(t)))
      .sort((a, b) => a - b)

    if (commonTimestamps.length < 21) {
      return res.status(400).json({ error: 'Not enough overlapping trading days to compute correlations' })
    }

    // Compute daily log returns for each symbol
    const logReturns = {}
    for (const symbol of validSymbols) {
      const closes = commonTimestamps.map(t => seriesMap[symbol].get(t))
      const rets = []
      for (let i = 1; i < closes.length; i++) {
        rets.push(Math.log(closes[i] / closes[i - 1]))
      }
      logReturns[symbol] = rets
    }

    // Pearson correlation
    function mean(arr) {
      return arr.reduce((a, b) => a + b, 0) / arr.length
    }
    function pearson(a, b) {
      const ma = mean(a), mb = mean(b)
      let num = 0, da = 0, db = 0
      for (let i = 0; i < a.length; i++) {
        const x = a[i] - ma, y = b[i] - mb
        num += x * y; da += x * x; db += y * y
      }
      const denom = Math.sqrt(da * db)
      return denom === 0 ? 0 : Math.max(-1, Math.min(1, num / denom))
    }

    const matrix = validSymbols.map((si, i) =>
      validSymbols.map((sj, j) => i === j ? 1 : pearson(logReturns[si], logReturns[sj]))
    )

    res.json({
      symbols: validSymbols,
      matrix,
      from: fromDate,
      to: toDate,
      tradingDays: commonTimestamps.length - 1,
      ...(skipped.length > 0 ? { skipped } : {})
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router
