import { useState } from 'react'
import { usePositions } from '../hooks/usePositions'
import PositionsTable from './PositionsTable'
import SummaryCards from './SummaryCards'

function Dashboard() {
  const { positions, loading, error, closePosition, deletePosition, refreshPrices } = usePositions()
  const [filters, setFilters] = useState({
    status: 'all',
    account: 'all',
    ticker: ''
  })
  const [refreshing, setRefreshing] = useState(false)
  const [refreshResult, setRefreshResult] = useState(null)

  const handleRefreshPrices = async () => {
    setRefreshing(true)
    setRefreshResult(null)
    const result = await refreshPrices()
    setRefreshing(false)
    if (result) {
      setRefreshResult(result)
      setTimeout(() => setRefreshResult(null), 5000)
    }
  }

  const uniqueAccounts = [...new Set(positions.map(p => p.account))]

  const filteredPositions = positions.filter(p => {
    if (filters.status !== 'all' && p.status !== filters.status) return false
    if (filters.account !== 'all' && p.account !== filters.account) return false
    if (filters.ticker && !p.ticker.toLowerCase().includes(filters.ticker.toLowerCase())) return false
    return true
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading positions...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-700">Error: {error}</p>
        <p className="text-red-600 text-sm mt-1">Make sure the server is running on port 3001.</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <button
          onClick={handleRefreshPrices}
          disabled={refreshing}
          className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
        >
          {refreshing ? (
            <>
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Refreshing...
            </>
          ) : (
            'Refresh Prices'
          )}
        </button>
      </div>

      {refreshResult && (
        <div className={`mb-4 p-3 rounded-md ${refreshResult.errors?.length > 0 ? 'bg-yellow-50 border border-yellow-200' : 'bg-green-50 border border-green-200'}`}>
          <p className={refreshResult.errors?.length > 0 ? 'text-yellow-800' : 'text-green-800'}>
            Updated {refreshResult.updated} position(s)
            {refreshResult.errors?.length > 0 && ` with ${refreshResult.errors.length} error(s)`}
          </p>
          {refreshResult.errors?.length > 0 && (
            <ul className="text-sm text-yellow-700 mt-1">
              {refreshResult.errors.map((err, i) => <li key={i}>{err}</li>)}
            </ul>
          )}
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="px-3 py-2 border rounded-md"
            >
              <option value="all">All</option>
              <option value="Open">Open</option>
              <option value="Closed">Closed</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Account</label>
            <select
              value={filters.account}
              onChange={(e) => setFilters({ ...filters, account: e.target.value })}
              className="px-3 py-2 border rounded-md"
            >
              <option value="all">All Accounts</option>
              {uniqueAccounts.map(account => (
                <option key={account} value={account}>{account}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Search Ticker</label>
            <input
              type="text"
              value={filters.ticker}
              onChange={(e) => setFilters({ ...filters, ticker: e.target.value })}
              placeholder="e.g., AAPL"
              className="px-3 py-2 border rounded-md"
            />
          </div>

          {(filters.status !== 'all' || filters.account !== 'all' || filters.ticker) && (
            <div className="flex items-end">
              <button
                onClick={() => setFilters({ status: 'all', account: 'all', ticker: '' })}
                className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900"
              >
                Clear Filters
              </button>
            </div>
          )}
        </div>
      </div>

      <SummaryCards positions={filteredPositions} />

      <PositionsTable
        positions={filteredPositions}
        onClose={closePosition}
        onDelete={deletePosition}
      />
    </div>
  )
}

export default Dashboard
