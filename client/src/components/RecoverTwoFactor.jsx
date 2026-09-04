import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

function RecoverTwoFactor() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const { completeMfaRecoveryEmail } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!token) setError('Invalid or missing recovery token')
  }, [token])

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setLoading(true)
    const result = await completeMfaRecoveryEmail(token, password)
    if (result.success) {
      setSuccess(true)
      setTimeout(() => navigate('/login', { replace: true }), 3000)
    } else {
      setError(result.error || 'Recovery failed')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">Recover 2FA</h2>
          <p className="mt-2 text-center text-sm text-gray-600">Replace your lost authenticator securely</p>
        </div>

        {success ? (
          <div className="rounded-md bg-green-50 p-4 space-y-2">
            <p className="text-sm font-medium text-green-800">Your old authenticator has been removed.</p>
            <p className="text-sm text-green-700">Sign in again to set up a new authenticator. Redirecting…</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 space-y-6">
            <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm text-amber-800">
                Completing recovery will sign out all sessions and revoke trusted devices and previous recovery codes.
              </p>
            </div>
            <div>
              <label htmlFor="recovery-password" className="block text-sm font-medium text-gray-700 mb-1">
                Confirm your password
              </label>
              <input
                id="recovery-password"
                type="password"
                autoComplete="current-password"
                required
                autoFocus
                value={password}
                onChange={event => setPassword(event.target.value)}
                className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            {error && <div className="rounded-md bg-red-50 p-4"><p className="text-sm text-red-700">{error}</p></div>}
            <button
              type="submit"
              disabled={loading || !token || !password}
              className="w-full py-2 px-4 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Recovering…' : 'Reset authenticator'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

export default RecoverTwoFactor
