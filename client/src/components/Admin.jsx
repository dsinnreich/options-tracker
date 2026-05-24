import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../hooks/useAuth'
import { Navigate } from 'react-router-dom'
import GlobalAssetClassMapEditor from './GlobalAssetClassMapEditor'

// ── Admin step-up modal ────────────────────────────────────────────────────
function AdminVerifyModal({ onVerified }) {
  const { verifyAdmin } = useAuth()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const result = await verifyAdmin(code.trim())
    if (result.success) {
      onVerified()
    } else {
      setError(result.error || 'Invalid code')
      setCode('')
    }
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Admin Verification Required</h2>
        <p className="text-sm text-gray-600">
          Enter your authenticator code to access admin settings. This session will stay unlocked for 1 hour.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            autoFocus
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            className="block w-full px-3 py-2 border border-gray-300 rounded-md text-center text-xl tracking-widest focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            placeholder="000000"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading || code.length < 6}
            className="w-full py-2 px-4 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Verifying…' : 'Verify'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────
function Admin() {
  const { isAdmin, fetchLoginHistory, fetchTrustedDevices, removeTrustedDevice } = useAuth()

  // Step-up gate
  const [needsVerification, setNeedsVerification] = useState(false)
  const [adminUnlocked, setAdminUnlocked] = useState(false)

  // User management
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [showEditForm, setShowEditForm] = useState(null)
  const [formData, setFormData] = useState({ email: '', name: '', password: '', isAdmin: false })
  const [deleteTarget, setDeleteTarget] = useState(null) // { id, name }
  const [deleteText, setDeleteText] = useState('')
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [resetLink, setResetLink] = useState(null) // { url, userName }

  // Global asset class map
  const [globalMap, setGlobalMap] = useState([])

  // Backup
  const [dbStats, setDbStats] = useState(null)
  const [backupLoading, setBackupLoading] = useState(false)
  const [backupError, setBackupError] = useState(null)
  const [restoreFile, setRestoreFile] = useState(null)
  const [restoreConfirm, setRestoreConfirm] = useState(false)
  const [restoreLoading, setRestoreLoading] = useState(false)
  const [restoreResult, setRestoreResult] = useState(null)
  const [restoreError, setRestoreError] = useState(null)

  // Security
  const [loginHistory, setLoginHistory] = useState([])
  const [trustedDevices, setTrustedDevicesData] = useState([])
  const [securityLoading, setSecurityLoading] = useState(false)

  const handleAdminFetchError = (res) => {
    if (res.status === 403) {
      setNeedsVerification(true)
      return true
    }
    return false
  }

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/admin/users', { credentials: 'include' })
      if (handleAdminFetchError(response)) { setLoading(false); return }
      if (!response.ok) throw new Error('Failed to fetch users')
      setUsers(await response.json())
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/backup/stats', { credentials: 'include' })
      if (res.ok) setDbStats(await res.json())
    } catch {}
  }, [])

  const fetchGlobalMap = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/global-asset-class-map', { credentials: 'include' })
      if (res.ok) setGlobalMap(await res.json())
    } catch {}
  }, [])

  const fetchSecurity = useCallback(async () => {
    setSecurityLoading(true)
    const [histResult, devResult] = await Promise.all([fetchLoginHistory(), fetchTrustedDevices()])
    if (histResult.success) setLoginHistory(histResult.history)
    if (devResult.success) setTrustedDevicesData(devResult.devices)
    setSecurityLoading(false)
  }, [fetchLoginHistory, fetchTrustedDevices])

  const onAdminVerified = useCallback(() => {
    setNeedsVerification(false)
    setAdminUnlocked(true)
  }, [])

  useEffect(() => {
    if (isAdmin) {
      fetchUsers()
      fetchStats()
      fetchSecurity()
      fetchGlobalMap()
    }
  }, [isAdmin, fetchUsers, fetchStats, fetchSecurity, fetchGlobalMap])

  // Re-load after step-up
  useEffect(() => {
    if (adminUnlocked) {
      fetchUsers()
      fetchStats()
      fetchGlobalMap()
    }
  }, [adminUnlocked, fetchUsers, fetchStats, fetchGlobalMap])

  const handleRemoveTrustedDevice = async (id) => {
    const result = await removeTrustedDevice(id)
    if (result.success) setTrustedDevicesData(prev => prev.filter(d => d.id !== id))
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
      if (!response.ok) throw new Error(data.error || 'Failed to create user')
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
      const updateData = { email: formData.email, name: formData.name, isAdmin: formData.isAdmin }
      if (formData.password) updateData.password = formData.password

      const response = await fetch(`/api/admin/users/${showEditForm}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(updateData)
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to update user')
      setShowEditForm(null)
      setFormData({ email: '', name: '', password: '', isAdmin: false })
      fetchUsers()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleDeleteUser = async () => {
    if (!deleteTarget || deleteText !== 'DELETE') return
    setDeleteLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/admin/users/${deleteTarget.id}`, {
        method: 'DELETE',
        credentials: 'include'
      })
      const data = await response.json()
      if (response.status === 403 && data.error === 'admin_verify_required') {
        setNeedsVerification(true)
        setDeleteTarget(null)
        setDeleteLoading(false)
        return
      }
      if (!response.ok) throw new Error(data.error || 'Failed to delete user')
      setDeleteTarget(null)
      setDeleteText('')
      fetchUsers()
    } catch (err) {
      setError(err.message)
    }
    setDeleteLoading(false)
  }

  const handleGenerateResetLink = async (user) => {
    try {
      const response = await fetch(`/api/admin/users/${user.id}/reset-link`, {
        method: 'POST', credentials: 'include'
      })
      const data = await response.json()
      if (response.status === 403 && data.error === 'admin_verify_required') { setNeedsVerification(true); return }
      if (!response.ok) throw new Error(data.error || 'Failed to generate link')
      setResetLink({ url: data.resetUrl, userName: user.name })
    } catch (err) {
      setError(err.message)
    }
  }

  const startEditUser = (user) => {
    setShowEditForm(user.id)
    setFormData({ email: user.email, name: user.name, password: '', isAdmin: user.is_admin === 1 })
    setShowCreateForm(false)
  }

  const cancelForm = () => {
    setShowCreateForm(false)
    setShowEditForm(null)
    setFormData({ email: '', name: '', password: '', isAdmin: false })
    setError(null)
  }

  const handleGlobalMapAdd = async (form) => {
    const res = await fetch('/api/admin/global-asset-class-map', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(form)
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed to add mapping')
    await fetchGlobalMap()
  }

  const handleGlobalMapUpdate = async (id, form) => {
    const res = await fetch(`/api/admin/global-asset-class-map/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(form)
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed to update mapping')
    await fetchGlobalMap()
  }

  const handleGlobalMapDelete = async (id) => {
    const res = await fetch(`/api/admin/global-asset-class-map/${id}`, {
      method: 'DELETE',
      credentials: 'include'
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed to delete mapping')
    await fetchGlobalMap()
  }

  const handleGlobalMapExport = async () => {
    const res = await fetch('/api/admin/global-asset-class-map/export', { credentials: 'include' })
    if (!res.ok) throw new Error('Export failed')
    const disposition = res.headers.get('Content-Disposition') || ''
    const match = disposition.match(/filename="([^"]+)"/)
    const filename = match ? match[1] : 'global-asset-class-map.json'
    const blob = await res.blob()
    const href = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = href; a.download = filename; a.click()
    URL.revokeObjectURL(href)
  }

  const handleGlobalMapImport = async (data) => {
    const res = await fetch('/api/admin/global-asset-class-map/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data)
    })
    const result = await res.json()
    if (!res.ok) throw new Error(result.error || 'Import failed')
    await fetchGlobalMap()
    return result
  }

  if (!isAdmin) return <Navigate to="/" replace />

  return (
    <>
      {needsVerification && <AdminVerifyModal onVerified={onAdminVerified} />}

      {deleteTarget && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Delete user</h2>
            <p className="text-sm text-gray-600">
              This will permanently delete <strong>{deleteTarget.name}</strong> and all their data —
              positions, portfolios, ETF research, and transaction history. This cannot be undone.
            </p>
            <p className="text-sm text-gray-700">
              Type <span className="font-mono font-bold text-red-600">DELETE</span> to confirm:
            </p>
            <input
              type="text"
              autoFocus
              value={deleteText}
              onChange={e => setDeleteText(e.target.value)}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-red-500 focus:border-red-500"
              placeholder="DELETE"
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-3">
              <button
                onClick={handleDeleteUser}
                disabled={deleteText !== 'DELETE' || deleteLoading}
                className="flex-1 py-2 px-4 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleteLoading ? 'Deleting…' : 'Delete user'}
              </button>
              <button
                onClick={() => { setDeleteTarget(null); setDeleteText('') }}
                className="flex-1 py-2 px-4 bg-gray-100 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-200"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {resetLink && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Password reset link for {resetLink.userName}</h2>
            <p className="text-sm text-gray-600">Copy this link and send it to the user. It expires in 1 hour.</p>
            <div className="flex gap-2">
              <input
                readOnly
                value={resetLink.url}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm font-mono bg-gray-50 focus:outline-none"
                onFocus={e => e.target.select()}
              />
              <button
                onClick={() => { navigator.clipboard.writeText(resetLink.url) }}
                className="px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700"
              >
                Copy
              </button>
            </div>
            <button
              onClick={() => setResetLink(null)}
              className="w-full py-2 px-4 bg-gray-100 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-200"
            >
              Close
            </button>
          </div>
        </div>
      )}

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
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
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
                  required={!!showCreateForm}
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
                <label htmlFor="isAdmin" className="ml-2 block text-sm text-gray-700">Admin privileges</label>
              </div>
              <div className="flex space-x-3">
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium">
                  {showCreateForm ? 'Create User' : 'Update User'}
                </button>
                <button type="button" onClick={cancelForm} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 text-sm font-medium">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── Data Backup ── */}
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
                  <div className="text-lg font-semibold text-gray-800">{count?.toLocaleString() ?? '—'}</div>
                </div>
              ))}
            </div>
          )}

          {backupError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">{backupError}</div>
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
            <span className="text-xs text-gray-400">{dbStats ? `Schema v${dbStats.schema_version}` : ''}</span>
          </div>

          {/* Restore */}
          <div className="mt-6 pt-6 border-t border-gray-100">
            <h3 className="text-sm font-semibold text-gray-800 mb-1">Restore from JSON Backup</h3>
            <p className="text-sm text-gray-500 mb-3">
              Uploads a <code className="bg-gray-100 px-1 rounded text-xs">tracker-backup-*.json</code> file and replaces all current data.
              Your login accounts are matched by email and preserved.
              <strong className="text-red-600"> This cannot be undone — download a fresh backup first.</strong>
            </p>

            {restoreResult && (
              <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md text-green-800 text-sm">
                ✓ Restore complete — {restoreResult.positions} positions, {restoreResult.portfolios} portfolios,{' '}
                {restoreResult.portfolio_positions?.toLocaleString()} holdings rows,{' '}
                {restoreResult.portfolio_transaction_history?.toLocaleString()} transactions,{' '}
                {restoreResult.etf_research_data?.toLocaleString()} ETF rows restored.
              </div>
            )}

            {restoreError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">Error: {restoreError}</div>
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

        {/* ── Security ── */}
        <div className="bg-white shadow rounded-lg p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Security</h2>
            <button
              onClick={fetchSecurity}
              disabled={securityLoading}
              className="text-xs text-blue-600 hover:text-blue-700 disabled:opacity-50"
            >
              {securityLoading ? 'Loading…' : 'Refresh'}
            </button>
          </div>

          {/* Trusted devices */}
          <div>
            <h3 className="text-sm font-semibold text-gray-800 mb-2">Trusted Devices</h3>
            {trustedDevices.length === 0 ? (
              <p className="text-sm text-gray-400">No trusted devices.</p>
            ) : (
              <div className="space-y-2">
                {trustedDevices.map(device => (
                  <div key={device.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-md text-sm">
                    <div className="space-y-0.5">
                      <div className="font-medium text-gray-800">{device.label || 'Unknown device'}</div>
                      <div className="text-gray-500 text-xs">
                        {device.country ? `${device.country} · ` : ''}
                        Added {new Date(device.created_at).toLocaleDateString()} ·
                        Last used {new Date(device.last_used_at).toLocaleDateString()} ·
                        Expires {new Date(device.expires_at).toLocaleDateString()}
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveTrustedDevice(device.id)}
                      className="ml-4 text-xs text-red-600 hover:text-red-800"
                    >
                      Revoke
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Login history */}
          <div>
            <h3 className="text-sm font-semibold text-gray-800 mb-2">Recent Login History</h3>
            {loginHistory.length === 0 ? (
              <p className="text-sm text-gray-400">No login events recorded.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm divide-y divide-gray-200">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 uppercase tracking-wider">
                      <th className="pb-2 pr-4">Time</th>
                      <th className="pb-2 pr-4">Email</th>
                      <th className="pb-2 pr-4">Country</th>
                      <th className="pb-2 pr-4">IP</th>
                      <th className="pb-2 pr-4">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {loginHistory.map(row => (
                      <tr key={row.id}>
                        <td className="py-2 pr-4 text-gray-500 whitespace-nowrap">
                          {new Date(row.created_at).toLocaleString()}
                        </td>
                        <td className="py-2 pr-4 text-gray-700">{row.email || '—'}</td>
                        <td className="py-2 pr-4 text-gray-500">{row.country || '—'}</td>
                        <td className="py-2 pr-4 text-gray-400 font-mono text-xs">{row.ip || '—'}</td>
                        <td className="py-2 pr-4">
                          {row.success ? (
                            <span className="text-green-600 font-medium">✓ Success</span>
                          ) : (
                            <span className="text-red-600 font-medium">✗ {row.failure_reason || 'Failed'}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* ── Global Asset Class Map ── */}
        <div className="bg-white shadow rounded-lg p-6">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Global Asset Class Map</h2>
            <p className="text-sm text-gray-500 mt-1">
              Define default asset class and style classifications for ETFs and funds.
              These apply to all users automatically — each user can override individual symbols from their own Asset Class Map editor.
            </p>
          </div>
          <GlobalAssetClassMapEditor
            globalMap={globalMap}
            onAdd={handleGlobalMapAdd}
            onUpdate={handleGlobalMapUpdate}
            onDelete={handleGlobalMapDelete}
            onExport={handleGlobalMapExport}
            onImport={handleGlobalMapImport}
          />
        </div>

        {/* ── Users table ── */}
        <div className="bg-white shadow rounded-lg overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-400 text-sm">Loading users…</div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">2FA</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {users.map((user) => (
                  <tr key={user.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{user.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{user.email}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {user.is_admin ? (
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-purple-100 text-purple-800">Admin</span>
                      ) : (
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">User</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {user.totp_enabled ? (
                        <span className="text-green-600 font-medium">✓ Active</span>
                      ) : (
                        <span className="text-amber-500">Not set up</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-3">
                      <button onClick={() => startEditUser(user)} className="text-blue-600 hover:text-blue-900">Edit</button>
                      <button onClick={() => handleGenerateResetLink(user)} className="text-amber-600 hover:text-amber-900">Reset link</button>
                      <button onClick={() => { setDeleteTarget({ id: user.id, name: user.name }); setDeleteText('') }} className="text-red-600 hover:text-red-900">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  )
}

export default Admin
