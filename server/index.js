import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import basicAuth from 'express-basic-auth'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import positionsRouter from './routes/positions.js'
import pricesRouter from './routes/prices.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = process.env.PORT || 3001
const NODE_ENV = process.env.NODE_ENV || 'development'

// HTTP Basic Authentication (optional - only if credentials are set)
if (process.env.AUTH_USERNAME && process.env.AUTH_PASSWORD) {
  console.log('🔒 Authentication enabled')
  app.use(basicAuth({
    users: { [process.env.AUTH_USERNAME]: process.env.AUTH_PASSWORD },
    challenge: true,
    realm: 'Options Tracker'
  }))
} else {
  console.log('⚠️  Authentication disabled - set AUTH_USERNAME and AUTH_PASSWORD to enable')
}

app.use(cors())
app.use(express.json())

app.use('/api/positions', positionsRouter)
app.use('/api/prices', pricesRouter)

// Temporary endpoint for database migration
app.post('/api/upload-db', express.text({ limit: '50mb' }), (req, res) => {
  try {
    const base64Data = req.body
    const buffer = Buffer.from(base64Data, 'base64')
    const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../data/options.db')

    // Ensure directory exists
    const dbDir = path.dirname(dbPath)
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true })
    }

    // Write the database file
    fs.writeFileSync(dbPath, buffer)
    console.log(`📤 Database uploaded: ${dbPath} (${buffer.length} bytes)`)

    res.json({ success: true, message: 'Database uploaded successfully', size: buffer.length })
  } catch (error) {
    console.error('Database upload error:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

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
