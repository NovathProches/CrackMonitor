import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export type Period = 7 | 30 | 90

export interface DailyPoint {
  date: string
  label: string
  count: number
  avgWidth: number | null
}

export interface SeverityPoint {
  name: string
  value: number
  color: string
}

export interface ReportSummary {
  totalDetections: number
  criticalHighCount: number
  resolutionRate: number
  avgWidth: number | null
  mttr: string | null
  ticketCounts: { open: number; inProgress: number; resolved: number }
}

const SEVERITY_COLOR: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#f59e0b',
  low: '#10b981',
}

export function useReports(period: Period) {
  const [daily, setDaily] = useState<DailyPoint[]>([])
  const [severity, setSeverity] = useState<SeverityPoint[]>([])
  const [summary, setSummary] = useState<ReportSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    async function load() {
      try {
        const since = new Date()
        since.setDate(since.getDate() - period)
        const sinceISO = since.toISOString()

        const [{ data: detData }, { data: ticketData }] = await Promise.all([
          supabase
            .from('detections')
            .select('captured_at, severity, crack_width_mm')
            .gte('captured_at', sinceISO),
          supabase
            .from('tickets')
            .select('status, created_at, resolved_at')
            .gte('created_at', sinceISO),
        ])

        if (cancelled) return

        type RawDet = { captured_at: string; severity: string | null; crack_width_mm: number | null }
        type RawTicket = { status: string; created_at: string; resolved_at: string | null }

        const dets = (detData ?? []) as RawDet[]
        const tickets = (ticketData ?? []) as RawTicket[]

        // ── daily series ────────────────────────────────────────────────────

        const dayMap = new Map<string, { count: number; widths: number[] }>()
        for (let i = period - 1; i >= 0; i--) {
          const d = new Date()
          d.setDate(d.getDate() - i)
          dayMap.set(d.toISOString().slice(0, 10), { count: 0, widths: [] })
        }
        for (const det of dets) {
          const key = det.captured_at.slice(0, 10)
          const entry = dayMap.get(key)
          if (entry) {
            entry.count++
            if (det.crack_width_mm != null) entry.widths.push(det.crack_width_mm)
          }
        }

        const dailyPoints: DailyPoint[] = []
        for (const [date, { count, widths }] of dayMap) {
          const d = new Date(date + 'T12:00:00')
          dailyPoints.push({
            date,
            label: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
            count,
            avgWidth:
              widths.length > 0
                ? Number((widths.reduce((a, b) => a + b, 0) / widths.length).toFixed(2))
                : null,
          })
        }

        // ── severity breakdown ───────────────────────────────────────────────

        const sevCounts: Record<string, number> = {
          critical: 0,
          high: 0,
          medium: 0,
          low: 0,
        }
        for (const det of dets) {
          if (det.severity && det.severity in sevCounts) sevCounts[det.severity]++
        }

        const severityPoints: SeverityPoint[] = Object.entries(sevCounts)
          .filter(([, v]) => v > 0)
          .map(([name, value]) => ({
            name: name.charAt(0).toUpperCase() + name.slice(1),
            value,
            color: SEVERITY_COLOR[name],
          }))

        // ── ticket metrics ───────────────────────────────────────────────────

        const ticketCounts = { open: 0, inProgress: 0, resolved: 0 }
        let resolvedCount = 0
        let totalMsToResolve = 0

        for (const t of tickets) {
          if (t.status === 'open') ticketCounts.open++
          else if (t.status === 'in_progress') ticketCounts.inProgress++
          else if (t.status === 'resolved') {
            ticketCounts.resolved++
            if (t.resolved_at) {
              resolvedCount++
              totalMsToResolve +=
                new Date(t.resolved_at).getTime() - new Date(t.created_at).getTime()
            }
          }
        }

        const totalTickets = tickets.length
        const resolutionRate =
          totalTickets > 0 ? Math.round((ticketCounts.resolved / totalTickets) * 100) : 0

        let mttr: string | null = null
        if (resolvedCount > 0) {
          const avgHrs = totalMsToResolve / resolvedCount / 3600000
          mttr = avgHrs < 24 ? `${Math.round(avgHrs)}h` : `${(avgHrs / 24).toFixed(1)}d`
        }

        // ── summary ──────────────────────────────────────────────────────────

        const allWidths = dets.flatMap(d =>
          d.crack_width_mm != null ? [d.crack_width_mm] : [],
        )
        const avgWidth =
          allWidths.length > 0
            ? Number(
                (allWidths.reduce((a, b) => a + b, 0) / allWidths.length).toFixed(2),
              )
            : null

        setDaily(dailyPoints)
        setSeverity(severityPoints)
        setSummary({
          totalDetections: dets.length,
          criticalHighCount: sevCounts.critical + sevCounts.high,
          resolutionRate,
          avgWidth,
          mttr,
          ticketCounts,
        })
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : 'Failed to load report data')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [period])

  return { daily, severity, summary, loading, error }
}
