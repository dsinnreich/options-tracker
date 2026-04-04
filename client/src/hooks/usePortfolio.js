import { useState, useEffect, useCallback } from 'react'

const API = '/api/portfolio'

export function usePortfolio() {
  const [portfolios, setPortfolios] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchPortfolios = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch(API, { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch portfolios')
      setPortfolios(await res.json())
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchPortfolios() }, [fetchPortfolios])

  const createPortfolio = useCallback(async (name) => {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name })
    })
    if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
    const p = await res.json()
    await fetchPortfolios()
    return p
  }, [fetchPortfolios])

  const renamePortfolio = useCallback(async (id, name) => {
    const res = await fetch(`${API}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name })
    })
    if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
    await fetchPortfolios()
  }, [fetchPortfolios])

  const deletePortfolio = useCallback(async (id) => {
    const res = await fetch(`${API}/${id}`, { method: 'DELETE', credentials: 'include' })
    if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
    await fetchPortfolios()
  }, [fetchPortfolios])

  const getImports = useCallback(async (portfolioId) => {
    const res = await fetch(`${API}/${portfolioId}/imports`, { credentials: 'include' })
    if (!res.ok) throw new Error('Failed to fetch imports')
    return res.json()
  }, [])

  const importCSV = useCallback(async (portfolioId, filename, content) => {
    const res = await fetch(`${API}/${portfolioId}/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ filename, content })
    })
    if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
    return res.json()
  }, [])

  const deleteImport = useCallback(async (portfolioId, importId) => {
    const res = await fetch(`${API}/${portfolioId}/imports/${importId}`, {
      method: 'DELETE', credentials: 'include'
    })
    if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
  }, [])

  const exportAssetClassMap = useCallback(async () => {
    const res = await fetch(`${API}/asset-class-map/export`, { credentials: 'include' })
    if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `asset-class-map-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  const importAssetClassMap = useCallback(async (data) => {
    const res = await fetch(`${API}/asset-class-map/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data)
    })
    if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
    return res.json()
  }, [])

  const getPositions = useCallback(async (portfolioId, importId) => {
    const url = importId
      ? `${API}/${portfolioId}/positions?importId=${importId}`
      : `${API}/${portfolioId}/positions`
    const res = await fetch(url, { credentials: 'include' })
    if (!res.ok) throw new Error('Failed to fetch positions')
    return res.json()
  }, [])

  const getAssetClassMap = useCallback(async () => {
    const res = await fetch(`${API}/asset-class-map`, { credentials: 'include' })
    if (!res.ok) throw new Error('Failed to fetch asset class map')
    return res.json()
  }, [])

  const addAssetClassMapping = useCallback(async (mapping) => {
    const res = await fetch(`${API}/asset-class-map`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(mapping)
    })
    if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
    return res.json()
  }, [])

  const updateAssetClassMapping = useCallback(async (id, mapping) => {
    const res = await fetch(`${API}/asset-class-map/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(mapping)
    })
    if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
    return res.json()
  }, [])

  const deleteAssetClassMapping = useCallback(async (id) => {
    const res = await fetch(`${API}/asset-class-map/${id}`, {
      method: 'DELETE', credentials: 'include'
    })
    if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
  }, [])

  const getTargets = useCallback(async (portfolioId) => {
    const res = await fetch(`${API}/${portfolioId}/targets`, { credentials: 'include' })
    if (!res.ok) throw new Error('Failed to fetch targets')
    return res.json()
  }, [])

  const saveTargets = useCallback(async (portfolioId, targets) => {
    const res = await fetch(`${API}/${portfolioId}/targets`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ targets })
    })
    if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
    return res.json()
  }, [])

  return {
    portfolios, loading, error,
    fetchPortfolios,
    createPortfolio, renamePortfolio, deletePortfolio,
    getImports, importCSV, deleteImport,
    getPositions,
    getAssetClassMap, addAssetClassMapping, updateAssetClassMapping, deleteAssetClassMapping,
    exportAssetClassMap, importAssetClassMap,
    getTargets, saveTargets
  }
}
