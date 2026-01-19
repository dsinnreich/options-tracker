import { useState, useEffect, useCallback } from 'react'
import { calculateDerivedFields } from '../utils/calculations'

const API_URL = '/api/positions'

export function usePositions() {
  const [positions, setPositions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchPositions = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch(API_URL)
      if (!response.ok) throw new Error('Failed to fetch positions')
      const data = await response.json()
      const enriched = data.map(calculateDerivedFields)
      setPositions(enriched)
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPositions()
  }, [fetchPositions])

  const getPosition = useCallback(async (id) => {
    try {
      const response = await fetch(`${API_URL}/${id}`)
      if (!response.ok) throw new Error('Failed to fetch position')
      const data = await response.json()
      return calculateDerivedFields(data)
    } catch (err) {
      setError(err.message)
      return null
    }
  }, [])

  const createPosition = useCallback(async (position) => {
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(position)
      })
      if (!response.ok) throw new Error('Failed to create position')
      await fetchPositions()
      return true
    } catch (err) {
      setError(err.message)
      return false
    }
  }, [fetchPositions])

  const updatePosition = useCallback(async (id, position) => {
    try {
      const response = await fetch(`${API_URL}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(position)
      })
      if (!response.ok) throw new Error('Failed to update position')
      await fetchPositions()
      return true
    } catch (err) {
      setError(err.message)
      return false
    }
  }, [fetchPositions])

  const closePosition = useCallback(async (id, closePrice) => {
    try {
      const response = await fetch(`${API_URL}/${id}/close`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ close_price: closePrice })
      })
      if (!response.ok) throw new Error('Failed to close position')
      await fetchPositions()
      return true
    } catch (err) {
      setError(err.message)
      return false
    }
  }, [fetchPositions])

  const deletePosition = useCallback(async (id) => {
    try {
      const response = await fetch(`${API_URL}/${id}`, {
        method: 'DELETE'
      })
      if (!response.ok) throw new Error('Failed to delete position')
      await fetchPositions()
      return true
    } catch (err) {
      setError(err.message)
      return false
    }
  }, [fetchPositions])

  const refreshPrices = useCallback(async () => {
    try {
      const response = await fetch('/api/prices/refresh-all', {
        method: 'POST'
      })
      if (!response.ok) throw new Error('Failed to refresh prices')
      const result = await response.json()
      await fetchPositions()
      return result
    } catch (err) {
      setError(err.message)
      return null
    }
  }, [fetchPositions])

  return {
    positions,
    loading,
    error,
    fetchPositions,
    getPosition,
    createPosition,
    updatePosition,
    closePosition,
    deletePosition,
    refreshPrices
  }
}
