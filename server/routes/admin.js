import { Router } from 'express'
import bcrypt from 'bcrypt'
import db from '../db.js'

const router = Router()

// Middleware to check if user is admin
function requireAdmin(req, res, next) {
  if (!req.session.userId || !req.session.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' })
  }
  next()
}

// Get all users (admin only)
router.get('/users', requireAdmin, (req, res) => {
  try {
    const users = db.prepare('SELECT id, email, name, is_admin, created_at FROM users ORDER BY created_at DESC').all()
    res.json(users)
  } catch (error) {
    console.error('Get users error:', error)
    res.status(500).json({ error: 'Failed to fetch users' })
  }
})

// Create a new user (admin only)
router.post('/users', requireAdmin, async (req, res) => {
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

    // Create user
    const result = db.prepare(`
      INSERT INTO users (email, password_hash, name, is_admin)
      VALUES (?, ?, ?, ?)
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
router.delete('/users/:id', requireAdmin, (req, res) => {
  try {
    const userId = parseInt(req.params.id)

    // Don't allow admin to delete themselves
    if (userId === req.session.userId) {
      return res.status(400).json({ error: 'Cannot delete your own account' })
    }

    // Check if user exists
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId)

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    // Delete user's positions first
    db.prepare('DELETE FROM positions WHERE user_id = ?').run(userId)

    // Delete user
    db.prepare('DELETE FROM users WHERE id = ?').run(userId)

    res.json({ success: true, message: 'User deleted successfully' })
  } catch (error) {
    console.error('Delete user error:', error)
    res.status(500).json({ error: 'Failed to delete user' })
  }
})

// Update user (admin only)
router.put('/users/:id', requireAdmin, async (req, res) => {
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

export default router
