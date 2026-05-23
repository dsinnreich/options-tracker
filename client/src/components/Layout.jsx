import { useState, useRef, useEffect } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

function ChangePasswordModal({ onClose }) {
  const { changePassword } = useAuth()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (next !== confirm) { setError('Passwords do not match'); return }
    setLoading(true)
    const result = await changePassword(current, next)
    if (result.success) {
      setSuccess(true)
      setTimeout(onClose, 1500)
    } else {
      setError(result.error || 'Failed to change password')
    }
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Change Password</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        {success ? (
          <p className="text-sm text-green-600">Password changed successfully.</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Current password</label>
              <input type="password" required value={current} onChange={e => setCurrent(e.target.value)}
                className="block w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">New password</label>
              <input type="password" required minLength={8} value={next} onChange={e => setNext(e.target.value)}
                className="block w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="Minimum 8 characters" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm new password</label>
              <input type="password" required minLength={8} value={confirm} onChange={e => setConfirm(e.target.value)}
                className="block w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full py-2 px-4 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50">
              {loading ? 'Saving…' : 'Change password'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

function Layout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout, isAdmin } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [showChangePassword, setShowChangePassword] = useState(false)
  const menuRef = useRef(null)

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const inPortfolio = location.pathname.startsWith('/portfolio')
  const inResearch = location.pathname.startsWith('/research')
  const inOptions = !inPortfolio && !inResearch

  return (
    <div className="min-h-screen bg-gray-50">
      {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} />}
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">

            {/* Left: app title + section tabs */}
            <div className="flex items-center space-x-6">
              <span className="text-xl font-bold text-gray-900">My Tracker</span>

              {/* Section tabs */}
              <div className="flex items-center space-x-1">
                <Link
                  to="/portfolio"
                  className={`px-4 py-2 rounded-md text-sm font-semibold border transition-colors ${
                    inPortfolio
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'text-gray-600 border-transparent hover:bg-gray-100'
                  }`}
                >
                  Portfolio
                </Link>
                <Link
                  to="/"
                  className={`px-4 py-2 rounded-md text-sm font-semibold border transition-colors ${
                    inOptions
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'text-gray-600 border-transparent hover:bg-gray-100'
                  }`}
                >
                  Options
                </Link>
                <Link
                  to="/research"
                  className={`px-4 py-2 rounded-md text-sm font-semibold border transition-colors ${
                    inResearch
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'text-gray-600 border-transparent hover:bg-gray-100'
                  }`}
                >
                  Research
                </Link>
              </div>
            </div>

            {/* Right: section-specific actions + user */}
            <div className="flex items-center space-x-4">

              <Link
                to="/help"
                className={`px-3 py-2 rounded-md text-sm font-medium ${
                  location.pathname === '/help'
                    ? 'bg-gray-100 text-gray-900'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                Help
              </Link>
              {isAdmin && (
                <Link
                  to="/admin"
                  className={`px-3 py-2 rounded-md text-sm font-medium ${
                    location.pathname === '/admin'
                      ? 'bg-gray-100 text-gray-900'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  Admin
                </Link>
              )}
              {inOptions && (
                <Link
                  to="/add"
                  className={`px-3 py-2 rounded-md text-sm font-medium ${
                    location.pathname === '/add'
                      ? 'bg-blue-600 text-white'
                      : 'bg-blue-500 text-white hover:bg-blue-600'
                  }`}
                >
                  + Add Position
                </Link>
              )}

              <div className="relative border-l pl-4" ref={menuRef}>
                <button
                  onClick={() => setMenuOpen(o => !o)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  {user?.name}
                  <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {menuOpen && (
                  <div className="absolute right-0 mt-1 w-44 bg-white rounded-md shadow-lg border border-gray-200 py-1 z-50">
                    <button
                      onClick={() => { setMenuOpen(false); setShowChangePassword(true) }}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      Change password
                    </button>
                    <div className="border-t border-gray-100 my-1" />
                    <button
                      onClick={handleLogout}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      </nav>

      <main className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>
    </div>
  )
}

export default Layout
