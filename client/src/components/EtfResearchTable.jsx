import { useState, useMemo } from 'react'

// best: 'high' = highest wins, 'low' = lowest wins, null = no ranking
const COLUMNS = [
  { key: 'ticker', label: 'Ticker', type: 'text', sticky: true },
  { key: 'name', label: 'Name', type: 'text', width: 240 },
  { key: 'std_dev_3y', label: 'Std Dev', sub: '3Y Monthly', type: 'number', decimals: 2, best: 'low' },
  { key: 'sharpe_ratio_3y', label: 'Sharpe Ratio', sub: '3Y Monthly', type: 'number', decimals: 2, best: 'high' },
  { key: 'alpha_3y', label: 'Alpha', sub: '3Y Monthly', type: 'number', decimals: 2, best: 'high' },
  { key: 'morningstar_rating', label: 'Morningstar', sub: 'Rating', type: 'stars', best: 'high' },
  { key: 'beta_3y', label: 'Beta', sub: '3Y Monthly', type: 'number', decimals: 2 },
  { key: 'total_return_1m', label: 'Return', sub: '1 Month', type: 'percent', decimals: 2, best: 'high' },
  { key: 'total_return_3m', label: 'Return', sub: '3 Month', type: 'percent', decimals: 2, best: 'high' },
  { key: 'total_return_6m', label: 'Return', sub: '6 Month', type: 'percent', decimals: 2, best: 'high' },
  { key: 'total_return_ytd', label: 'Return', sub: 'YTD', type: 'percent', decimals: 2, best: 'high' },
  { key: 'total_return_1y', label: 'Return', sub: '1 Year', type: 'percent', decimals: 2, best: 'high' },
  { key: 'total_return_3y', label: 'Return', sub: '3 Year', type: 'percent', decimals: 2, best: 'high' },
  { key: 'total_return_5y', label: 'Return', sub: '5 Year', type: 'percent', decimals: 2, best: 'high' },
  { key: 'downside_capture_3y', label: 'Downside', sub: 'Capture 3Y', type: 'number', decimals: 2, best: 'low' },
  { key: 'sec_yield', label: 'SEC Yield', sub: '30-Day', type: 'percent', decimals: 2, best: 'high' },
  { key: 'tax_cost_3y', label: 'Tax Cost', sub: '3Y', type: 'percent', decimals: 2, best: 'low' },
  { key: 'expense_ratio', label: 'Expense', sub: 'Ratio', type: 'percent', decimals: 2, best: 'low' },
  { key: 'category', label: 'Category', type: 'text' },
  { key: 'style_box', label: 'Style Box', type: 'text' },
  { key: 'medalist_rating', label: 'Medalist', type: 'text' }
]

function renderStars(n) {
  if (n == null) return '—'
  const count = Math.round(n)
  return '★'.repeat(count) + '☆'.repeat(Math.max(0, 5 - count))
}

function formatCell(value, col) {
  if (value == null || value === '') return '—'
  switch (col.type) {
    case 'percent':
      return `${Number(value).toFixed(col.decimals)}%`
    case 'number':
      return Number(value).toFixed(col.decimals)
    case 'stars':
      return renderStars(value)
    default:
      return value
  }
}

function cellColor(value, col) {
  if (col.type === 'percent' && value != null) {
    return Number(value) >= 0 ? 'text-gray-900' : 'text-red-600'
  }
  return 'text-gray-900'
}

