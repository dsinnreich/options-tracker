import { Router } from 'express'
import db from '../db.js'

const router = Router()

// Get all positions for current user
router.get('/', (req, res) => {
  try {
    const positions = db.prepare('SELECT * FROM positions WHERE user_id = ? ORDER BY created_at DESC').all(req.session.userId)
    res.json(positions)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get single position (must belong to current user)
router.get('/:id', (req, res) => {
  try {
    const position = db.prepare('SELECT * FROM positions WHERE id = ? AND user_id = ?').get(req.params.id, req.session.userId)
    if (!position) {
      return res.status(404).json({ error: 'Position not found' })
    }
    res.json(position)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Create position (assigned to current user)
router.post('/', (req, res) => {
  try {
    const {
      account,
      ticker,
      strike_price,
      stock_price,
      option_ticker,
      quantity,
      open_date,
      expiration_date,
      premium_per_contract,
      fees,
      current_option_price
    } = req.body

    const stmt = db.prepare(`
      INSERT INTO positions (
        user_id, account, ticker, strike_price, stock_price, option_ticker, quantity,
        open_date, expiration_date, premium_per_contract, fees, current_option_price
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const result = stmt.run(
      req.session.userId,
      account,
      ticker,
      strike_price,
      stock_price,
      option_ticker || null,
      quantity,
      open_date,
      expiration_date,
      premium_per_contract,
      fees || 0,
      current_option_price || 0
    )

    const newPosition = db.prepare('SELECT * FROM positions WHERE id = ?').get(result.lastInsertRowid)
    res.status(201).json(newPosition)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Update position
router.put('/:id', (req, res) => {
  try {
    const {
      account,
      ticker,
      strike_price,
      stock_price,
      option_ticker,
      quantity,
      open_date,
      expiration_date,
      premium_per_contract,
      fees,
      current_option_price,
      status
    } = req.body

    const stmt = db.prepare(`
      UPDATE positions SET
        account = ?,
        ticker = ?,
        strike_price = ?,
        stock_price = ?,
        option_ticker = ?,
        quantity = ?,
        open_date = ?,
        expiration_date = ?,
        premium_per_contract = ?,
        fees = ?,
        current_option_price = ?,
        status = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `)

    const result = stmt.run(
      account,
      ticker,
      strike_price,
      stock_price,
      option_ticker || null,
      quantity,
      open_date,
      expiration_date,
      premium_per_contract,
      fees || 0,
      current_option_price || 0,
      status || 'Open',
      req.params.id,
      req.session.userId
    )

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Position not found' })
    }

    const updated = db.prepare('SELECT * FROM positions WHERE id = ?').get(req.params.id)
    if (!updated) {
      return res.status(404).json({ error: 'Position not found' })
    }
    res.json(updated)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Close position
router.put('/:id/close', (req, res) => {
  try {
    const { close_price } = req.body

    const stmt = db.prepare(`
      UPDATE positions SET
        status = 'Closed',
        closed_at = CURRENT_TIMESTAMP,
        close_price = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `)

    const result = stmt.run(close_price || 0, req.params.id, req.session.userId)

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Position not found' })
    }

    const updated = db.prepare('SELECT * FROM positions WHERE id = ?').get(req.params.id)
    if (!updated) {
      return res.status(404).json({ error: 'Position not found' })
    }
    res.json(updated)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Delete position
router.delete('/:id', (req, res) => {
  try {
    const result = db.prepare('DELETE FROM positions WHERE id = ? AND user_id = ?').run(req.params.id, req.session.userId)
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Position not found' })
    }
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router
