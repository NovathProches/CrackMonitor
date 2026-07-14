import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'

export interface Engineer {
  id: string
  name: string
  code: string | null
}

export interface DetectionTicket {
  ticket_number: number
  status: string
  assignee: { name: string; code: string | null } | null
}

export interface DetectionRow {
  id: string
  captured_at: string
  lat: number | null
  lng: number | null
  crack_length_mm: number | null
  crack_width_mm: number | null
  crack_area_mm2: number | null
  status: string
  image_url: string | null
  overlay_url: string | null
  tickets: DetectionTicket[]
}

export const PAGE_SIZE = 25

export function useDetections() {
  const [rows, setRows] = useState<DetectionRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [engineers, setEngineers] = useState<Engineer[]>([])
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    api.get<Engineer[]>('/api/engineers/')
      .then(data => setEngineers(data))
      .catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) })
      if (statusFilter) params.set('status', statusFilter)

      const data = await api.get<{ count: number; results: DetectionRow[] }>(
        `/api/detections/?${params}`,
      )
      setRows(data.results)
      setTotal(data.count)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load detections')
    } finally {
      setLoading(false)
    }
  }, [page, statusFilter, refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const interval = setInterval(() => setRefreshKey(k => k + 1), 10000)
    return () => clearInterval(interval)
  }, [])

  const createTicket = useCallback(async (detectionId: string, assigneeId: string) => {
    await api.post('/api/tickets/', { detection_id: detectionId, assignee_id: assigneeId })
    setRefreshKey(k => k + 1)
  }, [])

  const markFixed = useCallback(async (ticketNumber: number) => {
    await api.patch(`/api/tickets/${ticketNumber}/`, {
      status: 'resolved',
      resolved_at: new Date().toISOString(),
    })
    setRefreshKey(k => k + 1)
  }, [])

  return {
    rows, total, page, setPage,
    statusFilter, setStatusFilter,
    loading, error,
    engineers,
    createTicket, markFixed,
  }
}
