import Database from 'better-sqlite3'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { existsSync, mkdirSync } from 'fs'
import bcrypt from 'bcrypt'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Use DATABASE_PATH from env if set, otherwise default to ../data/options.db
const dbPath = process.env.DATABASE_PATH || join(__dirname, '..', 'data', 'options.db')
const dataDir = dirname(dbPath)

// Ensure directory exists
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true })
}

console.log(`📁 Database path: ${dbPath}`)

const db = new Database(dbPath)

// Schema version tracking
db.exec(`
  CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`)

// Get current schema version
function getCurrentVersion() {
  const result = db.prepare('SELECT MAX(version) as version FROM schema_version').get()
  return result.version || 0
}

// Initial schema (version 1)
db.exec(`
  CREATE TABLE IF NOT EXISTS positions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account TEXT NOT NULL,
    ticker TEXT NOT NULL,
    strike_price REAL NOT NULL,
    stock_price REAL NOT NULL,
    option_ticker TEXT,
    quantity INTEGER NOT NULL,
    open_date TEXT NOT NULL,
    expiration_date TEXT NOT NULL,
    premium_per_contract REAL NOT NULL,
    fees REAL DEFAULT 0,
    current_option_price REAL DEFAULT 0,
    status TEXT CHECK(status IN ('Open', 'Closed')) DEFAULT 'Open',
    closed_at TEXT,
    close_price REAL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`)

// Initialize schema version if this is a new database
const currentVersion = getCurrentVersion()
if (currentVersion === 0) {
  db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(1)
  console.log('📋 Database initialized at schema version 1')
} else {
  console.log(`📋 Current schema version: ${currentVersion}`)
}

// Migration system - add future migrations here
const migrations = [
  {
    version: 2,
    up: (db) => {
      // Create users table
      db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          name TEXT NOT NULL,
          is_admin INTEGER DEFAULT 0,
          reset_token TEXT,
          reset_token_expires TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `)

      // Create a default admin user with temporary password
      // Default password: 'changeme' - IMPORTANT: Change this immediately!
      const defaultPasswordHash = bcrypt.hashSync('changeme', 10)

      db.prepare(`
        INSERT OR IGNORE INTO users (email, password_hash, name, is_admin)
        VALUES (?, ?, ?, 1)
      `).run('admin@options-tracker.local', defaultPasswordHash, 'Admin')

      // Add user_id column to positions table (if it doesn't already exist)
      try {
        db.exec('ALTER TABLE positions ADD COLUMN user_id INTEGER')
      } catch (err) {
        // Column might already exist from a previous partial migration, that's ok
        if (!err.message.includes('duplicate column name')) {
          throw err
        }
      }

      // Assign all existing positions to the admin user
      const adminUser = db.prepare('SELECT id FROM users WHERE email = ?').get('admin@options-tracker.local')
      db.prepare('UPDATE positions SET user_id = ? WHERE user_id IS NULL').run(adminUser.id)

      // Make user_id NOT NULL after backfilling
      // SQLite doesn't support ALTER COLUMN, so we need to recreate the table

      // Drop positions_new if it exists from a previous partial migration
      try {
        db.exec('DROP TABLE IF EXISTS positions_new')
      } catch (err) {
        // Ignore errors
      }

      db.exec(`
        CREATE TABLE positions_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          account TEXT NOT NULL,
          ticker TEXT NOT NULL,
          strike_price REAL NOT NULL,
          stock_price REAL NOT NULL,
          option_ticker TEXT,
          quantity INTEGER NOT NULL,
          open_date TEXT NOT NULL,
          expiration_date TEXT NOT NULL,
          premium_per_contract REAL NOT NULL,
          fees REAL DEFAULT 0,
          current_option_price REAL DEFAULT 0,
          status TEXT CHECK(status IN ('Open', 'Closed')) DEFAULT 'Open',
          closed_at TEXT,
          close_price REAL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(user_id) REFERENCES users(id)
        )
      `)

      db.exec('INSERT INTO positions_new (id, user_id, account, ticker, strike_price, stock_price, option_ticker, quantity, open_date, expiration_date, premium_per_contract, fees, current_option_price, status, closed_at, close_price, created_at, updated_at) SELECT id, user_id, account, ticker, strike_price, stock_price, option_ticker, quantity, open_date, expiration_date, premium_per_contract, fees, current_option_price, status, closed_at, close_price, created_at, updated_at FROM positions')
      db.exec('DROP TABLE positions')
      db.exec('ALTER TABLE positions_new RENAME TO positions')

      console.log('✅ Migrated to version 2: Added multi-user authentication')
      console.log('⚠️  Default admin account created: admin@options-tracker.local / changeme')
    }
  }
]

// Run pending migrations
function runMigrations() {
  const currentVersion = getCurrentVersion()

  for (const migration of migrations) {
    if (migration.version > currentVersion) {
      console.log(`🔄 Running migration to version ${migration.version}...`)
      migration.up(db)
      db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(migration.version)
      console.log(`✅ Migration to version ${migration.version} complete`)
    }
  }
}

runMigrations()

export default db
export { dbPath }
