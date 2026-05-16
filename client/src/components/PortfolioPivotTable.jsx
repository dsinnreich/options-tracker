import { useState, useMemo, useCallback } from 'react'

// --- Formatters ---
const fmt$ = (n) => {
  if (n == null || isNaN(n)) return '—'
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}
const fmtPct = (n) => {
  if (n == null || isNaN(n)) return '—'
  return n.toFixed(2) + '%'
}
const diffClass = (val) =>
  val < -0.5 ? 'text-red-600' : val > 0.5 ? 'text-green-700' : 'text-gray-600'

// --- Pivot calculation ---
function buildPivotData(positions, assetClassMap, targets, livePrices) {
  const mapBySymbol = {}
  for (const m of assetClassMap) {
    mapBySymbol[m.symbol.toUpperCase()] = m
  }

  const targetMap = {}
  for (const t of targets) {
    targetMap[`${t.asset_class}|${t.style}`] = t.target_percent
  }

  const groups = {}
  let grandTotal = 0
  let liveGrandTotal = 0
  const hasLive = livePrices && Object.keys(livePrices).length > 0

  // Symbols/labels that default to Liquidity/Cash if not in the asset class map
  const LIQUIDITY_SYMBOLS = new Set(['FDRXX', 'SPAXX', 'CORE', 'FDIC', 'PENDING ACTIVITY'])

  for (const pos of positions) {
    const sym = (pos.symbol || '').trim()
    if (!sym) continue

    const val = pos.current_value || 0
    grandTotal += val

    // Compute live value: if we have a live price for this symbol, use quantity * price * 1 (no multiplier for stocks)
    const lookupSym = sym.replace(/\*+$/, '').toUpperCase()
    let liveVal = val // default to imported value
    if (hasLive && livePrices[lookupSym] != null && pos.quantity != null) {
      liveVal = pos.quantity * livePrices[lookupSym]
    }
    liveGrandTotal += liveVal

    const mapping = mapBySymbol[lookupSym]
    const isLiquidityDefault = !mapping && LIQUIDITY_SYMBOLS.has(lookupSym)
    const assetClass = mapping ? mapping.asset_class : (isLiquidityDefault ? 'Liquidity' : 'Unmapped')
    const style = mapping ? mapping.style : (isLiquidityDefault ? 'Cash' : 'Unmapped')
    const isPending = lookupSym === 'PENDING ACTIVITY'
    const description = isPending ? 'Pending Activity' : (mapping?.investment_name || pos.description || sym)

    if (!groups[assetClass]) groups[assetClass] = {}
    if (!groups[assetClass][style]) groups[assetClass][style] = {}
    if (!groups[assetClass][style][sym]) {
      groups[assetClass][style][sym] = { description, value: 0, liveValue: 0 }
    }
    groups[assetClass][style][sym].value += val
    groups[assetClass][style][sym].liveValue += liveVal
  }

  const sortedAC = Object.keys(groups).sort((a, b) => {
    if (a === 'Unmapped') return 1
    if (b === 'Unmapped') return -1
    return a.localeCompare(b)
  })

  const assetClasses = []
  for (const assetClass of sortedAC) {
    const styles = groups[assetClass]
    let acValue = 0
    let acLiveValue = 0
    const styleRows = []

    for (const [style, holdings] of Object.entries(styles)) {
      let styleValue = 0
      let styleLiveValue = 0
      const holdingRows = []

      const sortedHoldings = Object.entries(holdings).sort(([, a], [, b]) => b.value - a.value)
      for (const [symbol, data] of sortedHoldings) {
        styleValue += data.value
        styleLiveValue += data.liveValue
        holdingRows.push({
          symbol,
          description: data.description,
          current_value: data.value,
          current_pct: grandTotal > 0 ? (data.value / grandTotal) * 100 : 0,
          live_value: data.liveValue
        })
      }

      acValue += styleValue
      acLiveValue += styleLiveValue
      const targetPct = targetMap[`${assetClass}|${style}`] || 0
      const targetDollar = (targetPct / 100) * grandTotal

      styleRows.push({
        style,
        current_value: styleValue,
        current_pct: grandTotal > 0 ? (styleValue / grandTotal) * 100 : 0,
        target_pct: targetPct,
        target_dollar: targetDollar,
        diff_dollar: styleValue - targetDollar,
        diff_pct: grandTotal > 0 ? ((styleValue - targetDollar) / grandTotal) * 100 : 0,
        live_value: styleLiveValue,
        children: holdingRows
      })
    }

    styleRows.sort((a, b) => {
      if (a.style === 'Unmapped') return 1
      if (b.style === 'Unmapped') return -1
      return b.current_value - a.current_value
    })

    const acTargetPct = styleRows.reduce((sum, s) => sum + s.target_pct, 0)
    const acTargetDollar = (acTargetPct / 100) * grandTotal

    assetClasses.push({
      asset_class: assetClass,
      current_value: acValue,
      current_pct: grandTotal > 0 ? (acValue / grandTotal) * 100 : 0,
      target_pct: acTargetPct,
      target_dollar: acTargetDollar,
      diff_dollar: acValue - acTargetDollar,
      diff_pct: grandTotal > 0 ? ((acValue - acTargetDollar) / grandTotal) * 100 : 0,
      live_value: acLiveValue,
      children: styleRows
    })
  }

  return { grandTotal, liveGrandTotal, hasLive, assetClasses }
}

