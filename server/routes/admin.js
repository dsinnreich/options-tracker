import { Router } from 'express'
import bcrypt from 'bcrypt'
import crypto from 'crypto'
import db from '../db.js'

const router = Router()

// Middleware to check if user is admin
function requireAdmin(req, res, next) {
  if (!req.session.userId || !req.session.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' })
  }
  next()
}

// Middleware to require fresh admin step-up verification (TOTP re-verify within last hour)
function requireAdminVerified(req, res, next) {
  const { adminVerifiedAt } = req.session
  if (!adminVerifiedAt || Date.now() - adminVerifiedAt > 3600000) {
    return res.status(403).json({ error: 'admin_verify_required' })
  }
  next()
}

// Get all users (admin only)
router.get('/users', requireAdmin, requireAdminVerified, (req, res) => {
  try {
    const users = db.prepare('SELECT id, email, name, is_admin, totp_enabled, created_at FROM users ORDER BY created_at DESC').all()
    res.json(users)
  } catch (error) {
    console.error('Get users error:', error)
    res.status(500).json({ error: 'Failed to fetch users' })
  }
})

// Create a new user (admin only)
router.post('/users', requireAdmin, requireAdminVerified, async (req, res) => {
  try {
    const { email, name, password, isAdmin } = req.body

    if (!email || !name || !password) {
      return res.status(400).json({ error: 'Email, name, and password are required' })
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' })
    }

    // Check if email already exists
    const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email)

    if (existingUser) {
      return res.status(400).json({ error: 'Email already exists' })
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10)

    // Create user — flag to force password change on first login
    const result = db.prepare(`
      INSERT INTO users (email, password_hash, name, is_admin, must_change_password)
      VALUES (?, ?, ?, ?, 1)
    `).run(email, passwordHash, name, isAdmin ? 1 : 0)

    res.json({
      success: true,
      user: {
        id: result.lastInsertRowid,
        email,
        name,
        isAdmin: isAdmin || false
      }
    })
  } catch (error) {
    console.error('Create user error:', error)
    res.status(500).json({ error: 'Failed to create user' })
  }
})

// Delete a user (admin only)
router.delete('/users/:id', requireAdmin, requireAdminVerified, (req, res) => {
  try {
    const userId = parseInt(req.params.id)

    if (userId === req.session.userId) {
      return res.status(400).json({ error: 'Cannot delete your own account' })
    }

    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId)
    if (!user) return res.status(404).json({ error: 'User not found' })

    // Delete all user data in dependency order (SQLite FKs not enforced by default)
    const deleteAll = db.transaction(() => {
      // Portfolio data
      const portfolioIds = db.prepare('SELECT id FROM portfolios WHERE user_id = ?').all(userId).map(p => p.id)
      for (const pid of portfolioIds) {
        const importIds = db.prepare('SELECT id FROM portfolio_imports WHERE portfolio_id = ?').all(pid).map(i => i.id)
        for (const iid of importIds) {
          db.prepare('DELETE FROM portfolio_positions WHERE import_id = ?').run(iid)
        }
        db.prepare('DELETE FROM portfolio_imports WHERE portfolio_id = ?').run(pid)
        db.prepare('DELETE FROM portfolio_targets WHERE portfolio_id = ?').run(pid)
        db.prepare('DELETE FROM portfolio_transaction_history WHERE portfolio_id = ?').run(pid)
      }
      db.prepare('DELETE FROM portfolios WHERE user_id = ?').run(userId)

      // ETF research data
      const watchlistIds = db.prepare('SELECT id FROM etf_watchlists WHERE user_id = ?').all(userId).map(w => w.id)
      for (const wid of watchlistIds) {
        const importIds = db.prepare('SELECT id FROM etf_research_imports WHERE watchlist_id = ?').all(wid).map(i => i.id)
        for (const iid of importIds) {
          db.prepare('DELETE FROM etf_research_data WHERE import_id = ?').run(iid)
        }
        db.prepare('DELETE FROM etf_research_imports WHERE watchlist_id = ?').run(wid)
      }
      db.prepare('DELETE FROM etf_watchlists WHERE user_id = ?').run(userId)

      db.prepare('DELETE FROM asset_class_map WHERE user_id = ?').run(userId)
      db.prepare('DELETE FROM positions WHERE user_id = ?').run(userId)
      db.prepare('DELETE FROM users WHERE id = ?').run(userId)
    })

    deleteAll()
    res.json({ success: true })
  } catch (error) {
    console.error('Delete user error:', error)
    res.status(500).json({ error: 'Failed to delete user' })
  }
})

