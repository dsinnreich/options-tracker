import crypto from 'crypto'
import db from './db.js'

const RECOVERY_CODE_COUNT = 10

export function normalizeRecoveryCode(code) {
  return String(code || '').toUpperCase().replace(/[^A-Z2-7]/g, '')
}

export function hashRecoveryCode(code) {
  return crypto.createHash('sha256').update(normalizeRecoveryCode(code)).digest('hex')
}

export function hashRecoveryToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex')
}

function createRecoveryCode() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const bytes = crypto.randomBytes(10)
  let bits = 0
  let value = 0
  let code = ''

  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      bits -= 5
      code += alphabet[(value >>> bits) & 31]
    }
  }

  return code.match(/.{1,4}/g).join('-')
}

export function replaceRecoveryCodes(userId) {
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, createRecoveryCode)
  const replace = db.transaction(() => {
    db.prepare('DELETE FROM mfa_recovery_codes WHERE user_id = ?').run(userId)
    const insert = db.prepare(
      'INSERT INTO mfa_recovery_codes (user_id, code_hash) VALUES (?, ?)'
    )
    for (const code of codes) insert.run(userId, hashRecoveryCode(code))
  })
  replace()
  return codes
}

export function recordSecurityEvent(user, eventType, ip, details = null) {
  try {
    db.prepare(`
      INSERT INTO security_events (user_id, email, event_type, ip, details)
      VALUES (?, ?, ?, ?, ?)
    `).run(user?.id ?? null, user?.email ?? null, eventType, ip || null, details)
  } catch (err) {
    console.error('Failed to record security event:', err.message)
  }
}

export function clearMfaForRecovery(userId) {
  const clear = db.transaction(() => {
    db.prepare(`
      UPDATE users
      SET totp_enabled = 0, totp_secret = NULL, totp_pending_secret = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(userId)
    db.prepare('DELETE FROM mfa_recovery_codes WHERE user_id = ?').run(userId)
    db.prepare('DELETE FROM mfa_recovery_tokens WHERE user_id = ?').run(userId)
    db.prepare('DELETE FROM trusted_devices WHERE user_id = ?').run(userId)
  })
  clear()
}

function sessionBelongsToUser(sessionData, userId) {
  return [
    sessionData?.userId,
    sessionData?.pendingUserId,
    sessionData?.setupUserId,
    sessionData?.pendingPasswordChangeId,
  ].some(value => Number(value) === Number(userId))
}

export async function revokeUserSessions(req, userId, exceptSid = null) {
  const store = req.app.locals.sessionStore
  if (!store?.db || !store?.table) return

  const rows = await new Promise((resolve, reject) => {
    store.db.all(`SELECT sid, sess FROM ${store.table}`, (err, result) => {
      if (err) reject(err)
      else resolve(result || [])
    })
  })

  const matchingSids = rows.flatMap(row => {
    try {
      return row.sid !== exceptSid && sessionBelongsToUser(JSON.parse(row.sess), userId)
        ? [row.sid]
        : []
    } catch {
      return []
    }
  })

  await Promise.all(matchingSids.map(sid => new Promise((resolve, reject) => {
    store.destroy(sid, err => err ? reject(err) : resolve())
  })))
}

export function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate(err => err ? reject(err) : resolve())
  })
}

export function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save(err => err ? reject(err) : resolve())
  })
}
