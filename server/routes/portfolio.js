import express from 'express'
import db from '../db.js'

const router = express.Router()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getPortfolio(portfolioId, userId) {
  return db.prepare('SELECT * FROM portfolios WHERE id = ? AND user_id = ?').get(portfolioId, userId)
}

// Parse "$1,234.56" or "-$1,234.56" → number (or null if empty)
function parseCurrency(str) {
  if (!str || str.trim() === '') return null
  const cleaned = str.replace(/[$,]/g, '').trim()
  return cleaned === '' ? null : parseFloat(cleaned)
}

// Parse "8.26%" → 8.26 (or null if empty)
function parsePercent(str) {
  if (!str || str.trim() === '') return null
  const cleaned = str.replace(/%/g, '').trim()
  return cleaned === '' ? null : parseFloat(cleaned)
}

// Parse CSV text into array of string arrays, handling quoted fields
function parseCSV(content) {
  const lines = content.split(/\r?\n/)
  return lines.map(line => {
    const fields = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        inQuotes = !inQuotes
      } else if (ch === ',' && !inQuotes) {
        fields.push(current.trim())
        current = ''
      } else {
        current += ch
      }
    }
    fields.push(current.trim())
    return fields
  })
}

// Convert "Apr-02-2026" → "2026-04-02"
const MONTHS = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
                 Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' }

function parseImportDate(rows) {
  for (const row of rows) {
    const first = (row[0] || '').trim()
    if (first.startsWith('Date downloaded')) {
      const match = first.match(/(\w{3})-(\d{2})-(\d{4})/)
      if (match) {
        const mon = MONTHS[match[1]]
        if (mon) return `${match[3]}-${mon}-${match[2]}`
      }
    }
  }
  return new Date().toISOString().split('T')[0]
}

// ---------------------------------------------------------------------------
// Portfolio CRUD
// ---------------------------------------------------------------------------

// GET /api/portfolio — list portfolios for the logged-in user
router.get('/', (req, res) => {
  const portfolios = db.prepare(
    'SELECT * FROM portfolios WHERE user_id = ? ORDER BY name'
  ).all(req.session.userId)
  res.json(portfolios)
})

// POST /api/portfolio — create a portfolio
router.post('/', (req, res) => {
  const { name } = req.body
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' })
  try {
    const result = db.prepare(
      'INSERT INTO portfolios (user_id, name) VALUES (?, ?)'
    ).run(req.session.userId, name.trim())
    res.status(201).json(db.prepare('SELECT * FROM portfolios WHERE id = ?').get(result.lastInsertRowid))
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'A portfolio with that name already exists' })
    throw err
  }
})

// PUT /api/portfolio/:id — rename a portfolio
router.put('/:id', (req, res) => {
  const portfolio = getPortfolio(req.params.id, req.session.userId)
  if (!portfolio) return res.status(404).json({ error: 'Portfolio not found' })

  const { name } = req.body
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' })

  try {
    db.prepare(
      'UPDATE portfolios SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(name.trim(), portfolio.id)
    res.json(db.prepare('SELECT * FROM portfolios WHERE id = ?').get(portfolio.id))
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'A portfolio with that name already exists' })
    throw err
  }
})

// DELETE /api/portfolio/:id — delete a portfolio and all its data
router.delete('/:id', (req, res) => {
  const portfolio = getPortfolio(req.params.id, req.session.userId)
  if (!portfolio) return res.status(404).json({ error: 'Portfolio not found' })

  const imports = db.prepare('SELECT id FROM portfolio_imports WHERE portfolio_id = ?').all(portfolio.id)
  const deletePositions = db.prepare('DELETE FROM portfolio_positions WHERE import_id = ?')
  const tx = db.transaction(() => {
    for (const imp of imports) deletePositions.run(imp.id)
    db.prepare('DELETE FROM portfolio_imports WHERE portfolio_id = ?').run(portfolio.id)
    db.prepare('DELETE FROM portfolio_targets WHERE portfolio_id = ?').run(portfolio.id)
    db.prepare('DELETE FROM portfolios WHERE id = ?').run(portfolio.id)
  })
  tx()
  res.json({ success: true })
})

// ---------------------------------------------------------------------------
// Asset Class Map (shared across portfolios, scoped to user)
// NOTE: these routes must come before /:id routes to avoid being swallowed
// ---------------------------------------------------------------------------

