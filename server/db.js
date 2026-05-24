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
  },
  {
    version: 3,
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS portfolios (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(user_id) REFERENCES users(id),
          UNIQUE(user_id, name)
        )
      `)

      db.exec(`
        CREATE TABLE IF NOT EXISTS portfolio_imports (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          portfolio_id INTEGER NOT NULL,
          import_date TEXT NOT NULL,
          filename TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(portfolio_id) REFERENCES portfolios(id),
          UNIQUE(portfolio_id, import_date)
        )
      `)

      db.exec(`
        CREATE TABLE IF NOT EXISTS portfolio_positions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          import_id INTEGER NOT NULL,
          account_number TEXT,
          account_name TEXT,
          symbol TEXT,
          description TEXT,
          quantity REAL,
          last_price REAL,
          last_price_change REAL,
          current_value REAL,
          today_gain_loss_dollar REAL,
          today_gain_loss_percent REAL,
          total_gain_loss_dollar REAL,
          total_gain_loss_percent REAL,
          percent_of_account REAL,
          cost_basis_total REAL,
          avg_cost_basis REAL,
          type TEXT,
          FOREIGN KEY(import_id) REFERENCES portfolio_imports(id)
        )
      `)

      db.exec(`
        CREATE TABLE IF NOT EXISTS asset_class_map (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          symbol TEXT NOT NULL,
          investment_name TEXT,
          asset_class TEXT NOT NULL,
          style TEXT NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(user_id) REFERENCES users(id),
          UNIQUE(user_id, symbol)
        )
      `)

      db.exec(`
        CREATE TABLE IF NOT EXISTS portfolio_targets (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          portfolio_id INTEGER NOT NULL,
          asset_class TEXT NOT NULL,
          style TEXT NOT NULL,
          target_percent REAL NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(portfolio_id) REFERENCES portfolios(id),
          UNIQUE(portfolio_id, asset_class, style)
        )
      `)

      console.log('✅ Migrated to version 3: Added portfolio tracking tables')
    }
  },
  {
    version: 4,
    up(db) {
      db.prepare(`ALTER TABLE portfolios ADD COLUMN notes TEXT NOT NULL DEFAULT ''`).run()
      console.log('✅ Migrated to version 4: Added notes column to portfolios')
    }
  },
  {
    version: 5,
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS portfolio_transaction_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          portfolio_id INTEGER NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
          account_number TEXT NOT NULL,
          symbol TEXT NOT NULL,
          transaction_type TEXT NOT NULL,
          run_date TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_txn_history_lookup
          ON portfolio_transaction_history(portfolio_id, account_number, symbol);
      `)
      console.log('✅ Migrated to version 5: Added portfolio_transaction_history table')
    }
  },
  {
    version: 6,
    up(db) {
      try {
        db.exec('ALTER TABLE positions ADD COLUMN close_fees REAL DEFAULT 0')
      } catch (err) {
        if (!err.message.includes('duplicate column name')) throw err
      }
      try {
        db.exec('ALTER TABLE positions ADD COLUMN close_date TEXT')
      } catch (err) {
        if (!err.message.includes('duplicate column name')) throw err
      }
      console.log('✅ Migrated to version 6: Added close_fees and close_date to positions')
    }
  },
  {
    version: 7,
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS etf_research_imports (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          import_date TEXT NOT NULL,
          filename TEXT,
          row_count INTEGER DEFAULT 0,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(user_id) REFERENCES users(id)
        )
      `)

      db.exec(`
        CREATE TABLE IF NOT EXISTS etf_research_data (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          import_id INTEGER NOT NULL,
          ticker TEXT NOT NULL,
          name TEXT,
          std_dev_3y REAL,
          sharpe_ratio_3y REAL,
          alpha_3y REAL,
          morningstar_rating REAL,
          beta_3y REAL,
          total_return_1m REAL,
          total_return_3m REAL,
          total_return_6m REAL,
          total_return_ytd REAL,
          total_return_1y REAL,
          total_return_3y REAL,
          total_return_5y REAL,
          downside_capture_3y REAL,
          sec_yield REAL,
          tax_cost_3y REAL,
          expense_ratio REAL,
          category TEXT,
          style_box TEXT,
          medalist_rating TEXT,
          FOREIGN KEY(import_id) REFERENCES etf_research_imports(id) ON DELETE CASCADE
        )
      `)

      console.log('✅ Migrated to version 7: Added ETF research tables')
    }
  },
  {
    version: 8,
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS etf_watchlists (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(user_id) REFERENCES users(id),
          UNIQUE(user_id, name)
        )
      `)

      try {
        db.exec('ALTER TABLE etf_research_imports ADD COLUMN watchlist_id INTEGER REFERENCES etf_watchlists(id)')
      } catch (err) {
        if (!err.message.includes('duplicate column name')) throw err
      }

      // Migrate any existing imports: create a default watchlist and assign them
      const users = db.prepare(
        'SELECT DISTINCT user_id FROM etf_research_imports WHERE watchlist_id IS NULL'
      ).all()
      for (const { user_id } of users) {
        const result = db.prepare(
          "INSERT OR IGNORE INTO etf_watchlists (user_id, name) VALUES (?, 'My ETFs')"
        ).run(user_id)
        const wl = db.prepare(
          "SELECT id FROM etf_watchlists WHERE user_id = ? AND name = 'My ETFs'"
        ).get(user_id)
        if (wl) {
          db.prepare(
            'UPDATE etf_research_imports SET watchlist_id = ? WHERE user_id = ? AND watchlist_id IS NULL'
          ).run(wl.id, user_id)
        }
      }

      console.log('✅ Migrated to version 8: Added etf_watchlists and linked imports')
    }
  },
  {
    version: 9,
    up(db) {
      try { db.exec(`ALTER TABLE users ADD COLUMN totp_secret TEXT`) } catch(e) { if (!e.message.includes('duplicate')) throw e }
      try { db.exec(`ALTER TABLE users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0`) } catch(e) { if (!e.message.includes('duplicate')) throw e }

      db.exec(`
        CREATE TABLE IF NOT EXISTS trusted_devices (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token_hash TEXT NOT NULL UNIQUE,
          label TEXT,
          country TEXT,
          ip TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          last_used_at TEXT DEFAULT CURRENT_TIMESTAMP,
          expires_at TEXT NOT NULL
        )
      `)

      db.exec(`
        CREATE TABLE IF NOT EXISTS login_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          email TEXT,
          ip TEXT,
          country TEXT,
          success INTEGER NOT NULL DEFAULT 0,
          failure_reason TEXT,
          trusted_device_id INTEGER REFERENCES trusted_devices(id) ON DELETE SET NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `)

      console.log('✅ Migrated to version 9: Added TOTP 2FA, trusted_devices, login_history')
    }
  },
  {
    version: 10,
    up(db) {
      try {
        db.exec(`ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0`)
      } catch (err) {
        if (!err.message.includes('duplicate column name')) throw err
      }
      console.log('✅ Migrated to version 10: Added must_change_password to users')
    }
  },
  {
    version: 11,
    up(db) {
      try {
        db.exec(`ALTER TABLE asset_class_map ADD COLUMN proxy_ticker TEXT`)
      } catch (err) {
        if (!err.message.includes('duplicate column name')) throw err
      }
      console.log('✅ Migrated to version 11: Added proxy_ticker to asset_class_map')
    }
  },
  {
    version: 12,
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS global_asset_class_map (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          symbol TEXT NOT NULL UNIQUE,
          investment_name TEXT,
          asset_class TEXT NOT NULL,
          style TEXT NOT NULL,
          proxy_ticker TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `)
      console.log('✅ Migrated to version 12: Added global_asset_class_map table')
    }
  },
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
