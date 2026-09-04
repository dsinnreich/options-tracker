import { Router } from 'express'
import bcrypt from 'bcrypt'
import crypto from 'crypto'
// Pure Node.js TOTP — no dependency on Web Crypto API (avoids otplib's
// globalThis.crypto requirement which is absent on some Node versions)
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function totpGenerateSecret(byteLength = 20) {
  const bytes = crypto.randomBytes(byteLength)
  let out = '', bits = 0, val = 0
  for (const b of bytes) {
    val = (val << 8) | b; bits += 8
    while (bits >= 5) { bits -= 5; out += BASE32[(val >>> bits) & 31] }
  }
  if (bits > 0) out += BASE32[(val << (5 - bits)) & 31]
  return out
}

function totpBase32Decode(str) {
  const s = str.toUpperCase().replace(/=+$/, '')
  const bytes = []; let bits = 0, val = 0
  for (const c of s) {
    const i = BASE32.indexOf(c); if (i === -1) continue
    val = (val << 5) | i; bits += 5
    if (bits >= 8) { bits -= 8; bytes.push((val >>> bits) & 0xff) }
  }
  return Buffer.from(bytes)
}

function totpCode(secret, counter) {
  const key = totpBase32Decode(secret)
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64BE(BigInt(counter))
  const digest = crypto.createHmac('sha1', key).update(buf).digest()
  const offset = digest[19] & 0xf
  const code = ((digest[offset] & 0x7f) << 24) | ((digest[offset+1] & 0xff) << 16) |
               ((digest[offset+2] & 0xff) << 8) | (digest[offset+3] & 0xff)
  return String(code % 1_000_000).padStart(6, '0')
}

function totpVerify(token, secret, windowSize = 1) {
  const t = String(token).replace(/\s/g, '')
  const counter = Math.floor(Date.now() / 30000)
  for (let i = -windowSize; i <= windowSize; i++) {
    if (totpCode(secret, counter + i) === t) return true
  }
  return false
}

function totpUri(email, issuer, secret) {
  return `otpauth://totp/${encodeURIComponent(issuer + ':' + email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}`
}
import QRCode from 'qrcode'
import db from '../db.js'
import { sendEmail, sendSecurityNotice } from '../email.js'
import {
  clearMfaForRecovery,
  hashRecoveryCode,
  hashRecoveryToken,
  recordSecurityEvent,
  regenerateSession,
  replaceRecoveryCodes,
  revokeUserSessions,
  saveSession,
} from '../mfaRecovery.js'

const router = Router()

// ─── helpers ──────────────────────────────────────────────────────────────────

const APP_NAME = 'Options Tracker'
const TRUSTED_DEVICE_COOKIE = 'td'
const TRUSTED_DEVICE_DAYS = 30
const MFA_RECOVERY_TOKEN_MINUTES = 15
const DUMMY_PASSWORD_HASH = '$2b$10$Y8E48.d8e89QJpXAIpzO8efyRdkkZdVcoeMOeaOfW/Yof.RWw0usi'

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

// Geo-lookup via free ip-api.com (no key, ~1000 req/day limit — more than enough)
async function getCountry(ip) {
  try {
    if (!ip || ip === '127.0.0.1' || ip === '::1') return null
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 2000)
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,countryCode`, { signal: controller.signal })
    clearTimeout(timer)
    const data = await res.json()
    return data.status === 'success' ? data.countryCode : null
  } catch {
    return null
  }
}

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || null
}

function logLogin(userId, email, ip, country, success, failureReason = null, trustedDeviceId = null) {
  try {
    db.prepare(`
      INSERT INTO login_history (user_id, email, ip, country, success, failure_reason, trusted_device_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(userId ?? null, email ?? null, ip ?? null, country ?? null, success ? 1 : 0, failureReason, trustedDeviceId)
  } catch { /* never let logging break login */ }
}

// Rate limit: max 5 failed attempts per email in last 15 minutes
function isRateLimited(email) {
  try {
    const row = db.prepare(`
      SELECT COUNT(*) as n FROM login_history
      WHERE email = ? AND success = 0
        AND created_at > datetime('now', '-15 minutes')
    `).get(email)
    return row.n >= 5
  } catch {
    return false
  }
}

