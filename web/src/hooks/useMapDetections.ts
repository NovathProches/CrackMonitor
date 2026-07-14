import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

export interface MapDetection {
  id: string
  captured_at: string
  lat: number
  lng: number
  crack_length_mm: number | null
  crack_width_mm: number | null
  status: string
  overlay_url: string | null
  tickets: Array<{ ticket_number: number; status: string }>
}

export function useMapDetections() {
  const [detections, setDetections] = useState<MapDetection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    api.get<{ count: number; results: MapDetection[] }>('/api/detections/?page_size=500')
      .then(data => {
        if (cancelled) return
        setDetections(data.results.filter(d => d.lat != null && d.lng != null) as MapDetection[])
      })
      .catch(e => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load map data')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [refreshKey])

  useEffect(() => {
    const interval = setInterval(() => setRefreshKey(k => k + 1), 15000)
    return () => clearInterval(interval)
  }, [])

  return { detections, loading, error }
}
