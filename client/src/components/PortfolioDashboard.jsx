import { useState, useEffect, useCallback, useRef } from 'react'
import { usePortfolio } from '../hooks/usePortfolio'
import { useResearch } from '../hooks/useResearch'
import PortfolioPivotTable from './PortfolioPivotTable'
import PortfolioByAccount from './PortfolioByAccount'
import AssetClassMapEditor from './AssetClassMapEditor'
import PortfolioResearchView from './PortfolioResearchView'

const DEFAULT_SUB_TABS = [
  { id: 'overview', label: 'By Asset Class' },
  { id: 'by-account', label: 'By Account' },
  { id: 'analysis', label: 'Analysis' },
]

export default function PortfolioDashboard() {
  const {
    portfolios, loading: portfoliosLoading,
    createPortfolio, renamePortfolio, deletePortfolio,
    getImports, importCSV, deleteImport,
    getPositions,
    getAssetClassMap, addAssetClassMapping, updateAssetClassMapping, deleteAssetClassMapping,
    exportAssetClassMap, importAssetClassMap,
    getTargets, saveTargets,
    getNotes, saveNotes,
    importHistory, getHistoryAccounts, getLastTransactions
  } = usePortfolio()

  const {
    data: researchData,
    watchlists: researchWatchlists,
    activeWatchlist: researchWatchlist,
    selectWatchlist: selectResearchWatchlist
  } = useResearch()

  // Persist selected research watchlist per portfolio
  const handleSelectResearchWatchlist = useCallback((wl) => {
    selectResearchWatchlist(wl)
    if (activePortfolioId) {
      const saved = JSON.parse(localStorage.getItem('portfolioAnalysisWatchlist') || '{}')
      saved[activePortfolioId] = wl.id
      localStorage.setItem('portfolioAnalysisWatchlist', JSON.stringify(saved))
    }
  }, [selectResearchWatchlist, activePortfolioId])

  const [activePortfolioId, setActivePortfolioId] = useState(null)
  const [activeTab, setActiveTab] = useState('overview')
  const [imports, setImports] = useState([])
  const [selectedImportId, setSelectedImportId] = useState(null)
  const [positions, setPositions] = useState([])
  const [assetClassMap, setAssetClassMap] = useState([])
  const [targets, setTargets] = useState([])
  const [dataLoading, setDataLoading] = useState(false)

  // Portfolio creation
  const [showNewForm, setShowNewForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  // Portfolio rename
  const [renamingId, setRenamingId] = useState(null)
  const [renameValue, setRenameValue] = useState('')

  // Notes
  const [noteText, setNoteText] = useState('')
  const [noteHeight, setNoteHeight] = useState('6rem')
  const noteRef = useRef(null)

  // Transaction history
  const [lastTransactions, setLastTransactions] = useState({})
  const [historyAccounts, setHistoryAccounts] = useState([])
  const [historyFile, setHistoryFile] = useState(null)
  const [importingHistory, setImportingHistory] = useState(false)
  const [historyResult, setHistoryResult] = useState(null)
  const [historyError, setHistoryError] = useState(null)

  // Holdings import
  const [importMode, setImportMode] = useState('file') // 'file' | 'paste'
  const [importFile, setImportFile] = useState(null)
  const [pasteContent, setPasteContent] = useState('')
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [importError, setImportError] = useState(null)
  const [importFormat, setImportFormat] = useState(null) // null | 'fidelity' | '529'
  const [accountName529, setAccountName529] = useState('')

  // Live prices
  const [livePrices, setLivePrices] = useState(null) // { symbol: price } or null when hidden
  const [livePricesLoading, setLivePricesLoading] = useState(false)
  const [livePricesError, setLivePricesError] = useState(null)

  // Tab ordering — persisted to localStorage
  const [portfolioOrder, setPortfolioOrder] = useState(() => {
    try { return JSON.parse(localStorage.getItem('portfolioTabOrder')) } catch { return null }
  })
  const [subTabOrder, setSubTabOrder] = useState(() => {
    try { return JSON.parse(localStorage.getItem('portfolioSubTabOrder')) || DEFAULT_SUB_TABS.map(t => t.id) } catch { return DEFAULT_SUB_TABS.map(t => t.id) }
  })
  const [dragPortfolioOver, setDragPortfolioOver] = useState(null)
  const [dragSubTabOver, setDragSubTabOver] = useState(null)
  const dragPortfolioIdx = useRef(null)
  const dragSubTabIdx = useRef(null)


  // Select first portfolio (in custom order) on initial load
  useEffect(() => {
    if (portfolios.length > 0 && !activePortfolioId) {
      const ordered = portfolioOrder
        ? [
            ...portfolioOrder.map(id => portfolios.find(p => p.id === id)).filter(Boolean),
            ...portfolios.filter(p => !portfolioOrder.includes(p.id))
          ]
        : portfolios
      setActivePortfolioId(ordered[0].id)
    }
  }, [portfolios, activePortfolioId, portfolioOrder])

  // Restore saved research watchlist when portfolio changes or watchlists load
  useEffect(() => {
    if (!activePortfolioId || researchWatchlists.length === 0) return
    const saved = JSON.parse(localStorage.getItem('portfolioAnalysisWatchlist') || '{}')
    const savedId = saved[activePortfolioId]
    const match = savedId && researchWatchlists.find(w => w.id === savedId)
    if (match) selectResearchWatchlist(match)
  }, [activePortfolioId, researchWatchlists, selectResearchWatchlist])

  // Load all data for active portfolio
  const loadPortfolioData = useCallback(async (portfolioId) => {
    if (!portfolioId) return
    setDataLoading(true)
    try {
      const [imps, map] = await Promise.all([
        getImports(portfolioId),
        getAssetClassMap()
      ])
      setImports(imps)
      setAssetClassMap(map)

      const latestId = imps.length > 0 ? imps[0].id : null
      setSelectedImportId(latestId)

      const [pos, tgts] = await Promise.all([
        latestId ? getPositions(portfolioId, latestId) : Promise.resolve([]),
        getTargets(portfolioId)
      ])
      setPositions(pos)
      setTargets(tgts)
    } catch (err) {
      console.error('Failed to load portfolio data:', err)
    } finally {
      setDataLoading(false)
    }
  }, [getImports, getAssetClassMap, getPositions, getTargets])

  useEffect(() => {
    if (activePortfolioId) {
      loadPortfolioData(activePortfolioId)
    }
  }, [activePortfolioId, loadPortfolioData])

  // Load notes from server when portfolio changes; height stays in localStorage (UI pref only)
  useEffect(() => {
    if (!activePortfolioId) return
    getNotes(activePortfolioId).then(data => setNoteText(data.notes || '')).catch(() => {})
    setNoteHeight(localStorage.getItem(`portfolioNotesHeight_${activePortfolioId}`) || '6rem')
  }, [activePortfolioId, getNotes])

  // Load last transactions and history accounts when portfolio changes
  const loadHistoryData = useCallback(async (portfolioId) => {
    if (!portfolioId) return
    try {
      const [txns, accts] = await Promise.all([
        getLastTransactions(portfolioId),
        getHistoryAccounts(portfolioId)
      ])
      setLastTransactions(txns)
      setHistoryAccounts(accts)
    } catch (err) {
      console.error('Failed to load history data:', err)
    }
  }, [getLastTransactions, getHistoryAccounts])

  useEffect(() => {
    if (activePortfolioId) loadHistoryData(activePortfolioId)
  }, [activePortfolioId, loadHistoryData])

  const noteDebounceRef = useRef(null)

  const handleNoteChange = (e) => {
    const value = e.target.value
    setNoteText(value)
    clearTimeout(noteDebounceRef.current)
    noteDebounceRef.current = setTimeout(() => {
      saveNotes(activePortfolioId, value).catch(() => {})
    }, 600)
  }

  const handleNoteResize = () => {
    if (noteRef.current) {
      const h = noteRef.current.style.height
      if (h) localStorage.setItem(`portfolioNotesHeight_${activePortfolioId}`, h)
    }
  }

  // Switch to a different import date
  const handleImportChange = async (importId) => {
    setSelectedImportId(importId)
    if (importId && activePortfolioId) {
      const pos = await getPositions(activePortfolioId, importId)
      setPositions(pos)
    }
  }

  // --- Portfolio management ---
  const handleCreatePortfolio = async (e) => {
    e.preventDefault()
    if (!newName.trim()) return
    setCreating(true)
    try {
      const p = await createPortfolio(newName.trim())
      setActivePortfolioId(p.id)
      setActiveTab('overview')
      setShowNewForm(false)
      setNewName('')
    } catch (err) {
      alert(err.message)
    } finally {
      setCreating(false)
    }
  }

  const handleRename = async (e) => {
    e.preventDefault()
    if (!renameValue.trim()) return
    try {
      await renamePortfolio(renamingId, renameValue.trim())
      setRenamingId(null)
    } catch (err) {
      alert(err.message)
    }
  }

  const handleDelete = async (portfolio) => {
    if (!confirm(`Delete portfolio "${portfolio.name}" and all its data? This cannot be undone.`)) return
    try {
      await deletePortfolio(portfolio.id)
      if (activePortfolioId === portfolio.id) {
        setActivePortfolioId(null)
        setPositions([])
        setImports([])
        setTargets([])
      }
    } catch (err) {
      alert(err.message)
    }
  }

  const switchPortfolio = (id) => {
    setActivePortfolioId(id)
    setActiveTab('overview')
    setImportResult(null)
    setImportError(null)
    setImportFile(null)
    setHistoryResult(null)
    setHistoryError(null)
    setHistoryFile(null)
  }

  // --- Holdings Import ---
  const detect529Format = (content) => {
    const firstLine = content.split(/\r?\n/)[0] || ''
    const cols = firstLine.split('\t').map(c => c.trim())
    return cols.includes('Symbol') && cols.includes('Units')
  }

  const handleImportFileChange = async (e) => {
    const file = e.target.files[0] || null
    setImportFile(file)
    setImportResult(null)
    setImportError(null)
    setImportFormat(null)
    setAccountName529('')
    if (file) {
      const text = await file.text()
      setImportFormat(detect529Format(text) ? '529' : 'fidelity')
    }
  }

  const handlePasteChange = (text) => {
    setPasteContent(text)
    setImportResult(null)
    setImportError(null)
    setImportFormat(text.trim() ? (detect529Format(text) ? '529' : 'fidelity') : null)
    setAccountName529('')
  }

  const handleImport = async () => {
    if (!activePortfolioId) return
    const content = importMode === 'paste' ? pasteContent : await importFile?.text()
    if (!content?.trim()) return
    const filename = importMode === 'paste' ? 'pasted-holdings.txt' : importFile.name

    setImporting(true)
    setImportResult(null)
    setImportError(null)
    try {
      const result = await importCSV(
        activePortfolioId,
        filename,
        content,
        importFormat === '529' ? accountName529 : undefined
      )
      setImportResult(result)
      setImportFile(null)
      setPasteContent('')
      setImportFormat(null)
      setAccountName529('')
      const el = document.getElementById('csv-upload')
      if (el) el.value = ''
      await loadPortfolioData(activePortfolioId)
    } catch (err) {
      setImportError(err.message)
    } finally {
      setImporting(false)
    }
  }

  // --- History Import ---
  const handleImportHistory = async () => {
    if (!historyFile || !activePortfolioId) return
    setImportingHistory(true)
    setHistoryResult(null)
    setHistoryError(null)
    try {
      const result = await importHistory(activePortfolioId, historyFile)
      setHistoryResult(result)
      setHistoryFile(null)
      const el = document.getElementById('history-upload')
      if (el) el.value = ''
      await loadHistoryData(activePortfolioId)
    } catch (err) {
      setHistoryError(err.message)
    } finally {
      setImportingHistory(false)
    }
  }

  const handleDeleteImport = async (imp) => {
    if (!confirm(`Delete import from ${imp.import_date}? This cannot be undone.`)) return
    try {
      await deleteImport(activePortfolioId, imp.id)
      await loadPortfolioData(activePortfolioId)
    } catch (err) {
      alert(err.message)
    }
  }


  // --- Targets ---
  const handleSaveTargets = async (newTargets) => {
    await saveTargets(activePortfolioId, newTargets)
    const fresh = await getTargets(activePortfolioId)
    setTargets(fresh)
  }

  // --- Live prices ---
  const NON_PRICEABLE = new Set(['FDRXX', 'SPAXX', 'CORE', 'FDIC', 'PENDING ACTIVITY'])

  const fetchLivePrices = async () => {
    if (positions.length === 0) return
    setLivePricesLoading(true)
    setLivePricesError(null)
    const prices = {}
    const symbols = [...new Set(
      positions
        .map(p => (p.symbol || '').replace(/\*+$/, '').toUpperCase())
        .filter(s => s && !NON_PRICEABLE.has(s))
    )]

    let failed = 0
    for (const sym of symbols) {
      try {
        const res = await fetch(`/api/prices/stock/${sym}`, { credentials: 'include' })
        if (res.ok) {
          const data = await res.json()
          if (data.price != null) prices[sym] = data.price
        } else {
          failed++
        }
      } catch {
        failed++
      }
    }

    // For non-priceable symbols, compute value from imported data (quantity * last_price or current_value)
    for (const pos of positions) {
      const sym = (pos.symbol || '').replace(/\*+$/, '').toUpperCase()
      if (NON_PRICEABLE.has(sym) && !prices[sym] && pos.last_price != null) {
        prices[sym] = pos.last_price
      }
    }

    setLivePrices(prices)
    setLivePricesLoading(false)
    if (failed > 0) {
      setLivePricesError(`Could not fetch prices for ${failed} symbol${failed !== 1 ? 's' : ''}`)
    }
  }

  const hideLivePrices = () => {
    setLivePrices(null)
    setLivePricesError(null)
  }

  // Clear live prices when switching portfolios or imports
  useEffect(() => {
    setLivePrices(null)
    setLivePricesError(null)
  }, [activePortfolioId, selectedImportId])

  // --- Asset class map ---
  const refreshMap = async () => {
    const map = await getAssetClassMap()
    setAssetClassMap(map)
  }

  const handleMapAdd = async (mapping) => {
    await addAssetClassMapping(mapping)
    await refreshMap()
  }

  const handleMapUpdate = async (id, mapping) => {
    await updateAssetClassMapping(id, mapping)
    await refreshMap()
  }

  const handleMapDelete = async (id) => {
    await deleteAssetClassMapping(id)
    await refreshMap()
  }

  // Symbols that auto-default to Liquidity/Cash — don't show in unmapped alert
  const AUTO_LIQUIDITY = new Set(['FDRXX', 'SPAXX', 'CORE', 'FDIC', 'PENDING ACTIVITY'])

  // Unmapped symbols from current positions (excluding auto-liquidity defaults)
  const mappedSymbols = new Set(assetClassMap.map(m => m.symbol.toUpperCase()))
  const unmappedSymbols = [...new Set(
    positions
      .map(p => (p.symbol || '').trim())
      .filter(s => s)
      .map(s => s.replace(/\*+$/, ''))
      .filter(s => !mappedSymbols.has(s.toUpperCase()) && !AUTO_LIQUIDITY.has(s.toUpperCase()))
  )]

  const activePortfolio = portfolios.find(p => p.id === activePortfolioId)

  const orderedPortfolios = portfolioOrder
    ? [
        ...portfolioOrder.map(id => portfolios.find(p => p.id === id)).filter(Boolean),
        ...portfolios.filter(p => !portfolioOrder.includes(p.id))
      ]
    : portfolios

  const orderedSubTabs = [
    ...subTabOrder.map(id => DEFAULT_SUB_TABS.find(t => t.id === id)).filter(Boolean),
    ...DEFAULT_SUB_TABS.filter(t => !subTabOrder.includes(t.id))
  ]

  if (portfoliosLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading portfolios...</div>
      </div>
    )
  }

  return (
    <div>
      {/* Portfolio tab bar */}
      <div className="flex items-center gap-0.5 border-b border-gray-200 mb-6 overflow-x-auto">
        {orderedPortfolios.map((p, i) => (
          <div
            key={p.id}
            className={`flex-shrink-0 rounded-t transition-colors ${dragPortfolioOver === i ? 'bg-blue-50' : ''}`}
            draggable={renamingId !== p.id}
            onDragStart={() => { dragPortfolioIdx.current = i }}
            onDragOver={(e) => { e.preventDefault(); setDragPortfolioOver(i) }}
            onDragLeave={() => setDragPortfolioOver(null)}
            onDrop={() => {
              const from = dragPortfolioIdx.current
              setDragPortfolioOver(null)
              if (from === null || from === i) return
              const ids = orderedPortfolios.map(q => q.id)
              const [moved] = ids.splice(from, 1)
              ids.splice(i, 0, moved)
              setPortfolioOrder(ids)
              localStorage.setItem('portfolioTabOrder', JSON.stringify(ids))
              dragPortfolioIdx.current = null
            }}
            onDragEnd={() => { dragPortfolioIdx.current = null; setDragPortfolioOver(null) }}
          >
            {renamingId === p.id ? (
              <form onSubmit={handleRename} className="flex items-center gap-1 px-2 py-1">
                <input
                  autoFocus
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  className="border rounded px-2 py-1 text-sm w-32 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                <button type="submit" className="text-green-600 hover:text-green-800 text-sm">✓</button>
                <button type="button" onClick={() => setRenamingId(null)} className="text-gray-400 hover:text-gray-600 text-sm">✕</button>
              </form>
            ) : (
              <button
                onClick={() => switchPortfolio(p.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-grab active:cursor-grabbing ${
                  activePortfolioId === p.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                }`}
              >
                {p.name}
                {activePortfolioId === p.id && (
                  <span className="flex items-center gap-1">
                    <span
                      title="Rename"
                      className="text-gray-300 hover:text-gray-500 cursor-pointer"
                      onClick={e => {
                        e.stopPropagation()
                        setRenamingId(p.id)
                        setRenameValue(p.name)
                      }}
                    >✏️</span>
                    <span
                      title="Delete portfolio"
                      className="text-gray-300 hover:text-red-400 cursor-pointer"
                      onClick={e => { e.stopPropagation(); handleDelete(p) }}
                    >🗑️</span>
                  </span>
                )}
              </button>
            )}
          </div>
        ))}

        {showNewForm ? (
          <form onSubmit={handleCreatePortfolio} className="flex items-center gap-1 px-2 py-1 flex-shrink-0">
            <input
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Portfolio name"
              className="border rounded px-2 py-1 text-sm w-36 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
            <button type="submit" disabled={creating} className="text-green-600 hover:text-green-800 text-sm disabled:opacity-50">✓</button>
            <button type="button" onClick={() => { setShowNewForm(false); setNewName('') }} className="text-gray-400 hover:text-gray-600 text-sm">✕</button>
          </form>
        ) : (
          <button
            onClick={() => setShowNewForm(true)}
            className="flex-shrink-0 px-3 py-2.5 text-sm text-gray-400 hover:text-gray-600 border-b-2 border-transparent"
          >
            + New Portfolio
          </button>
        )}
      </div>

      {/* Empty state */}
      {portfolios.length === 0 && !showNewForm && (
        <div className="text-center py-24">
          <div className="text-5xl mb-4">📊</div>
          <h3 className="text-lg font-medium text-gray-700 mb-2">No portfolios yet</h3>
          <p className="text-gray-400 mb-6">Create your first portfolio to get started.</p>
          <button
            onClick={() => setShowNewForm(true)}
            className="px-5 py-2.5 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            + New Portfolio
          </button>
        </div>
      )}

      {/* Main content for active portfolio */}
      {activePortfolio && (
        <>
          {/* Sub-navigation */}
          <div className="flex items-center justify-between mb-6 border-b border-gray-100 pb-0">
            {/* View tabs — draggable, left side */}
            <div className="flex items-center gap-6">
              {orderedSubTabs.map((tab, i) => (
                <button
                  key={tab.id}
                  draggable={true}
                  onDragStart={() => { dragSubTabIdx.current = i }}
                  onDragOver={(e) => { e.preventDefault(); setDragSubTabOver(i) }}
                  onDragLeave={() => setDragSubTabOver(null)}
                  onDrop={() => {
                    const from = dragSubTabIdx.current
                    setDragSubTabOver(null)
                    if (from === null || from === i) return
                    const ids = orderedSubTabs.map(t => t.id)
                    const [moved] = ids.splice(from, 1)
                    ids.splice(i, 0, moved)
                    setSubTabOrder(ids)
                    localStorage.setItem('portfolioSubTabOrder', JSON.stringify(ids))
                    dragSubTabIdx.current = null
                  }}
                  onDragEnd={() => { dragSubTabIdx.current = null; setDragSubTabOver(null) }}
                  onClick={() => setActiveTab(tab.id)}
                  className={`text-sm font-medium pb-3 border-b-2 -mb-px transition-colors cursor-grab active:cursor-grabbing ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : dragSubTabOver === i
                        ? 'border-blue-300 text-gray-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Action buttons — right side */}
            <div className="flex items-center gap-2 pb-3">
              <button
                onClick={() => setActiveTab('map')}
                className={`flex items-center gap-1.5 px-3 py-1 text-sm rounded border transition-colors ${
                  activeTab === 'map'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                }`}
              >
                Asset Class Map
                {unmappedSymbols.length > 0 && (
                  <span className="bg-orange-500 text-white text-xs rounded-full px-1.5 py-0.5 leading-none">
                    {unmappedSymbols.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'history'
                    ? 'bg-green-700 text-white'
                    : 'bg-green-600 text-white hover:bg-green-700'
                }`}
              >
                History
              </button>
              <button
                onClick={() => setActiveTab('import')}
                className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'import'
                    ? 'bg-blue-700 text-white'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                Import
              </button>
            </div>
          </div>

          {/* BY ASSET CLASS TAB */}
          {activeTab === 'overview' && (
            <div>
              {imports.length > 0 && (
                <div className="flex items-center gap-3 mb-5">
                  <label className="text-sm font-medium text-gray-600">Showing data for:</label>
                  <select
                    value={selectedImportId || ''}
                    onChange={e => handleImportChange(Number(e.target.value))}
                    className="border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                  >
                    {imports.map(imp => (
                      <option key={imp.id} value={imp.id}>{imp.import_date}</option>
                    ))}
                  </select>
                  <div className="ml-auto flex items-center gap-2">
                    {livePricesError && <span className="text-xs text-amber-600">{livePricesError}</span>}
                    {livePrices ? (
                      <button
                        onClick={hideLivePrices}
                        className="px-3 py-1.5 text-sm border border-gray-300 rounded-md text-gray-600 hover:bg-gray-50"
                      >
                        Hide Live Values
                      </button>
                    ) : (
                      <button
                        onClick={fetchLivePrices}
                        disabled={livePricesLoading || positions.length === 0}
                        className="px-3 py-1.5 text-sm border border-green-300 rounded-md text-green-700 hover:bg-green-50 disabled:opacity-50"
                      >
                        {livePricesLoading ? 'Fetching...' : 'Live Values'}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {dataLoading ? (
                <div className="flex items-center justify-center h-48 text-gray-400">Loading...</div>
              ) : positions.length === 0 ? (
                <div className="text-center py-20 text-gray-400">
                  <p className="mb-2">No positions loaded yet.</p>
                  <button
                    onClick={() => setActiveTab('import')}
                    className="text-blue-600 underline text-sm"
                  >
                    Go to Import to upload a CSV
                  </button>
                </div>
              ) : (
                <PortfolioPivotTable
                  positions={positions}
                  assetClassMap={assetClassMap}
                  savedTargets={targets}
                  onSaveTargets={handleSaveTargets}
                  livePrices={livePrices}
                />
              )}

              {/* Notes */}
              <div className="mt-6">
                <label className="block text-sm font-medium text-gray-600 mb-1">Notes</label>
                <textarea
                  ref={noteRef}
                  value={noteText}
                  onChange={handleNoteChange}
                  onMouseUp={handleNoteResize}
                  style={{ height: noteHeight }}
                  className="w-full border border-gray-300 rounded-md p-3 text-sm text-gray-700 resize-y focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400"
                  placeholder="Notes on positions and upcoming trades..."
                />
              </div>
            </div>
          )}

          {/* BY ACCOUNT TAB */}
          {activeTab === 'by-account' && (
            <div>
              {imports.length > 0 && (
                <div className="flex items-center gap-3 mb-5">
                  <label className="text-sm font-medium text-gray-600">Showing data for:</label>
                  <select
                    value={selectedImportId || ''}
                    onChange={e => handleImportChange(Number(e.target.value))}
                    className="border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                  >
                    {imports.map(imp => (
                      <option key={imp.id} value={imp.id}>{imp.import_date}</option>
                    ))}
                  </select>
                </div>
              )}
              {dataLoading ? (
                <div className="flex items-center justify-center h-48 text-gray-400">Loading...</div>
              ) : (
                <PortfolioByAccount positions={positions} lastTransactions={lastTransactions} livePrices={livePrices} />
              )}
            </div>
          )}

          {/* ANALYSIS TAB */}
          {activeTab === 'analysis' && (
            <div>
              <div className="flex items-center gap-6 mb-5">
                {imports.length > 0 && (
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-gray-600">Portfolio date:</label>
                    <select
                      value={selectedImportId || ''}
                      onChange={e => handleImportChange(Number(e.target.value))}
                      className="border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                    >
                      {imports.map(imp => (
                        <option key={imp.id} value={imp.id}>{imp.import_date}</option>
                      ))}
                    </select>
                  </div>
                )}
                {researchWatchlists.length > 0 && (
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-gray-600">Research watchlist:</label>
                    <select
                      value={researchWatchlist?.id || ''}
                      onChange={e => {
                        const wl = researchWatchlists.find(w => w.id === Number(e.target.value))
                        if (wl) handleSelectResearchWatchlist(wl)
                      }}
                      className="border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                    >
                      {researchWatchlists.map(wl => (
                        <option key={wl.id} value={wl.id}>{wl.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              {dataLoading ? (
                <div className="flex items-center justify-center h-48 text-gray-400">Loading...</div>
              ) : (
                <PortfolioResearchView
                  positions={positions}
                  assetClassMap={assetClassMap}
                  researchData={researchData}
                  researchWatchlist={researchWatchlist}
                />
              )}
            </div>
          )}

          {/* ASSET CLASS MAP TAB */}
          {activeTab === 'map' && (
            <AssetClassMapEditor
              assetClassMap={assetClassMap}
              unmappedSymbols={unmappedSymbols}
              positions={positions}
              onAdd={handleMapAdd}
              onUpdate={handleMapUpdate}
              onDelete={handleMapDelete}
              onExport={exportAssetClassMap}
              onImport={async (data) => { await importAssetClassMap(data); await refreshMap() }}
            />
          )}

          {/* HISTORY TAB */}
          {activeTab === 'history' && (
            <div className="max-w-2xl">
              <h2 className="text-base font-semibold text-gray-800 mb-1">Import Transaction History</h2>
              <p className="text-sm text-gray-500 mb-5">
                Upload a Fidelity transaction history CSV (e.g. <code className="bg-gray-100 px-1 rounded">History_for_Account_X12345678.csv</code>).
                Importing replaces all previous history for that account.
              </p>

              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 mb-4 text-center hover:border-blue-400 transition-colors">
                <input
                  type="file"
                  accept=".csv"
                  id="history-upload"
                  className="hidden"
                  onChange={e => {
                    setHistoryFile(e.target.files[0] || null)
                    setHistoryResult(null)
                    setHistoryError(null)
                  }}
                />
                <label htmlFor="history-upload" className="cursor-pointer block">
                  {historyFile ? (
                    <span className="text-blue-600 font-medium text-sm">{historyFile.name}</span>
                  ) : (
                    <span className="text-gray-400 text-sm">Click to select a history CSV file</span>
                  )}
                </label>
              </div>

              <button
                onClick={handleImportHistory}
                disabled={!historyFile || importingHistory}
                className="px-5 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
              >
                {importingHistory ? 'Importing...' : 'Import History'}
              </button>

              {historyResult && (
                <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md text-green-800 text-sm">
                  ✓ Imported {historyResult.total} transactions ({historyResult.buys} buys, {historyResult.sells} sells)
                  {historyResult.multiAccount
                    ? ` across ${historyResult.accountNumbers.length} accounts: ${historyResult.accountNumbers.join(', ')}`
                    : ` for account ${historyResult.accountNumber}`
                  }
                </div>
              )}
              {historyError && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
                  Error: {historyError}
                </div>
              )}

              {/* Accounts with history */}
              {historyAccounts.length > 0 && (
                <div className="mt-8">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Imported History by Account</h3>
                  <div className="rounded-lg border border-gray-200 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="text-left px-4 py-2.5 font-medium text-gray-600">Account</th>
                          <th className="text-right px-4 py-2.5 font-medium text-gray-600">Transactions</th>
                          <th className="text-right px-4 py-2.5 font-medium text-gray-600">Date Range</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {historyAccounts.map(acct => (
                          <tr key={acct.account_number} className="hover:bg-gray-50">
                            <td className="px-4 py-2.5 font-medium text-gray-800">{acct.account_number}</td>
                            <td className="px-4 py-2.5 text-right text-gray-600">{acct.total.toLocaleString()}</td>
                            <td className="px-4 py-2.5 text-right text-gray-500 text-xs">
                              {acct.earliest} – {acct.latest}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* IMPORT TAB */}
          {activeTab === 'import' && (
            <div className="max-w-2xl">
              <h2 className="text-base font-semibold text-gray-800 mb-1">Import Positions</h2>
              <p className="text-sm text-gray-500 mb-4">
                Supports Fidelity CSV exports and 529 tab-separated holdings. Format is detected automatically.
                Each import is stored separately so you can view historical snapshots.
                Re-importing the same date replaces that day's data.
              </p>

              {/* Mode toggle */}
              <div className="flex rounded-md border border-gray-300 overflow-hidden w-fit mb-5">
                {[['file', 'Upload File'], ['paste', 'Paste Holdings']].map(([mode, label]) => (
                  <button
                    key={mode}
                    onClick={() => {
                      setImportMode(mode)
                      setImportFile(null)
                      setPasteContent('')
                      setImportFormat(null)
                      setAccountName529('')
                      setImportResult(null)
                      setImportError(null)
                    }}
                    className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                      importMode === mode
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {importMode === 'file' ? (
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 mb-4 text-center hover:border-blue-400 transition-colors">
                  <input
                    type="file"
                    accept=".csv,.txt,.tsv"
                    id="csv-upload"
                    className="hidden"
                    onChange={handleImportFileChange}
                  />
                  <label htmlFor="csv-upload" className="cursor-pointer block">
                    {importFile ? (
                      <span className="text-blue-600 font-medium text-sm">{importFile.name}</span>
                    ) : (
                      <span className="text-gray-400 text-sm">Click to select a file (CSV or tab-separated)</span>
                    )}
                  </label>
                </div>
              ) : (
                <div className="mb-4">
                  <textarea
                    value={pasteContent}
                    onChange={e => handlePasteChange(e.target.value)}
                    placeholder={'Paste your 529 holdings here.\n\nExpected format:\nPortfolio\tSymbol\tNAV\tUnits\tTotal\nmy529 Fund Name\tUTVLX\t$18.03\t7,149.50\t$128,905.52'}
                    rows={10}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm font-mono focus:ring-blue-500 focus:border-blue-500 resize-y"
                  />
                </div>
              )}

              {importFormat && (
                <div className="mb-4 flex items-start gap-4">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium flex-shrink-0 ${
                    importFormat === '529'
                      ? 'bg-purple-100 text-purple-700'
                      : 'bg-blue-100 text-blue-700'
                  }`}>
                    {importFormat === '529' ? '529 Tab Format' : 'Fidelity CSV'}
                  </span>

                  {importFormat === '529' && (
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Account Name <span className="text-gray-400 font-normal">(used to group holdings in your portfolio)</span>
                      </label>
                      <input
                        type="text"
                        value={accountName529}
                        onChange={e => setAccountName529(e.target.value)}
                        placeholder="e.g. my529 – Child 1"
                        className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={handleImport}
                disabled={(importMode === 'file' ? !importFile : !pasteContent.trim()) || importing}
                className="px-5 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
              >
                {importing ? 'Importing...' : 'Import'}
              </button>

              {importResult && (
                <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md text-green-800 text-sm">
                  ✓ Imported {importResult.positions_count} positions for {importResult.import_date}
                </div>
              )}
              {importError && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
                  Error: {importError}
                </div>
              )}

              {/* Import history */}
              {imports.length > 0 && (
                <div className="mt-8">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Import History</h3>
                  <div className="rounded-lg border border-gray-200 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="text-left px-4 py-2.5 font-medium text-gray-600">Date</th>
                          <th className="text-left px-4 py-2.5 font-medium text-gray-600">File</th>
                          <th className="text-left px-4 py-2.5 font-medium text-gray-600">Imported</th>
                          <th className="px-4 py-2.5 w-32"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {imports.map(imp => (
                          <tr key={imp.id} className="hover:bg-gray-50">
                            <td className="px-4 py-2.5 font-medium text-gray-800">{imp.import_date}</td>
                            <td className="px-4 py-2.5 text-gray-500">{imp.filename}</td>
                            <td className="px-4 py-2.5 text-gray-400 text-xs">
                              {new Date(imp.created_at).toLocaleDateString()}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <button
                                onClick={() => handleDeleteImport(imp)}
                                className="text-red-400 hover:text-red-600 text-xs"
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
              )}

            </div>
          )}
        </>
      )}
    </div>
  )
}
