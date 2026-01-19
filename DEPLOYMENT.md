# Options Tracker - Deployment Guide

This guide covers deploying to Railway (quick start) and to your own server at sinnreich.net (advanced).

---

## Table of Contents

1. [Railway Deployment (Recommended for Testing)](#railway-deployment)
2. [Custom Server Deployment (sinnreich.net)](#custom-server-deployment)
3. [Environment Variables](#environment-variables)
4. [Password Protection](#password-protection)
5. [Database Persistence](#database-persistence)
6. [Troubleshooting](#troubleshooting)

---

## Railway Deployment

Railway is the easiest way to deploy and test your app. Perfect for getting started.

### Step 1: Create Railway Account

1. Go to [railway.app](https://railway.app/)
2. Sign up with GitHub (recommended for easy deploys)
3. Verify your account

### Step 2: Deploy from GitHub

**Option A: Deploy from GitHub (Recommended)**

1. Push your code to a GitHub repository:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/options-tracker.git
   git push -u origin main
   ```

2. In Railway dashboard:
   - Click **"New Project"**
   - Select **"Deploy from GitHub repo"**
   - Choose your `options-tracker` repository
   - Railway will auto-detect it as a Node.js app

**Option B: Deploy from CLI**

1. Install Railway CLI:
   ```bash
   npm i -g @railway/cli
   ```

2. Login and deploy:
   ```bash
   railway login
   railway init
   railway up
   ```

### Step 3: Configure Environment Variables

In the Railway dashboard for your project:

1. Go to **Variables** tab
2. Add these variables:

   ```
   NODE_ENV=production
   AUTH_USERNAME=your-username
   AUTH_PASSWORD=your-secure-password
   DATABASE_PATH=/app/data/options.db
   MARKETDATA_API_TOKEN=your-api-token-here
   ```

3. Click **"Deploy"** to apply changes

### Step 4: Add Persistent Storage

**IMPORTANT:** Without this, your database will reset on every deploy!

1. In your Railway project, go to **Volumes** tab
2. Click **"New Volume"**
3. Configure:
   - **Mount Path:** `/app/data`
   - **Name:** `options-db`
4. Click **"Add"**

Your database will now persist across deployments!

### Step 5: Access Your App

1. Go to **Settings** tab
2. Scroll to **Networking**
3. Click **"Generate Domain"**
4. Your app will be available at: `https://your-app-name.up.railway.app`

When you visit, you'll be prompted for username and password (HTTP Basic Auth).

### Railway Costs

- **Free Trial:** $5 credit (lasts ~1 month for this app)
- **Hobby Plan:** $5/month (recommended for always-on access)
- **Usage-based:** ~$2-4/month if you monitor usage

**Tip:** Railway shows real-time usage metrics in the dashboard.

---

## Custom Server Deployment (sinnreich.net)

Deploy to your own server for full control and no recurring costs.

### Prerequisites

- SSH access to your server
- Node.js 18+ installed
- Domain/subdomain configured (e.g., options.sinnreich.net)
- Basic Linux command line knowledge

### Step 1: Server Preparation

SSH into your server:

```bash
ssh user@sinnreich.net
```

Install Node.js (if not already installed):

```bash
# Using nvm (recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20

# Verify
node --version
npm --version
```

### Step 2: Upload Your Code

**Option A: Git Clone (Recommended)**

```bash
# On your server
cd /var/www  # or your preferred directory
git clone https://github.com/YOUR_USERNAME/options-tracker.git
cd options-tracker
```

**Option B: SCP/SFTP Upload**

```bash
# On your local machine
scp -r /path/to/options-tracker user@sinnreich.net:/var/www/
```

### Step 3: Install Dependencies

```bash
cd /var/www/options-tracker
npm install
```

### Step 4: Configure Environment

Create production `.env` file:

```bash
cd server
cp .env.example .env
nano .env  # or use vim, emacs, etc.
```

Set your values:

```env
NODE_ENV=production
PORT=3001
AUTH_USERNAME=your-username
AUTH_PASSWORD=your-secure-password
DATABASE_PATH=/var/opt/options-tracker/data/options.db
MARKETDATA_API_TOKEN=your-api-token-here
```

Create database directory:

```bash
sudo mkdir -p /var/opt/options-tracker/data
sudo chown -R $USER:$USER /var/opt/options-tracker
```

### Step 5: Build the Application

```bash
cd /var/www/options-tracker
npm run build:all
```

This builds the React frontend into `client/dist`.

### Step 6: Set Up Process Manager

Use PM2 to keep your app running:

```bash
# Install PM2 globally
npm install -g pm2

# Start the app
pm2 start npm --name "options-tracker" -- start

# Save PM2 config
pm2 save

# Set PM2 to start on boot
pm2 startup
# Follow the command it outputs
```

Useful PM2 commands:

```bash
pm2 list              # Show running apps
pm2 logs options-tracker  # View logs
pm2 restart options-tracker  # Restart app
pm2 stop options-tracker     # Stop app
pm2 delete options-tracker   # Remove from PM2
```

### Step 7: Configure Nginx (Reverse Proxy + HTTPS)

If you want to serve at `options.sinnreich.net` with HTTPS:

Create nginx config:

```bash
sudo nano /etc/nginx/sites-available/options-tracker
```

Add this configuration:

```nginx
server {
    listen 80;
    server_name options.sinnreich.net;  # Change to your subdomain

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/options-tracker /etc/nginx/sites-enabled/
sudo nginx -t  # Test configuration
sudo systemctl reload nginx
```

### Step 8: Add HTTPS with Let's Encrypt

```bash
# Install certbot
sudo apt update
sudo apt install certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d options.sinnreich.net

# Follow prompts and select redirect HTTP to HTTPS
```

Certbot will automatically:
- Obtain SSL certificate
- Configure nginx for HTTPS
- Set up auto-renewal

Your app is now live at `https://options.sinnreich.net`!

### Updating the App

When you make changes:

```bash
cd /var/www/options-tracker
git pull origin main  # If using git
npm install  # Install any new dependencies
npm run build:all  # Rebuild frontend
pm2 restart options-tracker  # Restart server
```

---

## Environment Variables

Complete reference:

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `NODE_ENV` | Yes | Environment mode | `production` |
| `PORT` | No | Server port | `3001` (default) |
| `AUTH_USERNAME` | No* | Login username | `dan` |
| `AUTH_PASSWORD` | No* | Login password | `secure-password-123` |
| `DATABASE_PATH` | No | SQLite DB location | `/app/data/options.db` |
| `MARKETDATA_API_TOKEN` | Yes | Market data API key | `your-token` |

*Both AUTH_USERNAME and AUTH_PASSWORD must be set together to enable authentication. If either is missing, authentication is disabled.

---

## Password Protection

The app uses **HTTP Basic Authentication** - a simple browser login prompt.

### Setting Password

**Railway:**
- Add `AUTH_USERNAME` and `AUTH_PASSWORD` in Variables tab
- Redeploy

**Custom Server:**
- Edit `server/.env` file
- Set both variables
- Restart: `pm2 restart options-tracker`

### Disabling Password (for development)

Leave `AUTH_USERNAME` and `AUTH_PASSWORD` empty or unset.

### Security Notes

- Basic Auth sends credentials with every request (use HTTPS!)
- For production, always use HTTPS (Railway provides it automatically)
- Choose a strong password (12+ characters, mix of letters/numbers/symbols)
- Consider using environment-specific passwords

---

## Database Persistence

Your SQLite database must be stored in a persistent location.

### Railway

1. Create a Volume mounted at `/app/data`
2. Set `DATABASE_PATH=/app/data/options.db`
3. Data survives deployments ✅

### Custom Server

1. Choose persistent path (e.g., `/var/opt/options-tracker/data/options.db`)
2. Ensure directory is writable by the app user
3. Set `DATABASE_PATH` in `.env`
4. Data survives across app restarts ✅

### Backup Strategy

**Railway:**
```bash
# Download database backup
railway run cat /app/data/options.db > backup-$(date +%Y%m%d).db
```

**Custom Server:**
```bash
# Automated backup script
#!/bin/bash
cp /var/opt/options-tracker/data/options.db \
   /var/backups/options-tracker/options-$(date +%Y%m%d).db

# Add to crontab for daily backups:
# 0 2 * * * /path/to/backup-script.sh
```

---

## Troubleshooting

### App won't start

**Check logs:**

Railway:
- View logs in Railway dashboard under **Deployments** tab

Custom Server:
```bash
pm2 logs options-tracker
```

**Common issues:**

1. **Port already in use**
   - Change `PORT` in environment variables
   - Or kill existing process: `lsof -ti:3001 | xargs kill`

2. **Database permission error**
   - Ensure database directory is writable: `chmod -R 755 /var/opt/options-tracker`

3. **Module not found**
   - Reinstall dependencies: `npm install`

### Authentication not working

1. Verify both `AUTH_USERNAME` and `AUTH_PASSWORD` are set
2. Check logs for "🔒 Authentication enabled" message
3. Try incognito/private browser window (clears cached credentials)
4. Clear browser cache and cookies

### Database resets on deploy (Railway)

- Ensure Volume is mounted at `/app/data`
- Verify `DATABASE_PATH=/app/data/options.db`
- Check Volume is attached in Railway dashboard

### Can't access at sinnreich.net

1. **DNS not configured:**
   ```bash
   # Test DNS resolution
   nslookup options.sinnreich.net
   ```

2. **Nginx not running:**
   ```bash
   sudo systemctl status nginx
   sudo systemctl start nginx
   ```

3. **Firewall blocking:**
   ```bash
   sudo ufw allow 80
   sudo ufw allow 443
   ```

4. **App not running:**
   ```bash
   pm2 list
   pm2 start options-tracker
   ```

### Build fails

1. **Out of memory:**
   - Railway: Upgrade to Hobby plan
   - Custom server: Add swap space

2. **Dependency issues:**
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

---

## Support & Resources

- **Railway Docs:** https://docs.railway.app/
- **PM2 Docs:** https://pm2.keymetrics.io/docs/
- **Nginx Docs:** https://nginx.org/en/docs/
- **Let's Encrypt:** https://letsencrypt.org/getting-started/

---

## Quick Reference Commands

### Railway
```bash
railway login                 # Login to Railway
railway link                  # Link to existing project
railway up                    # Deploy current directory
railway logs                  # View logs
railway variables             # Manage environment variables
railway run <command>         # Run command in Railway environment
```

### Custom Server
```bash
pm2 start npm --name "options-tracker" -- start  # Start app
pm2 stop options-tracker      # Stop app
pm2 restart options-tracker   # Restart app
pm2 logs options-tracker      # View logs
pm2 list                      # List all apps
pm2 save                      # Save PM2 config
pm2 startup                   # Setup auto-start on boot
```

### Nginx
```bash
sudo nginx -t                 # Test config
sudo systemctl reload nginx   # Reload config
sudo systemctl restart nginx  # Restart nginx
sudo systemctl status nginx   # Check status
```

---

**Need help?** Check the logs first - they usually contain the answer!
