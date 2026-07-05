import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

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
  measurement_source: string | null
  image_path: string | null
  overlay_path: string | null
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

export function useDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [latest, setLatest] = useState<LatestDetection | null>(null)
  const [recent, setRecent] = useState<RecentDetection[]>([])
  const [queue, setQueue] = useState<QueueTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [imageLoading, setImageLoading] = useState(false)
  const [overlayUrl, setOverlayUrl] = useState<string | null>(null)
  const [engineers, setEngineers] = useState<Engineer[]>([])
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        setLoading(true)

        const [
          { count: totalDetections },
          { count: resolvedCracks },
          { count: openTickets },
          { count: inProgressTickets },
          { count: totalTickets },
          { data: latestData },
          { data: recentData },
          { data: queueData },
          { data: engineersData },
        ] = await Promise.all([
          supabase.from('detections').select('*', { count: 'exact', head: true }),
          supabase.from('tickets').select('*', { count: 'exact', head: true }).eq('status', 'resolved'),
          supabase.from('tickets').select('*', { count: 'exact', head: true }).eq('status', 'open'),
          supabase.from('tickets').select('*', { count: 'exact', head: true }).eq('status', 'in_progress'),
          supabase.from('tickets').select('*', { count: 'exact', head: true }),
          supabase
            .from('detections')
            .select(`
              id, captured_at, lat, lng, crack_length_mm, crack_width_mm, crack_area_mm2,
              status, measurement_source, image_path, overlay_path,
              tickets!detection_id(ticket_number, status, assignee:engineers!assignee_id(name, code))
            `)
            .order('captured_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('detections')
            .select('id, captured_at, lat, lng, crack_length_mm, crack_width_mm')
            .order('captured_at', { ascending: false })
            .range(1, 5),
          supabase
            .from('tickets')
            .select(`
              ticket_number, status,
              detection:detections!detection_id(lat, lng, crack_length_mm),
              assignee:engineers!assignee_id(name, code)
            `)
            .in('status', ['open', 'in_progress'])
            .order('ticket_number', { ascending: false })
            .limit(10),
          supabase.from('engineers').select('id, name, code').order('name'),
        ])

        if (cancelled) return

        const tot = totalTickets ?? 0
        const res = resolvedCracks ?? 0

        setStats({
          totalDetections: totalDetections ?? 0,
          resolvedCracks: res,
          openTickets: openTickets ?? 0,
          resolvedPct: tot > 0 ? Math.round((res / tot) * 100) : 0,
          queueCounts: {
            open: openTickets ?? 0,
            inProgress: inProgressTickets ?? 0,
            resolved: res,
          },
        })

        const det = (latestData as LatestDetection | null) ?? null
        setLatest(det)
        setRecent((recentData as RecentDetection[]) ?? [])
        setQueue((queueData as unknown as QueueTicket[]) ?? [])
        setEngineers((engineersData as Engineer[]) ?? [])

        // Fetch signed URL for the annotated overlay image
        if (det?.overlay_path) {
          setImageLoading(true)
          setOverlayUrl(null)
          const { data: signed } = await supabase.storage
            .from('detections')
            .createSignedUrl(det.overlay_path, 3600)
          if (!cancelled) {
            setOverlayUrl(signed?.signedUrl ?? null)
            setImageLoading(false)
          }
        } else {
          setOverlayUrl(null)
          setImageLoading(false)
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load dashboard')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [refreshKey])

  // Re-fetch automatically whenever the ESP32CAM pushes a new detection
  useEffect(() => {
    const channel = supabase
      .channel('detections-live')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'detections' },
        () => setRefreshKey(k => k + 1),
      )
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

  return { stats, latest, recent, queue, engineers, loading, imageLoading, overlayUrl, error, createTicket, markFixed }
}
