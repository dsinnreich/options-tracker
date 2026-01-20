# Quick Start Guide - Local Development

## 🚀 One-Click Launcher

### Option 1: Double-Click Launcher (Easiest)

1. Find `start-app.command` in your project folder
2. **Double-click it** to start the app
3. Your browser will open automatically to http://localhost:5173
4. To stop: Close the Terminal window or press Ctrl+C

**First time only:** macOS may ask for permission to run the script. Click "Open" or go to System Settings → Privacy & Security and allow it.

### Option 2: Browser Bookmark

1. Start the app first using `start-app.command` (or run `npm run dev` in terminal)
2. Drag `Open-Options-Tracker.html` to your browser bookmarks bar
3. Click the bookmark anytime to open the app (must be running)

### Option 3: Create a Dock/Desktop Shortcut

**To add to Dock:**
1. Right-click `start-app.command`
2. Select "Make Alias"
3. Drag the alias to your Dock
4. Click it anytime to launch!

**To add to Desktop:**
1. Right-click `start-app.command`
2. Select "Make Alias"
3. Drag the alias to your Desktop
4. Double-click to launch!

**Pro tip:** You can rename the alias to just "Options Tracker" for a cleaner look.

---

## 🛑 Stopping the App

- Close the Terminal window that opened, OR
- Press `Ctrl+C` in the Terminal window

---

## 🔧 Manual Start (if needed)

If the one-click launcher doesn't work:

```bash
cd /Users/dansinnreich/Documents/options-tracker
npm run dev
```

Then visit: http://localhost:5173

---

## 🌐 Access Points

- **Local Dev:** http://localhost:5173
- **Production:** https://server-production-dbe5.up.railway.app

Login: `dan` / (your password)