// Update user (admin only)
router.put('/users/:id', requireAdmin, requireAdminVerified, async (req, res) => {
  try {
    const userId = parseInt(req.params.id)
    const { email, name, password, isAdmin } = req.body

    // Check if user exists
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId)

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    // Check if new email already exists (if changing email)
    if (email) {
      const existingUser = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email, userId)
      if (existingUser) {
        return res.status(400).json({ error: 'Email already exists' })
      }
    }

    // Build update query
    const updates = []
    const values = []

    if (email) {
      updates.push('email = ?')
      values.push(email)
    }

    if (name) {
      updates.push('name = ?')
      values.push(name)
    }

    if (password) {
      if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' })
      }
      const passwordHash = await bcrypt.hash(password, 10)
      updates.push('password_hash = ?')
      values.push(passwordHash)
    }

    if (isAdmin !== undefined) {
      updates.push('is_admin = ?')
      values.push(isAdmin ? 1 : 0)
    }

    updates.push('updated_at = CURRENT_TIMESTAMP')
    values.push(userId)

    if (updates.length > 1) { // More than just updated_at
      db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values)
    }

    res.json({ success: true, message: 'User updated successfully' })
  } catch (error) {
    console.error('Update user error:', error)
    res.status(500).json({ error: 'Failed to update user' })
  }
})

// Generate a password reset link for a user (admin fallback when email is unavailable)
router.post('/users/:id/reset-link', requireAdmin, requireAdminVerified, (req, res) => {
  try {
    const userId = parseInt(req.params.id)
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId)
    if (!user) return res.status(404).json({ error: 'User not found' })
    const resetToken = crypto.randomBytes(32).toString('hex')
    const resetTokenExpires = new Date(Date.now() + 3600000).toISOString()
    db.prepare('UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?').run(resetToken, resetTokenExpires, userId)
    const appUrl = process.env.APP_URL || 'http://localhost:3001'
    res.json({ resetUrl: `${appUrl}/reset-password?token=${resetToken}` })
  } catch (err) {
    console.error('Generate reset link error:', err)
    res.status(500).json({ error: 'Failed to generate reset link' })
  }
})

// ── Global Asset Class Map ─────────────────────────────────────────────────

// GET /api/admin/global-asset-class-map
router.get('/global-asset-class-map', requireAdmin, requireAdminVerified, (req, res) => {
  try {
    const mappings = db.prepare(
      'SELECT * FROM global_asset_class_map ORDER BY asset_class, style, symbol'
    ).all()
    res.json(mappings)
  } catch (err) {
    console.error('Get global map error:', err)
    res.status(500).json({ error: 'Failed to fetch global map' })
  }
})

// POST /api/admin/global-asset-class-map
router.post('/global-asset-class-map', requireAdmin, requireAdminVerified, (req, res) => {
  try {
    const { symbol, investment_name, asset_class, style, proxy_ticker } = req.body
    if (!symbol || !asset_class || !style) {
      return res.status(400).json({ error: 'symbol, asset_class, and style are required' })
    }
    const result = db.prepare(
      'INSERT INTO global_asset_class_map (symbol, investment_name, asset_class, style, proxy_ticker) VALUES (?, ?, ?, ?, ?)'
    ).run(symbol.trim().toUpperCase(), (investment_name || '').trim(), asset_class.trim(), style.trim(), (proxy_ticker || '').trim().toUpperCase() || null)
    res.status(201).json(db.prepare('SELECT * FROM global_asset_class_map WHERE id = ?').get(result.lastInsertRowid))
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'That symbol is already in the global map' })
    console.error('Add global map entry error:', err)
    res.status(500).json({ error: 'Failed to add mapping' })
  }
})

