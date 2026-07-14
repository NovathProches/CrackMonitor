import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

export type Period = 7 | 30 | 90

export interface DailyPoint {
  date: string
  label: string
  count: number
  avgWidth: number | null
}

export interface ReportSummary {
  totalDetections: number
  resolutionRate: number
  avgWidth: number | null
  mttr: string | null
  ticketCounts: { open: number; inProgress: number; resolved: number }
}

interface ReportsResponse {
  daily: Array<{ date: string; label: string; count: number; avg_width: number | null }>
  summary: {
    total_detections: number
    resolution_rate: number
    avg_width: number | null
    mttr: string | null
    ticket_counts: { open: number; in_progress: number; resolved: number }
  }
}

export function useReports(period: Period) {
  const [daily, setDaily] = useState<DailyPoint[]>([])
  const [summary, setSummary] = useState<ReportSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    api.get<ReportsResponse>(`/api/stats/reports/?period=${period}`)
      .then(data => {
        if (cancelled) return
        setDaily(data.daily.map(d => ({ ...d, avgWidth: d.avg_width })))
        setSummary({
          totalDetections: data.summary.total_detections,
          resolutionRate: data.summary.resolution_rate,
          avgWidth: data.summary.avg_width,
          mttr: data.summary.mttr,
          ticketCounts: {
            open: data.summary.ticket_counts.open,
            inProgress: data.summary.ticket_counts.in_progress,
            resolved: data.summary.ticket_counts.resolved,
          },
        })
      })
      .catch(e => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load report data')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [period])

  return { daily, summary, loading, error }
}
