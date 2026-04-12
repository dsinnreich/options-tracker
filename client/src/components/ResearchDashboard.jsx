import { useRef } from 'react'
import { useResearch } from '../hooks/useResearch'
import EtfResearchTable from './EtfResearchTable'

function ResearchDashboard() {
  const {
    data,
    imports,
    currentImport,
    loading,
    error,
    importFile,
    fetchImportData,
    deleteImport
  } = useResearch()

  const fileInputRef = useRef(null)

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    await importFile(file)
    e.target.value = ''
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ETF Research</h1>
          {currentImport && (
            <p className="text-sm text-gray-500 mt-1">
              {currentImport.filename} — imported {currentImport.import_date} — {currentImport.row_count} ETFs
            </p>
          )}
        </div>

        <div className="flex items-center space-x-3">
          {imports.length > 1 && (
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
              onClick={() => {
                if (confirm('Delete this import?')) deleteImport(currentImport.id)
              }}
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
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
          >
            {loading ? 'Importing...' : 'Import XLSX'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-md text-sm">
          {error}
        </div>
      )}

      <EtfResearchTable data={data} />
    </div>
  )
}

export default ResearchDashboard
