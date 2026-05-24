import { useState, useMemo, useRef, useCallback } from 'react'

// --- Formatters ---
const fmtPct = (n) => {
  if (n == null || isNaN(n)) return '—'
  return n.toFixed(2) + '%'
}
const fmtNum = (n, decimals = 2) => {
  if (n == null || isNaN(n)) return '—'
  return Number(n).toFixed(decimals)
}

// --- Column definitions ---
const RESEARCH_COLS = [
  { key: 'total_return_1m',  label: 'Return',   sub: '1M',  fmt: n => fmtPct(n),  color: true  },
  { key: 'total_return_3m',  label: 'Return',   sub: '3M',  fmt: n => fmtPct(n),  color: true  },
  { key: 'total_return_6m',  label: 'Return',   sub: '6M',  fmt: n => fmtPct(n),  color: true  },
  { key: 'total_return_ytd', label: 'Return',   sub: 'YTD', fmt: n => fmtPct(n),  color: true  },
  { key: 'total_return_1y',  label: 'Return',   sub: '1Y',  fmt: n => fmtPct(n),  color: true  },
  { key: 'total_return_3y',  label: 'Return',   sub: '3Y',  fmt: n => fmtPct(n),  color: true  },
  { key: 'total_return_5y',  label: 'Return',   sub: '5Y',  fmt: n => fmtPct(n),  color: true  },
  { key: 'std_dev_3y',       label: 'Std Dev',  sub: '3Y',  fmt: n => fmtNum(n),  color: false },
  { key: 'sharpe_ratio_3y',  label: 'Sharpe',   sub: '3Y',  fmt: n => fmtNum(n),  color: false },
  { key: 'alpha_3y',         label: 'Alpha',    sub: '3Y',  fmt: n => fmtNum(n),  color: true  },
]

// Value-weighted average of research fields across a list of holdings
function weightedResearch(holdings, researchByTicker, proxyBySymbol) {
  const result = {}
  for (const col of RESEARCH_COLS) {
    const pairs = holdings
      .map(h => {
        const sym = h.symbol.replace(/\*+$/, '').toUpperCase()
        const r = researchByTicker[sym] ?? researchByTicker[proxyBySymbol[sym]]
        const v = r?.[col.key]
        return v != null ? { v, w: h.current_value } : null
      })
      .filter(Boolean)
    if (pairs.length === 0) {
      result[col.key] = null
    } else {
      const weightSum = pairs.reduce((s, p) => s + p.w, 0)
      result[col.key] = weightSum > 0
        ? pairs.reduce((s, p) => s + p.v * p.w, 0) / weightSum
        : null
    }
  }
  return result
}

// Build simplified pivot (no targets/diffs)
function buildPivot(positions, assetClassMap) {
  const mapBySymbol = {}
  for (const m of assetClassMap) mapBySymbol[m.symbol.toUpperCase()] = m

  const LIQUIDITY_SYMBOLS = new Set(['FDRXX', 'SPAXX', 'CORE', 'FDIC', 'PENDING ACTIVITY'])
  const groups = {}
  let grandTotal = 0

  for (const pos of positions) {
    const sym = (pos.symbol || '').trim()
    if (!sym) continue
    const val = pos.current_value || 0
    grandTotal += val

    const lookupSym = sym.replace(/\*+$/, '').toUpperCase()
    const mapping = mapBySymbol[lookupSym]
    const isLiquidityDefault = !mapping && LIQUIDITY_SYMBOLS.has(lookupSym)
    const assetClass = mapping ? mapping.asset_class : (isLiquidityDefault ? 'Liquidity' : 'Unmapped')
    const style = mapping ? mapping.style : (isLiquidityDefault ? 'Cash' : 'Unmapped')
    const description = mapping?.investment_name || pos.description || sym

    if (!groups[assetClass]) groups[assetClass] = {}
    if (!groups[assetClass][style]) groups[assetClass][style] = {}
    if (!groups[assetClass][style][sym]) {
      groups[assetClass][style][sym] = { symbol: sym, description, value: 0 }
    }
    groups[assetClass][style][sym].value += val
  }

  const sortedAC = Object.keys(groups).sort((a, b) => {
    if (a === 'Unmapped') return 1
    if (b === 'Unmapped') return -1
    return a.localeCompare(b)
  })

  const assetClasses = []
  for (const assetClass of sortedAC) {
    let acValue = 0
    const styleRows = []
    const acHoldings = []

    for (const [style, holdings] of Object.entries(groups[assetClass])) {
      let styleValue = 0
      const holdingRows = []

      const sorted = Object.entries(holdings).sort(([, a], [, b]) => b.value - a.value)
      for (const [symbol, data] of sorted) {
        styleValue += data.value
        holdingRows.push({ symbol, description: data.description, current_value: data.value })
      }

      acValue += styleValue
      styleRows.push({ style, current_value: styleValue, children: holdingRows })
      acHoldings.push(...holdingRows)
    }

    styleRows.sort((a, b) => {
      if (a.style === 'Unmapped') return 1
      if (b.style === 'Unmapped') return -1
      return b.current_value - a.current_value
    })

    assetClasses.push({ asset_class: assetClass, current_value: acValue, children: styleRows, allHoldings: acHoldings })
  }

  return { grandTotal, assetClasses }
}

