import { useState, useEffect, useCallback, createContext, useContext } from 'react'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const checkAuth = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/me', { credentials: 'include' })
      if (response.ok) {
        const data = await response.json()
        setUser(data)
      } else {
        setUser(null)
      }
    } catch (err) {
      console.error('Auth check failed:', err)
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  // Returns { success, user } on full login, or { requires2fa: true } / { requiresTotpSetup: true }
  const login = useCallback(async (email, password) => {
    try {
      setError(null)
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Login failed')
      }

      if (data.requires2fa) return { requires2fa: true }
      if (data.requiresTotpSetup) return { requiresTotpSetup: true }

      setUser(data.user)
      return { success: true }
    } catch (err) {
      setError(err.message)
      return { success: false, error: err.message }
    }
  }, [])

  // First-time login: set own password, then proceeds to TOTP setup or full login
  const setInitialPassword = useCallback(async (newPassword) => {
    try {
      const response = await fetch('/api/auth/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ newPassword })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to set password')
      if (data.requiresTotpSetup) return { requiresTotpSetup: true }
      setUser(data.user)
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }, [])

  // Complete login with TOTP code; optionally remember device for 30 days
  const submitTotp = useCallback(async (code, rememberDevice = false) => {
    try {
      setError(null)
      const response = await fetch('/api/auth/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ code, rememberDevice })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || '2FA verification failed')
      }

      setUser(data.user)
      return { success: true }
    } catch (err) {
      setError(err.message)
      return { success: false, error: err.message }
    }
  }, [])

  // Get TOTP setup secret + QR code data URL for new setup flow
  const getSetupSecret = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/2fa/setup-secret', { credentials: 'include' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to get setup secret')
      return { success: true, qrDataUrl: data.qrDataUrl, secret: data.secret }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }, [])

  // Verify first TOTP code to activate 2FA; completes login from setup flow
  const enableTotp = useCallback(async (code) => {
    try {
      const response = await fetch('/api/auth/2fa/enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ code })
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to enable 2FA')

      setUser(data.user)
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }, [])

  // Disable 2FA — requires current password + a TOTP code
  const disable2fa = useCallback(async (password, code) => {
    try {
      const response = await fetch('/api/auth/2fa/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password, code })
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to disable 2FA')

      setUser(prev => prev ? { ...prev, totpEnabled: false } : prev)
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }, [])

  // Admin step-up: re-verify TOTP to unlock admin actions for 1 hour
  const verifyAdmin = useCallback(async (code) => {
    try {
      const response = await fetch('/api/auth/admin-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ code })
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Admin verification failed')

      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }, [])

  const fetchLoginHistory = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/login-history', { credentials: 'include' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to fetch login history')
      return { success: true, history: data }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }, [])

  const fetchTrustedDevices = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/trusted-devices', { credentials: 'include' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to fetch trusted devices')
      return { success: true, devices: data }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }, [])

  const removeTrustedDevice = useCallback(async (id) => {
    try {
      const response = await fetch(`/api/auth/trusted-devices/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to remove device')
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
      setUser(null)
      return { success: true }
    } catch (err) {
      setError(err.message)
      return { success: false, error: err.message }
    }
  }, [])

  const changePassword = useCallback(async (currentPassword, newPassword) => {
    try {
      setError(null)
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ currentPassword, newPassword })
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Password change failed')
      return { success: true }
    } catch (err) {
      setError(err.message)
      return { success: false, error: err.message }
    }
  }, [])

  const forgotPassword = useCallback(async (email) => {
    try {
      setError(null)
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email })
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Request failed')
      return { success: true, message: data.message }
    } catch (err) {
      setError(err.message)
      return { success: false, error: err.message }
    }
  }, [])

  const resetPassword = useCallback(async (token, newPassword) => {
    try {
      setError(null)
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token, newPassword })
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Password reset failed')
      return { success: true }
    } catch (err) {
      setError(err.message)
      return { success: false, error: err.message }
    }
  }, [])

  const value = {
    user,
    loading,
    error,
    login,
    logout,
    changePassword,
    forgotPassword,
    resetPassword,
    setInitialPassword,
    submitTotp,
    getSetupSecret,
    enableTotp,
    disable2fa,
    verifyAdmin,
    fetchLoginHistory,
    fetchTrustedDevices,
    removeTrustedDevice,
    isAuthenticated: !!user,
    isAdmin: user?.isAdmin || false
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
