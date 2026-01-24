import { Router } from 'express'
import bcrypt from 'bcrypt'
import crypto from 'crypto'
import nodemailer from 'nodemailer'
import db from '../db.js'

const router = Router()

// Email transporter configuration (Gmail)
let emailTransporter = null

function getEmailTransporter() {
  if (!emailTransporter && process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    emailTransporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD
      }
    })
  }
  return emailTransporter
}

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' })
    }

    // Find user by email
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email)

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash)

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    // Store user in session
    req.session.userId = user.id
    req.session.userEmail = user.email
    req.session.userName = user.name
    req.session.isAdmin = user.is_admin === 1

    console.log('Login successful:', {
      userId: user.id,
      email: user.email,
      sessionID: req.sessionID,
      isAdmin: user.is_admin === 1
    })

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isAdmin: user.is_admin === 1
      }
    })
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ error: 'Login failed' })
  }
})

// Logout
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' })
    }
    res.clearCookie('connect.sid')
    res.json({ success: true })
  })
})

// Check if user is logged in
router.get('/me', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not logged in' })
  }

  const user = db.prepare('SELECT id, email, name, is_admin FROM users WHERE id = ?').get(req.session.userId)

  if (!user) {
    return res.status(401).json({ error: 'User not found' })
  }

  res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    isAdmin: user.is_admin === 1
  })
})

// Request password reset
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body

    if (!email) {
      return res.status(400).json({ error: 'Email is required' })
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email)

    if (!user) {
      // Don't reveal if email exists or not (security)
      return res.json({ success: true, message: 'If that email exists, a reset link has been sent' })
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex')
    const resetTokenExpires = new Date(Date.now() + 3600000).toISOString() // 1 hour

    // Save reset token to database
    db.prepare('UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?')
      .run(resetToken, resetTokenExpires, user.id)

    // Send reset email
    const transporter = getEmailTransporter()

    if (!transporter) {
      console.error('Email not configured')
      return res.status(500).json({ error: 'Email service not configured' })
    }

    const resetUrl = `${process.env.APP_URL || 'http://localhost:3001'}/reset-password?token=${resetToken}`

    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: email,
      subject: 'Password Reset - Options Tracker',
      html: `
        <h2>Password Reset Request</h2>
        <p>You requested to reset your password for Options Tracker.</p>
        <p>Click the link below to reset your password (valid for 1 hour):</p>
        <p><a href="${resetUrl}">${resetUrl}</a></p>
        <p>If you didn't request this, please ignore this email.</p>
      `
    })

    res.json({ success: true, message: 'If that email exists, a reset link has been sent' })
  } catch (error) {
    console.error('Password reset request error:', error)
    res.status(500).json({ error: 'Failed to send reset email' })
  }
})

// Reset password with token
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body

    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password are required' })
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' })
    }

    // Find user by reset token
    const user = db.prepare('SELECT * FROM users WHERE reset_token = ?').get(token)

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset token' })
    }

    // Check if token is expired
    if (new Date(user.reset_token_expires) < new Date()) {
      return res.status(400).json({ error: 'Reset token has expired' })
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 10)

    // Update password and clear reset token
    db.prepare('UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?')
      .run(passwordHash, user.id)

    res.json({ success: true, message: 'Password reset successful' })
  } catch (error) {
    console.error('Password reset error:', error)
    res.status(500).json({ error: 'Failed to reset password' })
  }
})

// Change password (when logged in)
router.post('/change-password', async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Not logged in' })
    }

    const { currentPassword, newPassword } = req.body

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password are required' })
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' })
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId)

    if (!user) {
      return res.status(401).json({ error: 'User not found' })
    }

    // Verify current password
    const validPassword = await bcrypt.compare(currentPassword, user.password_hash)

    if (!validPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' })
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 10)

    // Update password
    db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(passwordHash, user.id)

    res.json({ success: true, message: 'Password changed successfully' })
  } catch (error) {
    console.error('Password change error:', error)
    res.status(500).json({ error: 'Failed to change password' })
  }
})

export default router
