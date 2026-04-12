import { useState, useCallback, useEffect } from 'react'

const API_URL = '/api/research'

export function useResearch() {
  const [data, setData] = useState([])
  const [watchlists, setWatchlists] = useState([])
  const [activeWatchlist, setActiveWatchlist] = useState(null)
  const [currentImport, setCurrentImport] = useState(null)
  const [imports, setImports] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // --- Watchlist CRUD ---

  const fetchWatchlists = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/watchlists`, { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch watchlists')
      const list = await res.json()
      setWatchlists(list)
      return list
    } catch (err) {
      setError(err.message)
      return []
    }
  }, [])

  const createWatchlist = useCallback(async (name) => {
    try {
      const res = await fetch(`${API_URL}/watchlists`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name })
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to create watchlist')
      }
      const wl = await res.json()
      await fetchWatchlists()
      return wl
    } catch (err) {
      setError(err.message)
      return null
    }
  }, [fetchWatchlists])

  const renameWatchlist = useCallback(async (id, name) => {
    try {
      const res = await fetch(`${API_URL}/watchlists/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name })
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to rename watchlist')
      }
      await fetchWatchlists()
      return true
    } catch (err) {
      setError(err.message)
      return false
    }
  }, [fetchWatchlists])

  const deleteWatchlist = useCallback(async (id) => {
    try {
      const res = await fetch(`${API_URL}/watchlists/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      })
      if (!res.ok) throw new Error('Failed to delete watchlist')
      const remaining = await fetchWatchlists()
      if (activeWatchlist?.id === id) {
        setActiveWatchlist(remaining[0] || null)
      }
      return true
    } catch (err) {
      setError(err.message)
      return false
    }
  }, [fetchWatchlists, activeWatchlist])

  // --- Data fetching (scoped to active watchlist) ---

  const fetchWatchlistData = useCallback(async (watchlistId) => {
    if (!watchlistId) return
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/watchlists/${watchlistId}/latest`, { credentials: 'include' })
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

  const fetchWatchlistImports = useCallback(async (watchlistId) => {
    if (!watchlistId) return
    try {
      const res = await fetch(`${API_URL}/watchlists/${watchlistId}/imports`, { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch imports')
      const list = await res.json()
      setImports(list)
    } catch (err) {
      setError(err.message)
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

  // --- Import file into active watchlist ---

  const importFile = useCallback(async (file) => {
    if (!activeWatchlist) {
      setError('Select or create a watchlist first')
      return false
    }
    setLoading(true)
    setError(null)
    try {
      const buffer = await file.arrayBuffer()
      const base64 = btoa(
        new Uint8Array(buffer).reduce((d, byte) => d + String.fromCharCode(byte), '')
      )
      const res = await fetch(`${API_URL}/watchlists/${activeWatchlist.id}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ data: base64, filename: file.name })
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Import failed')
      }
      await fetchWatchlistData(activeWatchlist.id)
      await fetchWatchlistImports(activeWatchlist.id)
      return true
    } catch (err) {
      setError(err.message)
      return false
    } finally {
      setLoading(false)
    }
  }, [activeWatchlist, fetchWatchlistData, fetchWatchlistImports])

  const deleteImport = useCallback(async (importId) => {
    try {
      const res = await fetch(`${API_URL}/imports/${importId}`, {
        method: 'DELETE',
        credentials: 'include'
      })
      if (!res.ok) throw new Error('Failed to delete import')
      if (activeWatchlist) {
        await fetchWatchlistData(activeWatchlist.id)
        await fetchWatchlistImports(activeWatchlist.id)
      }
      return true
    } catch (err) {
      setError(err.message)
      return false
    }
  }, [activeWatchlist, fetchWatchlistData, fetchWatchlistImports])

  // --- Select a watchlist and load its data ---

  const selectWatchlist = useCallback(async (wl) => {
    setActiveWatchlist(wl)
    if (wl) {
      await fetchWatchlistData(wl.id)
      await fetchWatchlistImports(wl.id)
    } else {
      setData([])
      setCurrentImport(null)
      setImports([])
    }
  }, [fetchWatchlistData, fetchWatchlistImports])

  // --- Initial load ---

  useEffect(() => {
    fetchWatchlists().then(list => {
      if (list.length > 0) {
        selectWatchlist(list[0])
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return {
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
  }
}
