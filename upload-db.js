// Temporary script to upload database to Railway
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read base64 from stdin
let base64Data = '';
process.stdin.on('data', chunk => {
  base64Data += chunk;
});

process.stdin.on('end', () => {
  const buffer = Buffer.from(base64Data.trim(), 'base64');
  const dbPath = process.env.DATABASE_PATH || '/app/data/options.db';

  // Ensure directory exists
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  fs.writeFileSync(dbPath, buffer);
  console.log(`Database uploaded to ${dbPath} (${buffer.length} bytes)`);
});
