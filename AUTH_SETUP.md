# Authentication Setup Guide

## Overview

This application now uses session-based authentication with multi-user support. Users can create accounts, reset passwords via email, and admins can manage user accounts.

## Default Admin Account

After first run, the database migration creates a default admin account:

- **Email**: `admin@options-tracker.local`
- **Password**: `changeme`

**⚠️ IMPORTANT**: Change this password immediately after first login!

## Environment Variables

Add these to your `server/.env` file:

### Required for Production
```env
SESSION_SECRET=your-random-secret-key-here
NODE_ENV=production
APP_URL=https://yourdomain.com
```

### Required for Password Reset (Gmail)
```env
GMAIL_USER=your-email@gmail.com
GMAIL_APP_PASSWORD=your-gmail-app-password
```

To get a Gmail app password:
1. Go to Google Account settings
2. Enable 2-factor authentication
3. Go to Security → App passwords
4. Generate a new app password
5. Use that password in `GMAIL_APP_PASSWORD`

## Railway Deployment

When deploying to Railway, add these environment variables in the Railway dashboard:

1. `SESSION_SECRET` - Generate a random string (e.g., use `openssl rand -hex 32`)
2. `GMAIL_USER` - Your Gmail address
3. `GMAIL_APP_PASSWORD` - Your Gmail app password
4. `NODE_ENV` - Set to `production`
5. `APP_URL` - Your deployed URL (e.g., `https://options.sinnreich.net`)

## Features

### For All Users
- Login/logout with email and password
- Password reset via email
- View only your own positions
- Export/import your positions as CSV
- Change your password when logged in

### For Admins
- Access the Admin panel
- Create new user accounts
- Edit user accounts (email, name, password, admin status)
- Delete user accounts
- View all users

## User Management

### Creating Users (Admin Only)

1. Log in as admin
2. Click "Admin" in the navigation
3. Click "+ Create User"
4. Fill in:
   - Email (must be unique)
   - Name
   - Password (minimum 8 characters)
   - Admin privileges checkbox (optional)
5. Click "Create User"

The new user will receive their credentials and can log in immediately.

### Password Reset Flow

1. User clicks "Forgot your password?" on login page
2. User enters their email
3. System sends reset link to email (valid for 1 hour)
4. User clicks link and enters new password
5. User is redirected to login with new password

## Security Features

- Passwords are hashed with bcrypt (10 rounds)
- Sessions stored in SQLite database
- HTTP-only cookies (prevents XSS)
- Secure cookies in production (HTTPS only)
- CSRF protection via same-site cookies
- Session expires after 1 week
- Password minimum length: 8 characters
- User can only access their own positions
- Admin actions require admin privileges

## Database Schema

### Users Table
- `id` - Primary key
- `email` - Unique, not null
- `password_hash` - Hashed password
- `name` - User's display name
- `is_admin` - Boolean (0 or 1)
- `reset_token` - Temporary password reset token
- `reset_token_expires` - Token expiration timestamp
- `created_at` - Account creation date
- `updated_at` - Last update timestamp

### Positions Table (Updated)
- Added `user_id` foreign key
- All positions are now associated with a user
- Users can only view/edit their own positions

## Testing Locally

1. Start the development server:
   ```bash
   npm run dev
   ```

2. Open http://localhost:5173 (or the port shown in terminal)

3. You'll be redirected to login page

4. Log in with:
   - Email: `admin@options-tracker.local`
   - Password: `changeme`

5. Change the admin password immediately via the user menu

## Troubleshooting

### "Authentication required" error
- Make sure you're logged in
- Check that cookies are enabled in your browser
- In development, make sure CORS is configured correctly

### Password reset emails not sending
- Check `GMAIL_USER` and `GMAIL_APP_PASSWORD` are set
- Verify Gmail app password is correct
- Check server logs for email errors

### Session not persisting
- Check that `SESSION_SECRET` is set
- Verify cookies are enabled
- In production, ensure `APP_URL` matches your domain
- Check that HTTPS is enabled in production

### Migration errors
- If you see "duplicate column" errors, the migration may have partially run
- Check `data/options.db` and verify schema version
- Contact support if migration fails

## API Endpoints

### Public Endpoints (No Auth Required)
- `POST /api/auth/login` - Log in
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password with token

### Protected Endpoints (Auth Required)
- `POST /api/auth/logout` - Log out
- `GET /api/auth/me` - Get current user
- `POST /api/auth/change-password` - Change password
- `GET /api/positions` - Get user's positions
- `POST /api/positions` - Create position
- `PUT /api/positions/:id` - Update position
- `DELETE /api/positions/:id` - Delete position
- `GET /api/backup/export/csv` - Export positions
- `POST /api/backup/import/csv` - Import positions

### Admin-Only Endpoints
- `GET /api/admin/users` - List all users
- `POST /api/admin/users` - Create user
- `PUT /api/admin/users/:id` - Update user
- `DELETE /api/admin/users/:id` - Delete user
