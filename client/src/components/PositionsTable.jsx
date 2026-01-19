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
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
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