function EtfResearchTable({ data }) {
  const [sortField, setSortField] = useState('ticker')
  const [sortDir, setSortDir] = useState('asc')
  const [checkedTickers, setCheckedTickers] = useState(new Set())
  const [comparing, setComparing] = useState(false)

  const handleSort = (key) => {
    if (sortField === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(key)
      setSortDir('asc')
    }
  }

  const toggleTicker = (ticker) => {
    setCheckedTickers(prev => {
      const next = new Set(prev)
      if (next.has(ticker)) next.delete(ticker)
      else next.add(ticker)
      return next
    })
  }

  const startCompare = () => setComparing(true)

  const clearSelection = () => {
    setCheckedTickers(new Set())
    setComparing(false)
  }

  const visibleData = useMemo(() => {
    let rows = [...data]
    if (comparing && checkedTickers.size > 0) {
      rows = rows.filter(r => checkedTickers.has(r.ticker))
    }
    rows.sort((a, b) => {
      let av = a[sortField]
      let bv = b[sortField]
      if (av == null) return 1
      if (bv == null) return -1
      if (typeof av === 'string') {
        av = av.toLowerCase()
        bv = (bv || '').toLowerCase()
      }
      if (sortDir === 'asc') return av > bv ? 1 : av < bv ? -1 : 0
      return av < bv ? 1 : av > bv ? -1 : 0
    })
    return rows
  }, [data, sortField, sortDir, checkedTickers, comparing])

  // Compute best value per ranked column when comparing
  const bestValues = useMemo(() => {
    if (!comparing || visibleData.length < 2) return {}
    const bests = {}
    for (const col of COLUMNS) {
      if (!col.best) continue
      const values = visibleData.map(r => r[col.key]).filter(v => v != null)
      if (values.length === 0) continue
      bests[col.key] = col.best === 'high' ? Math.max(...values) : Math.min(...values)
    }
    return bests
  }, [comparing, visibleData])

  if (!data.length) {
    return <p className="text-gray-500 text-center py-12">No research data loaded. Import a Morningstar XLSX file to get started.</p>
  }

  const sortArrow = (key) => {
    if (sortField !== key) return ''
    return sortDir === 'asc' ? ' ▲' : ' ▼'
  }

  return (
    <div>
      {checkedTickers.size > 0 && (
        <div className="mb-3 flex items-center space-x-3">
          <span className="text-sm text-gray-600">
            {checkedTickers.size} selected
          </span>
          {!comparing ? (
            <button
              onClick={startCompare}
              className="px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
            >
              Compare Selected
            </button>
          ) : (
            <span className="text-sm text-blue-700 font-medium">
              Comparing {checkedTickers.size} ETF{checkedTickers.size !== 1 ? 's' : ''}
            </span>
          )}
          <button
            onClick={clearSelection}
            className="text-sm text-gray-500 hover:text-gray-700 underline"
          >
            Clear selection
          </button>
        </div>
      )}

      <div className="overflow-x-auto border border-gray-200 rounded-lg shadow-sm pb-3">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-2 py-2 text-left font-medium text-gray-500 sticky left-0 bg-gray-50 z-10 w-8">
                <span className="sr-only">Select</span>
              </th>
              {COLUMNS.map(col => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className={`px-2 py-2 font-medium text-gray-500 cursor-pointer hover:bg-gray-100 select-none whitespace-nowrap ${
                    col.type === 'text' ? 'text-left' : 'text-right'
                  } ${col.sticky ? 'sticky left-8 bg-gray-50 z-10' : ''}`}
                  style={col.width ? { minWidth: col.width } : undefined}
                >
                  <div className="leading-tight">
                    <div>{col.label}{sortArrow(col.key)}</div>
                    {col.sub && <div className="text-[10px] font-normal text-gray-400">{col.sub}</div>}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visibleData.map(row => {
              const isSelected = checkedTickers.has(row.ticker)
              return (
                <tr
                  key={row.id}
                  className={`hover:bg-blue-50 transition-colors ${isSelected ? 'bg-blue-50' : ''}`}
                >
                  <td className="px-2 py-1.5 sticky left-0 bg-white z-10" onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleTicker(row.ticker)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </td>
                  {COLUMNS.map(col => {
                    const isBest = comparing && col.best && row[col.key] != null && bestValues[col.key] === row[col.key]
                    return (
                      <td
                        key={col.key}
                        className={`px-2 py-1.5 whitespace-nowrap ${
                          col.type === 'text' ? 'text-left' : 'text-right'
                        } ${col.sticky ? 'sticky left-8 z-10 font-semibold' : ''} ${
                          col.sticky ? (isBest ? 'bg-green-50' : 'bg-white') : ''
                        } ${
                          col.key === 'name' ? 'text-gray-600 truncate max-w-[240px]' : cellColor(row[col.key], col)
                        } ${col.type === 'stars' ? 'text-yellow-500 tracking-tight' : ''} ${
                          isBest ? 'bg-green-50 font-semibold' : ''
                        }`}
                      >
                        {formatCell(row[col.key], col)}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-2 text-xs text-gray-400">
        {visibleData.length} of {data.length} ETFs shown
      </div>
    </div>
  )
}

export default EtfResearchTable
