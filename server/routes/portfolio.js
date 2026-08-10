import express from 'express'
import db from '../db.js'

const router = express.Router()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Owner-only access (rename, delete, manage shares)
function getPortfolio(portfolioId, userId) {
  return db.prepare('SELECT * FROM portfolios WHERE id = ? AND user_id = ?').get(portfolioId, userId)
}

// Read access: owner OR any share
function getPortfolioRead(portfolioId, userId) {
  return db.prepare(`
    SELECT p.* FROM portfolios p
    LEFT JOIN portfolio_shares ps ON ps.portfolio_id = p.id AND ps.shared_with_user_id = ?
    WHERE p.id = ? AND (p.user_id = ? OR ps.id IS NOT NULL)
  `).get(userId, portfolioId, userId)
}

// Write access: owner OR share with can_edit = 1
function getPortfolioWrite(portfolioId, userId) {
  return db.prepare(`
    SELECT p.* FROM portfolios p
    LEFT JOIN portfolio_shares ps ON ps.portfolio_id = p.id AND ps.shared_with_user_id = ?
    WHERE p.id = ? AND (p.user_id = ? OR (ps.id IS NOT NULL AND ps.can_edit = 1))
  `).get(userId, portfolioId, userId)
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

// GET /api/portfolio — list owned portfolios + shared portfolios
router.get('/', (req, res) => {
  const userId = req.session.userId
  const owned = db.prepare(
    "SELECT *, 1 as is_owner, 1 as can_edit, NULL as shared_by_name FROM portfolios WHERE user_id = ? ORDER BY name"
  ).all(userId)
  const shared = db.prepare(`
    SELECT p.*, 0 as is_owner, ps.can_edit, u.name as shared_by_name
    FROM portfolios p
    JOIN portfolio_shares ps ON ps.portfolio_id = p.id
    JOIN users u ON u.id = p.user_id
    WHERE ps.shared_with_user_id = ?
    ORDER BY p.name
  `).all(userId)
  res.json([...owned, ...shared])
})

// GET /api/portfolio/shareable-users — users the current user can share portfolios with
router.get('/shareable-users', (req, res) => {
  const users = db.prepare(
    'SELECT id, name, email FROM users WHERE id != ? ORDER BY name'
  ).all(req.session.userId)
  res.json(users)
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
    db.prepare('DELETE FROM portfolio_shares WHERE portfolio_id = ?').run(portfolio.id)
    db.prepare('DELETE FROM portfolios WHERE id = ?').run(portfolio.id)
  })
  tx()
  res.json({ success: true })
})

// GET /api/portfolio/:id/shares — list shares for a portfolio (owner only)
router.get('/:id/shares', (req, res) => {
  const portfolio = getPortfolio(req.params.id, req.session.userId)
  if (!portfolio) return res.status(404).json({ error: 'Portfolio not found' })
  const shares = db.prepare(`
    SELECT ps.id, ps.shared_with_user_id, ps.can_edit, u.name, u.email
    FROM portfolio_shares ps
    JOIN users u ON u.id = ps.shared_with_user_id
    WHERE ps.portfolio_id = ?
    ORDER BY u.name
  `).all(portfolio.id)
  res.json(shares)
})

// PUT /api/portfolio/:id/shares — replace all shares for a portfolio (owner only)
// Body: { shares: [{ user_id, can_edit }] }
router.put('/:id/shares', (req, res) => {
  const portfolio = getPortfolio(req.params.id, req.session.userId)
  if (!portfolio) return res.status(404).json({ error: 'Portfolio not found' })
  const { shares } = req.body
  if (!Array.isArray(shares)) return res.status(400).json({ error: 'shares must be an array' })

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM portfolio_shares WHERE portfolio_id = ?').run(portfolio.id)
    const insert = db.prepare(
      'INSERT INTO portfolio_shares (portfolio_id, shared_with_user_id, can_edit) VALUES (?, ?, ?)'
    )
    for (const s of shares) {
      if (s.user_id && s.user_id !== req.session.userId) {
        insert.run(portfolio.id, s.user_id, s.can_edit ? 1 : 0)
      }
    }
  })
  tx()
  res.json({ success: true })
})

// ---------------------------------------------------------------------------
// Asset Class Map (shared across portfolios, scoped to user)
// NOTE: these routes must come before /:id routes to avoid being swallowed
// ---------------------------------------------------------------------------

