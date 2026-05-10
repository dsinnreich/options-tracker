import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { Navigate } from 'react-router-dom'

function Admin() {
  const { isAdmin } = useAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [showEditForm, setShowEditForm] = useState(null)
  const [formData, setFormData] = useState({
    email: '',
    name: '',
    password: '',
    isAdmin: false
  })

  const [dbStats, setDbStats] = useState(null)
  const [backupLoading, setBackupLoading] = useState(false)
  const [backupError, setBackupError] = useState(null)

  const [restoreFile, setRestoreFile] = useState(null)
  const [restoreConfirm, setRestoreConfirm] = useState(false)
  const [restoreLoading, setRestoreLoading] = useState(false)
  const [restoreResult, setRestoreResult] = useState(null)
  const [restoreError, setRestoreError] = useState(null)

  useEffect(() => {
    if (isAdmin) {
      fetchUsers()
      fetchStats()
    }
  }, [isAdmin])

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/backup/stats', { credentials: 'include' })
      if (res.ok) setDbStats(await res.json())
    } catch {}
  }

  const downloadFile = async (url, label) => {
    setBackupLoading(true)
    setBackupError(null)
    try {
      const res = await fetch(url, { credentials: 'include' })
      if (!res.ok) throw new Error((await res.json()).error || 'Download failed')
      const disposition = res.headers.get('Content-Disposition') || ''
      const match = disposition.match(/filename="([^"]+)"/)
      const filename = match ? match[1] : label
      const blob = await res.blob()
      const href = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = href
      a.download = filename
      a.click()
      URL.revokeObjectURL(href)
    } catch (err) {
      setBackupError(err.message)
    } finally {
      setBackupLoading(false)
    }
  }

  const handleRestore = async () => {
    if (!restoreFile) return
    setRestoreLoading(true)
    setRestoreError(null)
    setRestoreResult(null)
    try {
      const text = await restoreFile.text()
      const backup = JSON.parse(text)
      const res = await fetch('/api/backup/restore/json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(backup),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Restore failed')
      setRestoreResult(data.summary)
      setRestoreFile(null)
      setRestoreConfirm(false)
      fetchStats()
    } catch (err) {
      setRestoreError(err.message)
    } finally {
      setRestoreLoading(false)
    }
  }

  const fetchUsers = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/admin/users', {
        credentials: 'include'
      })
      if (!response.ok) throw new Error('Failed to fetch users')
      const data = await response.json()
      setUsers(data)
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateUser = async (e) => {
    e.preventDefault()
    setError(null)

    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(formData)
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create user')
      }

      setShowCreateForm(false)
      setFormData({ email: '', name: '', password: '', isAdmin: false })
      fetchUsers()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleUpdateUser = async (e) => {
    e.preventDefault()
    setError(null)

    try {
      const updateData = {
        email: formData.email,
        name: formData.name,
        isAdmin: formData.isAdmin
      }

      // Only include password if it was provided
      if (formData.password) {
        updateData.password = formData.password
      }

      const response = await fetch(`/api/admin/users/${showEditForm}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(updateData)
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update user')
      }

      setShowEditForm(null)
      setFormData({ email: '', name: '', password: '', isAdmin: false })
      fetchUsers()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleDeleteUser = async (userId) => {
    if (!confirm('Are you sure you want to delete this user? All their positions will also be deleted.')) {
      return
    }

    setError(null)

    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
        credentials: 'include'
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete user')
      }

      fetchUsers()
    } catch (err) {
      setError(err.message)
    }
  }

  const startEditUser = (user) => {
    setShowEditForm(user.id)
    setFormData({
      email: user.email,
      name: user.name,
      password: '',
      isAdmin: user.is_admin === 1
    })
    setShowCreateForm(false)
  }

  const cancelForm = () => {
    setShowCreateForm(false)
    setShowEditForm(null)
    setFormData({ email: '', name: '', password: '', isAdmin: false })
    setError(null)
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading users...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
        {!showCreateForm && !showEditForm && (
          <button
            onClick={() => setShowCreateForm(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
          >
            + Create User
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {(showCreateForm || showEditForm) && (
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            {showCreateForm ? 'Create New User' : 'Edit User'}
          </h2>
          <form onSubmit={showCreateForm ? handleCreateUser : handleUpdateUser} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password {showEditForm && '(leave blank to keep current)'}
              </label>
              <input
                type="password"
                required={showCreateForm}
                minLength={8}
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="Minimum 8 characters"
              />
            </div>
            <div className="flex items-center">
              <input
                type="checkbox"
                id="isAdmin"
                checked={formData.isAdmin}
                onChange={(e) => setFormData({ ...formData, isAdmin: e.target.checked })}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="isAdmin" className="ml-2 block text-sm text-gray-700">
                Admin privileges
              </label>
            </div>
            <div className="flex space-x-3">
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
              >
                {showCreateForm ? 'Create User' : 'Update User'}
              </button>
              <button
                type="button"
                onClick={cancelForm}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 text-sm font-medium"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Backup */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Data Backup</h2>
        <p className="text-sm text-gray-500 mb-4">
          Download a backup of all data — options positions, portfolio holdings, transaction history, ETF research, and asset class mappings.
          Recommended once every 1–2 weeks.
        </p>

        {dbStats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            {[
              ['Options positions', dbStats.positions],
              ['Portfolio imports', dbStats.portfolio_imports],
              ['Holdings rows', dbStats.portfolio_positions],
              ['Transactions', dbStats.portfolio_transaction_history],
              ['Portfolios', dbStats.portfolios],
              ['ETF watchlists', dbStats.etf_watchlists],
              ['ETF imports', dbStats.etf_research_imports],
              ['ETF rows', dbStats.etf_research_data],
            ].map(([label, count]) => (
              <div key={label} className="bg-gray-50 rounded-md px-3 py-2">
                <div className="text-xs text-gray-500">{label}</div>
                <div className="text-lg font-semibold text-gray-800">{count.toLocaleString()}</div>
              </div>
            ))}
          </div>
        )}

        {backupError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
            {backupError}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={() => downloadFile('/api/backup/export/full', 'tracker-backup.json')}
            disabled={backupLoading}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
          >
            {backupLoading ? 'Preparing…' : 'Export Full JSON'}
          </button>
          <button
            onClick={() => downloadFile('/api/backup/download/database', 'tracker-backup.db')}
            disabled={backupLoading}
            className="px-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-800 disabled:opacity-50 text-sm font-medium"
          >
            {backupLoading ? 'Preparing…' : 'Download .db File'}
          </button>
          <span className="text-xs text-gray-400">
            {dbStats ? `Schema v${dbStats.schema_version}` : ''}
          </span>
        </div>

        {/* Restore */}
        <div className="mt-6 pt-6 border-t border-gray-100">
          <h3 className="text-sm font-semibold text-gray-800 mb-1">Restore from JSON Backup</h3>
          <p className="text-sm text-gray-500 mb-3">
            Uploads a <code className="bg-gray-100 px-1 rounded text-xs">tracker-backup-*.json</code> file and
            replaces all current data. Your login accounts are matched by email and preserved.
            <strong className="text-red-600"> This cannot be undone — download a fresh backup first if you have any current data to keep.</strong>
          </p>

          {restoreResult && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md text-green-800 text-sm">
              ✓ Restore complete —{' '}
              {restoreResult.positions} positions, {restoreResult.portfolios} portfolios,{' '}
              {restoreResult.portfolio_positions.toLocaleString()} holdings rows,{' '}
              {restoreResult.portfolio_transaction_history.toLocaleString()} transactions,{' '}
              {restoreResult.etf_research_data.toLocaleString()} ETF rows restored.
            </div>
          )}

          {restoreError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
              Error: {restoreError}
            </div>
          )}

          {!restoreConfirm ? (
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50 cursor-pointer">
                <input
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={e => {
                    setRestoreFile(e.target.files[0] || null)
                    setRestoreError(null)
                    setRestoreResult(null)
                    e.target.value = ''
                  }}
                />
                Choose JSON file
              </label>
              {restoreFile && (
                <>
                  <span className="text-sm text-gray-600">{restoreFile.name}</span>
                  <button
                    onClick={() => setRestoreConfirm(true)}
                    className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm font-medium"
                  >
                    Restore…
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-md">
              <span className="text-sm text-red-700 font-medium">
                Replace ALL current data with <strong>{restoreFile.name}</strong>?
              </span>
              <button
                onClick={handleRestore}
                disabled={restoreLoading}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 text-sm font-medium"
              >
                {restoreLoading ? 'Restoring…' : 'Yes, restore now'}
              </button>
              <button
                onClick={() => { setRestoreConfirm(false); setRestoreFile(null) }}
                className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Users */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Email
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Role
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Created
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {users.map((user) => (
              <tr key={user.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {user.name}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {user.email}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {user.is_admin ? (
                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-purple-100 text-purple-800">
                      Admin
                    </span>
                  ) : (
                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                      User
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {new Date(user.created_at).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-3">
                  <button
                    onClick={() => startEditUser(user)}
                    className="text-blue-600 hover:text-blue-900"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteUser(user.id)}
                    className="text-red-600 hover:text-red-900"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default Admin
