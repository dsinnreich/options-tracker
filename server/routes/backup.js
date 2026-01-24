import { Router } from 'express'
import db, { dbPath } from '../db.js'
import { readFileSync } from 'fs'

const router = Router()

// Export all positions as JSON (for easy backup)
router.get('/export/json', (req, res) => {
  try {
    const positions = db.prepare('SELECT * FROM positions WHERE user_id = ? ORDER BY created_at DESC').all(req.session.userId)
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
        user_id, account, ticker, strike_price, stock_price, option_ticker,
        quantity, open_date, expiration_date, premium_per_contract,
        fees, current_option_price, status, closed_at, close_price,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    let imported = 0
    let skipped = 0

    for (const pos of backup.positions) {
      try {
        insert.run(
          req.session.userId,
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

// Export selected positions as CSV
router.get('/export/csv', (req, res) => {
  try {
    const ids = req.query.ids ? req.query.ids.split(',').map(id => parseInt(id)) : null

    let positions
    if (ids && ids.length > 0) {
      // Export selected positions
      const placeholders = ids.map(() => '?').join(',')
      positions = db.prepare(`SELECT * FROM positions WHERE id IN (${placeholders}) AND user_id = ? ORDER BY created_at DESC`).all(...ids, req.session.userId)
    } else {
      // Export all positions
      positions = db.prepare('SELECT * FROM positions WHERE user_id = ? ORDER BY created_at DESC').all(req.session.userId)
    }

    if (positions.length === 0) {
      return res.status(400).json({ error: 'No positions to export' })
    }

    // CSV headers
    const headers = [
      'id', 'account', 'ticker', 'strike_price', 'stock_price', 'option_ticker',
      'quantity', 'open_date', 'expiration_date', 'premium_per_contract',
      'fees', 'current_option_price', 'status', 'closed_at', 'close_price',
      'created_at', 'updated_at'
    ]

    // Convert to CSV
    let csv = headers.join(',') + '\n'

    for (const pos of positions) {
      const row = headers.map(header => {
        let value = pos[header]
        // Handle null values
        if (value === null || value === undefined) {
          return ''
        }
        // Escape quotes and wrap in quotes if contains comma
        value = String(value)
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
          value = '"' + value.replace(/"/g, '""') + '"'
        }
        return value
      })
      csv += row.join(',') + '\n'
    }

    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', `attachment; filename="positions-${new Date().toISOString().split('T')[0]}.csv"`)
    res.send(csv)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Import positions from CSV
router.post('/import/csv', (req, res) => {
  try {
    const csvData = req.body

    if (typeof csvData !== 'string') {
      return res.status(400).json({ error: 'Invalid CSV data' })
    }

    // Parse CSV
    const lines = csvData.trim().split('\n')
    if (lines.length < 2) {
      return res.status(400).json({ error: 'CSV file is empty or invalid' })
    }

    const headers = lines[0].split(',').map(h => h.trim())

    // Validate required headers
    const requiredHeaders = ['account', 'ticker', 'strike_price', 'stock_price', 'quantity',
                             'open_date', 'expiration_date', 'premium_per_contract']
    const missingHeaders = requiredHeaders.filter(h => !headers.includes(h))
    if (missingHeaders.length > 0) {
      return res.status(400).json({ error: `Missing required headers: ${missingHeaders.join(', ')}` })
    }

    const insert = db.prepare(`
      INSERT INTO positions (
        user_id, account, ticker, strike_price, stock_price, option_ticker,
        quantity, open_date, expiration_date, premium_per_contract,
        fees, current_option_price, status, closed_at, close_price
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    let imported = 0
    let skipped = 0
    const errors = []

    // Skip header row, process data rows
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue

      try {
        // Simple CSV parsing (handle quoted values)
        const values = []
        let current = ''
        let inQuotes = false

        for (let char of line) {
          if (char === '"') {
            inQuotes = !inQuotes
          } else if (char === ',' && !inQuotes) {
            values.push(current.trim())
            current = ''
          } else {
            current += char
          }
        }
        values.push(current.trim())

        const position = {}
        headers.forEach((header, index) => {
          position[header] = values[index] || null
        })

        // Convert numeric fields
        const numericFields = ['strike_price', 'stock_price', 'quantity', 'premium_per_contract', 'fees', 'current_option_price', 'close_price']
        numericFields.forEach(field => {
          if (position[field] && position[field] !== '') {
            position[field] = parseFloat(position[field])
          }
        })

        // Convert quantity to integer
        if (position.quantity) {
          position.quantity = parseInt(position.quantity)
        }

        insert.run(
          req.session.userId,
          position.account, position.ticker, position.strike_price, position.stock_price,
          position.option_ticker || null,
          position.quantity, position.open_date, position.expiration_date,
          position.premium_per_contract,
          position.fees || 0, position.current_option_price || 0,
          position.status || 'Open',
          position.closed_at || null, position.close_price || null
        )
        imported++
      } catch (err) {
        console.error(`Failed to import row ${i}: ${err.message}`)
        errors.push(`Row ${i}: ${err.message}`)
        skipped++
      }
    }

    res.json({
      success: true,
      imported,
      skipped,
      total: lines.length - 1,
      errors: errors.length > 0 ? errors : undefined
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get backup info
router.get('/info', (req, res) => {
  try {
    const positionsCount = db.prepare('SELECT COUNT(*) as count FROM positions WHERE user_id = ?').get(req.session.userId).count
    const schemaVersion = db.prepare('SELECT MAX(version) as version FROM schema_version').get().version
    const openPositions = db.prepare("SELECT COUNT(*) as count FROM positions WHERE user_id = ? AND status = 'Open'").get(req.session.userId).count
    const closedPositions = db.prepare("SELECT COUNT(*) as count FROM positions WHERE user_id = ? AND status = 'Closed'").get(req.session.userId).count

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
