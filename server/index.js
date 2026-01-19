import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import basicAuth from 'express-basic-auth'
import path from 'path'
import { fileURLToPath } from 'url'
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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
  console.log(`Environment: ${NODE_ENV}`)
})
