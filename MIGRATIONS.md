# Database Migrations & Backup Guide

This guide explains how to safely manage database changes and protect your data.

---

## 🛡️ Backup Your Data

Your app now has built-in backup features to protect your positions data.

### Automatic Backups (Recommended)

Set up a scheduled backup using the Railway CLI or a cron job:

```bash
# Download JSON backup (human-readable, easy to restore)
curl -u dan:YourPassword https://your-app.up.railway.app/api/backup/export/json > backup-$(date +%Y%m%d).json

# Download raw database file (complete backup)
curl -u dan:YourPassword https://your-app.up.railway.app/api/backup/download/database > backup-$(date +%Y%m%d).db
```

**Recommended Schedule:** Weekly backups before making any changes.

### Manual Backup via Browser

1. Visit: `https://your-app.up.railway.app/api/backup/export/json`
2. Login with your credentials
3. Save the JSON file to your computer
4. Keep it somewhere safe (Dropbox, Google Drive, etc.)

### Backup Information

Check your database status:
```bash
curl -u dan:YourPassword https://your-app.up.railway.app/api/backup/info
```

Returns:
```json
{
  "schema_version": 1,
  "total_positions": 12,
  "open_positions": 8,
  "closed_positions": 4,
  "database_path": "/app/data/options.db"
}
```

---

## 🔄 Schema Migrations

The app now tracks database schema versions and automatically applies migrations when you deploy.

### Current Schema: Version 1

- `positions` table with all current fields
- `schema_version` table for migration tracking

### Adding a New Migration

When you need to change the database schema (add/modify columns, tables, etc.), follow these steps:

#### Step 1: Create Migration

Edit `server/db.js` and add to the `migrations` array:

```javascript
const migrations = [
  // Example: Add a new column
  {
    version: 2,
    up: (db) => {
      db.exec('ALTER TABLE positions ADD COLUMN notes TEXT')
      console.log('✅ Migrated to version 2: Added notes column')
    }
  },

  // Example: Create a new table
  {
    version: 3,
    up: (db) => {
      db.exec(`
        CREATE TABLE transactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          position_id INTEGER,
          date TEXT,
          amount REAL,
          FOREIGN KEY(position_id) REFERENCES positions(id)
        )
      `)
      console.log('✅ Migrated to version 3: Added transactions table')
    }
  }
]
```

#### Step 2: Test Locally

```bash
# Start local server - migrations run automatically
npm run dev

# Check logs for migration messages
# You should see: "🔄 Running migration to version 2..."
```

#### Step 3: Backup Production Data

**CRITICAL: Always backup before deploying schema changes!**

```bash
# Backup your production data
curl -u dan:YourPassword https://your-app.up.railway.app/api/backup/export/json > backup-before-migration.json
```

#### Step 4: Deploy

```bash
git add server/db.js
git commit -m "Add migration for [describe change]"
git push
```

Railway will deploy automatically. The migration runs on startup:
- Checks current schema version
- Runs any pending migrations in order
- Updates schema version

#### Step 5: Verify

Check Railway logs:
```bash
railway logs
```

Look for:
```
📋 Current schema version: 1
🔄 Running migration to version 2...
✅ Migration to version 2 complete
```

---

## 📥 Restore from Backup

### Restore JSON Backup

If you need to restore your positions from a JSON backup:

```bash
curl -u dan:YourPassword \
  -X POST \
  -H "Content-Type: application/json" \
  -d @backup-20260119.json \
  https://your-app.up.railway.app/api/backup/import/json
```

Response:
```json
{
  "success": true,
  "imported": 12,
  "skipped": 0,
  "total": 12
}
```

**Note:** This adds positions to the existing database. It won't delete existing data.

### Restore Database File

To restore a complete database backup (`.db` file):

1. **Via Railway CLI:**
   ```bash
   # Copy backup to Railway volume
   cat backup-20260119.db | railway run "cat > /app/data/options.db"

   # Restart the service
   railway restart
   ```

2. **Via Railway Dashboard:**
   - Stop your service
   - Use Railway's volume management to upload the `.db` file
   - Start your service

---

## 🧪 Testing Migrations Safely

### Test with a Copy of Production Data

1. Download production backup:
   ```bash
   curl -u dan:YourPassword https://your-app.up.railway.app/api/backup/download/database > production.db
   ```

2. Copy to local:
   ```bash
   cp production.db data/options.db
   ```

3. Test migration locally:
   ```bash
   npm run dev
   ```

4. Verify data is intact:
   - Check the web interface
   - Verify all positions are present
   - Test new features

---

## ⚠️ Important Safety Rules

1. **ALWAYS backup before deploying schema changes**
2. **Test migrations locally with production data first**
3. **Migrations are irreversible** - there's no "down" migration
4. **Never edit the `positions` table structure manually in production**
5. **Keep weekly backups** - automate if possible

---

## 📋 Migration Examples

### Example 1: Add a Column

```javascript
{
  version: 2,
  up: (db) => {
    // Add column with default value
    db.exec('ALTER TABLE positions ADD COLUMN notes TEXT DEFAULT ""')
    console.log('✅ Migrated to version 2: Added notes column')
  }
}
```

### Example 2: Create Index for Performance

```javascript
{
  version: 3,
  up: (db) => {
    db.exec('CREATE INDEX idx_ticker ON positions(ticker)')
    db.exec('CREATE INDEX idx_status ON positions(status)')
    console.log('✅ Migrated to version 3: Added performance indexes')
  }
}
```

### Example 3: Modify Data

```javascript
{
  version: 4,
  up: (db) => {
    // Normalize ticker symbols to uppercase
    db.exec('UPDATE positions SET ticker = UPPER(ticker)')
    console.log('✅ Migrated to version 4: Normalized ticker symbols')
  }
}
```

---

## 🆘 Troubleshooting

### Migration Failed

1. Check Railway logs for error message
2. Restore from backup (see above)
3. Fix the migration code
4. Redeploy

### Data Lost After Deploy

1. Don't panic - your volume should have the data
2. Check Railway logs to see if migration failed
3. Restore from your most recent backup
4. If no backup exists, contact Railway support about volume recovery

### Schema Version Mismatch

If logs show unexpected schema version:
```bash
# Check current version
curl -u dan:YourPassword https://your-app.up.railway.app/api/backup/info
```

The `schema_version` field should match your latest migration version.

---

## 📚 Best Practices

1. **Version Control:** Keep all migrations in git
2. **Linear History:** Never modify old migrations, always add new ones
3. **Descriptive Names:** Use clear migration descriptions
4. **Test First:** Always test on local copy of production data
5. **Backup Schedule:** Weekly automated backups minimum
6. **Document Changes:** Update this file when adding migrations

---

## 🔮 Future-Proofing Checklist

Before making any database changes:

- [ ] Review current schema version
- [ ] Backup production data (JSON + .db file)
- [ ] Write migration in `server/db.js`
- [ ] Test migration locally with production data copy
- [ ] Verify all positions intact after migration
- [ ] Commit and push changes
- [ ] Monitor Railway logs during deployment
- [ ] Verify production data after deploy
- [ ] Keep backup for at least 30 days

---

**Remember: Backups are your safety net. When in doubt, backup first!** 🛡️
