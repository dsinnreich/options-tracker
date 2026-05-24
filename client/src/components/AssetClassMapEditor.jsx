import { useState, useRef } from 'react'

const EMPTY_FORM = { symbol: '', investment_name: '', asset_class: '', style: '', proxy_ticker: '' }

export default function AssetClassMapEditor({ assetClassMap, unmappedSymbols, positions, onAdd, onUpdate, onDelete, onExport, onImport }) {
  const [editingId, setEditingId] = useState(null)
  const [importResult, setImportResult] = useState(null)
  const [importError, setImportError] = useState(null)
  const fileInputRef = useRef(null)

  const handleExport = async () => {
    try { await onExport() }
    catch (err) { alert('Export failed: ' + err.message) }
  }

  const handleImportFile = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setImportResult(null)
    setImportError(null)
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      if (!Array.isArray(data.mappings)) throw new Error('Invalid file format')
      const result = await onImport(data)
      setImportResult(result)
    } catch (err) {
      setImportError(err.message.includes('JSON') ? 'Invalid file — please select a valid asset class map backup' : err.message)
    }
    e.target.value = ''
  }
  const [editForm, setEditForm] = useState(EMPTY_FORM)
  const [newForm, setNewForm] = useState(EMPTY_FORM)
  const [addingFor, setAddingFor] = useState(null) // symbol being quick-added from unmapped list
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // Unique asset class / style suggestions from existing map
  const existingClasses = [...new Set(assetClassMap.map(m => m.asset_class))].sort()
  const existingStyles = [...new Set(assetClassMap.map(m => m.style))].sort()

  // Get description for a symbol from current positions
  const descFor = (sym) => {
    const pos = positions.find(p => (p.symbol || '').toUpperCase() === sym.toUpperCase())
    return pos?.description || ''
  }

  const startEdit = (m) => {
    setEditingId(m.id)
    setEditForm({ symbol: m.symbol, investment_name: m.investment_name || '', asset_class: m.asset_class, style: m.style, proxy_ticker: m.proxy_ticker || '' })
    setError(null)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditForm(EMPTY_FORM)
    setError(null)
  }

  const handleUpdate = async (id) => {
    if (!editForm.asset_class.trim() || !editForm.style.trim()) {
      setError('Asset Class and Style are required')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onUpdate(id, editForm)
      cancelEdit()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id, symbol) => {
    if (!confirm(`Remove mapping for ${symbol}?`)) return
    try {
      await onDelete(id)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleAdd = async (e) => {
    e.preventDefault()
    const form = addingFor ? { ...newForm, symbol: addingFor } : newForm
    if (!form.symbol.trim() || !form.asset_class.trim() || !form.style.trim()) {
      setError('Symbol, Asset Class, and Style are required')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onAdd(form)
      setNewForm(EMPTY_FORM)
      setAddingFor(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const startQuickAdd = (sym) => {
    setAddingFor(sym)
    setNewForm({ symbol: sym, investment_name: descFor(sym), asset_class: '', style: '' })
    setError(null)
    setTimeout(() => document.getElementById('new-asset-class')?.focus(), 50)
  }

  return (
    <div className="space-y-8">

      {/* Export / Import toolbar */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleExport}
          className="px-4 py-1.5 text-sm font-medium border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
        >
          Export Map
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="px-4 py-1.5 text-sm font-medium border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
        >
          Import Map
        </button>
        <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleImportFile} />
        {importResult && (
          <span className="text-sm text-green-700">
            ✓ Imported {importResult.imported} mappings ({importResult.total} total)
          </span>
        )}
        {importError && <span className="text-sm text-red-600">{importError}</span>}
      </div>

      {/* Unmapped symbols alert */}
      {unmappedSymbols.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-orange-800 mb-2">
            {unmappedSymbols.length} unmapped symbol{unmappedSymbols.length !== 1 ? 's' : ''} in current import
          </h3>
          <div className="flex flex-wrap gap-2">
            {unmappedSymbols.map(sym => (
              <button
                key={sym}
                onClick={() => startQuickAdd(sym)}
                className="px-2.5 py-1 bg-orange-100 text-orange-800 text-xs rounded-full hover:bg-orange-200 border border-orange-300"
                title={descFor(sym)}
              >
                {sym} +
              </button>
            ))}
          </div>
          <p className="text-xs text-orange-600 mt-2">
            Click a symbol to map it. Unmapped positions won't appear in the pivot table correctly.
          </p>
        </div>
      )}

      {/* Add new mapping form */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          {addingFor ? `Add Mapping for ${addingFor}` : 'Add New Mapping'}
        </h3>
        <form onSubmit={handleAdd} className="flex flex-wrap gap-3 items-end">
          {!addingFor && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Symbol *</label>
              <input
                type="text"
                value={newForm.symbol}
                onChange={e => setNewForm(f => ({ ...f, symbol: e.target.value.toUpperCase() }))}
                placeholder="IVV"
                className="border rounded px-2.5 py-1.5 text-sm w-24 uppercase"
              />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Investment Name</label>
            <input
              type="text"
              value={newForm.investment_name}
              onChange={e => setNewForm(f => ({ ...f, investment_name: e.target.value }))}
              placeholder="Optional description"
              className="border rounded px-2.5 py-1.5 text-sm w-52"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Asset Class *</label>
            <input
              id="new-asset-class"
              type="text"
              value={newForm.asset_class}
              onChange={e => setNewForm(f => ({ ...f, asset_class: e.target.value }))}
              placeholder="e.g. Equity"
              list="ac-suggestions"
              className="border rounded px-2.5 py-1.5 text-sm w-32"
            />
            <datalist id="ac-suggestions">
              {existingClasses.map(c => <option key={c} value={c} />)}
            </datalist>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Style *</label>
            <input
              type="text"
              value={newForm.style}
              onChange={e => setNewForm(f => ({ ...f, style: e.target.value }))}
              placeholder="e.g. Core"
              list="style-suggestions"
              className="border rounded px-2.5 py-1.5 text-sm w-32"
            />
            <datalist id="style-suggestions">
              {existingStyles.map(s => <option key={s} value={s} />)}
            </datalist>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Return Proxy</label>
            <input
              type="text"
              value={newForm.proxy_ticker}
              onChange={e => setNewForm(f => ({ ...f, proxy_ticker: e.target.value.toUpperCase() }))}
              placeholder="e.g. IVV"
              className="border rounded px-2.5 py-1.5 text-sm w-24 uppercase"
              title="Use returns from this ticker when Morningstar data is unavailable for this symbol"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Adding...' : 'Add'}
            </button>
            {addingFor && (
              <button
                type="button"
                onClick={() => { setAddingFor(null); setNewForm(EMPTY_FORM) }}
                className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
        {error && <p className="text-red-600 text-xs mt-2">{error}</p>}
      </div>

      {/* Existing mappings table */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          All Mappings ({assetClassMap.length})
        </h3>
        {assetClassMap.length === 0 ? (
          <p className="text-gray-400 text-sm">No mappings yet. Add your first one above.</p>
        ) : (
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600 w-24">Symbol</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Investment Name</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600 w-32">Asset Class</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600 w-28">Style</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600 w-28" title="Ticker to borrow returns from when this symbol has no Morningstar data">Return Proxy</th>
                  <th className="px-4 py-2.5 w-24"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {assetClassMap.map(m => (
                  <tr key={m.id} className="hover:bg-gray-50">
                    {editingId === m.id ? (
                      <>
                        <td className="px-4 py-2">
                          <span className="font-medium text-gray-900">{m.symbol}</span>
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={editForm.investment_name}
                            onChange={e => setEditForm(f => ({ ...f, investment_name: e.target.value }))}
                            className="border rounded px-2 py-1 text-sm w-full"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={editForm.asset_class}
                            onChange={e => setEditForm(f => ({ ...f, asset_class: e.target.value }))}
                            list="ac-suggestions"
                            className="border rounded px-2 py-1 text-sm w-full"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={editForm.style}
                            onChange={e => setEditForm(f => ({ ...f, style: e.target.value }))}
                            list="style-suggestions"
                            className="border rounded px-2 py-1 text-sm w-full"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={editForm.proxy_ticker}
                            onChange={e => setEditForm(f => ({ ...f, proxy_ticker: e.target.value.toUpperCase() }))}
                            placeholder="e.g. IVV"
                            className="border rounded px-2 py-1 text-sm w-20 uppercase"
                            title="Use returns from this ticker when Morningstar data is unavailable"
                          />
                        </td>
                        <td className="px-4 py-2 text-right">
                          <button
                            onClick={() => handleUpdate(m.id)}
                            disabled={saving}
                            className="text-green-600 hover:text-green-800 text-xs font-medium mr-2 disabled:opacity-50"
                          >
                            Save
                          </button>
                          <button onClick={cancelEdit} className="text-gray-400 hover:text-gray-600 text-xs">
                            Cancel
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-2.5 font-medium text-gray-900">{m.symbol}</td>
                        <td className="px-4 py-2.5 text-gray-600">{m.investment_name || '—'}</td>
                        <td className="px-4 py-2.5 text-gray-700">{m.asset_class}</td>
                        <td className="px-4 py-2.5 text-gray-700">{m.style}</td>
                        <td className="px-4 py-2.5 text-gray-500 font-mono text-xs">{m.proxy_ticker || '—'}</td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            onClick={() => startEdit(m)}
                            className="text-blue-500 hover:text-blue-700 text-xs font-medium mr-3"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(m.id, m.symbol)}
                            className="text-red-400 hover:text-red-600 text-xs"
                          >
                            Delete
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