// PUT /api/admin/global-asset-class-map/:id
router.put('/global-asset-class-map/:id', requireAdmin, requireAdminVerified, (req, res) => {
  try {
    const mapping = db.prepare('SELECT * FROM global_asset_class_map WHERE id = ?').get(req.params.id)
    if (!mapping) return res.status(404).json({ error: 'Mapping not found' })
    const { symbol, investment_name, asset_class, style, proxy_ticker } = req.body
    db.prepare(`
      UPDATE global_asset_class_map
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
    res.json(db.prepare('SELECT * FROM global_asset_class_map WHERE id = ?').get(mapping.id))
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'That symbol is already in the global map' })
    console.error('Update global map entry error:', err)
    res.status(500).json({ error: 'Failed to update mapping' })
  }
})

// DELETE /api/admin/global-asset-class-map/:id
router.delete('/global-asset-class-map/:id', requireAdmin, requireAdminVerified, (req, res) => {
  try {
    const mapping = db.prepare('SELECT * FROM global_asset_class_map WHERE id = ?').get(req.params.id)
    if (!mapping) return res.status(404).json({ error: 'Mapping not found' })
    db.prepare('DELETE FROM global_asset_class_map WHERE id = ?').run(mapping.id)
    res.json({ success: true })
  } catch (err) {
    console.error('Delete global map entry error:', err)
    res.status(500).json({ error: 'Failed to delete mapping' })
  }
})

// GET /api/admin/global-asset-class-map/export
router.get('/global-asset-class-map/export', requireAdmin, requireAdminVerified, (req, res) => {
  try {
    const mappings = db.prepare(
      'SELECT symbol, investment_name, asset_class, style, proxy_ticker FROM global_asset_class_map ORDER BY asset_class, style, symbol'
    ).all()
    const date = new Date().toISOString().split('T')[0].replace(/-/g, '')
    res.setHeader('Content-Disposition', `attachment; filename="global-asset-class-map-${date}.json"`)
    res.setHeader('Content-Type', 'application/json')
    res.json({ export_version: 1, exported_at: new Date().toISOString(), mappings })
  } catch (err) {
    console.error('Export global map error:', err)
    res.status(500).json({ error: 'Failed to export global map' })
  }
})

// POST /api/admin/global-asset-class-map/import
router.post('/global-asset-class-map/import', requireAdmin, requireAdminVerified, (req, res) => {
  try {
    const { mappings } = req.body
    if (!Array.isArray(mappings)) return res.status(400).json({ error: 'Invalid file — expected a mappings array' })
    const upsert = db.prepare(`
      INSERT INTO global_asset_class_map (symbol, investment_name, asset_class, style, proxy_ticker)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(symbol) DO UPDATE SET
        investment_name = excluded.investment_name,
        asset_class     = excluded.asset_class,
        style           = excluded.style,
        proxy_ticker    = excluded.proxy_ticker,
        updated_at      = CURRENT_TIMESTAMP
    `)
    const tx = db.transaction((rows) => {
      for (const m of rows) {
        if (!m.symbol || !m.asset_class || !m.style) continue
        upsert.run(m.symbol.trim().toUpperCase(), (m.investment_name || '').trim(), m.asset_class.trim(), m.style.trim(), (m.proxy_ticker || '').trim().toUpperCase() || null)
      }
    })
    tx(mappings)
    const total = db.prepare('SELECT COUNT(*) as n FROM global_asset_class_map').get().n
    res.json({ imported: mappings.length, total })
  } catch (err) {
    console.error('Import global map error:', err)
    res.status(500).json({ error: 'Failed to import global map' })
  }
})

export default router
