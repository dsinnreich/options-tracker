import { Router } from 'express'
import db, { dbPath } from '../db.js'
import { readFileSync } from 'fs'

const router = Router()

// Export all positions as JSON (for easy backup)
router.get('/export/json', (req, res) => {
  try {
    const positions = db.prepare('SELECT * FROM positions ORDER BY created_at DESC').all()
    const backup = {
      exported_at: new Date().toISOString(),
      schema_version: db.prepare('SELECT MAX(version) as version FROM schema_version').get().version,
      positions_count: positions.length,
      positions: positions
    }

    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Content-Disposition', `attachment; filename="positions-backup-${new Date().toISOString().split('T')[0]}.json"`)
    res.json(backup)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Import positions from JSON backup
router.post('/import/json', (req, res) => {
  try {
    const backup = req.body

    if (!backup.positions || !Array.isArray(backup.positions)) {
      return res.status(400).json({ error: 'Invalid backup format' })
    }

    // Insert each position (skip id to let DB auto-generate)
    const insert = db.prepare(`
      INSERT INTO positions (
        account, ticker, strike_price, stock_price, option_ticker,
        quantity, open_date, expiration_date, premium_per_contract,
        fees, current_option_price, status, closed_at, close_price,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    let imported = 0
    let skipped = 0

    for (const pos of backup.positions) {
      try {
        insert.run(
          pos.account, pos.ticker, pos.strike_price, pos.stock_price, pos.option_ticker,
          pos.quantity, pos.open_date, pos.expiration_date, pos.premium_per_contract,
          pos.fees || 0, pos.current_option_price || 0, pos.status || 'Open',
          pos.closed_at, pos.close_price, pos.created_at, pos.updated_at
        )
        imported++
      } catch (err) {
        console.error(`Failed to import position: ${err.message}`)
        skipped++
      }
    }

    res.json({
      success: true,
      imported,
      skipped,
      total: backup.positions.length
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Download raw database file (binary backup)
router.get('/download/database', (req, res) => {
  try {
    const dbFile = readFileSync(dbPath)
    res.setHeader('Content-Type', 'application/octet-stream')
    res.setHeader('Content-Disposition', `attachment; filename="options-backup-${new Date().toISOString().split('T')[0]}.db"`)
    res.send(dbFile)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get backup info
router.get('/info', (req, res) => {
  try {
    const positionsCount = db.prepare('SELECT COUNT(*) as count FROM positions').get().count
    const schemaVersion = db.prepare('SELECT MAX(version) as version FROM schema_version').get().version
    const openPositions = db.prepare("SELECT COUNT(*) as count FROM positions WHERE status = 'Open'").get().count
    const closedPositions = db.prepare("SELECT COUNT(*) as count FROM positions WHERE status = 'Closed'").get().count

    res.json({
      schema_version: schemaVersion,
      total_positions: positionsCount,
      open_positions: openPositions,
      closed_positions: closedPositions,
      database_path: dbPath
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router
