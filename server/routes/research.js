import express from 'express'
import XLSX from 'xlsx'
import db from '../db.js'

const router = express.Router()

// Column mapping: XLSX header → DB column
const COL_MAP = {
  'Ticker': 'ticker',
  'Name': 'name',
  'Standard Deviation (3Y Monthly)': 'std_dev_3y',
  'Sharpe Ratio (3Y Monthly)': 'sharpe_ratio_3y',
  'Alpha (3Y Monthly)': 'alpha_3y',
  'Morningstar Rating for Funds (Overall)': 'morningstar_rating',
  'Beta (3Y Monthly)': 'beta_3y',
  'Total Return (1M)': 'total_return_1m',
  'Total Return (3M)': 'total_return_3m',
  'Total Return (6M)': 'total_return_6m',
  'Total Return (YTD)': 'total_return_ytd',
  'Total Return (1Y)': 'total_return_1y',
  'Total Return (3Y)': 'total_return_3y',
  'Total Return (5Y)': 'total_return_5y',
  'Downside Capture Ratio (3Y)': 'downside_capture_3y',
  'SEC 30-Day Yield': 'sec_yield',
  'Tax Cost Ratio (3Y)': 'tax_cost_3y',
  'Adjusted Expense Ratio': 'expense_ratio',
  'Morningstar Category': 'category',
  'Equity Style Box (Funds)': 'style_box',
  'Medalist Rating (Overall)': 'medalist_rating'
}

const DB_COLS = Object.values(COL_MAP)

// ===========================================================================
// Watchlist CRUD
// ===========================================================================

// GET /api/research/watchlists
router.get('/watchlists', (req, res) => {
  const watchlists = db.prepare(
    'SELECT * FROM etf_watchlists WHERE user_id = ? ORDER BY name'
  ).all(req.session.userId)
  res.json(watchlists)
})

// POST /api/research/watchlists
router.post('/watchlists', (req, res) => {
  try {
    const { name } = req.body
    if (!name?.trim()) return res.status(400).json({ error: 'Name is required' })
    const result = db.prepare(
      'INSERT INTO etf_watchlists (user_id, name) VALUES (?, ?)'
    ).run(req.session.userId, name.trim())
    const wl = db.prepare('SELECT * FROM etf_watchlists WHERE id = ?').get(result.lastInsertRowid)
    res.json(wl)
  } catch (error) {
    if (error.message.includes('UNIQUE constraint')) {
      return res.status(409).json({ error: 'A watchlist with that name already exists' })
    }
    res.status(500).json({ error: error.message })
  }
})

// PUT /api/research/watchlists/:id
router.put('/watchlists/:id', (req, res) => {
  try {
    const { name } = req.body
    if (!name?.trim()) return res.status(400).json({ error: 'Name is required' })
    const result = db.prepare(
      'UPDATE etf_watchlists SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?'
    ).run(name.trim(), req.params.id, req.session.userId)
    if (result.changes === 0) return res.status(404).json({ error: 'Watchlist not found' })
    const wl = db.prepare('SELECT * FROM etf_watchlists WHERE id = ?').get(req.params.id)
    res.json(wl)
  } catch (error) {
    if (error.message.includes('UNIQUE constraint')) {
      return res.status(409).json({ error: 'A watchlist with that name already exists' })
    }
    res.status(500).json({ error: error.message })
  }
})

