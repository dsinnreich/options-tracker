import { useRef, useState } from 'react'
import { useResearch } from '../hooks/useResearch'
import EtfResearchTable from './EtfResearchTable'

function ResearchDashboard() {
  const {
    data,
    watchlists,
    activeWatchlist,
    currentImport,
    imports,
    loading,
    error,
    selectWatchlist,
    createWatchlist,
    renameWatchlist,
    deleteWatchlist,
    importFile,
    fetchImportData,
    deleteImport
  } = useResearch()

  const fileInputRef = useRef(null)
  const [showNewForm, setShowNewForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [renamingId, setRenamingId] = useState(null)
  const [renameValue, setRenameValue] = useState('')

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    await importFile(file)
    e.target.value = ''
  }

  const handleCreate = async () => {
    if (!newName.trim()) return
    const wl = await createWatchlist(newName.trim())
    if (wl) {
      selectWatchlist(wl)
      setNewName('')
      setShowNewForm(false)
    }
  }

  const handleRename = async () => {
    if (!renameValue.trim() || !renamingId) return
    await renameWatchlist(renamingId, renameValue.trim())
    setRenamingId(null)
    setRenameValue('')
  }

  const startRename = (wl) => {
    setRenamingId(wl.id)
    setRenameValue(wl.name)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900">ETF Research</h1>

        <div className="flex items-center space-x-3">
          {currentImport && imports.length > 1 && (
            <select
              value={currentImport?.id || ''}
              onChange={e => fetchImportData(e.target.value)}
              className="px-3 py-2 border rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
            >
              {imports.map(imp => (
                <option key={imp.id} value={imp.id}>
                  {imp.import_date} — {imp.filename}
                </option>
              ))}
            </select>
          )}

          {currentImport && (
            <button
              onClick={() => { if (confirm('Delete this import?')) deleteImport(currentImport.id) }}
              className="px-3 py-2 text-sm text-red-600 hover:text-red-800 border border-red-200 rounded-md hover:bg-red-50"
            >
              Delete Import
            </button>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={loading || !activeWatchlist}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
          >
            {loading ? 'Importing...' : 'Import XLSX'}
          </button>
        </div>
      </div>

      {/* Watchlist tabs */}
      <div className="flex items-center space-x-1 mb-4 border-b border-gray-200 pb-2">
        {watchlists.map(wl => (
          <div key={wl.id} className="flex items-center">
            {renamingId === wl.id ? (
              <div className="flex items-center space-x-1">
                <input
                  type="text"
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setRenamingId(null) }}
                  className="px-2 py-1 border rounded text-sm w-32 focus:ring-blue-500 focus:border-blue-500"
                  autoFocus
                />
                <button onClick={handleRename} className="text-green-600 hover:text-green-800 text-xs font-medium">Save</button>
                <button onClick={() => setRenamingId(null)} className="text-gray-400 hover:text-gray-600 text-xs">Cancel</button>
              </div>
            ) : (
              <button
                onClick={() => selectWatchlist(wl)}
                onDoubleClick={() => startRename(wl)}
                className={`px-4 py-2 rounded-t-md text-sm font-medium border-b-2 transition-colors ${
                  activeWatchlist?.id === wl.id
                    ? 'border-blue-600 text-blue-700 bg-blue-50'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
                title="Double-click to rename"
              >
                {wl.name}
              </button>
            )}
          </div>
        ))}

        {showNewForm ? (
          <div className="flex items-center space-x-1 ml-1">
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') { setShowNewForm(false); setNewName('') } }}
              placeholder="Watchlist name"
              className="px-2 py-1 border rounded text-sm w-36 focus:ring-blue-500 focus:border-blue-500"
              autoFocus
            />
            <button onClick={handleCreate} className="text-green-600 hover:text-green-800 text-xs font-medium">Create</button>
            <button onClick={() => { setShowNewForm(false); setNewName('') }} className="text-gray-400 hover:text-gray-600 text-xs">Cancel</button>
          </div>
        ) : (
          <button
            onClick={() => setShowNewForm(true)}
            className="px-3 py-2 text-sm text-gray-400 hover:text-gray-600 font-medium"
          >
            + New Watchlist
          </button>
        )}

        {activeWatchlist && watchlists.length > 0 && (
          <button
            onClick={() => {
              if (confirm(`Delete watchlist "${activeWatchlist.name}" and all its data?`)) {
                deleteWatchlist(activeWatchlist.id)
              }
            }}
            className="ml-auto text-xs text-red-400 hover:text-red-600"
          >
            Delete Watchlist
          </button>
        )}
      </div>

      {activeWatchlist && currentImport && (
        <p className="text-sm text-gray-500 mb-3">
          {currentImport.filename} — imported {currentImport.import_date} — {currentImport.row_count} ETFs
        </p>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-md text-sm">
          {error}
        </div>
      )}

      {!activeWatchlist && watchlists.length === 0 ? (
        <p className="text-gray-500 text-center py-12">Create a watchlist to get started.</p>
      ) : (
        <EtfResearchTable data={data} />
      )}
    </div>
  )
}

export default ResearchDashboard
