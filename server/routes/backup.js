import { Router } from 'express'
import db, { dbPath } from '../db.js'
import { readFileSync } from 'fs'

const router = Router()

function requireAdmin(req, res, next) {
  if (!req.session.userId || !req.session.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' })
  }
  next()
}

// Full JSON export of all tables — admin only
router.get('/export/full', requireAdmin, (req, res) => {
  try {
    const schemaVersion = db.prepare('SELECT MAX(version) as version FROM schema_version').get().version

    const tables = {
      users:                        db.prepare('SELECT * FROM users ORDER BY id').all(),
      positions:                    db.prepare('SELECT * FROM positions ORDER BY id').all(),
      portfolios:                   db.prepare('SELECT * FROM portfolios ORDER BY id').all(),
      portfolio_imports:            db.prepare('SELECT * FROM portfolio_imports ORDER BY id').all(),
      portfolio_positions:          db.prepare('SELECT * FROM portfolio_positions ORDER BY id').all(),
      asset_class_map:              db.prepare('SELECT * FROM asset_class_map ORDER BY id').all(),
      portfolio_targets:            db.prepare('SELECT * FROM portfolio_targets ORDER BY id').all(),
      portfolio_transaction_history: db.prepare('SELECT * FROM portfolio_transaction_history ORDER BY id').all(),
      etf_watchlists:               db.prepare('SELECT * FROM etf_watchlists ORDER BY id').all(),
      etf_research_imports:         db.prepare('SELECT * FROM etf_research_imports ORDER BY id').all(),
      etf_research_data:            db.prepare('SELECT * FROM etf_research_data ORDER BY id').all(),
    }

    const counts = Object.fromEntries(
      Object.entries(tables).map(([k, v]) => [k, v.length])
    )

    const backup = {
      exported_at: new Date().toISOString(),
      schema_version: schemaVersion,
      counts,
      tables,
    }

    const date = new Date().toISOString().split('T')[0]
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Content-Disposition', `attachment; filename="tracker-backup-${date}.json"`)
    res.json(backup)
  } catch (error) {
    console.error('Full export error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Download raw SQLite database file — admin only
router.get('/download/database', requireAdmin, (req, res) => {
  try {
    const dbFile = readFileSync(dbPath)
    const date = new Date().toISOString().split('T')[0]
    res.setHeader('Content-Type', 'application/octet-stream')
    res.setHeader('Content-Disposition', `attachment; filename="tracker-backup-${date}.db"`)
    res.send(dbFile)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// DB stats for the Admin UI
router.get('/stats', requireAdmin, (req, res) => {
  try {
    const schemaVersion = db.prepare('SELECT MAX(version) as version FROM schema_version').get().version
    res.json({
      schema_version: schemaVersion,
      positions:                     db.prepare('SELECT COUNT(*) as n FROM positions').get().n,
      portfolios:                    db.prepare('SELECT COUNT(*) as n FROM portfolios').get().n,
      portfolio_imports:             db.prepare('SELECT COUNT(*) as n FROM portfolio_imports').get().n,
      portfolio_positions:           db.prepare('SELECT COUNT(*) as n FROM portfolio_positions').get().n,
      portfolio_transaction_history: db.prepare('SELECT COUNT(*) as n FROM portfolio_transaction_history').get().n,
      etf_watchlists:                db.prepare('SELECT COUNT(*) as n FROM etf_watchlists').get().n,
      etf_research_imports:          db.prepare('SELECT COUNT(*) as n FROM etf_research_imports').get().n,
      etf_research_data:             db.prepare('SELECT COUNT(*) as n FROM etf_research_data').get().n,
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Restore from full JSON backup — admin only
// Wipes all data tables, remaps user IDs by email, then re-inserts everything.
router.post('/restore/json', requireAdmin, (req, res) => {
  const backup = req.body

  if (!backup || !backup.tables || typeof backup.schema_version !== 'number') {
    return res.status(400).json({ error: 'Invalid backup file — missing tables or schema_version' })
  }

  const t = backup.tables
  const currentUserId = req.session.userId

  const restore = db.transaction(() => {
    // Build old_user_id → new_user_id map by matching on email.
    // Users not in the current DB are re-inserted so their data is preserved.
    const userIdMap = {}
    for (const u of (t.users || [])) {
      const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(u.email)
      if (existing) {
        userIdMap[u.id] = existing.id
      } else {
        const r = db.prepare(`
          INSERT INTO users (email, password_hash, name, is_admin, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(u.email, u.password_hash, u.name, u.is_admin, u.created_at, u.updated_at)
        userIdMap[u.id] = r.lastInsertRowid
      }
    }
    // Any user_id not in the map falls back to the restoring admin
    const uid = (old) => userIdMap[old] ?? currentUserId

    // Wipe tables in reverse-dependency order
    db.exec(`
      DELETE FROM etf_research_data;
      DELETE FROM etf_research_imports;
      DELETE FROM etf_watchlists;
      DELETE FROM portfolio_transaction_history;
      DELETE FROM portfolio_targets;
      DELETE FROM portfolio_positions;
      DELETE FROM portfolio_imports;
      DELETE FROM portfolios;
      DELETE FROM asset_class_map;
      DELETE FROM positions;
    `)

    // Re-insert with original IDs (foreign keys stay intact) and remapped user_ids

    const stmts = {
      position: db.prepare(`INSERT INTO positions
        (id,user_id,account,ticker,strike_price,stock_price,option_ticker,quantity,
         open_date,expiration_date,premium_per_contract,fees,current_option_price,
         status,closed_at,close_price,close_fees,close_date,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`),

      portfolio: db.prepare(`INSERT INTO portfolios
        (id,user_id,name,notes,created_at,updated_at)
        VALUES (?,?,?,?,?,?)`),

      portfolioImport: db.prepare(`INSERT INTO portfolio_imports
        (id,portfolio_id,import_date,filename,created_at)
        VALUES (?,?,?,?,?)`),

      portfolioPosition: db.prepare(`INSERT INTO portfolio_positions
        (id,import_id,account_number,account_name,symbol,description,quantity,
         last_price,last_price_change,current_value,today_gain_loss_dollar,
         today_gain_loss_percent,total_gain_loss_dollar,total_gain_loss_percent,
         percent_of_account,cost_basis_total,avg_cost_basis,type)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`),

      assetClassMap: db.prepare(`INSERT INTO asset_class_map
        (id,user_id,symbol,investment_name,asset_class,style,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?)`),

      target: db.prepare(`INSERT INTO portfolio_targets
        (id,portfolio_id,asset_class,style,target_percent,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?)`),

      txn: db.prepare(`INSERT INTO portfolio_transaction_history
        (id,portfolio_id,account_number,symbol,transaction_type,run_date,created_at)
        VALUES (?,?,?,?,?,?,?)`),

      watchlist: db.prepare(`INSERT INTO etf_watchlists
        (id,user_id,name,created_at,updated_at)
        VALUES (?,?,?,?,?)`),

      etfImport: db.prepare(`INSERT INTO etf_research_imports
        (id,user_id,import_date,filename,row_count,watchlist_id,created_at)
        VALUES (?,?,?,?,?,?,?)`),

      etfData: db.prepare(`INSERT INTO etf_research_data
        (id,import_id,ticker,name,std_dev_3y,sharpe_ratio_3y,alpha_3y,morningstar_rating,
         beta_3y,total_return_1m,total_return_3m,total_return_6m,total_return_ytd,
         total_return_1y,total_return_3y,total_return_5y,downside_capture_3y,
         sec_yield,tax_cost_3y,expense_ratio,category,style_box,medalist_rating)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`),
    }

    for (const r of (t.positions || []))
      stmts.position.run(r.id, uid(r.user_id), r.account, r.ticker, r.strike_price,
        r.stock_price, r.option_ticker, r.quantity, r.open_date, r.expiration_date,
        r.premium_per_contract, r.fees ?? 0, r.current_option_price ?? 0, r.status ?? 'Open',
        r.closed_at ?? null, r.close_price ?? null, r.close_fees ?? 0, r.close_date ?? null,
        r.created_at, r.updated_at)

    for (const r of (t.portfolios || []))
      stmts.portfolio.run(r.id, uid(r.user_id), r.name, r.notes ?? '', r.created_at, r.updated_at)

    for (const r of (t.portfolio_imports || []))
      stmts.portfolioImport.run(r.id, r.portfolio_id, r.import_date, r.filename, r.created_at)

    for (const r of (t.portfolio_positions || []))
      stmts.portfolioPosition.run(r.id, r.import_id, r.account_number, r.account_name,
        r.symbol, r.description, r.quantity, r.last_price, r.last_price_change,
        r.current_value, r.today_gain_loss_dollar, r.today_gain_loss_percent,
        r.total_gain_loss_dollar, r.total_gain_loss_percent, r.percent_of_account,
        r.cost_basis_total, r.avg_cost_basis, r.type)

    for (const r of (t.asset_class_map || []))
      stmts.assetClassMap.run(r.id, uid(r.user_id), r.symbol, r.investment_name,
        r.asset_class, r.style, r.created_at, r.updated_at)

    for (const r of (t.portfolio_targets || []))
      stmts.target.run(r.id, r.portfolio_id, r.asset_class, r.style,
        r.target_percent, r.created_at, r.updated_at)

    for (const r of (t.portfolio_transaction_history || []))
      stmts.txn.run(r.id, r.portfolio_id, r.account_number, r.symbol,
        r.transaction_type, r.run_date, r.created_at)

    for (const r of (t.etf_watchlists || []))
      stmts.watchlist.run(r.id, uid(r.user_id), r.name, r.created_at, r.updated_at)

    for (const r of (t.etf_research_imports || []))
      stmts.etfImport.run(r.id, uid(r.user_id), r.import_date, r.filename,
        r.row_count ?? 0, r.watchlist_id ?? null, r.created_at)

    for (const r of (t.etf_research_data || []))
      stmts.etfData.run(r.id, r.import_id, r.ticker, r.name, r.std_dev_3y,
        r.sharpe_ratio_3y, r.alpha_3y, r.morningstar_rating, r.beta_3y,
        r.total_return_1m, r.total_return_3m, r.total_return_6m, r.total_return_ytd,
        r.total_return_1y, r.total_return_3y, r.total_return_5y, r.downside_capture_3y,
        r.sec_yield, r.tax_cost_3y, r.expense_ratio, r.category, r.style_box, r.medalist_rating)

    return {
      positions:                     t.positions?.length ?? 0,
      portfolios:                    t.portfolios?.length ?? 0,
      portfolio_imports:             t.portfolio_imports?.length ?? 0,
      portfolio_positions:           t.portfolio_positions?.length ?? 0,
      asset_class_map:               t.asset_class_map?.length ?? 0,
      portfolio_targets:             t.portfolio_targets?.length ?? 0,
      portfolio_transaction_history: t.portfolio_transaction_history?.length ?? 0,
      etf_watchlists:                t.etf_watchlists?.length ?? 0,
      etf_research_imports:          t.etf_research_imports?.length ?? 0,
      etf_research_data:             t.etf_research_data?.length ?? 0,
    }
  })

  try {
    const summary = restore()
    res.json({ success: true, summary })
  } catch (err) {
    console.error('Restore error:', err)
    res.status(500).json({ error: err.message })
  }
})

// Legacy per-user endpoints (unchanged)
router.get('/export/json', (req, res) => {
  try {
    const positions = db.prepare('SELECT * FROM positions WHERE user_id = ? ORDER BY created_at DESC').all(req.session.userId)
    const backup = {
      exported_at: new Date().toISOString(),
      schema_version: db.prepare('SELECT MAX(version) as version FROM schema_version').get().version,
      positions_count: positions.length,
      positions,
    }
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Content-Disposition', `attachment; filename="positions-backup-${new Date().toISOString().split('T')[0]}.json"`)
    res.json(backup)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.get('/export/csv', (req, res) => {
  try {
    const ids = req.query.ids ? req.query.ids.split(',').map(id => parseInt(id)) : null
    let positions
    if (ids && ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',')
      positions = db.prepare(`SELECT * FROM positions WHERE id IN (${placeholders}) AND user_id = ? ORDER BY created_at DESC`).all(...ids, req.session.userId)
    } else {
      positions = db.prepare('SELECT * FROM positions WHERE user_id = ? ORDER BY created_at DESC').all(req.session.userId)
    }
    if (positions.length === 0) return res.status(400).json({ error: 'No positions to export' })

    const headers = ['id','account','ticker','strike_price','stock_price','option_ticker','quantity','open_date','expiration_date','premium_per_contract','fees','current_option_price','status','closed_at','close_price','created_at','updated_at']
    let csv = headers.join(',') + '\n'
    for (const pos of positions) {
      const row = headers.map(h => {
        let v = pos[h]
        if (v === null || v === undefined) return ''
        v = String(v)
        if (v.includes(',') || v.includes('"') || v.includes('\n')) v = '"' + v.replace(/"/g, '""') + '"'
        return v
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

export default router