// GET /api/portfolio/asset-class-map — returns merged list: user overrides + global defaults
// ?portfolio_id=X: when the portfolio is shared with viewer, returns the owner's map instead
router.get('/asset-class-map', (req, res) => {
  const userId = req.session.userId
  let mapUserId = userId
  if (req.query.portfolio_id) {
    const portfolio = getPortfolioRead(req.query.portfolio_id, userId)
    if (portfolio) mapUserId = portfolio.user_id
  }
  const userMappings = db.prepare(
    'SELECT * FROM asset_class_map WHERE user_id = ? ORDER BY asset_class, style, symbol'
  ).all(mapUserId)
  const globalMappings = db.prepare(
    'SELECT * FROM global_asset_class_map ORDER BY asset_class, style, symbol'
  ).all()

  const globalBySymbol = {}
  for (const g of globalMappings) globalBySymbol[g.symbol.toUpperCase()] = g

  const userSymbols = new Set(userMappings.map(m => m.symbol.toUpperCase()))

  const result = [
    ...userMappings.map(m => ({
      ...m,
      source: 'user',
      has_global_default: !!globalBySymbol[m.symbol.toUpperCase()]
    })),
    ...globalMappings
      .filter(g => !userSymbols.has(g.symbol.toUpperCase()))
      .map(g => ({ ...g, source: 'global', has_global_default: false }))
  ]

  res.json(result)
})

