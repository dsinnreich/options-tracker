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

// Check if database already exists
if (existsSync(dbPath)) {
  const stats = require('fs').statSync(dbPath)
  console.log(`📊 Existing database found: ${stats.size} bytes`)
} else {
  console.log(`📝 Creating new database at ${dbPath}`)
}

let db = new Database(dbPath)

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

// Function to reload database connection
export function reloadDatabase() {
  console.log('🔄 Closing and reopening database connection...')
  try {
    db.close()
  } catch (e) {
    // Ignore if already closed
  }
  db = new Database(dbPath)
  console.log('✅ Database connection reloaded')
  return db
}

// Getter function to always get current db instance
export function getDb() {
  return db
}

export default db
