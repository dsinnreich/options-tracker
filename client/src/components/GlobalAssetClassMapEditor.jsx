import { useState, useRef } from 'react'

const EMPTY_FORM = { symbol: '', investment_name: '', asset_class: '', style: '', proxy_ticker: '' }

export default function GlobalAssetClassMapEditor({ globalMap, onAdd, onUpdate, onDelete, onExport, onImport }) {
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState(EMPTY_FORM)
  const [newForm, setNewForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [importResult, setImportResult] = useState(null)
  const [importError, setImportError] = useState(null)
  const fileInputRef = useRef(null)

  const existingClasses = [...new Set(globalMap.map(m => m.asset_class))].sort()
  const existingStyles = [...new Set(globalMap.map(m => m.style))].sort()

  const startEdit = (m) => {
    setEditingId(m.id)
    setEditForm({ symbol: m.symbol, investment_name: m.investment_name || '', asset_class: m.asset_class, style: m.style, proxy_ticker: m.proxy_ticker || '' })
    setError(null)
  }

  const cancelEdit = () => { setEditingId(null); setEditForm(EMPTY_FORM); setError(null) }

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!newForm.symbol.trim() || !newForm.asset_class.trim() || !newForm.style.trim()) {
      setError('Symbol, Asset Class, and Style are required')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onAdd(newForm)
      setNewForm(EMPTY_FORM)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
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
    if (!confirm(`Remove "${symbol}" from the global map? Users without a personal override will lose this classification.`)) return
    try {
      await onDelete(id)
    } catch (err) {
      setError(err.message)
    }
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

  return (
    <div className="space-y-6">

      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <button
          onClick={onExport}
          className="px-4 py-1.5 text-sm font-medium border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
        >
          Export
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="px-4 py-1.5 text-sm font-medium border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
        >
          Import
        </button>
        <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleImportFile} />
        {importResult && <span className="text-sm text-green-700">✓ Imported {importResult.imported} mappings ({importResult.total} total)</span>}
        {importError && <span className="text-sm text-red-600">{importError}</span>}
      </div>

      {/* Add form */}
      <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Add Global Mapping</h3>
        <form onSubmit={handleAdd} className="flex flex-wrap gap-3 items-end">
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
              type="text"
              value={newForm.asset_class}
              onChange={e => setNewForm(f => ({ ...f, asset_class: e.target.value }))}
              placeholder="e.g. Equity"
              list="g-ac-suggestions"
              className="border rounded px-2.5 py-1.5 text-sm w-32"
            />
            <datalist id="g-ac-suggestions">
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
              list="g-style-suggestions"
              className="border rounded px-2.5 py-1.5 text-sm w-32"
            />
            <datalist id="g-style-suggestions">
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
              title="Borrow returns from this ticker when Morningstar data is unavailable"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Adding...' : 'Add'}
          </button>
        </form>
        {error && <p className="text-red-600 text-xs mt-2">{error}</p>}
      </div>

      {/* Table */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">
          Global Mappings ({globalMap.length})
          <span className="ml-2 text-xs font-normal text-gray-400">Visible to all users unless overridden</span>
        </h3>
        {globalMap.length === 0 ? (
          <p className="text-gray-400 text-sm">No global mappings yet. Add one above.</p>
        ) : (
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600 w-24">Symbol</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Investment Name</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600 w-32">Asset Class</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600 w-28">Style</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600 w-24" title="Borrow returns from this ticker when Morningstar data is unavailable">Return Proxy</th>
                  <th className="px-4 py-2.5 w-24"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {globalMap.map(m => (
                  <tr key={m.id} className="hover:bg-gray-50">
                    {editingId === m.id ? (
                      <>
                        <td className="px-4 py-2 font-medium text-gray-900">{m.symbol}</td>
                        <td className="px-4 py-2">
                          <input type="text" value={editForm.investment_name} onChange={e => setEditForm(f => ({ ...f, investment_name: e.target.value }))} className="border rounded px-2 py-1 text-sm w-full" />
                        </td>
                        <td className="px-4 py-2">
                          <input type="text" value={editForm.asset_class} onChange={e => setEditForm(f => ({ ...f, asset_class: e.target.value }))} list="g-ac-suggestions" className="border rounded px-2 py-1 text-sm w-full" />
                        </td>
                        <td className="px-4 py-2">
                          <input type="text" value={editForm.style} onChange={e => setEditForm(f => ({ ...f, style: e.target.value }))} list="g-style-suggestions" className="border rounded px-2 py-1 text-sm w-full" />
                        </td>
                        <td className="px-4 py-2">
                          <input type="text" value={editForm.proxy_ticker} onChange={e => setEditForm(f => ({ ...f, proxy_ticker: e.target.value.toUpperCase() }))} placeholder="e.g. IVV" className="border rounded px-2 py-1 text-sm w-20 uppercase" />
                        </td>
                        <td className="px-4 py-2 text-right whitespace-nowrap">
                          <button onClick={() => handleUpdate(m.id)} disabled={saving} className="text-green-600 hover:text-green-800 text-xs font-medium mr-2 disabled:opacity-50">Save</button>
                          <button onClick={cancelEdit} className="text-gray-400 hover:text-gray-600 text-xs">Cancel</button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-2.5 font-medium text-gray-900">{m.symbol}</td>
                        <td className="px-4 py-2.5 text-gray-600">{m.investment_name || '—'}</td>
                        <td className="px-4 py-2.5 text-gray-700">{m.asset_class}</td>
                        <td className="px-4 py-2.5 text-gray-700">{m.style}</td>
                        <td className="px-4 py-2.5 text-gray-500 font-mono text-xs">{m.proxy_ticker || '—'}</td>
                        <td className="px-4 py-2.5 text-right whitespace-nowrap">
                          <button onClick={() => startEdit(m)} className="text-blue-500 hover:text-blue-700 text-xs font-medium mr-3">Edit</button>
                          <button onClick={() => handleDelete(m.id, m.symbol)} className="text-red-400 hover:text-red-600 text-xs">Delete</button>
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
