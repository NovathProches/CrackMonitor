import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

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
  gps_accuracy_m: number | null
  crack_length_mm: number | null
  crack_width_mm: number | null
  crack_area_mm2: number | null
  severity: string | null
  status: string
  image_path: string | null
  overlay_path: string | null
  tickets: DetectionTicket[]
}

export const PAGE_SIZE = 25

export function useDetections() {
  const [rows, setRows] = useState<DetectionRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [severityFilter, setSeverityFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [engineers, setEngineers] = useState<Engineer[]>([])
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    supabase.from('engineers').select('id, name, code').order('name')
      .then(({ data }) => setEngineers((data as Engineer[]) ?? []))
  }, [])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      try {
        let query = supabase
          .from('detections')
          .select(
            `id, captured_at, lat, lng, gps_accuracy_m,
             crack_length_mm, crack_width_mm, crack_area_mm2,
             severity, status, image_path, overlay_path,
             tickets!detection_id(ticket_number, status, assignee:engineers!assignee_id(name, code))`,
            { count: 'exact' },
          )
          .order('captured_at', { ascending: false })
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

        if (severityFilter) query = query.eq('severity', severityFilter)
        if (statusFilter) query = query.eq('status', statusFilter)

        const { data, count, error: err } = await query

        if (cancelled) return
        if (err) throw err

        setRows((data as unknown as DetectionRow[]) ?? [])
        setTotal(count ?? 0)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load detections')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [page, severityFilter, statusFilter, refreshKey])

  useEffect(() => {
    const channel = supabase
      .channel('detections-list-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'detections' }, () => {
        setRefreshKey(k => k + 1)
        setPage(0)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const createTicket = useCallback(async (detectionId: string, assigneeId: string) => {
    const resp = await fetch(
      `${import.meta.env.VITE_CV_SERVICE_URL ?? 'http://localhost:8000'}/tickets`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ detection_id: detectionId, assignee_id: assigneeId }),
      },
    )
    if (!resp.ok) throw new Error(await resp.text())
    setRefreshKey(k => k + 1)
  }, [])

  const markFixed = useCallback(async (ticketNumber: number) => {
    const { error } = await supabase
      .from('tickets')
      .update({ status: 'resolved', resolved_at: new Date().toISOString() })
      .eq('ticket_number', ticketNumber)
    if (!error) setRefreshKey(k => k + 1)
    return error
  }, [])

  return {
    rows, total, page, setPage,
    severityFilter, setSeverityFilter,
    statusFilter, setStatusFilter,
    loading, error,
    engineers,
    createTicket, markFixed,
  }
}
