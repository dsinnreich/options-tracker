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

export default router
