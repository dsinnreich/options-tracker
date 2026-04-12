import { useState, useCallback, useEffect } from 'react'

const API_URL = '/api/research'

export function useResearch() {
  const [data, setData] = useState([])
  const [imports, setImports] = useState([])
  const [currentImport, setCurrentImport] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const fetchImports = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/imports`, { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch imports')
      const list = await res.json()
      setImports(list)
    } catch (err) {
      setError(err.message)
    }
  }, [])

  const fetchLatest = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/latest`, { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch data')
      const result = await res.json()
      setCurrentImport(result.import)
      setData(result.data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchImportData = useCallback(async (importId) => {
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/data/${importId}`, { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch data')
      const result = await res.json()
      setCurrentImport(result.import)
      setData(result.data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const importFile = useCallback(async (file) => {
    setLoading(true)
    setError(null)
    try {
      const buffer = await file.arrayBuffer()
      const base64 = btoa(
        new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      )
      const res = await fetch(`${API_URL}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ data: base64, filename: file.name })
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Import failed')
      }
      const result = await res.json()
      await fetchImports()
      await fetchImportData(result.import.id)
      return true
    } catch (err) {
      setError(err.message)
      return false
    } finally {
      setLoading(false)
    }
  }, [fetchImports, fetchImportData])

  const deleteImport = useCallback(async (importId) => {
    try {
      const res = await fetch(`${API_URL}/imports/${importId}`, {
        method: 'DELETE',
        credentials: 'include'
      })
      if (!res.ok) throw new Error('Failed to delete import')
      await fetchImports()
      if (currentImport?.id === importId) {
        await fetchLatest()
      }
      return true
    } catch (err) {
      setError(err.message)
      return false
    }
  }, [fetchImports, fetchLatest, currentImport])

  useEffect(() => {
    fetchImports()
    fetchLatest()
  }, [fetchImports, fetchLatest])

  return {
    data,
    imports,
    currentImport,
    loading,
    error,
    importFile,
    fetchImportData,
    fetchLatest,
    deleteImport
  }
}