// --- Component ---

const NAME_COL_KEY = 'analysisNameColWidth'
const NAME_COL_DEFAULT = 280

export default function PortfolioResearchView({ positions, assetClassMap, researchData, researchWatchlist }) {
  const [expandedAC, setExpandedAC] = useState({})
  const [expandedStyles, setExpandedStyles] = useState({})
  const [nameColWidth, setNameColWidth] = useState(() => {
    const saved = localStorage.getItem(NAME_COL_KEY)
    return saved ? Number(saved) : NAME_COL_DEFAULT
  })
  const dragState = useRef(null)

  const startNameResize = useCallback((e) => {
    e.preventDefault()
    dragState.current = { startX: e.clientX, startW: nameColWidth }
    const onMove = (ev) => {
      const newW = Math.max(120, dragState.current.startW + ev.clientX - dragState.current.startX)
      setNameColWidth(newW)
    }
    const onUp = (ev) => {
      const newW = Math.max(120, dragState.current.startW + ev.clientX - dragState.current.startX)
      localStorage.setItem(NAME_COL_KEY, newW)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [nameColWidth])

  const researchByTicker = useMemo(() => {
    const map = {}
    for (const r of researchData) {
      if (r.ticker) map[r.ticker.toUpperCase()] = r
    }
    return map
  }, [researchData])

  // symbol → proxy_ticker for symbols that have no direct research data
  const proxyBySymbol = useMemo(() => {
    const map = {}
    for (const m of assetClassMap) {
      if (m.proxy_ticker) map[m.symbol.toUpperCase()] = m.proxy_ticker.toUpperCase()
    }
    return map
  }, [assetClassMap])

  const pivot = useMemo(() => buildPivot(positions, assetClassMap), [positions, assetClassMap])

  const isACExpanded = (ac) => expandedAC[ac] !== undefined ? expandedAC[ac] : true
  const isStyleExpanded = (ac, style) => {
    const key = `${ac}|${style}`
    return expandedStyles[key] !== undefined ? expandedStyles[key] : true
  }
  const toggleAC = (ac) => setExpandedAC(prev => ({ ...prev, [ac]: !isACExpanded(ac) }))
  const toggleStyle = (ac, style) => {
    const key = `${ac}|${style}`
    setExpandedStyles(prev => ({ ...prev, [key]: !isStyleExpanded(ac, style) }))
  }

  const { grandTotal, assetClasses } = pivot

  // Build flat row list (same pattern as PortfolioPivotTable)
  const rows = useMemo(() => {
    const result = []
    for (const acRow of assetClasses) {
      const acExpanded = isACExpanded(acRow.asset_class)
      const acResearch = weightedResearch(acRow.allHoldings, researchByTicker, proxyBySymbol)
      if (acExpanded) {
        for (const sRow of acRow.children) {
          const styleExpanded = isStyleExpanded(acRow.asset_class, sRow.style)
          const styleResearch = weightedResearch(sRow.children, researchByTicker, proxyBySymbol)
          if (styleExpanded) {
            for (const hRow of sRow.children) {
              result.push({ type: 'holding', acRow, sRow, hRow })
            }
          }
          result.push({ type: 'style', acRow, sRow, styleExpanded, styleResearch })
        }
      }
      result.push({ type: 'asset_class', acRow, acExpanded, acResearch })
    }
    // Grand total research = weighted average across everything
    const allHoldings = assetClasses.flatMap(ac => ac.allHoldings)
    result.push({ type: 'grand_total', grandResearch: weightedResearch(allHoldings, researchByTicker, proxyBySymbol) })
    return result
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pivot, expandedAC, expandedStyles, researchByTicker, proxyBySymbol])

  function researchColor(col, val) {
    if (!col.color || val == null) return ''
    return val >= 0 ? 'text-gray-900' : 'text-red-600'
  }

  function renderResearchCells(research, bold = false) {
    return RESEARCH_COLS.map(col => {
      const val = research?.[col.key]
      return (
        <td key={col.key}
            className={`px-3 py-1 text-right whitespace-nowrap text-sm ${bold ? 'font-semibold' : ''} ${val != null ? researchColor(col, val) : 'text-gray-300'}`}>
          {val != null ? col.fmt(val) : '—'}
        </td>
      )
    })
  }

  if (positions.length === 0) {
    return <div className="text-center py-20 text-gray-400">No positions loaded.</div>
  }

  return (
    <div>
      {/* Status bar */}
      <div className="flex items-center gap-3 mb-4 text-sm text-gray-400">
        {researchData.length > 0
          ? <>Research data from watchlist: <span className="font-medium text-gray-600">{researchWatchlist?.name ?? '—'}</span> · {researchData.length} ETFs</>
          : <span className="text-amber-600">No research data available — import a Morningstar XLSX in the ETF Research tab to populate stats.</span>
        }
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="text-sm w-full" style={{ borderCollapse: 'collapse', tableLayout: 'auto' }}>
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-3 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap" style={{ minWidth: 140 }}>Asset Class</th>
              <th className="px-3 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap" style={{ minWidth: 120 }}>Style</th>
              <th className="px-3 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wide relative" style={{ width: nameColWidth, minWidth: 120 }}>
                Name
                <span
                  onMouseDown={startNameResize}
                  className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-blue-200 opacity-50"
                />
              </th>
              <th className="px-3 py-2.5 text-right font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap" style={{ minWidth: 90 }}>Current %</th>
              {RESEARCH_COLS.map(col => (
                <th key={col.key} className="px-3 py-2.5 text-right font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap" style={{ minWidth: 76 }}>
                  <div className="leading-tight">
                    <div>{col.label}</div>
                    <div className="text-xs font-normal text-gray-400">{col.sub}</div>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              // --- Holding row ---
              if (row.type === 'holding') {
                const { acRow, sRow, hRow } = row
                const lookupSym = hRow.symbol.replace(/\*+$/, '').toUpperCase()
                const proxyTicker = proxyBySymbol[lookupSym]
                const r = researchByTicker[lookupSym] ?? (proxyTicker ? researchByTicker[proxyTicker] : undefined)
                const isProxied = !researchByTicker[lookupSym] && !!r
                return (
                  <tr key={`h|${acRow.asset_class}|${sRow.style}|${hRow.symbol}`}
                      className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-1 text-gray-300">└</td>
                    <td className="px-3 py-1 text-gray-300">└</td>
                    <td className="px-3 py-1 overflow-hidden" style={{ width: nameColWidth, maxWidth: nameColWidth }}>
                      <span className="font-medium text-gray-900">{hRow.symbol}</span>
                      {isProxied && (
                        <span className="ml-1.5 text-xs text-blue-400 font-normal" title={`Returns proxied from ${proxyTicker}`}>~{proxyTicker}</span>
                      )}
                      {hRow.description && (
                        <span className="ml-2 text-gray-400 truncate" title={hRow.description}> {hRow.description}</span>
                      )}
                    </td>
                    <td className="px-3 py-1 text-right text-gray-500">
                      {fmtPct(grandTotal > 0 ? (hRow.current_value / grandTotal) * 100 : 0)}
                    </td>
                    {renderResearchCells(r)}
                  </tr>
                )
              }

              // --- Style total row ---
              if (row.type === 'style') {
                const { acRow, sRow, styleExpanded, styleResearch } = row
                return (
                  <tr key={`s|${acRow.asset_class}|${sRow.style}`}
                      className="border-b border-gray-200 bg-gray-50 cursor-pointer hover:bg-gray-100"
                      onClick={() => toggleStyle(acRow.asset_class, sRow.style)}>
                    <td className="px-3 py-1.5 text-gray-400">{styleExpanded ? '▼' : '▶'}</td>
                    <td className="px-3 py-1.5 font-semibold text-gray-800 whitespace-nowrap">{sRow.style} Total</td>
                    <td className="px-3 py-1.5"></td>
                    <td className="px-3 py-1.5 text-right font-semibold text-gray-700">
                      {fmtPct(grandTotal > 0 ? (sRow.current_value / grandTotal) * 100 : 0)}
                    </td>
                    {renderResearchCells(styleResearch, true)}
                  </tr>
                )
              }

              // --- Asset class total row ---
              if (row.type === 'asset_class') {
                const { acRow, acExpanded, acResearch } = row
                return (
                  <tr key={`ac|${acRow.asset_class}`}
                      className="border-b-2 border-gray-300 bg-amber-50 cursor-pointer hover:bg-amber-100"
                      onClick={() => toggleAC(acRow.asset_class)}>
                    <td className="px-3 py-2 font-bold text-gray-900 whitespace-nowrap" colSpan={2}>
                      <span className="mr-1 text-gray-500 text-sm">{acExpanded ? '▼' : '▶'}</span>
                      {acRow.asset_class} Total
                    </td>
                    <td className="px-3 py-2"></td>
                    <td className="px-3 py-2 text-right font-bold text-gray-800">
                      {fmtPct(grandTotal > 0 ? (acRow.current_value / grandTotal) * 100 : 0)}
                    </td>
                    {renderResearchCells(acResearch, true)}
                  </tr>
                )
              }

              // --- Grand total row ---
              return (
                <tr key="grand-total" className="bg-gray-100 border-t-2 border-gray-400">
                  <td className="px-3 py-2.5 font-bold text-gray-900" colSpan={3}>Grand Total</td>
                  <td className="px-3 py-2.5 text-right font-bold text-gray-800">100.00%</td>
                  {renderResearchCells(row.grandResearch, true)}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-sm text-gray-400 mt-2">
        Stats from Morningstar. Std Dev, Sharpe, Alpha are 3Y monthly. Aggregate rows show value-weighted averages.
      </p>
    </div>
  )
}