// Check trusted device cookie; returns device row or null
function checkTrustedDevice(req, userId) {
  try {
    const token = req.cookies?.[TRUSTED_DEVICE_COOKIE]
    if (!token) return null
    const hash = hashToken(token)
    const device = db.prepare(`
      SELECT * FROM trusted_devices
      WHERE token_hash = ? AND user_id = ? AND expires_at > CURRENT_TIMESTAMP
    `).get(hash, userId)
    if (device) {
      db.prepare(`UPDATE trusted_devices SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?`).run(device.id)
    }
    return device || null
  } catch {
    return null
  }
}

function setTrustedDeviceCookie(res, userId, country, ip, label) {
  const token = crypto.randomBytes(32).toString('hex')
  const hash = hashToken(token)
  const expiresAt = new Date(Date.now() + TRUSTED_DEVICE_DAYS * 24 * 60 * 60 * 1000).toISOString()
  db.prepare(`
    INSERT INTO trusted_devices (user_id, token_hash, label, country, ip, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(userId, hash, label || 'Browser', country || null, ip || null, expiresAt)
  res.cookie(TRUSTED_DEVICE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: TRUSTED_DEVICE_DAYS * 24 * 60 * 60 * 1000,
  })
}

function setFullSession(req, user) {
  req.session.userId = user.id
  req.session.userEmail = user.email
  req.session.userName = user.name
  req.session.isAdmin = user.is_admin === 1
  // clear any pending state
  delete req.session.pendingUserId
  delete req.session.setupUserId
  delete req.session.mfaRecoveryMethod
  delete req.session.adminVerifiedAt
}

async function beginMfaSetupAfterRecovery(req, user, method) {
  clearMfaForRecovery(user.id)
  await revokeUserSessions(req, user.id, req.sessionID)
  await regenerateSession(req)
  req.session.setupUserId = user.id
  req.session.mfaRecoveryMethod = method
  await saveSession(req)
}

// ─── login ────────────────────────────────────────────────────────────────────

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body
    const ip = getClientIp(req)

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' })
    }

    if (isRateLimited(email)) {
      return res.status(429).json({ error: 'Too many failed attempts. Try again in 15 minutes.' })
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email)
    if (!user) {
      logLogin(null, email, ip, null, false, 'user_not_found')
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    const validPassword = await bcrypt.compare(password, user.password_hash)
    if (!validPassword) {
      logLogin(user.id, email, ip, null, false, 'wrong_password')
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    // Password correct. Must user choose a new password first?
    if (user.must_change_password) {
      req.session.pendingPasswordChangeId = user.id
      return req.session.save(() => res.json({ requiresPasswordChange: true }))
    }

    // Does user need to set up 2FA first?
    if (!user.totp_enabled) {
      req.session.setupUserId = user.id
      return req.session.save(() => res.json({ requiresTotpSetup: true }))
    }

    // Check trusted device cookie
    const device = checkTrustedDevice(req, user.id)
    if (device) {
      const country = await getCountry(ip)
      logLogin(user.id, email, ip, country, true, null, device.id)
      setFullSession(req, user)
      return req.session.save((err) => {
        if (err) return res.status(500).json({ error: 'Session error' })
        return res.json({ success: true, user: { id: user.id, email: user.email, name: user.name, isAdmin: user.is_admin === 1, totpEnabled: true } })
      })
    }

    // Needs TOTP — get country for anomaly info
    const country = await getCountry(ip)
    const previousCountries = db.prepare(`
      SELECT DISTINCT country FROM login_history
      WHERE user_id = ? AND success = 1 AND country IS NOT NULL
      ORDER BY created_at DESC LIMIT 10
    `).all(user.id).map(r => r.country)
    const newCountry = country && previousCountries.length > 0 && !previousCountries.includes(country)

    req.session.pendingUserId = user.id
    req.session.pendingIp = ip
    req.session.pendingCountry = country
    req.session.save(() =>
      res.json({ requires2fa: true, newCountry: newCountry || false, country: country || null })
    )
  } catch (err) {
    console.error('login error:', err)
    res.status(500).json({ error: 'Login failed: ' + err.message })
  }
})

// ─── first-time password change ───────────────────────────────────────────────

router.post('/set-password', async (req, res) => {
  try {
    const userId = req.session.pendingPasswordChangeId
    if (!userId) return res.status(400).json({ error: 'No pending password change' })

    const { newPassword } = req.body
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' })
    }

    const passwordHash = await bcrypt.hash(newPassword, 10)
    db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(passwordHash, userId)
    delete req.session.pendingPasswordChangeId

    // Now check if TOTP setup is needed
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId)
    if (!user.totp_enabled) {
      req.session.setupUserId = user.id
      return req.session.save(() => res.json({ requiresTotpSetup: true }))
    }

    // Fully authenticated
    setFullSession(req, user)
    req.session.save((err) => {
      if (err) return res.status(500).json({ error: 'Session error' })
      res.json({ success: true, user: { id: user.id, email: user.email, name: user.name, isAdmin: user.is_admin === 1, totpEnabled: user.totp_enabled === 1 } })
    })
  } catch (err) {
    console.error('set-password error:', err)
    res.status(500).json({ error: 'Failed to set password: ' + err.message })
  }
})

// ─── complete login with TOTP ─────────────────────────────────────────────────

router.post('/2fa/verify', async (req, res) => {
  try {
    const { code, rememberDevice, deviceLabel } = req.body
    const pendingUserId = req.session.pendingUserId

    if (!pendingUserId) return res.status(400).json({ error: 'No pending login' })
    if (!code) return res.status(400).json({ error: 'Code is required' })

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(pendingUserId)
    if (!user?.totp_secret) return res.status(400).json({ error: 'User not found or 2FA not configured' })

    const valid = totpVerify(code, user.totp_secret)
    if (!valid) {
      logLogin(user.id, user.email, req.session.pendingIp, req.session.pendingCountry, false, 'wrong_totp')
      return res.status(401).json({ error: 'Invalid code. Please try again.' })
    }

    const ip = req.session.pendingIp
    const country = req.session.pendingCountry

    if (rememberDevice) {
      setTrustedDeviceCookie(res, user.id, country, ip, deviceLabel || 'Browser')
    }

    logLogin(user.id, user.email, ip, country, true)
    setFullSession(req, user)

    req.session.save((err) => {
      if (err) return res.status(500).json({ error: 'Session error' })
      res.json({ success: true, user: { id: user.id, email: user.email, name: user.name, isAdmin: user.is_admin === 1, totpEnabled: true } })
    })
  } catch (err) {
    console.error('2fa/verify error:', err)
    res.status(500).json({ error: 'Verification failed: ' + err.message })
  }
})

// Use a saved one-time recovery code after the password step.
router.post('/2fa/recover/code', async (req, res) => {
  try {
    const userId = req.session.pendingUserId
    const { recoveryCode } = req.body
    if (!userId) return res.status(400).json({ error: 'Start by signing in with your password' })
    if (!recoveryCode) return res.status(400).json({ error: 'Recovery code is required' })

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId)
    if (!user?.totp_enabled) return res.status(400).json({ error: '2FA recovery is not available' })
    if (isRateLimited(user.email)) return res.status(429).json({ error: 'Too many failed attempts. Try again in 15 minutes.' })

    const storedCode = db.prepare(`
      SELECT id FROM mfa_recovery_codes
      WHERE user_id = ? AND code_hash = ? AND used_at IS NULL
    `).get(user.id, hashRecoveryCode(recoveryCode))

    if (!storedCode) {
      logLogin(user.id, user.email, getClientIp(req), null, false, 'wrong_mfa_recovery_code')
      recordSecurityEvent(user, 'mfa_recovery_code_failed', getClientIp(req))
      return res.status(401).json({ error: 'Invalid or already-used recovery code' })
    }

    await beginMfaSetupAfterRecovery(req, user, 'recovery_code')
    recordSecurityEvent(user, 'mfa_recovery_completed', getClientIp(req), 'Recovery code')
    res.clearCookie(TRUSTED_DEVICE_COOKIE)
    void sendSecurityNotice(
      user.email,
      'Two-factor authentication recovery completed',
      'A recovery code was used to reset your authenticator. All trusted devices and previous recovery codes were revoked.'
    )
    res.json({ success: true, requiresTotpSetup: true })
  } catch (err) {
    console.error('2fa/recover/code error:', err)
    res.status(500).json({ error: 'Failed to recover two-factor authentication' })
  }
})

// Request a short-lived recovery link. A valid password is required, but the
// response is deliberately generic so the endpoint does not reveal accounts.
router.post('/2fa/recover/request-email', async (req, res) => {
  const genericMessage = 'If the account details are valid, a recovery link has been sent.'
  try {
    const { email, password } = req.body
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' })

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email)
    if (user && isRateLimited(user.email)) {
      return res.status(429).json({ error: 'Too many failed attempts. Try again in 15 minutes.' })
    }
    const validPassword = await bcrypt.compare(password, user?.password_hash || DUMMY_PASSWORD_HASH)
    if (!user || !validPassword || !user.totp_enabled) {
      if (user) {
        logLogin(user.id, user.email, getClientIp(req), null, false, 'mfa_recovery_bad_password')
        recordSecurityEvent(user, 'mfa_recovery_email_failed', getClientIp(req))
      }
      return res.json({ success: true, message: genericMessage })
    }

    const recentRequests = db.prepare(`
      SELECT COUNT(*) AS count FROM mfa_recovery_tokens
      WHERE user_id = ? AND created_at > datetime('now', '-15 minutes')
    `).get(user.id).count
    if (recentRequests >= 3) {
      return res.status(429).json({ error: 'Too many recovery requests. Try again in 15 minutes.' })
    }
    if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
      return res.status(503).json({ error: 'Recovery email service is unavailable' })
    }

    const token = crypto.randomBytes(32).toString('base64url')
    const tokenHash = hashRecoveryToken(token)
    const expiresAt = new Date(Date.now() + MFA_RECOVERY_TOKEN_MINUTES * 60 * 1000).toISOString()
    db.prepare(`
      DELETE FROM mfa_recovery_tokens WHERE created_at < datetime('now', '-30 days')
    `).run()
    db.prepare(`
      UPDATE mfa_recovery_tokens SET used_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND used_at IS NULL
    `).run(user.id)
    db.prepare(`
      INSERT INTO mfa_recovery_tokens (user_id, token_hash, requested_ip, expires_at)
      VALUES (?, ?, ?, ?)
    `).run(user.id, tokenHash, getClientIp(req), expiresAt)

    const appUrl = (process.env.APP_URL || 'http://localhost:3001').replace(/\/$/, '')
    const recoveryUrl = `${appUrl}/recover-2fa?token=${encodeURIComponent(token)}`
    try {
      await sendMfaRecoveryEmail(user.email, recoveryUrl)
    } catch (err) {
      db.prepare('DELETE FROM mfa_recovery_tokens WHERE token_hash = ?').run(tokenHash)
      throw err
    }

    recordSecurityEvent(user, 'mfa_recovery_email_requested', getClientIp(req))
    res.json({ success: true, message: genericMessage })
  } catch (err) {
    console.error('2fa/recover/request-email error:', err.message)
    res.status(500).json({ error: 'Failed to send the recovery email' })
  }
})

// Complete email recovery with independent proof of both the emailed token and
// the account password, then force enrollment of a replacement authenticator.
router.post('/2fa/recover/complete-email', async (req, res) => {
  try {
    const { token, password } = req.body
    if (!token || !password) return res.status(400).json({ error: 'Recovery token and password are required' })

    const recovery = db.prepare(`
      SELECT t.id AS token_id, t.expires_at, t.used_at, u.*
      FROM mfa_recovery_tokens t
      JOIN users u ON u.id = t.user_id
      WHERE t.token_hash = ?
    `).get(hashRecoveryToken(token))

    if (!recovery || recovery.used_at || new Date(recovery.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Invalid or expired recovery link' })
    }
    if (isRateLimited(recovery.email)) {
      return res.status(429).json({ error: 'Too many failed attempts. Try again in 15 minutes.' })
    }

    const validPassword = await bcrypt.compare(password, recovery.password_hash)
    if (!validPassword) {
      logLogin(recovery.id, recovery.email, getClientIp(req), null, false, 'mfa_recovery_bad_password')
      recordSecurityEvent(recovery, 'mfa_recovery_email_failed', getClientIp(req))
      return res.status(401).json({ error: 'Incorrect password' })
    }

    await beginMfaSetupAfterRecovery(req, recovery, 'email')
    recordSecurityEvent(recovery, 'mfa_recovery_completed', getClientIp(req), 'Email link and password')
    res.clearCookie(TRUSTED_DEVICE_COOKIE)
    void sendSecurityNotice(
      recovery.email,
      'Two-factor authentication recovery completed',
      'Your authenticator was reset using an email recovery link and your password. All trusted devices, active sessions, and previous recovery codes were revoked.'
    )
    res.json({ success: true, requiresTotpSetup: true })
  } catch (err) {
    console.error('2fa/recover/complete-email error:', err)
    res.status(500).json({ error: 'Failed to complete two-factor authentication recovery' })
  }
})

// ─── TOTP setup (new users, or changing authenticator) ────────────────────────

// Generate a secret + QR code. Requires a setup-only session.
router.get('/2fa/setup-secret', async (req, res) => {
  try {
    const userId = req.session.setupUserId
    if (!userId) return res.status(401).json({ error: 'Not authenticated' })

    const user = db.prepare('SELECT id, email, name FROM users WHERE id = ?').get(userId)
    if (!user) return res.status(404).json({ error: 'User not found' })

    const secret = totpGenerateSecret()
    const otpauth = totpUri(user.email, APP_NAME, secret)
    const qrDataUrl = await QRCode.toDataURL(otpauth)

    // Do not replace a working authenticator until the new secret is verified.
    db.prepare('UPDATE users SET totp_pending_secret = ? WHERE id = ?').run(secret, userId)

    res.json({ secret, qrDataUrl })
  } catch (err) {
    console.error('2fa/setup-secret error:', err)
    res.status(500).json({ error: 'Failed to generate 2FA setup: ' + err.message })
  }
})

// Verify the first code and enable 2FA, then complete login
router.post('/2fa/enable', async (req, res) => {
  try {
    const { code } = req.body
    const userId = req.session.setupUserId
    if (!userId) return res.status(401).json({ error: 'Not authenticated' })
    if (!code) return res.status(400).json({ error: 'Code is required' })

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId)
    if (!user?.totp_pending_secret) return res.status(400).json({ error: '2FA secret not generated yet' })

    const valid = totpVerify(code, user.totp_pending_secret)
    if (!valid) return res.status(401).json({ error: 'Invalid code — make sure your authenticator clock is synced' })

    db.prepare(`
      UPDATE users
      SET totp_secret = totp_pending_secret, totp_pending_secret = NULL,
          totp_enabled = 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(userId)
    const recoveryCodes = replaceRecoveryCodes(userId)
    recordSecurityEvent(user, 'mfa_enabled', getClientIp(req), 'New authenticator enrolled')
    void sendSecurityNotice(
      user.email,
      'Two-factor authentication was set up',
      'A new authenticator was added to your Options Tracker account. If you did not do this, contact the administrator immediately.'
    )

    const fullUser = db.prepare('SELECT * FROM users WHERE id = ?').get(userId)
    setFullSession(req, fullUser)
    logLogin(userId, fullUser.email, getClientIp(req), null, true)
    req.session.save((err) => {
      if (err) return res.status(500).json({ error: 'Session error' })
      res.json({
        success: true,
        recoveryCodes,
        user: { id: fullUser.id, email: fullUser.email, name: fullUser.name, isAdmin: fullUser.is_admin === 1, totpEnabled: true }
      })
    })
  } catch (err) {
    console.error('2fa/enable error:', err)
    res.status(500).json({ error: 'Failed to enable 2FA: ' + err.message })
  }
})