// --- Column definitions ---
const COLS = [
  { key: 'asset_class',   label: 'Asset Class',   defaultWidth: 130, align: 'left'  },
  { key: 'style',         label: 'Style',          defaultWidth: 110, align: 'left'  },
  { key: 'name',          label: 'Name',           defaultWidth: 340, align: 'left'  },
  { key: 'current_value', label: 'Current Value',  defaultWidth: 120, align: 'right' },
  { key: 'current_pct',   label: 'Current %',      defaultWidth:  85, align: 'right' },
  { key: 'target_pct',    label: 'Target %',       defaultWidth:  85, align: 'right' },
  { key: 'target_dollar', label: 'Target $',       defaultWidth: 120, align: 'right' },
  { key: 'diff_dollar',   label: '$ Diff',         defaultWidth: 110, align: 'right' },
  { key: 'diff_pct',      label: '% Diff',         defaultWidth:  85, align: 'right' },
]

const MIN_COL_WIDTH = 50

// --- Component ---
export default function PortfolioPivotTable({ positions, assetClassMap, savedTargets, onSaveTargets, livePrices }) {
  const [whatIfMode, setWhatIfMode] = useState(false)
  const [editTargets, setEditTargets] = useState({})
  const [saving, setSaving] = useState(false)
  const [expandedAC, setExpandedAC] = useState({})
  const [expandedStyles, setExpandedStyles] = useState({})

  // Column widths — persisted to localStorage, initialised from defaults
  const [colWidths, setColWidths] = useState(() => {
    try {
      const saved = localStorage.getItem('portfolioColWidths')
      if (saved) return { ...Object.fromEntries(COLS.map(c => [c.key, c.defaultWidth])), ...JSON.parse(saved) }
    } catch {}
    return Object.fromEntries(COLS.map(c => [c.key, c.defaultWidth]))
  })

  // Drag-to-resize handler
  const startResize = useCallback((colKey, e) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = colWidths[colKey]

    const onMouseMove = (e) => {
      const newWidth = Math.max(MIN_COL_WIDTH, startWidth + e.clientX - startX)
      setColWidths(prev => {
        const next = { ...prev, [colKey]: newWidth }
        try { localStorage.setItem('portfolioColWidths', JSON.stringify(next)) } catch {}
        return next
      })
    }
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [colWidths])

  const w = (key) => ({ width: colWidths[key], minWidth: MIN_COL_WIDTH })

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

  const effectiveTargets = useMemo(() => {
    if (!whatIfMode) return savedTargets
    return Object.entries(editTargets).map(([key, val]) => {
      const idx = key.indexOf('|')
      return {
        asset_class: key.slice(0, idx),
        style: key.slice(idx + 1),
        target_percent: parseFloat(val) || 0
      }
    })
  }, [whatIfMode, editTargets, savedTargets])

  const pivotData = useMemo(
    () => buildPivotData(positions, assetClassMap, effectiveTargets, livePrices),
    [positions, assetClassMap, effectiveTargets, livePrices]
  )

  const totalTargetPct = Object.values(editTargets).reduce((sum, v) => sum + (parseFloat(v) || 0), 0)
  const targetValid = Math.abs(totalTargetPct - 100) < 0.01

  const enterWhatIf = () => {
    const targets = {}
    for (const acRow of pivotData.assetClasses) {
      for (const sRow of acRow.children) {
        targets[`${acRow.asset_class}|${sRow.style}`] = sRow.target_pct.toString()
      }
    }
    setEditTargets(targets)
    setWhatIfMode(true)
  }

  const cancelWhatIf = () => { setWhatIfMode(false); setEditTargets({}) }

  const handleSave = async () => {
    setSaving(true)
    try {
      const targetsArray = Object.entries(editTargets).map(([key, val]) => {
        const idx = key.indexOf('|')
        return { asset_class: key.slice(0, idx), style: key.slice(idx + 1), target_percent: parseFloat(val) || 0 }
      })
      await onSaveTargets(targetsArray)
      setWhatIfMode(false)
      setEditTargets({})
    } catch (err) {
      alert('Failed to save: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  // Flat row list for rendering
  const rows = useMemo(() => {
    const result = []
    for (const acRow of pivotData.assetClasses) {
      const acExpanded = isACExpanded(acRow.asset_class)
      if (acExpanded) {
        for (const sRow of acRow.children) {
          const styleExpanded = isStyleExpanded(acRow.asset_class, sRow.style)
          if (styleExpanded) {
            for (const hRow of sRow.children) result.push({ type: 'holding', acRow, sRow, hRow })
          }
          result.push({ type: 'style', acRow, sRow, styleExpanded })
        }
      }
      result.push({ type: 'asset_class', acRow, acExpanded })
    }
    result.push({ type: 'grand_total' })
    return result
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pivotData, expandedAC, expandedStyles])

  // Shared header cell style: relative positioning so resize handle can sit at right edge
  const thStyle = (key) => ({ ...w(key), position: 'relative', userSelect: 'none' })

  // Resize handle element
  const ResizeHandle = ({ colKey }) => (
    <div
      onMouseDown={(e) => startResize(colKey, e)}
      style={{
        position: 'absolute', top: 0, right: 0, bottom: 0, width: 8,
        cursor: 'col-resize', zIndex: 1,
      }}
      className="group"
    >
      <div className="absolute inset-y-0 right-0.5 w-0.5 bg-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  )

  const px = 'px-2'  // compact horizontal padding

  return (
    <div>
      {/* Header bar */}
      <div className="flex justify-between items-center mb-3">
        <div className="text-sm text-gray-500">
          Total Portfolio Value:{' '}
          <span className="font-semibold text-gray-800">{fmt$(pivotData.grandTotal)}</span>
          {pivotData.hasLive && (
            <>
              <span className="mx-2 text-gray-300">|</span>
              <span className="text-green-700">Live: <span className="font-semibold">{fmt$(pivotData.liveGrandTotal)}</span></span>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          {whatIfMode ? (
            <>
              <span className={`text-sm font-medium ${targetValid ? 'text-green-700' : 'text-red-600'}`}>
                Total Target: {fmtPct(totalTargetPct)}
                {!targetValid && ' ← must equal 100%'}
              </span>
              <button onClick={handleSave} disabled={saving || !targetValid}
                className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50">
                {saving ? 'Saving...' : 'Save Targets'}
              </button>
              <button onClick={cancelWhatIf}
                className="px-3 py-1 bg-gray-100 text-gray-700 text-sm rounded hover:bg-gray-200">
                Cancel
              </button>
            </>
          ) : (
            <button onClick={enterWhatIf}
              className="px-3 py-1 bg-blue-50 text-blue-700 text-sm rounded hover:bg-blue-100 border border-blue-200">
              Edit Targets (What-If)
            </button>
          )}
        </div>
      </div>

      {/* Table — table-fixed so column widths are respected */}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table style={{ tableLayout: 'fixed', borderCollapse: 'collapse' }} className="text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {COLS.map(col => (
                <th key={col.key}
                    style={thStyle(col.key)}
                    className={`${px} py-1.5 font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap overflow-hidden ${col.align === 'right' ? 'text-right' : 'text-left'}`}>
                  {col.label}
                  <ResizeHandle colKey={col.key} />
                </th>
              ))}
              {pivotData.hasLive && (
                <th style={{ width: 120 }} className={`${px} py-1.5 font-semibold text-green-600 uppercase tracking-wide whitespace-nowrap text-right`}>
                  Live Value
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              // --- Holding row ---
              if (row.type === 'holding') {
                const { acRow, sRow, hRow } = row
                return (
                  <tr key={`h|${acRow.asset_class}|${sRow.style}|${hRow.symbol}`}
                      className="border-b border-gray-100 hover:bg-gray-50">
                    <td style={w('asset_class')} className={`${px} py-0.5 text-gray-300`}>└</td>
                    <td style={w('style')} className={`${px} py-0.5 text-gray-300`}>└</td>
                    <td style={{ ...w('name'), maxWidth: 0 }} className={`${px} py-0.5 overflow-hidden`}>
                      <span className="font-medium text-gray-900 whitespace-nowrap">{hRow.symbol}</span>
                      {hRow.description && (
                        <span className="ml-1.5 text-gray-400 whitespace-nowrap" title={hRow.description}>{hRow.description}</span>
                      )}
                    </td>
                    <td style={w('current_value')} className={`${px} py-0.5 text-right text-gray-700`}>{fmt$(hRow.current_value)}</td>
                    <td style={w('current_pct')}   className={`${px} py-0.5 text-right text-gray-500`}>{fmtPct(hRow.current_pct)}</td>
                    <td style={w('target_pct')}    className={`${px} py-0.5`}></td>
                    <td style={w('target_dollar')} className={`${px} py-0.5`}></td>
                    <td style={w('diff_dollar')}   className={`${px} py-0.5`}></td>
                    <td style={w('diff_pct')}      className={`${px} py-0.5`}></td>
                    {pivotData.hasLive && (
                      <td className={`${px} py-0.5 text-right text-green-700`}>{fmt$(hRow.live_value)}</td>
                    )}
                  </tr>
                )
              }

              // --- Style total row ---
              if (row.type === 'style') {
                const { acRow, sRow, styleExpanded } = row
                const key = `${acRow.asset_class}|${sRow.style}`
                return (
                  <tr key={`s|${key}`}
                      className="border-b border-gray-200 bg-gray-50 cursor-pointer hover:bg-gray-100"
                      onClick={() => toggleStyle(acRow.asset_class, sRow.style)}>
                    <td style={w('asset_class')} className={`${px} py-1 text-gray-400 text-xs`}>
                      {styleExpanded ? '▼' : '▶'}
                    </td>
                    <td style={w('style')} className={`${px} py-1 font-semibold text-gray-800 whitespace-nowrap overflow-hidden`}>
                      {sRow.style} Total
                    </td>
                    <td style={w('name')} className={`${px} py-1`}></td>
                    <td style={w('current_value')} className={`${px} py-1 text-right font-semibold text-gray-800`}>{fmt$(sRow.current_value)}</td>
                    <td style={w('current_pct')}   className={`${px} py-1 text-right font-semibold text-gray-700`}>{fmtPct(sRow.current_pct)}</td>
                    <td style={w('target_pct')}    className={`${px} py-1 text-right font-semibold text-gray-700`}
                        onClick={e => e.stopPropagation()}>
                      {whatIfMode ? (
                        <input type="number" step="1" min="0" max="100"
                          value={editTargets[key] ?? ''}
                          onChange={e => setEditTargets(prev => ({ ...prev, [key]: e.target.value }))}
                          className="w-14 text-right border rounded px-1 py-0 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                      ) : fmtPct(sRow.target_pct)}
                    </td>
                    <td style={w('target_dollar')} className={`${px} py-1 text-right font-semibold text-gray-700`}>{fmt$(sRow.target_dollar)}</td>
                    <td style={w('diff_dollar')}   className={`${px} py-1 text-right font-semibold ${diffClass(sRow.diff_dollar)}`}>{fmt$(sRow.diff_dollar)}</td>
                    <td style={w('diff_pct')}      className={`${px} py-1 text-right font-semibold ${diffClass(sRow.diff_pct)}`}>{fmtPct(sRow.diff_pct)}</td>
                    {pivotData.hasLive && (
                      <td className={`${px} py-1 text-right font-semibold text-green-700`}>{fmt$(sRow.live_value)}</td>
                    )}
                  </tr>
                )
              }

              // --- Asset class total row ---
              if (row.type === 'asset_class') {
                const { acRow, acExpanded } = row
                return (
                  <tr key={`ac|${acRow.asset_class}`}
                      className="border-b-2 border-gray-300 bg-amber-50 cursor-pointer hover:bg-amber-100"
                      onClick={() => toggleAC(acRow.asset_class)}>
                    <td style={w('asset_class')} className={`${px} py-1.5 font-bold text-gray-900 whitespace-nowrap overflow-hidden`} colSpan={2}>
                      <span className="mr-1 text-gray-500 text-xs">{acExpanded ? '▼' : '▶'}</span>
                      {acRow.asset_class} Total
                    </td>
                    <td style={w('name')} className={`${px} py-1.5`}></td>
                    <td style={w('current_value')} className={`${px} py-1.5 text-right font-bold text-gray-900`}>{fmt$(acRow.current_value)}</td>
                    <td style={w('current_pct')}   className={`${px} py-1.5 text-right font-bold text-gray-800`}>{fmtPct(acRow.current_pct)}</td>
                    <td style={w('target_pct')}    className={`${px} py-1.5 text-right font-bold text-gray-800`}>{fmtPct(acRow.target_pct)}</td>
                    <td style={w('target_dollar')} className={`${px} py-1.5 text-right font-bold text-gray-800`}>{fmt$(acRow.target_dollar)}</td>
                    <td style={w('diff_dollar')}   className={`${px} py-1.5 text-right font-bold ${diffClass(acRow.diff_dollar)}`}>{fmt$(acRow.diff_dollar)}</td>
                    <td style={w('diff_pct')}      className={`${px} py-1.5 text-right font-bold ${diffClass(acRow.diff_pct)}`}>{fmtPct(acRow.diff_pct)}</td>
                    {pivotData.hasLive && (
                      <td className={`${px} py-1.5 text-right font-bold text-green-700`}>{fmt$(acRow.live_value)}</td>
                    )}
                  </tr>
                )
              }

              // --- Grand total row ---
              return (
                <tr key="grand-total" className="bg-gray-100 border-t-2 border-gray-400">
                  <td style={w('asset_class')} className={`${px} py-2 font-bold text-gray-900`} colSpan={3}>Grand Total</td>
                  <td style={w('current_value')} className={`${px} py-2 text-right font-bold text-gray-900`}>{fmt$(pivotData.grandTotal)}</td>
                  <td style={w('current_pct')}   className={`${px} py-2 text-right font-bold text-gray-800`}>100.00%</td>
                  <td style={w('target_pct')}    className={`${px} py-2 text-right font-bold text-gray-800`}>
                    {whatIfMode ? fmtPct(totalTargetPct) : '100.00%'}
                  </td>
                  <td style={w('target_dollar')} className={`${px} py-2 text-right font-bold text-gray-800`}>{fmt$(pivotData.grandTotal)}</td>
                  <td style={w('diff_dollar')}   className={`${px} py-2 text-right font-bold text-gray-500`}>—</td>
                  <td style={w('diff_pct')}      className={`${px} py-2 text-right font-bold text-gray-500`}>—</td>
                  {pivotData.hasLive && (
                    <td className={`${px} py-2 text-right font-bold text-green-700`}>{fmt$(pivotData.liveGrandTotal)}</td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {whatIfMode && (
        <p className="text-xs text-gray-400 mt-2">
          Edit Target % on Style Total rows — values must sum to 100% before saving.
        </p>
      )}
    </div>
  )
}
