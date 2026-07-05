import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

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
  severity: string | null
  overlay_path: string | null
  image_path: string | null
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
    supabase
      .from('engineers')
      .select('id, name, code')
      .order('name')
      .then(({ data }) => setEngineers((data as Engineer[]) ?? []))
  }, [])

  useEffect(() => {
    Promise.all([
      supabase.from('tickets').select('*', { count: 'exact', head: true }).eq('status', 'open'),
      supabase.from('tickets').select('*', { count: 'exact', head: true }).eq('status', 'in_progress'),
      supabase.from('tickets').select('*', { count: 'exact', head: true }).eq('status', 'resolved'),
    ]).then(([{ count: open }, { count: inP }, { count: res }]) => {
      setCounts({ open: open ?? 0, inProgress: inP ?? 0, resolved: res ?? 0 })
    })
  }, [refreshKey])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      try {
        let query = supabase
          .from('tickets')
          .select(
            `ticket_number, status, scheduled_for, created_at, resolved_at,
             assignee:engineers!assignee_id(id, name, code),
             detection:detections!detection_id(
               id, captured_at, lat, lng,
               crack_length_mm, crack_width_mm, crack_area_mm2,
               severity, overlay_path, image_path
             )`,
            { count: 'exact' },
          )
          .order('created_at', { ascending: false })
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

        if (statusFilter) query = query.eq('status', statusFilter)
        if (assigneeFilter) query = query.eq('assignee_id', assigneeFilter)

        const { data, count, error: err } = await query
        if (cancelled) return
        if (err) throw err

        setRows((data as unknown as TicketRow[]) ?? [])
        setTotal(count ?? 0)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load tickets')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [page, statusFilter, assigneeFilter, refreshKey])

  useEffect(() => {
    const channel = supabase
      .channel('tickets-list-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, () => {
        setRefreshKey(k => k + 1)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const updateStatus = useCallback(async (ticketNumber: number, newStatus: string) => {
    const patch: Record<string, string> = { status: newStatus }
    if (newStatus === 'resolved') patch.resolved_at = new Date().toISOString()
    const { error } = await supabase
      .from('tickets')
      .update(patch)
      .eq('ticket_number', ticketNumber)
    if (error) throw new Error(error.message)
    setRefreshKey(k => k + 1)
  }, [])

  const reassign = useCallback(async (ticketNumber: number, assigneeId: string | null) => {
    const { error } = await supabase
      .from('tickets')
      .update({ assignee_id: assigneeId })
      .eq('ticket_number', ticketNumber)
    if (error) throw new Error(error.message)
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