// Disable 2FA — requires current password + valid TOTP
router.post('/2fa/disable', async (req, res) => {
  try {
    if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' })
    const { password, code } = req.body
    if (!password || !code) return res.status(400).json({ error: 'Password and code are required' })

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId)
    if (!user) return res.status(404).json({ error: 'User not found' })

    const validPw = await bcrypt.compare(password, user.password_hash)
    if (!validPw) return res.status(401).json({ error: 'Incorrect password' })

    const validCode = totpVerify(code, user.totp_secret)
    if (!validCode) return res.status(401).json({ error: 'Invalid authenticator code' })

    const disable = db.transaction(() => {
      db.prepare(`
        UPDATE users
        SET totp_enabled = 0, totp_secret = NULL, totp_pending_secret = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(user.id)
      db.prepare('DELETE FROM mfa_recovery_codes WHERE user_id = ?').run(user.id)
      db.prepare('DELETE FROM mfa_recovery_tokens WHERE user_id = ?').run(user.id)
      db.prepare('DELETE FROM trusted_devices WHERE user_id = ?').run(user.id)
    })
    disable()
    recordSecurityEvent(user, 'mfa_disabled', getClientIp(req))
    void sendSecurityNotice(
      user.email,
      'Two-factor authentication was disabled',
      'Two-factor authentication was disabled on your Options Tracker account. If you did not do this, contact the administrator immediately.'
    )
    res.json({ success: true, message: '2FA disabled' })
  } catch (err) {
    console.error('2fa/disable error:', err)
    res.status(500).json({ error: 'Failed to disable 2FA: ' + err.message })
  }
})

// Generate a fresh set of one-time recovery codes. Existing codes are revoked.
router.post('/2fa/recovery-codes/regenerate', async (req, res) => {
  try {
    if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' })
    const { password, code } = req.body
    if (!password || !code) return res.status(400).json({ error: 'Password and authenticator code are required' })

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId)
    if (!user?.totp_enabled || !user.totp_secret) return res.status(400).json({ error: '2FA is not configured' })

    const [validPassword, validCode] = await Promise.all([
      bcrypt.compare(password, user.password_hash),
      Promise.resolve(totpVerify(code, user.totp_secret)),
    ])
    if (!validPassword || !validCode) {
      recordSecurityEvent(user, 'mfa_recovery_codes_failed', getClientIp(req))
      return res.status(401).json({ error: 'Password or authenticator code is incorrect' })
    }

    const recoveryCodes = replaceRecoveryCodes(user.id)
    recordSecurityEvent(user, 'mfa_recovery_codes_regenerated', getClientIp(req))
    void sendSecurityNotice(
      user.email,
      'New recovery codes were generated',
      'Your previous Options Tracker recovery codes are no longer valid. If you did not generate new codes, contact the administrator immediately.'
    )
    res.json({ success: true, recoveryCodes })
  } catch (err) {
    console.error('recovery-codes/regenerate error:', err)
    res.status(500).json({ error: 'Failed to generate recovery codes' })
  }
})

// ─── admin step-up verification ───────────────────────────────────────────────

router.post('/admin-verify', (req, res) => {
  if (!req.session.userId || !req.session.isAdmin) return res.status(403).json({ error: 'Forbidden' })
  const { code } = req.body
  if (!code) return res.status(400).json({ error: 'Code required' })

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId)
  if (!user?.totp_secret) return res.status(400).json({ error: '2FA not configured' })

  const valid = totpVerify(code, user.totp_secret)
  if (!valid) return res.status(401).json({ error: 'Invalid code' })

  req.session.adminVerifiedAt = Date.now()
  req.session.save(() => res.json({ success: true }))
})

// ─── login history ────────────────────────────────────────────────────────────

router.get('/login-history', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' })
  const rows = db.prepare(`
    SELECT id, ip, country, success, failure_reason, trusted_device_id, created_at
    FROM login_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 20
  `).all(req.session.userId)
  res.json(rows)
})

// ─── trusted devices ─────────────────────────────────────────────────────────

router.get('/trusted-devices', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' })
  const devices = db.prepare(`
    SELECT id, label, country, ip, created_at, last_used_at, expires_at
    FROM trusted_devices WHERE user_id = ? AND expires_at > CURRENT_TIMESTAMP ORDER BY last_used_at DESC
  `).all(req.session.userId)
  res.json(devices)
})

router.delete('/trusted-devices/:id', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' })
  db.prepare('DELETE FROM trusted_devices WHERE id = ? AND user_id = ?').run(req.params.id, req.session.userId)
  res.json({ success: true })
})

// ─── unchanged routes below ───────────────────────────────────────────────────

router.post('/logout', (req, res) => {
  res.clearCookie(TRUSTED_DEVICE_COOKIE)
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: 'Logout failed' })
    res.clearCookie('connect.sid')
    res.json({ success: true })
  })
})

router.get('/me', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' })
  const user = db.prepare('SELECT id, email, name, is_admin, totp_enabled FROM users WHERE id = ?').get(req.session.userId)
  if (!user) return res.status(401).json({ error: 'User not found' })
  res.json({ id: user.id, email: user.email, name: user.name, isAdmin: user.is_admin === 1, totpEnabled: user.totp_enabled === 1 })
})

function sendPasswordResetEmail(to, resetUrl) {
  return sendEmail(
    to,
    'Password Reset - Options Tracker',
    `<h2>Password Reset</h2><p><a href="${resetUrl}">${resetUrl}</a></p><p>Valid for 1 hour.</p>`
  )
}

function sendMfaRecoveryEmail(to, recoveryUrl) {
  return sendEmail(
    to,
    'Recover two-factor authentication - Options Tracker',
    `<h2>Two-factor authentication recovery</h2>
     <p>A request was made to replace the authenticator on your Options Tracker account.</p>
     <p><a href="${recoveryUrl}">Continue 2FA recovery</a></p>
     <p>This single-use link expires in ${MFA_RECOVERY_TOKEN_MINUTES} minutes. You will need to enter your password again.</p>
     <p>If you did not request this, do not use the link and contact the administrator.</p>`
  )
}

router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body
    if (!email) return res.status(400).json({ error: 'Email is required' })
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email)
    if (!user) return res.json({ success: true, message: 'If that email exists, a reset link has been sent' })
    if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
      console.error('Password reset: RESEND_API_KEY or RESEND_FROM_EMAIL not set in environment')
      return res.status(500).json({ error: 'Email service not configured. Contact the admin to reset your password.' })
    }
    const resetToken = crypto.randomBytes(32).toString('hex')
    const resetTokenExpires = new Date(Date.now() + 3600000).toISOString()
    db.prepare('UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?').run(resetToken, resetTokenExpires, user.id)
    const resetUrl = `${process.env.APP_URL || 'http://localhost:3001'}/reset-password?token=${resetToken}`
    await sendPasswordResetEmail(email, resetUrl)
    res.json({ success: true, message: 'If that email exists, a reset link has been sent' })
  } catch (err) {
    console.error('Password reset request error:', err.message)
    res.status(500).json({ error: `Failed to send reset email: ${err.message}` })
  }
})

router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body
    if (!token || !newPassword) return res.status(400).json({ error: 'Token and new password are required' })
    if (newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' })
    const user = db.prepare('SELECT * FROM users WHERE reset_token = ?').get(token)
    if (!user || new Date(user.reset_token_expires) < new Date()) return res.status(400).json({ error: 'Invalid or expired reset token' })
    const passwordHash = await bcrypt.hash(newPassword, 10)
    const reset = db.transaction(() => {
      db.prepare(`
        UPDATE users
        SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(passwordHash, user.id)
      db.prepare('DELETE FROM trusted_devices WHERE user_id = ?').run(user.id)
    })
    reset()
    await revokeUserSessions(req, user.id)
    recordSecurityEvent(user, 'password_reset', getClientIp(req))
    void sendSecurityNotice(
      user.email,
      'Your password was reset',
      'Your Options Tracker password was reset. Existing sessions and trusted devices were signed out. Your authenticator configuration was not changed.'
    )
    res.json({ success: true, message: 'Password reset successful' })
  } catch (err) {
    res.status(500).json({ error: 'Failed to reset password' })
  }
})

router.post('/change-password', async (req, res) => {
  try {
    if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' })
    const { currentPassword, newPassword } = req.body
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Current and new password are required' })
    if (newPassword.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' })
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId)
    const validPassword = await bcrypt.compare(currentPassword, user.password_hash)
    if (!validPassword) return res.status(401).json({ error: 'Current password is incorrect' })
    const passwordHash = await bcrypt.hash(newPassword, 10)
    db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(passwordHash, user.id)
    res.json({ success: true, message: 'Password changed successfully' })
  } catch (err) {
    res.status(500).json({ error: 'Failed to change password' })
  }
})

export default router
