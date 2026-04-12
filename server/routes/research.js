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

// ---------------------------------------------------------------------------
// GET /api/research/imports — list all imports
// ---------------------------------------------------------------------------
router.get('/imports', (req, res) => {
  const imports = db.prepare(
    'SELECT * FROM etf_research_imports WHERE user_id = ? ORDER BY created_at DESC'
  ).all(req.session.userId)
  res.json(imports)
})

// ---------------------------------------------------------------------------
// GET /api/research/data/:importId — get data for a specific import
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// GET /api/research/latest — get the most recent import's data
// ---------------------------------------------------------------------------
router.get('/latest', (req, res) => {
  const imp = db.prepare(
    'SELECT * FROM etf_research_imports WHERE user_id = ? ORDER BY created_at DESC LIMIT 1'
  ).get(req.session.userId)
  if (!imp) return res.json({ import: null, data: [] })

  const rows = db.prepare(
    'SELECT * FROM etf_research_data WHERE import_id = ? ORDER BY ticker'
  ).all(imp.id)
  res.json({ import: imp, data: rows })
})

// ---------------------------------------------------------------------------
// POST /api/research/import — upload XLSX (base64 in JSON body)
// ---------------------------------------------------------------------------
router.post('/import', (req, res) => {
  try {
    const { data, filename } = req.body
    if (!data) return res.status(400).json({ error: 'No data provided' })

    // Parse base64 XLSX
    const buffer = Buffer.from(data, 'base64')
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json(sheet)

    if (rows.length === 0) {
      return res.status(400).json({ error: 'No data rows found in spreadsheet' })
    }

    const importDate = new Date().toISOString().split('T')[0]

    // Insert import record
    const importResult = db.prepare(
      'INSERT INTO etf_research_imports (user_id, import_date, filename, row_count) VALUES (?, ?, ?, ?)'
    ).run(req.session.userId, importDate, filename || 'unknown.xlsx', rows.length)

    const importId = importResult.lastInsertRowid

    // Build insert statement
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

// ---------------------------------------------------------------------------
// DELETE /api/research/imports/:id — delete an import and its data
// ---------------------------------------------------------------------------
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
