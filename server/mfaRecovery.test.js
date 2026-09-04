import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const testDir = mkdtempSync(join(tmpdir(), 'options-tracker-mfa-'))
process.env.DATABASE_PATH = join(testDir, 'test.db')

const { default: db } = await import('./db.js')
const {
  clearMfaForRecovery,
  hashRecoveryCode,
  normalizeRecoveryCode,
  replaceRecoveryCodes,
} = await import('./mfaRecovery.js')

after(() => {
  db.close()
  rmSync(testDir, { recursive: true, force: true })
})

test('recovery codes are unique, formatted, and stored only as hashes', () => {
  const user = db.prepare('SELECT id FROM users LIMIT 1').get()
  const codes = replaceRecoveryCodes(user.id)

  assert.equal(codes.length, 10)
  assert.equal(new Set(codes).size, 10)
  for (const code of codes) assert.match(code, /^[A-Z2-7]{4}(?:-[A-Z2-7]{4}){3}$/)

  const stored = db.prepare(
    'SELECT code_hash FROM mfa_recovery_codes WHERE user_id = ? ORDER BY id'
  ).all(user.id)
  assert.equal(stored.length, 10)
  assert.ok(stored.every(row => /^[a-f0-9]{64}$/.test(row.code_hash)))
  assert.ok(stored.some(row => row.code_hash === hashRecoveryCode(codes[0])))
  assert.ok(!stored.some(row => codes.includes(row.code_hash)))
})

test('recovery code normalization accepts display formatting only', () => {
  assert.equal(normalizeRecoveryCode('abcd-efgh ijkl-mnop'), 'ABCDEFGHIJKLMNOP')
})

test('MFA recovery revokes every bound MFA artifact without deleting the user', () => {
  const user = db.prepare('SELECT id FROM users LIMIT 1').get()
  db.prepare(`
    UPDATE users SET totp_enabled = 1, totp_secret = 'active', totp_pending_secret = 'pending'
    WHERE id = ?
  `).run(user.id)
  db.prepare(`
    INSERT INTO trusted_devices (user_id, token_hash, expires_at)
    VALUES (?, 'device-hash', datetime('now', '+1 day'))
  `).run(user.id)
  db.prepare(`
    INSERT INTO mfa_recovery_tokens (user_id, token_hash, expires_at)
    VALUES (?, 'token-hash', datetime('now', '+15 minutes'))
  `).run(user.id)

  clearMfaForRecovery(user.id)

  const updated = db.prepare(
    'SELECT totp_enabled, totp_secret, totp_pending_secret FROM users WHERE id = ?'
  ).get(user.id)
  assert.deepEqual(updated, { totp_enabled: 0, totp_secret: null, totp_pending_secret: null })
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM mfa_recovery_codes WHERE user_id = ?').get(user.id).count, 0)
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM mfa_recovery_tokens WHERE user_id = ?').get(user.id).count, 0)
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM trusted_devices WHERE user_id = ?').get(user.id).count, 0)
  assert.ok(db.prepare('SELECT id FROM users WHERE id = ?').get(user.id))
})
