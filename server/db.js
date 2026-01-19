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

export default db