// POST /api/portfolio/asset-class-map
router.post('/asset-class-map', (req, res) => {
  const { symbol, investment_name, asset_class, style, proxy_ticker } = req.body
  if (!symbol || !asset_class || !style) {
    return res.status(400).json({ error: 'symbol, asset_class, and style are required' })
  }
  try {
    const result = db.prepare(
      'INSERT INTO asset_class_map (user_id, symbol, investment_name, asset_class, style, proxy_ticker) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(req.session.userId, symbol.trim().toUpperCase(), (investment_name || '').trim(), asset_class.trim(), style.trim(), (proxy_ticker || '').trim().toUpperCase() || null)
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

  const { symbol, investment_name, asset_class, style, proxy_ticker } = req.body
  try {
    db.prepare(`
      UPDATE asset_class_map
      SET symbol = ?, investment_name = ?, asset_class = ?, style = ?, proxy_ticker = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      (symbol || mapping.symbol).trim().toUpperCase(),
      investment_name !== undefined ? investment_name.trim() : mapping.investment_name,
      (asset_class || mapping.asset_class).trim(),
      (style || mapping.style).trim(),
      proxy_ticker !== undefined ? ((proxy_ticker || '').trim().toUpperCase() || null) : mapping.proxy_ticker,
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
    'SELECT symbol, investment_name, asset_class, style, proxy_ticker FROM asset_class_map WHERE user_id = ? ORDER BY asset_class, style, symbol'
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
    INSERT INTO asset_class_map (user_id, symbol, investment_name, asset_class, style, proxy_ticker)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, symbol) DO UPDATE SET
      investment_name = excluded.investment_name,
      asset_class     = excluded.asset_class,
      style           = excluded.style,
      proxy_ticker    = excluded.proxy_ticker,
      updated_at      = CURRENT_TIMESTAMP
  `)

  const tx = db.transaction((rows) => {
    for (const m of rows) {
      if (!m.symbol || !m.asset_class || !m.style) continue
      upsert.run(req.session.userId, m.symbol.trim().toUpperCase(), (m.investment_name || '').trim(), m.asset_class.trim(), m.style.trim(), (m.proxy_ticker || '').trim().toUpperCase() || null)
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
  const portfolio = getPortfolioRead(req.params.id, req.session.userId)
  if (!portfolio) return res.status(404).json({ error: 'Portfolio not found' })

  const imports = db.prepare(
    'SELECT * FROM portfolio_imports WHERE portfolio_id = ? ORDER BY import_date DESC'
  ).all(portfolio.id)
  res.json(imports)
})

// Detect whether content is a 529 tab-separated export.
// Handles both with-header and headerless paste (detects ticker in col[1], $ price in col[2]).
function is529Format(content) {
  const firstLine = content.split(/\r?\n/)[0] || ''
  const cols = firstLine.split('\t').map(c => c.trim())
  const lower = cols.map(c => c.toLowerCase())
  // With header row
  if (lower.some(c => c === 'symbol') && lower.some(c => c === 'units')) return true
  // Without header row: col[1] is a ticker (3-6 uppercase letters), col[2] starts with $
  if (cols.length >= 4 && /^[A-Z]{3,6}$/.test(cols[1]) && cols[2].startsWith('$')) return true
  return false
}

// Parse 529 tab-separated export into position objects.
// Supports optional header row; headerless format assumes: Description, Symbol, NAV, Units, Total
function parse529(content, accountName) {
  const lines = content.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 1) return []

  const firstCols = lines[0].split('\t').map(c => c.trim().toLowerCase())
  const hasHeader = firstCols.some(c => c === 'symbol') && firstCols.some(c => c === 'units')

  let descIdx, symbolIdx, navIdx, unitsIdx, totalIdx
  let startLine

  if (hasHeader) {
    const idx = (names) => {
      for (const name of names) {
        const i = firstCols.findIndex(h => h === name)
        if (i !== -1) return i
      }
      return -1
    }
    symbolIdx = idx(['symbol', 'ticker'])
    descIdx   = idx(['portfolio', 'name', 'description', 'fund name', 'investment'])
    navIdx    = idx(['nav', 'price', 'unit value', 'share price'])
    unitsIdx  = idx(['units', 'shares', 'quantity'])
    totalIdx  = idx(['total', 'value', 'market value', 'current value', 'total value'])
    startLine = 1
  } else {
    // Headerless: Description(0), Symbol(1), NAV(2), Units(3), Total(4)
    descIdx = 0; symbolIdx = 1; navIdx = 2; unitsIdx = 3; totalIdx = 4
    startLine = 0
  }

  const positions = []
  for (let i = startLine; i < lines.length; i++) {
    const cols = lines[i].split('\t').map(c => c.trim())
    const symbol = symbolIdx !== -1 ? (cols[symbolIdx] || '') : ''
    if (!symbol) continue
    const rawUnits = unitsIdx !== -1 ? cols[unitsIdx] : ''
    const quantity = rawUnits ? parseFloat(rawUnits.replace(/,/g, '')) : null
    positions.push({
      account_number:          '',
      account_name:            accountName,
      symbol,
      description:             descIdx !== -1 ? (cols[descIdx] || '') : '',
      quantity,
      last_price:              navIdx !== -1 ? parseCurrency(cols[navIdx]) : null,
      last_price_change:       null,
      current_value:           totalIdx !== -1 ? parseCurrency(cols[totalIdx]) : null,
      today_gain_loss_dollar:  null,
      today_gain_loss_percent: null,
      total_gain_loss_dollar:  null,
      total_gain_loss_percent: null,
      percent_of_account:      null,
      cost_basis_total:        null,
      avg_cost_basis:          null,
      type:                    '529'
    })
  }
  return positions
}

// POST /api/portfolio/:id/import — upload and parse a holdings file.
// Body: { filename: string, content: string, accountName?: string }
// Supports Fidelity CSV and 529 tab-separated formats (auto-detected).
router.post('/:id/import', (req, res) => {
  const portfolio = getPortfolioWrite(req.params.id, req.session.userId)
  if (!portfolio) return res.status(404).json({ error: 'Portfolio not found' })

  const { filename, content, accountName } = req.body
  if (!content) return res.status(400).json({ error: 'File content is required' })

  let positions
  let importDate

  if (is529Format(content)) {
    const name = (accountName || '').trim() || '529'
    positions = parse529(content, name)
    importDate = new Date().toISOString().split('T')[0]
  } else {
    const rows = parseCSV(content)
    if (rows.length < 2) return res.status(400).json({ error: 'CSV appears to be empty' })

    importDate = parseImportDate(rows)

    // CSV columns: Account Number(0), Account Name(1), Symbol(2), Description(3),
    //   Quantity(4), Last Price(5), Last Price Change(6), Current Value(7),
    //   Today's Gain/Loss $(8), Today's Gain/Loss %(9), Total Gain/Loss $(10),
    //   Total Gain/Loss %(11), Percent Of Account(12), Cost Basis Total(13),
    //   Average Cost Basis(14), Type(15)
    positions = []
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]
      const acctName = (row[1] || '').trim()
      if (!acctName) continue
      positions.push({
        account_number:          (row[0]  || '').trim(),
        account_name:            acctName,
        symbol:                  (row[2]  || '').trim(),
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
  }

  if (positions.length === 0) return res.status(400).json({ error: 'No positions found in file' })

  // If an import already exists for this date, replace it
  const existing = db.prepare(
    'SELECT id FROM portfolio_imports WHERE portfolio_id = ? AND import_date = ?'
  ).get(portfolio.id, importDate)
  if (existing) {
    db.prepare('DELETE FROM portfolio_positions WHERE import_id = ?').run(existing.id)
    db.prepare('DELETE FROM portfolio_imports WHERE id = ?').run(existing.id)
  }

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

  const insertAll = db.transaction((ps) => {
    for (const p of ps) {
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
  const portfolio = getPortfolioWrite(req.params.id, req.session.userId)
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
  const portfolio = getPortfolioRead(req.params.id, req.session.userId)
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

// GET /api/portfolio/:id/allocation-export — download a percent-only allocation
// breakdown (style + individual holdings) as CSV. No dollar amounts included —
// safe to share with people you don't want to see your account value.
router.get('/:id/allocation-export', (req, res) => {
  const portfolio = getPortfolioRead(req.params.id, req.session.userId)
  if (!portfolio) return res.status(404).json({ error: 'Portfolio not found' })

  const latest = db.prepare(
    'SELECT id FROM portfolio_imports WHERE portfolio_id = ? ORDER BY import_date DESC LIMIT 1'
  ).get(portfolio.id)
  if (!latest) return res.status(400).json({ error: 'No holdings imported yet' })

  const positions = db.prepare(
    'SELECT * FROM portfolio_positions WHERE import_id = ?'
  ).all(latest.id)

  const userMappings = db.prepare(
    'SELECT * FROM asset_class_map WHERE user_id = ?'
  ).all(portfolio.user_id)
  const globalMappings = db.prepare('SELECT * FROM global_asset_class_map').all()
  const mapBySymbol = {}
  for (const g of globalMappings) mapBySymbol[g.symbol.toUpperCase()] = g
  for (const m of userMappings) mapBySymbol[m.symbol.toUpperCase()] = m // user overrides win

  const LIQUIDITY_SYMBOLS = new Set(['FDRXX', 'SPAXX', 'CORE', 'FDIC', 'PENDING ACTIVITY'])

  // Aggregate value per asset_class -> style -> symbol (across accounts)
  const groups = {}
  let grandTotal = 0

  for (const pos of positions) {
    const sym = (pos.symbol || '').trim()
    if (!sym) continue
    const val = pos.current_value || 0
    grandTotal += val

    const lookupSym = sym.replace(/\*+$/, '').toUpperCase()
    const mapping = mapBySymbol[lookupSym]
    const isLiquidityDefault = !mapping && LIQUIDITY_SYMBOLS.has(lookupSym)
    const assetClass = mapping ? mapping.asset_class : (isLiquidityDefault ? 'Liquidity' : 'Unmapped')
    const style = mapping ? mapping.style : (isLiquidityDefault ? 'Cash' : 'Unmapped')
    const isPending = lookupSym === 'PENDING ACTIVITY'
    const description = isPending ? 'Pending Activity' : (mapping?.investment_name || pos.description || sym)

    if (!groups[assetClass]) groups[assetClass] = {}
    if (!groups[assetClass][style]) groups[assetClass][style] = {}
    if (!groups[assetClass][style][sym]) groups[assetClass][style][sym] = { description, value: 0 }
    groups[assetClass][style][sym].value += val
  }

  const pct = (v) => (grandTotal > 0 ? (v / grandTotal) * 100 : 0)

  // Build asset_class -> style -> holdings tree, each level sorted by % descending
  const assetClasses = Object.entries(groups).map(([assetClass, styles]) => {
    let acValue = 0
    const styleRows = Object.entries(styles).map(([style, holdings]) => {
      let styleValue = 0
      const holdingRows = Object.entries(holdings).map(([symbol, h]) => {
        styleValue += h.value
        return { symbol, description: h.description, pct: pct(h.value) }
      }).sort((a, b) => b.pct - a.pct)
      acValue += styleValue
      return { style, pct: pct(styleValue), holdings: holdingRows }
    }).sort((a, b) => b.pct - a.pct)
    return { assetClass, pct: pct(acValue), styles: styleRows }
  }).sort((a, b) => b.pct - a.pct)

  const csvEscape = (s) => `"${String(s).replace(/"/g, '""')}"`

  const lines = []
  lines.push('Asset Class,Style,Symbol,Description,% of Portfolio')
  for (const ac of assetClasses) {
    lines.push(`${csvEscape(ac.assetClass)},,,,${ac.pct.toFixed(2)}%`)
    for (const s of ac.styles) {
      lines.push(`,${csvEscape(s.style)},,,${s.pct.toFixed(2)}%`)
      for (const h of s.holdings) {
        lines.push(`,,${csvEscape(h.symbol)},${csvEscape(h.description)},${h.pct.toFixed(2)}%`)
      }
    }
  }

  const csv = lines.join('\r\n')
  const safeName = portfolio.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
  const date = new Date().toISOString().split('T')[0]
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}-allocation-${date}.csv"`)
  res.setHeader('Content-Type', 'text/csv')
  res.send(csv)
})

// ---------------------------------------------------------------------------
// Targets
// ---------------------------------------------------------------------------

// GET /api/portfolio/:id/targets
router.get('/:id/targets', (req, res) => {
  const portfolio = getPortfolioRead(req.params.id, req.session.userId)
  if (!portfolio) return res.status(404).json({ error: 'Portfolio not found' })

  const targets = db.prepare(
    'SELECT * FROM portfolio_targets WHERE portfolio_id = ? ORDER BY asset_class, style'
  ).all(portfolio.id)
  res.json(targets)
})

// PUT /api/portfolio/:id/targets — replace all targets for a portfolio
// Body: { targets: [{ asset_class, style, target_percent }] }
router.put('/:id/targets', (req, res) => {
  const portfolio = getPortfolioWrite(req.params.id, req.session.userId)
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

// ---------------------------------------------------------------------------
// Transaction History
// ---------------------------------------------------------------------------

// Extract account number from filename e.g. "History_for_Account_X66856330-2.csv" → "X66856330"
function extractAccountNumber(filename) {
  const name = filename.replace(/\.csv$/i, '')
  const match = name.match(/History_for_Account_(.+?)(?:-\d+)?$/)
  return match ? match[1].trim() : name.trim()
}

// Parse the Fidelity history CSV text
// Returns { multiAccount: bool, transactions: [{ account_number, symbol, transaction_type, run_date }] }
// Single-account format: Run Date, Action, Symbol, Description, ...  (account from filename)
// Multi-account format:  Run Date, Account, Account Number, Action, Symbol, ...
function parseHistoryCSV(text, fallbackAccountNumber) {
  const allRows = parseCSV(text)
  const headerIdx = allRows.findIndex(r => r[0] === 'Run Date')
  if (headerIdx === -1) throw new Error('Could not find header row in history CSV')

  const header = allRows[headerIdx]
  // Detect format by checking if "Account Number" column is present
  const acctNumCol = header.findIndex(h => h.trim() === 'Account Number')
  const multiAccount = acctNumCol !== -1

  // Column indexes
  let runDateCol, actionCol, symbolCol
  if (multiAccount) {
    // Run Date, Account, Account Number, Action, Symbol, ...
    runDateCol = 0
    actionCol  = header.findIndex(h => h.trim() === 'Action')
    symbolCol  = header.findIndex(h => h.trim() === 'Symbol')
  } else {
    // Run Date, Action, Symbol, ...
    runDateCol = 0
    actionCol  = 1
    symbolCol  = 2
  }

  const transactions = []
  for (let i = headerIdx + 1; i < allRows.length; i++) {
    const cols = allRows[i]
    const runDate = (cols[runDateCol] || '').trim()
    const action  = (cols[actionCol]  || '').trim()
    const symbol  = (cols[symbolCol]  || '').trim()
    if (!runDate || !action || !symbol) continue

    let type = null
    if (action.startsWith('YOU BOUGHT')) type = 'buy'
    else if (action.startsWith('YOU SOLD'))  type = 'sell'
    else continue  // skip dividends, transfers, etc.

    const accountNumber = multiAccount
      ? (cols[acctNumCol] || '').trim()
      : fallbackAccountNumber

    transactions.push({ account_number: accountNumber, symbol, transaction_type: type, run_date: runDate })
  }
  return { multiAccount, transactions }
}

// POST /api/portfolio/:id/history — import a history CSV file
// Auto-detects single-account (account from filename) vs multi-account (account from data)
// Replaces all previous history for each account present in the file
router.post('/:id/history', (req, res) => {
  const portfolio = getPortfolioWrite(req.params.id, req.session.userId)
  if (!portfolio) return res.status(404).json({ error: 'Portfolio not found' })

  const { filename, csv } = req.body
  if (!filename || !csv) return res.status(400).json({ error: 'filename and csv are required' })

  const fallbackAccount = extractAccountNumber(filename)
  let parsed
  try {
    parsed = parseHistoryCSV(csv, fallbackAccount)
  } catch (e) {
    return res.status(400).json({ error: e.message })
  }

  const { transactions } = parsed

  // Group transactions by account_number
  const byAccount = {}
  for (const t of transactions) {
    if (!byAccount[t.account_number]) byAccount[t.account_number] = []
    byAccount[t.account_number].push(t)
  }

  const insert = db.prepare(`
    INSERT INTO portfolio_transaction_history (portfolio_id, account_number, symbol, transaction_type, run_date)
    VALUES (?, ?, ?, ?, ?)
  `)
  const deleteAcct = db.prepare(
    'DELETE FROM portfolio_transaction_history WHERE portfolio_id = ? AND account_number = ?'
  )

  // Replace history for each account present in the file
  db.transaction(() => {
    for (const [acctNum, rows] of Object.entries(byAccount)) {
      deleteAcct.run(portfolio.id, acctNum)
      for (const t of rows) {
        insert.run(portfolio.id, t.account_number, t.symbol, t.transaction_type, t.run_date)
      }
    }
  })()

  const accountNumbers = Object.keys(byAccount)
  const buys  = transactions.filter(t => t.transaction_type === 'buy').length
  const sells = transactions.filter(t => t.transaction_type === 'sell').length

  res.json({
    ok: true,
    multiAccount: parsed.multiAccount,
    accountNumbers,
    accountNumber: accountNumbers.length === 1 ? accountNumbers[0] : null,
    total: transactions.length,
    buys,
    sells
  })
})

// GET /api/portfolio/:id/history/last-transactions
// Returns { [accountNumber]: { [symbol]: { lastBuy, lastSell } } }
router.get('/:id/history/last-transactions', (req, res) => {
  const portfolio = getPortfolioRead(req.params.id, req.session.userId)
  if (!portfolio) return res.status(404).json({ error: 'Portfolio not found' })

  const rows = db.prepare(`
    SELECT account_number, symbol, transaction_type, MAX(run_date) as latest_date
    FROM portfolio_transaction_history
    WHERE portfolio_id = ?
    GROUP BY account_number, symbol, transaction_type
  `).all(portfolio.id)

  // Shape into nested lookup: { accountNumber: { symbol: { lastBuy, lastSell } } }
  const result = {}
  for (const row of rows) {
    if (!result[row.account_number]) result[row.account_number] = {}
    if (!result[row.account_number][row.symbol]) result[row.account_number][row.symbol] = {}
    if (row.transaction_type === 'buy')  result[row.account_number][row.symbol].lastBuy  = row.latest_date
    if (row.transaction_type === 'sell') result[row.account_number][row.symbol].lastSell = row.latest_date
  }
  res.json(result)
})

// GET /api/portfolio/:id/history/accounts — list accounts with imported history
router.get('/:id/history/accounts', (req, res) => {
  const portfolio = getPortfolioRead(req.params.id, req.session.userId)
  if (!portfolio) return res.status(404).json({ error: 'Portfolio not found' })

  const rows = db.prepare(`
    SELECT account_number,
           COUNT(*) as total,
           SUM(transaction_type = 'buy')  as buys,
           SUM(transaction_type = 'sell') as sells,
           MIN(run_date) as earliest,
           MAX(run_date) as latest
    FROM portfolio_transaction_history
    WHERE portfolio_id = ?
    GROUP BY account_number
  `).all(portfolio.id)
  res.json(rows)
})

// GET /api/portfolio/:id/notes
router.get('/:id/notes', (req, res) => {
  const portfolio = getPortfolioRead(req.params.id, req.session.userId)
  if (!portfolio) return res.status(404).json({ error: 'Portfolio not found' })
  res.json({ notes: portfolio.notes || '' })
})

// PUT /api/portfolio/:id/notes — body: { notes: string }
router.put('/:id/notes', (req, res) => {
  const portfolio = getPortfolioWrite(req.params.id, req.session.userId)
  if (!portfolio) return res.status(404).json({ error: 'Portfolio not found' })
  const { notes } = req.body
  if (typeof notes !== 'string') return res.status(400).json({ error: 'notes must be a string' })
  db.prepare('UPDATE portfolios SET notes = ? WHERE id = ?').run(notes, portfolio.id)
  res.json({ ok: true })
})

export default router
