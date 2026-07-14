import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'

export interface Engineer {
  id: string
  name: string
  code: string | null
}

export interface TicketDetection {
  id: string
  captured_at: string
  lat: number | null
  lng: number | null
  crack_length_mm: number | null
  crack_width_mm: number | null
  crack_area_mm2: number | null
  overlay_url: string | null
  image_url: string | null
}

export interface TicketRow {
  ticket_number: number
  status: string
  scheduled_for: string | null
  created_at: string
  resolved_at: string | null
  assignee: Engineer | null
  detection: TicketDetection | null
}

export interface TicketCounts {
  open: number
  inProgress: number
  resolved: number
}

export const PAGE_SIZE = 25

export function useMaintenance() {
  const [rows, setRows] = useState<TicketRow[]>([])
  const [total, setTotal] = useState(0)
  const [counts, setCounts] = useState<TicketCounts>({ open: 0, inProgress: 0, resolved: 0 })
  const [page, setPage] = useState(0)
  const [statusFilter, setStatusFilter] = useState('')
  const [assigneeFilter, setAssigneeFilter] = useState('')
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
      if (assigneeFilter) params.set('assignee_id', assigneeFilter)

      const data = await api.get<{
        count: number
        counts: { open: number; in_progress: number; resolved: number }
        results: TicketRow[]
      }>(`/api/tickets/?${params}`)

      setRows(data.results)
      setTotal(data.count)
      setCounts({
        open: data.counts.open,
        inProgress: data.counts.in_progress,
        resolved: data.counts.resolved,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load tickets')
    } finally {
      setLoading(false)
    }
  }, [page, statusFilter, assigneeFilter, refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const interval = setInterval(() => setRefreshKey(k => k + 1), 10000)
    return () => clearInterval(interval)
  }, [])

  const updateStatus = useCallback(async (ticketNumber: number, newStatus: string) => {
    const patch: Record<string, string> = { status: newStatus }
    if (newStatus === 'resolved') patch.resolved_at = new Date().toISOString()
    await api.patch(`/api/tickets/${ticketNumber}/`, patch)
    setRefreshKey(k => k + 1)
  }, [])

  const reassign = useCallback(async (ticketNumber: number, assigneeId: string | null) => {
    await api.patch(`/api/tickets/${ticketNumber}/`, { assignee_id: assigneeId })
    setRefreshKey(k => k + 1)
  }, [])

  return {
    rows, total, counts, page, setPage,
    statusFilter, setStatusFilter,
    assigneeFilter, setAssigneeFilter,
    loading, error,
    engineers,
    updateStatus, reassign,
  }
}
