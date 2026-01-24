import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatCurrency, formatCurrencyWhole, formatPercent } from '../utils/calculations'
import { format, parseISO } from 'date-fns'

function PositionsTable({ positions, onClose, onDelete }) {
  const navigate = useNavigate()
  const [sortField, setSortField] = useState('created_at')
  const [sortDirection, setSortDirection] = useState('desc')
  const [closingId, setClosingId] = useState(null)
  const [closePrice, setClosePrice] = useState('')
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [importing, setImporting] = useState(false)

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const sortedPositions = [...positions].sort((a, b) => {
    let aVal = a[sortField]
    let bVal = b[sortField]

    if (typeof aVal === 'string') {
      aVal = aVal.toLowerCase()
      bVal = bVal.toLowerCase()
    }

    if (sortDirection === 'asc') {
      return aVal > bVal ? 1 : -1
    }
    return aVal < bVal ? 1 : -1
  })

  const handleClosePosition = (id) => {
    if (closePrice !== '') {
      onClose(id, parseFloat(closePrice))
      setClosingId(null)
      setClosePrice('')
    }
  }

  const toggleSelection = (id) => {
    const newSelected = new Set(selectedIds)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedIds(newSelected)
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === positions.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(positions.map(p => p.id)))
    }
  }

  const handleExportCSV = async () => {
    try {
      const ids = Array.from(selectedIds).join(',')
      const url = selectedIds.size > 0
        ? `/api/backup/export/csv?ids=${ids}`
        : '/api/backup/export/csv'

      const response = await fetch(url)
      const blob = await response.blob()
      const downloadUrl = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = downloadUrl
      a.download = `positions-${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(downloadUrl)

      setSelectedIds(new Set())
    } catch (error) {
      alert('Failed to export CSV: ' + error.message)
    }
  }

  const handleImportCSV = async (event) => {
    const file = event.target.files[0]
    if (!file) return

    try {
      setImporting(true)
      const text = await file.text()

      const response = await fetch('/api/backup/import/csv', {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
        },
        body: text
      })

      const result = await response.json()

      if (result.success) {
        alert(`Successfully imported ${result.imported} positions!${result.skipped > 0 ? `\n${result.skipped} positions were skipped.` : ''}`)
        window.location.reload()
      } else {
        alert('Import failed: ' + result.error)
      }
    } catch (error) {
      alert('Failed to import CSV: ' + error.message)
    } finally {
      setImporting(false)
      event.target.value = ''
    }
  }

  const getMoneynessBadge = (moneyness) => {
    const colors = {
      ITM: 'bg-red-100 text-red-800',
      ATM: 'bg-yellow-100 text-yellow-800',
      OTM: 'bg-green-100 text-green-800'
    }
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[moneyness]}`}>
        {moneyness}
      </span>
    )
  }

  const getStatusBadge = (status) => {
    const colors = {
      Open: 'bg-blue-100 text-blue-800',
      Closed: 'bg-gray-100 text-gray-800'
    }
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[status]}`}>
        {status}
      </span>
    )
  }

  const getPnLColor = (pnl) => {
    if (pnl > 0) return 'text-green-600'
    if (pnl < 0) return 'text-red-600'
    return 'text-gray-600'
  }

  const getExtrinsicBufferDisplay = (position) => {
    // Don't show value for closed positions
    if (position.status === 'Closed') {
      return <span className="text-gray-400">—</span>
    }

    const value = position.extrinsic_buffer
    let indicator = null
    let indicatorColor = ''

    // Add colored indicator based on value
    if (value < 0.50) {
      indicator = '●'
      indicatorColor = 'text-red-600'
    } else if (value < 2.00) {
      indicator = '●'
      indicatorColor = 'text-orange-500'
    } else if (value < 5.00) {
      indicator = '●'
      indicatorColor = 'text-yellow-500'
    }

    return (
      <div className="flex items-center space-x-1">
        {indicator && <span className={`${indicatorColor} text-lg leading-none`}>{indicator}</span>}
        <span>{formatCurrency(value)}</span>
      </div>
    )
  }

  const SortHeader = ({ field, children }) => (
    <th
      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center space-x-1">
        <span>{children}</span>
        {sortField === field && (
          <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
        )}
      </div>
    </th>
  )

  if (positions.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-8 text-center">
        <p className="text-gray-500">No positions yet. Add your first position to get started.</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      {/* Export/Import Controls */}
      <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <button
              onClick={handleExportCSV}
              disabled={positions.length === 0}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm font-medium"
            >
              {selectedIds.size > 0 ? `Export ${selectedIds.size} Selected` : 'Export All'}
            </button>
            <label className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer text-sm font-medium">
              {importing ? 'Importing...' : 'Import CSV'}
              <input
                type="file"
                accept=".csv"
                onChange={handleImportCSV}
                disabled={importing}
                className="hidden"
              />
            </label>
            {selectedIds.size > 0 && (
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-sm text-gray-600 hover:text-gray-800"
              >
                Clear selection
              </button>
            )}
          </div>
          <div className="text-sm text-gray-600">
            {selectedIds.size > 0 && `${selectedIds.size} selected`}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left">
                <input
                  type="checkbox"
                  checked={selectedIds.size === positions.length && positions.length > 0}
                  onChange={toggleSelectAll}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
              </th>
              <SortHeader field="ticker">Ticker</SortHeader>
              <SortHeader field="account">Account</SortHeader>
              <SortHeader field="strike_price">Strike</SortHeader>
              <SortHeader field="quantity">Qty</SortHeader>
              <SortHeader field="expiration_date">Expiration</SortHeader>
              <SortHeader field="dte">DTE</SortHeader>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Moneyness</th>
              <SortHeader field="net_premium">Net Premium</SortHeader>
              <SortHeader field="annualized_yield">Ann. Yield</SortHeader>
              <SortHeader field="pnl">P&L</SortHeader>
              <SortHeader field="extrinsic_buffer">Ext. Buffer</SortHeader>
              <SortHeader field="status">Status</SortHeader>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedPositions.map((position) => (
              <tr key={position.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(position.id)}
                    onChange={() => toggleSelection(position.id)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="font-medium text-gray-900">{position.ticker}</div>
                  <div className="text-xs text-gray-500">{formatCurrency(position.stock_price)}</div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                  {position.account}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                  {formatCurrencyWhole(position.strike_price)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                  {position.quantity}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                  {format(parseISO(position.expiration_date), 'MMM d, yyyy')}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                  {position.dte}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {getMoneynessBadge(position.moneyness)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                  {formatCurrencyWhole(position.net_premium)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                  {formatPercent(position.annualized_yield)}
                </td>
                <td className={`px-4 py-3 whitespace-nowrap text-sm font-medium ${getPnLColor(position.pnl)}`}>
                  {formatCurrencyWhole(position.pnl)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                  {getExtrinsicBufferDisplay(position)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {getStatusBadge(position.status)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm">
                  {closingId === position.id ? (
                    <div className="flex items-center space-x-2">
                      <input
                        type="number"
                        step="0.01"
                        value={closePrice}
                        onChange={(e) => setClosePrice(e.target.value)}
                        placeholder="Close price"
                        className="w-20 px-2 py-1 border rounded text-sm"
                      />
                      <button
                        onClick={() => handleClosePosition(position.id)}
                        className="text-green-600 hover:text-green-800"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => { setClosingId(null); setClosePrice(''); }}
                        className="text-gray-600 hover:text-gray-800"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-3">
                      <button
                        onClick={() => navigate(`/edit/${position.id}`)}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        Edit
                      </button>
                      {position.status === 'Open' && (
                        <>
                          <button
                            onClick={() => navigate(`/roll/${position.id}`)}
                            className="text-purple-600 hover:text-purple-800"
                          >
                            Roll
                          </button>
                          <button
                            onClick={() => setClosingId(position.id)}
                            className="text-yellow-600 hover:text-yellow-800"
                          >
                            Close
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => {
                          if (confirm('Are you sure you want to delete this position?')) {
                            onDelete(position.id)
                          }
                        }}
                        className="text-red-600 hover:text-red-800"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default PositionsTable
