import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'

export interface Engineer {
  id: string
  name: string
  code: string | null
}

export interface DashboardStats {
  totalDetections: number
  resolvedCracks: number
  openTickets: number
  resolvedPct: number
  queueCounts: { open: number; inProgress: number; resolved: number }
}

export interface LatestDetection {
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
  tickets: Array<{
    ticket_number: number
    status: string
    assignee: { name: string; code: string | null } | null
  }>
}

export interface RecentDetection {
  id: string
  captured_at: string
  lat: number | null
  lng: number | null
  crack_length_mm: number | null
  crack_width_mm: number | null
}

export interface QueueTicket {
  ticket_number: number
  status: string
  detection: {
    lat: number | null
    lng: number | null
    crack_length_mm: number | null
  } | null
  assignee: { name: string; code: string | null } | null
}

interface DashboardResponse {
  total_detections: number
  open_tickets: number
  in_progress_tickets: number
  resolved_tickets: number
  total_tickets: number
  latest_detection: LatestDetection | null
  recent_detections: RecentDetection[]
  queue_tickets: QueueTicket[]
  engineers: Engineer[]
}

export function useDashboard() {
  const [data, setData] = useState<DashboardResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const result = await api.get<DashboardResponse>('/api/stats/dashboard/')
      setData(result)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const interval = setInterval(load, 8000)
    return () => clearInterval(interval)
  }, [load])

  const createTicket = useCallback(async (detectionId: string, assigneeId: string) => {
    await api.post('/api/tickets/', { detection_id: detectionId, assignee_id: assigneeId })
    load()
  }, [load])

  const markFixed = useCallback(async (ticketNumber: number) => {
    await api.patch(`/api/tickets/${ticketNumber}/`, {
      status: 'resolved',
      resolved_at: new Date().toISOString(),
    })
    load()
  }, [load])

  const stats: DashboardStats | null = data
    ? {
        totalDetections: data.total_detections,
        openTickets: data.open_tickets,
        resolvedCracks: data.resolved_tickets,
        resolvedPct:
          data.total_tickets > 0
            ? Math.round((data.resolved_tickets / data.total_tickets) * 100)
            : 0,
        queueCounts: {
          open: data.open_tickets,
          inProgress: data.in_progress_tickets,
          resolved: data.resolved_tickets,
        },
      }
    : null

  return {
    stats,
    latest: data?.latest_detection ?? null,
    recent: data?.recent_detections ?? [],
    queue: data?.queue_tickets ?? [],
    engineers: data?.engineers ?? [],
    loading,
    imageLoading: false,
    rawImageUrl: data?.latest_detection?.image_url ?? null,
    overlayUrl: data?.latest_detection?.overlay_url ?? null,
    error,
    createTicket,
    markFixed,
  }
}
