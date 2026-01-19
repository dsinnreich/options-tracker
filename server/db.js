import Database from 'better-sqlite3'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { existsSync, mkdirSync } from 'fs'

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
  // Example migration for version 2:
  // {
  //   version: 2,
  //   up: (db) => {
  //     db.exec('ALTER TABLE positions ADD COLUMN new_field TEXT')
  //     console.log('✅ Migrated to version 2: Added new_field column')
  //   }
  // }
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