// DELETE /api/research/watchlists/:id
router.delete('/watchlists/:id', (req, res) => {
  try {
    const wl = db.prepare(
      'SELECT * FROM etf_watchlists WHERE id = ? AND user_id = ?'
    ).get(req.params.id, req.session.userId)
    if (!wl) return res.status(404).json({ error: 'Watchlist not found' })

    // Delete all imports and their data for this watchlist
    const imports = db.prepare('SELECT id FROM etf_research_imports WHERE watchlist_id = ?').all(wl.id)
    for (const imp of imports) {
      db.prepare('DELETE FROM etf_research_data WHERE import_id = ?').run(imp.id)
    }
    db.prepare('DELETE FROM etf_research_imports WHERE watchlist_id = ?').run(wl.id)
    db.prepare('DELETE FROM etf_watchlists WHERE id = ?').run(wl.id)
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// ===========================================================================
// Import & Data (scoped to watchlist)
// ===========================================================================

// GET /api/research/watchlists/:watchlistId/latest — latest import data for a watchlist
router.get('/watchlists/:watchlistId/latest', (req, res) => {
  const wl = db.prepare(
    'SELECT * FROM etf_watchlists WHERE id = ? AND user_id = ?'
  ).get(req.params.watchlistId, req.session.userId)
  if (!wl) return res.status(404).json({ error: 'Watchlist not found' })

  const imp = db.prepare(
    'SELECT * FROM etf_research_imports WHERE watchlist_id = ? ORDER BY created_at DESC LIMIT 1'
  ).get(wl.id)
  if (!imp) return res.json({ import: null, data: [] })

  const rows = db.prepare(
    'SELECT * FROM etf_research_data WHERE import_id = ? ORDER BY ticker'
  ).all(imp.id)
  res.json({ import: imp, data: rows })
})

// GET /api/research/watchlists/:watchlistId/imports — list imports for a watchlist
router.get('/watchlists/:watchlistId/imports', (req, res) => {
  const imports = db.prepare(
    'SELECT i.* FROM etf_research_imports i JOIN etf_watchlists w ON i.watchlist_id = w.id WHERE w.id = ? AND w.user_id = ? ORDER BY i.created_at DESC'
  ).all(req.params.watchlistId, req.session.userId)
  res.json(imports)
})

// GET /api/research/data/:importId — get data for a specific import
router.get('/data/:importId', (req, res) => {
  const imp = db.prepare(
    'SELECT * FROM etf_research_imports WHERE id = ? AND user_id = ?'
  ).get(req.params.importId, req.session.userId)
  if (!imp) return res.status(404).json({ error: 'Import not found' })

  const rows = db.prepare(
    'SELECT * FROM etf_research_data WHERE import_id = ? ORDER BY ticker'
  ).all(imp.id)
  res.json({ import: imp, data: rows })
})

// POST /api/research/watchlists/:watchlistId/import — upload XLSX into a watchlist
router.post('/watchlists/:watchlistId/import', (req, res) => {
  try {
    const wl = db.prepare(
      'SELECT * FROM etf_watchlists WHERE id = ? AND user_id = ?'
    ).get(req.params.watchlistId, req.session.userId)
    if (!wl) return res.status(404).json({ error: 'Watchlist not found' })

    const { data, filename } = req.body
    if (!data) return res.status(400).json({ error: 'No data provided' })

    const buffer = Buffer.from(data, 'base64')
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json(sheet)

    if (rows.length === 0) {
      return res.status(400).json({ error: 'No data rows found in spreadsheet' })
    }

    const importDate = new Date().toISOString().split('T')[0]

    const importResult = db.prepare(
      'INSERT INTO etf_research_imports (user_id, watchlist_id, import_date, filename, row_count) VALUES (?, ?, ?, ?, ?)'
    ).run(req.session.userId, wl.id, importDate, filename || 'unknown.xlsx', rows.length)

    const importId = importResult.lastInsertRowid

    const placeholders = DB_COLS.map(() => '?').join(', ')
    const insertStmt = db.prepare(
      `INSERT INTO etf_research_data (import_id, ${DB_COLS.join(', ')}) VALUES (?, ${placeholders})`
    )

    const xlsxHeaders = Object.keys(COL_MAP)

    const insertMany = db.transaction(() => {
      for (const row of rows) {
        const values = xlsxHeaders.map(header => {
          const val = row[header]
          return val != null ? val : null
        })
        insertStmt.run(importId, ...values)
      }
    })
    insertMany()

    const imp = db.prepare('SELECT * FROM etf_research_imports WHERE id = ?').get(importId)
    res.json({ import: imp, rowsImported: rows.length })
  } catch (error) {
    console.error('Research import error:', error)
    res.status(500).json({ error: error.message })
  }
})

// DELETE /api/research/imports/:id — delete a single import and its data
router.delete('/imports/:id', (req, res) => {
  try {
    const imp = db.prepare(
      'SELECT * FROM etf_research_imports WHERE id = ? AND user_id = ?'
    ).get(req.params.id, req.session.userId)
    if (!imp) return res.status(404).json({ error: 'Import not found' })

    db.prepare('DELETE FROM etf_research_data WHERE import_id = ?').run(imp.id)
    db.prepare('DELETE FROM etf_research_imports WHERE id = ?').run(imp.id)
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router
