import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useNavigate, useLocation } from 'react-router-dom'

// step: 'credentials' | 'changepass' | 'totp' | 'setup' | 'forgot'
function Login() {
  const [step, setStep] = useState('credentials')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [rememberDevice, setRememberDevice] = useState(false)
  const [setupQr, setSetupQr] = useState(null)
  const [setupSecret, setSetupSecret] = useState(null)
  const [setupCode, setSetupCode] = useState('')
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotMessage, setForgotMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const { login, setInitialPassword, submitTotp, getSetupSecret, enableTotp, forgotPassword } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const from = location.state?.from?.pathname || '/'

  const goToSetup = async () => {
    const secret = await getSetupSecret()
    if (secret.success) {
      setSetupQr(secret.qrDataUrl)
      setSetupSecret(secret.secret)
      setStep('setup')
    } else {
      setError(secret.error || 'Failed to load 2FA setup')
    }
  }

  const handleCredentials = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const result = await login(email, password)

    if (result.success) {
      navigate(from, { replace: true })
    } else if (result.requiresPasswordChange) {
      setStep('changepass')
    } else if (result.requires2fa) {
      setStep('totp')
    } else if (result.requiresTotpSetup) {
      await goToSetup()
    } else {
      setError(result.error || 'Login failed')
    }

    setLoading(false)
  }

  const handleChangePass = async (e) => {
    e.preventDefault()
    setError('')
    if (newPassword !== newPasswordConfirm) {
      setError('Passwords do not match')
      return
    }
    setLoading(true)

    const result = await setInitialPassword(newPassword)

    if (result.success) {
      navigate(from, { replace: true })
    } else if (result.requiresTotpSetup) {
      await goToSetup()
    } else {
      setError(result.error || 'Failed to set password')
    }

    setLoading(false)
  }

  const handleTotp = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const result = await submitTotp(totpCode.trim(), rememberDevice)

    if (result.success) {
      navigate(from, { replace: true })
    } else {
      setError(result.error || 'Invalid code')
      setTotpCode('')
    }

    setLoading(false)
  }

  const handleSetup = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const result = await enableTotp(setupCode.trim())

    if (result.success) {
      navigate(from, { replace: true })
    } else {
      setError(result.error || 'Invalid code — try again')
      setSetupCode('')
    }

    setLoading(false)
  }

  const handleForgot = async (e) => {
    e.preventDefault()
    setError('')
    setForgotMessage('')
    setLoading(true)

    const result = await forgotPassword(forgotEmail)

    if (result.success) {
      setForgotMessage(result.message)
      setForgotEmail('')
    } else {
      setError(result.error || 'Failed to send reset email')
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Options Tracker
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            {step === 'credentials' && 'Sign in to your account'}
            {step === 'changepass' && 'Choose your password'}
            {step === 'totp' && 'Two-factor authentication'}
            {step === 'setup' && 'Set up two-factor authentication'}
            {step === 'forgot' && 'Reset your password'}
          </p>
        </div>

        {/* ── Step 1b: Choose initial password ── */}
        {step === 'changepass' && (
          <form className="mt-8 space-y-6" onSubmit={handleChangePass}>
            <p className="text-sm text-gray-600">
              Your account was created by an admin. Please choose your own password before continuing.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New password</label>
                <input
                  type="password"
                  autoFocus
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="Minimum 8 characters"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirm password</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPasswordConfirm}
                  onChange={e => setNewPasswordConfirm(e.target.value)}
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="Re-enter your password"
                />
              </div>
            </div>
            {error && <div className="rounded-md bg-red-50 p-4"><p className="text-sm text-red-700">{error}</p></div>}
            <button
              type="submit"
              disabled={loading || newPassword.length < 8}
              className="w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Saving…' : 'Set password & continue'}
            </button>
          </form>
        )}

        {/* ── Step 1: Email + Password ── */}
        {step === 'credentials' && (
          <form className="mt-8 space-y-6" onSubmit={handleCredentials}>
            <div className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="Enter your email"
                />
              </div>
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="Enter your password"
                />
              </div>
            </div>

            {error && <div className="rounded-md bg-red-50 p-4"><p className="text-sm text-red-700">{error}</p></div>}

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => { setStep('forgot'); setError('') }}
                className="text-sm font-medium text-blue-600 hover:text-blue-500"
              >
                Forgot your password?
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        )}

        {/* ── Step 2a: TOTP verify ── */}
        {step === 'totp' && (
          <form className="mt-8 space-y-6" onSubmit={handleTotp}>
            <p className="text-sm text-gray-600">
              Enter the 6-digit code from your authenticator app.
            </p>

            <div>
              <label htmlFor="totp" className="block text-sm font-medium text-gray-700 mb-1">
                Authentication code
              </label>
              <input
                id="totp"
                type="text"
                inputMode="numeric"
                maxLength={6}
                autoComplete="one-time-code"
                autoFocus
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-gray-900 text-center text-xl tracking-widest focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="000000"
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberDevice}
                onChange={(e) => setRememberDevice(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              Remember this device for 30 days
            </label>

            {error && <div className="rounded-md bg-red-50 p-4"><p className="text-sm text-red-700">{error}</p></div>}

            <button
              type="submit"
              disabled={loading || totpCode.length < 6}
              className="w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Verifying…' : 'Verify'}
            </button>
          </form>
        )}

        {/* ── Step 2b: TOTP first-time setup ── */}
        {step === 'setup' && (
          <form className="mt-8 space-y-6" onSubmit={handleSetup}>
            <div className="space-y-3">
              <p className="text-sm text-gray-700 font-medium">
                Scan this QR code with Google Authenticator, Authy, or any TOTP app.
              </p>
              {setupQr && (
                <div className="flex justify-center">
                  <img src={setupQr} alt="TOTP QR code" className="w-48 h-48 border rounded" />
                </div>
              )}
              {setupSecret && (
                <p className="text-xs text-gray-500 text-center break-all">
                  Manual key: <span className="font-mono">{setupSecret}</span>
                </p>
              )}
              <p className="text-sm text-gray-600">
                Then enter the 6-digit code shown in the app to confirm setup.
              </p>
            </div>

            <div>
              <label htmlFor="setup-code" className="block text-sm font-medium text-gray-700 mb-1">
                Verification code
              </label>
              <input
                id="setup-code"
                type="text"
                inputMode="numeric"
                maxLength={6}
                autoComplete="one-time-code"
                value={setupCode}
                onChange={(e) => setSetupCode(e.target.value.replace(/\D/g, ''))}
                className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-gray-900 text-center text-xl tracking-widest focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="000000"
              />
            </div>

            {error && <div className="rounded-md bg-red-50 p-4"><p className="text-sm text-red-700">{error}</p></div>}

            <button
              type="submit"
              disabled={loading || setupCode.length < 6}
              className="w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Activating…' : 'Activate 2FA & Sign in'}
            </button>
          </form>
        )}

        {/* ── Forgot password ── */}
        {step === 'forgot' && (
          <form className="mt-8 space-y-6" onSubmit={handleForgot}>
            <div>
              <label htmlFor="forgot-email" className="block text-sm font-medium text-gray-700 mb-1">
                Email address
              </label>
              <input
                id="forgot-email"
                type="email"
                autoComplete="email"
                required
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="Enter your email"
              />
            </div>

            {error && <div className="rounded-md bg-red-50 p-4"><p className="text-sm text-red-700">{error}</p></div>}
            {forgotMessage && <div className="rounded-md bg-green-50 p-4"><p className="text-sm text-green-700">{forgotMessage}</p></div>}

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => { setStep('credentials'); setError(''); setForgotMessage('') }}
                className="text-sm font-medium text-blue-600 hover:text-blue-500"
              >
                Back to sign in
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

export default Login
