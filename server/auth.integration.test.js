import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import net from 'node:net'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'

const projectRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function decodeBase32(value) {
  const bytes = []
  let bits = 0
  let buffer = 0

  for (const character of value.toUpperCase().replace(/=+$/, '')) {
    const index = BASE32.indexOf(character)
    if (index === -1) continue
    buffer = (buffer << 5) | index
    bits += 5
    if (bits >= 8) {
      bits -= 8
      bytes.push((buffer >>> bits) & 0xff)
    }
  }

  return Buffer.from(bytes)
}

function currentTotp(secret) {
  const counter = Math.floor(Date.now() / 30_000)
  const counterBuffer = Buffer.alloc(8)
  counterBuffer.writeBigUInt64BE(BigInt(counter))
  const digest = crypto.createHmac('sha1', decodeBase32(secret)).update(counterBuffer).digest()
  const offset = digest[19] & 0xf
  const value = ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff)
  return String(value % 1_000_000).padStart(6, '0')
}

async function availablePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()
  await new Promise(resolve => server.close(resolve))
  return port
}

async function waitForServer(baseUrl, child, output) {
  const deadline = Date.now() + 12_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Server exited before becoming healthy.\n${output.join('')}`)
    }
    try {
      const response = await fetch(`${baseUrl}/api/health`)
      if (response.ok) return
    } catch {
      // The server may still be applying migrations.
    }
    await new Promise(resolve => setTimeout(resolve, 75))
  }
  throw new Error(`Server did not become healthy.\n${output.join('')}`)
}

function createClient(baseUrl) {
  const cookies = new Map()

  return {
    clearCookie() {
      cookies.clear()
    },
    async request(path, { method = 'GET', body } = {}) {
      const headers = { 'x-forwarded-for': '127.0.0.1' }
      if (cookies.size) {
        headers.cookie = [...cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ')
      }
      if (body !== undefined) headers['content-type'] = 'application/json'

      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      const setCookies = response.headers.getSetCookie?.() || []
      for (const setCookie of setCookies) {
        const [pair] = setCookie.split(';', 1)
        const separator = pair.indexOf('=')
        const name = pair.slice(0, separator)
        const value = pair.slice(separator + 1)
        if (value) cookies.set(name, value)
        else cookies.delete(name)
      }

      const payload = await response.json()
      return { status: response.status, payload }
    },
  }
}

test('MFA recovery revokes old factors and forces authenticator re-enrollment', async () => {
  const testDir = mkdtempSync(join(tmpdir(), 'options-tracker-auth-'))
  const databasePath = join(testDir, 'options.db')
  const port = await availablePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const output = []
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      DATABASE_PATH: databasePath,
      SESSION_DB_DIR: testDir,
      PORT: String(port),
      NODE_ENV: 'development',
      RESEND_API_KEY: '',
      RESEND_FROM_EMAIL: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', chunk => output.push(chunk.toString()))
  child.stderr.on('data', chunk => output.push(chunk.toString()))

  let testDb
  try {
    await waitForServer(baseUrl, child, output)
    const client = createClient(baseUrl)

    let response = await client.request('/api/auth/login', {
      method: 'POST',
      body: { email: 'admin@options-tracker.local', password: 'changeme' },
    })
    assert.equal(response.status, 200)
    assert.equal(response.payload.requiresTotpSetup, true)

    response = await client.request('/api/auth/2fa/setup-secret')
    assert.equal(response.status, 200)
    const firstSecret = response.payload.secret

    response = await client.request('/api/auth/2fa/enable', {
      method: 'POST',
      body: { code: currentTotp(firstSecret) },
    })
    assert.equal(response.status, 200)
    assert.equal(response.payload.recoveryCodes.length, 10)
    const originalCodes = response.payload.recoveryCodes

    response = await client.request('/api/auth/logout', { method: 'POST' })
    assert.equal(response.status, 200)

    response = await client.request('/api/auth/login', {
      method: 'POST',
      body: { email: 'admin@options-tracker.local', password: 'changeme' },
    })
    assert.equal(response.payload.requires2fa, true)

    response = await client.request('/api/auth/2fa/recover/code', {
      method: 'POST',
      body: { recoveryCode: originalCodes[0].toLowerCase().replaceAll('-', ' ') },
    })
    assert.equal(response.status, 200)
    assert.equal(response.payload.requiresTotpSetup, true)

    response = await client.request('/api/auth/me')
    assert.equal(response.status, 401, 'recovery must not create a fully authenticated session')

    response = await client.request('/api/auth/2fa/setup-secret')
    assert.equal(response.status, 200)
    const secondSecret = response.payload.secret
    response = await client.request('/api/auth/2fa/enable', {
      method: 'POST',
      body: { code: currentTotp(secondSecret) },
    })
    assert.equal(response.status, 200)
    assert.equal(response.payload.recoveryCodes.length, 10)

    await client.request('/api/auth/logout', { method: 'POST' })
    await client.request('/api/auth/login', {
      method: 'POST',
      body: { email: 'admin@options-tracker.local', password: 'changeme' },
    })
    response = await client.request('/api/auth/2fa/recover/code', {
      method: 'POST',
      body: { recoveryCode: originalCodes[1] },
    })
    assert.equal(response.status, 401, 'codes from the replaced authenticator must be revoked')

    for (let attempt = 0; attempt < 4; attempt += 1) {
      response = await client.request('/api/auth/2fa/recover/code', {
        method: 'POST',
        body: { recoveryCode: originalCodes[1] },
      })
      assert.equal(response.status, 401)
    }
    response = await client.request('/api/auth/2fa/recover/code', {
      method: 'POST',
      body: { recoveryCode: originalCodes[1] },
    })
    assert.equal(response.status, 429, 'recovery-code guessing must be rate limited')

    const rawEmailToken = crypto.randomBytes(32).toString('base64url')
    const tokenHash = crypto.createHash('sha256').update(rawEmailToken).digest('hex')
    testDb = new Database(databasePath)
    const user = testDb.prepare('SELECT id FROM users WHERE email = ?').get('admin@options-tracker.local')
    testDb.prepare('DELETE FROM login_history WHERE user_id = ? AND success = 0').run(user.id)
    testDb.prepare(`
      INSERT INTO mfa_recovery_tokens (user_id, token_hash, requested_ip, expires_at)
      VALUES (?, ?, '127.0.0.1', ?)
    `).run(user.id, tokenHash, new Date(Date.now() + 15 * 60_000).toISOString())

    client.clearCookie()
    response = await client.request('/api/auth/2fa/recover/complete-email', {
      method: 'POST',
      body: { token: rawEmailToken, password: 'changeme' },
    })
    assert.equal(response.status, 200)
    assert.equal(response.payload.requiresTotpSetup, true)

    response = await client.request('/api/auth/2fa/setup-secret')
    assert.equal(response.status, 200, 'email recovery must create setup-only session state')

    const recoveredUser = testDb.prepare(`
      SELECT totp_enabled, totp_secret FROM users WHERE id = ?
    `).get(user.id)
    assert.deepEqual(recoveredUser, { totp_enabled: 0, totp_secret: null })
    assert.equal(
      testDb.prepare('SELECT COUNT(*) AS count FROM mfa_recovery_codes WHERE user_id = ?').get(user.id).count,
      0,
    )
    assert.equal(
      testDb.prepare('SELECT COUNT(*) AS count FROM mfa_recovery_tokens WHERE user_id = ?').get(user.id).count,
      0,
    )
  } finally {
    testDb?.close()
    if (child.exitCode === null) child.kill('SIGTERM')
    await new Promise(resolve => {
      if (child.exitCode !== null) return resolve()
      child.once('exit', resolve)
      setTimeout(resolve, 2_000)
    })
    rmSync(testDir, { recursive: true, force: true })
  }
})
