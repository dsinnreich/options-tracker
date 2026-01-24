import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import session from 'express-session'
import SQLiteStore from 'connect-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'
import positionsRouter from './routes/positions.js'
import pricesRouter from './routes/prices.js'
import backupRouter from './routes/backup.js'
import authRouter from './routes/auth.js'
import adminRouter from './routes/admin.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = process.env.PORT || 3001
const NODE_ENV = process.env.NODE_ENV || 'development'

// Session configuration
const SessionStore = SQLiteStore(session)

app.use(session({
  store: new SessionStore({
    db: 'sessions.db',
    dir: path.join(__dirname, '../data')
  }),
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: NODE_ENV === 'production', // Use secure cookies in production
    httpOnly: true,
    sameSite: 'lax', // Standard for same-site cookies
    maxAge: 1000 * 60 * 60 * 24 * 7 // 1 week
  }
}))

app.use(cors({
  origin: NODE_ENV === 'production' ? process.env.APP_URL : 'http://localhost:5173',
  credentials: true
}))

app.use(express.json())
app.use(express.text())

// Authentication middleware for protected routes
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' })
  }
  next()
}

// Public routes (no auth required)
app.use('/api/auth', authRouter)

// Protected routes (auth required)
app.use('/api/positions', requireAuth, positionsRouter)
app.use('/api/prices', requireAuth, pricesRouter)
app.use('/api/backup', requireAuth, backupRouter)
app.use('/api/admin', requireAuth, adminRouter)

console.log('🔒 Session-based authentication enabled')

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' })
})

// Serve static files in production
if (NODE_ENV === 'production') {
  const clientBuildPath = path.join(__dirname, '../client/dist')

  app.use(express.static(clientBuildPath))

  // Handle SPA routing - send all non-API routes to index.html
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientBuildPath, 'index.html'))
  })

  console.log('📦 Serving static files from:', clientBuildPath)
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`)
  console.log(`Environment: ${NODE_ENV}`)
})
