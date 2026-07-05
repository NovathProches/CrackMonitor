import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export interface MapDetection {
  id: string
  captured_at: string
  lat: number
  lng: number
  crack_length_mm: number | null
  crack_width_mm: number | null
  severity: string | null
  status: string
  overlay_path: string | null
  tickets: Array<{ ticket_number: number; status: string }>
}

export function useMapDetections() {
  const [detections, setDetections] = useState<MapDetection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [severityFilter, setSeverityFilter] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      try {
        let query = supabase
          .from('detections')
          .select(
            `id, captured_at, lat, lng,
             crack_length_mm, crack_width_mm,
             severity, status, overlay_path,
             tickets!detection_id(ticket_number, status)`,
          )
          .not('lat', 'is', null)
          .not('lng', 'is', null)
          .order('captured_at', { ascending: false })
          .limit(500)

        if (severityFilter) query = query.eq('severity', severityFilter)

        const { data, error: err } = await query
        if (cancelled) return
        if (err) throw err

        setDetections((data as unknown as MapDetection[]) ?? [])
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load map data')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [severityFilter, refreshKey])

  useEffect(() => {
    const channel = supabase
      .channel('map-detections-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'detections' }, () => {
        setRefreshKey(k => k + 1)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  return { detections, loading, error, severityFilter, setSeverityFilter }
}