// GET /api/portfolio/asset-class-map
router.get('/asset-class-map', (req, res) => {
  const mappings = db.prepare(
    'SELECT * FROM asset_class_map WHERE user_id = ? ORDER BY asset_class, style, symbol'
  ).all(req.session.userId)
  res.json(mappings)
})

// POST /api/portfolio/asset-class-map
router.post('/asset-class-map', (req, res) => {
  const { symbol, investment_name, asset_class, style } = req.body
  if (!symbol || !asset_class || !style) {
    return res.status(400).json({ error: 'symbol, asset_class, and style are required' })
  }
  try {
    const result = db.prepare(
      'INSERT INTO asset_class_map (user_id, symbol, investment_name, asset_class, style) VALUES (?, ?, ?, ?, ?)'
    ).run(req.session.userId, symbol.trim().toUpperCase(), (investment_name || '').trim(), asset_class.trim(), style.trim())
    res.status(201).json(db.prepare('SELECT * FROM asset_class_map WHERE id = ?').get(result.lastInsertRowid))
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'That symbol is already mapped' })
    throw err
  }
})

// PUT /api/portfolio/asset-class-map/:id
router.put('/asset-class-map/:id', (req, res) => {
  const mapping = db.prepare(
    'SELECT * FROM asset_class_map WHERE id = ? AND user_id = ?'
  ).get(req.params.id, req.session.userId)
  if (!mapping) return res.status(404).json({ error: 'Mapping not found' })

  const { symbol, investment_name, asset_class, style } = req.body
  try {
    db.prepare(`
      UPDATE asset_class_map
      SET symbol = ?, investment_name = ?, asset_class = ?, style = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      (symbol || mapping.symbol).trim().toUpperCase(),
      investment_name !== undefined ? investment_name.trim() : mapping.investment_name,
      (asset_class || mapping.asset_class).trim(),
      (style || mapping.style).trim(),
      mapping.id
    )
    res.json(db.prepare('SELECT * FROM asset_class_map WHERE id = ?').get(mapping.id))
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'That symbol is already mapped' })
    throw err
  }
})

// GET /api/portfolio/asset-class-map/export — download all mappings as JSON
router.get('/asset-class-map/export', (req, res) => {
  const mappings = db.prepare(
    'SELECT symbol, investment_name, asset_class, style FROM asset_class_map WHERE user_id = ? ORDER BY asset_class, style, symbol'
  ).all(req.session.userId)

  const exportData = {
    export_version: 1,
    exported_at: new Date().toISOString(),
    mappings
  }

  const date = new Date().toISOString().split('T')[0].replace(/-/g, '')
  res.setHeader('Content-Disposition', `attachment; filename="asset-class-map-${date}.json"`)
  res.setHeader('Content-Type', 'application/json')
  res.json(exportData)
})

// POST /api/portfolio/asset-class-map/import — restore mappings from JSON (upsert by symbol)
router.post('/asset-class-map/import', (req, res) => {
  const { mappings } = req.body
  if (!Array.isArray(mappings)) {
    return res.status(400).json({ error: 'Invalid file — expected a mappings array' })
  }

  const upsert = db.prepare(`
    INSERT INTO asset_class_map (user_id, symbol, investment_name, asset_class, style)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id, symbol) DO UPDATE SET
      investment_name = excluded.investment_name,
      asset_class     = excluded.asset_class,
      style           = excluded.style,
      updated_at      = CURRENT_TIMESTAMP
  `)

  const tx = db.transaction((rows) => {
    for (const m of rows) {
      if (!m.symbol || !m.asset_class || !m.style) continue
      upsert.run(req.session.userId, m.symbol.trim().toUpperCase(), (m.investment_name || '').trim(), m.asset_class.trim(), m.style.trim())
    }
  })
  tx(mappings)

  const total = db.prepare('SELECT COUNT(*) as n FROM asset_class_map WHERE user_id = ?').get(req.session.userId).n
  res.json({ imported: mappings.length, total })
})

// DELETE /api/portfolio/asset-class-map/:id
router.delete('/asset-class-map/:id', (req, res) => {
  const mapping = db.prepare(
    'SELECT * FROM asset_class_map WHERE id = ? AND user_id = ?'
  ).get(req.params.id, req.session.userId)
  if (!mapping) return res.status(404).json({ error: 'Mapping not found' })
  db.prepare('DELETE FROM asset_class_map WHERE id = ?').run(mapping.id)
  res.json({ success: true })
})

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

// GET /api/portfolio/:id/imports — list import history
router.get('/:id/imports', (req, res) => {
  const portfolio = getPortfolio(req.params.id, req.session.userId)
  if (!portfolio) return res.status(404).json({ error: 'Portfolio not found' })

  const imports = db.prepare(
    'SELECT * FROM portfolio_imports WHERE portfolio_id = ? ORDER BY import_date DESC'
  ).all(portfolio.id)
  res.json(imports)
})

// POST /api/portfolio/:id/import — upload and parse a CSV
// Body: { filename: string, content: string (raw CSV text) }
router.post('/:id/import', (req, res) => {
  const portfolio = getPortfolio(req.params.id, req.session.userId)
  if (!portfolio) return res.status(404).json({ error: 'Portfolio not found' })

  const { filename, content } = req.body
  if (!content) return res.status(400).json({ error: 'CSV content is required' })

  const rows = parseCSV(content)
  if (rows.length < 2) return res.status(400).json({ error: 'CSV appears to be empty' })

  // Determine the import date from the "Date downloaded" footer line
  const importDate = parseImportDate(rows)

  // If an import already exists for this date, delete it so we can replace it
  const existing = db.prepare(
    'SELECT id FROM portfolio_imports WHERE portfolio_id = ? AND import_date = ?'
  ).get(portfolio.id, importDate)
  if (existing) {
    db.prepare('DELETE FROM portfolio_positions WHERE import_id = ?').run(existing.id)
    db.prepare('DELETE FROM portfolio_imports WHERE id = ?').run(existing.id)
  }

  // Parse positions (skip header row at index 0)
  // CSV columns: Account Number(0), Account Name(1), Symbol(2), Description(3),
  //   Quantity(4), Last Price(5), Last Price Change(6), Current Value(7),
  //   Today's Gain/Loss $(8), Today's Gain/Loss %(9), Total Gain/Loss $(10),
  //   Total Gain/Loss %(11), Percent Of Account(12), Cost Basis Total(13),
  //   Average Cost Basis(14), Type(15)
  const positions = []
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const accountName = (row[1] || '').trim()
    // Skip footer and empty rows (no Account Name)
    if (!accountName) continue
    const symbol = (row[2] || '').trim()

    positions.push({
      account_number:          (row[0]  || '').trim(),
      account_name:            accountName,
      symbol:                  symbol,
      description:             (row[3]  || '').trim(),
      quantity:                row[4]  ? parseFloat(row[4])  : null,
      last_price:              parseCurrency(row[5]),
      last_price_change:       parseCurrency(row[6]),
      current_value:           parseCurrency(row[7]),
      today_gain_loss_dollar:  parseCurrency(row[8]),
      today_gain_loss_percent: parsePercent(row[9]),
      total_gain_loss_dollar:  parseCurrency(row[10]),
      total_gain_loss_percent: parsePercent(row[11]),
      percent_of_account:      parsePercent(row[12]),
      cost_basis_total:        parseCurrency(row[13]),
      avg_cost_basis:          parseCurrency(row[14]),
      type:                    (row[15] || '').trim()
    })
  }

  if (positions.length === 0) return res.status(400).json({ error: 'No positions found in CSV' })

  // Insert import record + positions in one transaction
  const importResult = db.prepare(
    'INSERT INTO portfolio_imports (portfolio_id, import_date, filename) VALUES (?, ?, ?)'
  ).run(portfolio.id, importDate, filename || 'import.csv')

  const importId = importResult.lastInsertRowid

  const insertPos = db.prepare(`
    INSERT INTO portfolio_positions (
      import_id, account_number, account_name, symbol, description, quantity,
      last_price, last_price_change, current_value, today_gain_loss_dollar,
      today_gain_loss_percent, total_gain_loss_dollar, total_gain_loss_percent,
      percent_of_account, cost_basis_total, avg_cost_basis, type
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const insertAll = db.transaction((rows) => {
    for (const p of rows) {
      insertPos.run(
        importId, p.account_number, p.account_name, p.symbol, p.description, p.quantity,
        p.last_price, p.last_price_change, p.current_value, p.today_gain_loss_dollar,
        p.today_gain_loss_percent, p.total_gain_loss_dollar, p.total_gain_loss_percent,
        p.percent_of_account, p.cost_basis_total, p.avg_cost_basis, p.type
      )
    }
  })
  insertAll(positions)

  res.status(201).json({ import_id: importId, import_date: importDate, positions_count: positions.length })
})

// DELETE /api/portfolio/:id/imports/:importId — delete a specific import
router.delete('/:id/imports/:importId', (req, res) => {
  const portfolio = getPortfolio(req.params.id, req.session.userId)
  if (!portfolio) return res.status(404).json({ error: 'Portfolio not found' })

  const imp = db.prepare(
    'SELECT * FROM portfolio_imports WHERE id = ? AND portfolio_id = ?'
  ).get(req.params.importId, portfolio.id)
  if (!imp) return res.status(404).json({ error: 'Import not found' })

  db.prepare('DELETE FROM portfolio_positions WHERE import_id = ?').run(imp.id)
  db.prepare('DELETE FROM portfolio_imports WHERE id = ?').run(imp.id)
  res.json({ success: true })
})


// ---------------------------------------------------------------------------
// Positions
// ---------------------------------------------------------------------------

// GET /api/portfolio/:id/positions?importId=xxx
// Returns positions for the latest import (or a specific one via query param)
router.get('/:id/positions', (req, res) => {
  const portfolio = getPortfolio(req.params.id, req.session.userId)
  if (!portfolio) return res.status(404).json({ error: 'Portfolio not found' })

  let importId = req.query.importId
  if (!importId) {
    const latest = db.prepare(
      'SELECT id FROM portfolio_imports WHERE portfolio_id = ? ORDER BY import_date DESC LIMIT 1'
    ).get(portfolio.id)
    if (!latest) return res.json([])
    importId = latest.id
  }

  const positions = db.prepare(
    'SELECT * FROM portfolio_positions WHERE import_id = ? ORDER BY account_name, symbol'
  ).all(importId)
  res.json(positions)
})

// ---------------------------------------------------------------------------
// Targets
// ---------------------------------------------------------------------------

// GET /api/portfolio/:id/targets
router.get('/:id/targets', (req, res) => {
  const portfolio = getPortfolio(req.params.id, req.session.userId)
  if (!portfolio) return res.status(404).json({ error: 'Portfolio not found' })

  const targets = db.prepare(
    'SELECT * FROM portfolio_targets WHERE portfolio_id = ? ORDER BY asset_class, style'
  ).all(portfolio.id)
  res.json(targets)
})

// PUT /api/portfolio/:id/targets — replace all targets for a portfolio
// Body: { targets: [{ asset_class, style, target_percent }] }
router.put('/:id/targets', (req, res) => {
  const portfolio = getPortfolio(req.params.id, req.session.userId)
  if (!portfolio) return res.status(404).json({ error: 'Portfolio not found' })

  const { targets } = req.body
  if (!Array.isArray(targets)) return res.status(400).json({ error: 'targets must be an array' })

  const insert = db.prepare(
    'INSERT INTO portfolio_targets (portfolio_id, asset_class, style, target_percent) VALUES (?, ?, ?, ?)'
  )
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM portfolio_targets WHERE portfolio_id = ?').run(portfolio.id)
    for (const t of targets) {
      insert.run(portfolio.id, t.asset_class, t.style, t.target_percent)
    }
  })
  tx()

  const saved = db.prepare(
    'SELECT * FROM portfolio_targets WHERE portfolio_id = ? ORDER BY asset_class, style'
  ).all(portfolio.id)
  res.json(saved)
})

// GET /api/portfolio/:id/notes
router.get('/:id/notes', (req, res) => {
  const portfolio = getPortfolio(req.params.id, req.session.userId)
  if (!portfolio) return res.status(404).json({ error: 'Portfolio not found' })
  res.json({ notes: portfolio.notes || '' })
})

// PUT /api/portfolio/:id/notes — body: { notes: string }
router.put('/:id/notes', (req, res) => {
  const portfolio = getPortfolio(req.params.id, req.session.userId)
  if (!portfolio) return res.status(404).json({ error: 'Portfolio not found' })
  const { notes } = req.body
  if (typeof notes !== 'string') return res.status(400).json({ error: 'notes must be a string' })
  db.prepare('UPDATE portfolios SET notes = ? WHERE id = ?').run(notes, portfolio.id)
  res.json({ ok: true })
})

export default router
