import { useState } from 'react'
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  Activity,
  CheckCircle2,
  ChevronDown,
  Clock,
  Download,
  Loader2,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { getToken } from '@/lib/api'
import { useReports, type Period, type ReportSummary } from '@/hooks/useReports'

// ── shared chart styles ───────────────────────────────────────────────────────

const TOOLTIP_STYLE: React.CSSProperties = {
  borderRadius: '0.5rem',
  border: '1px solid #e2e8f0',
  fontSize: 12,
  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
}

const AXIS_TICK = { fontSize: 11, fill: '#94a3b8' }
const GRID_COLOR = '#f1f5f9'
const PRIMARY = '#7F77DD'

// ── export ────────────────────────────────────────────────────────────────────

const EXPORT_FORMATS = [
  { id: 'csv', label: 'CSV (.csv)' },
  { id: 'pdf', label: 'PDF (.pdf)' },
] as const

type ExportFormat = (typeof EXPORT_FORMATS)[number]['id']

async function downloadReport(period: Period, fmt: ExportFormat) {
  const token = getToken()
  const resp = await fetch(`/api/stats/reports/export/?period=${period}&output=${fmt}`, {
    headers: token ? { Authorization: `Token ${token}` } : {},
  })
  if (!resp.ok) throw new Error(`Export failed (${resp.status})`)
  const blob = await resp.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `crack-report-${period}d.${fmt}`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function ExportButton({ period }: { period: Period }) {
  const [busy, setBusy] = useState(false)

  async function handle(fmt: ExportFormat) {
    setBusy(true)
    try {
      await downloadReport(period, fmt)
    } catch (e) {
      console.error('Export failed', e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <DropdownMenuPrimitive.Root>
      <DropdownMenuPrimitive.Trigger asChild>
        <button
          disabled={busy}
          className={cn(
            'flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-sm font-medium transition-colors',
            'hover:bg-accent hover:text-accent-foreground',
            busy && 'cursor-not-allowed opacity-60',
          )}
        >
          {busy
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <Download className="h-4 w-4" />}
          Export
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
      </DropdownMenuPrimitive.Trigger>

      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          align="end"
          sideOffset={4}
          className={cn(
            'z-50 min-w-[9rem] rounded-md border bg-popover p-1 text-popover-foreground shadow-md',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            'data-[side=bottom]:slide-in-from-top-2',
          )}
        >
          {EXPORT_FORMATS.map(({ id, label }) => (
            <DropdownMenuPrimitive.Item
              key={id}
              onSelect={() => handle(id)}
              className="flex cursor-pointer select-none items-center rounded-sm px-3 py-2 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              {label}
            </DropdownMenuPrimitive.Item>
          ))}
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  )
}

// ── period toggle ─────────────────────────────────────────────────────────────

function PeriodToggle({
  period,
  onChange,
}: {
  period: Period
  onChange: (p: Period) => void
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg border bg-muted/40 p-1">
      {([7, 30, 90] as Period[]).map(p => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          className={cn(
            'rounded-md px-3 py-1 text-sm font-medium transition-colors',
            period === p
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {p}d
        </button>
      ))}
    </div>
  )
}

// ── stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  iconClass,
  loading,
}: {
  label: string
  value: string | number | null
  sub?: string
  icon: React.ElementType
  iconClass: string
  loading: boolean
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className={cn('h-4 w-4', iconClass)} />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-9 w-24" />
        ) : (
          <>
            <p className="text-3xl font-bold tabular-nums">{value ?? '—'}</p>
            {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ── summary stats ─────────────────────────────────────────────────────────────

function SummaryCards({
  summary,
  loading,
  period,
}: {
  summary: ReportSummary | null
  loading: boolean
  period: Period
}) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <StatCard
        label="Total detections"
        value={summary?.totalDetections ?? null}
        sub={`last ${period} days`}
        icon={Activity}
        iconClass="text-primary"
        loading={loading}
      />
      <StatCard
        label="Resolution rate"
        value={summary ? `${summary.resolutionRate}%` : null}
        sub="tickets resolved"
        icon={CheckCircle2}
        iconClass="text-emerald-500"
        loading={loading}
      />
      <StatCard
        label="Avg crack width"
        value={summary?.avgWidth != null ? `${summary.avgWidth.toFixed(1)} mm` : null}
        sub="mean for period"
        icon={Clock}
        iconClass="text-blue-500"
        loading={loading}
      />
    </div>
  )
}

// ── detections area chart ─────────────────────────────────────────────────────

function DetectionsChart({
  data,
  period,
  loading,
}: {
  data: { label: string; count: number }[]
  period: Period
  loading: boolean
}) {
  const tickInterval = period <= 7 ? 0 : period <= 30 ? 4 : 9

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Detections per day</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-56 w-full" />
        ) : (
          <ResponsiveContainer width="100%" height={224}>
            <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
              <defs>
                <linearGradient id="detGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={PRIMARY} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={PRIMARY} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
              <XAxis
                dataKey="label"
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
                interval={tickInterval}
              />
              <YAxis
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(v) => [v, 'Detections']}
              />
              <Area
                type="monotone"
                dataKey="count"
                stroke={PRIMARY}
                strokeWidth={2}
                fill="url(#detGradient)"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}

// ── crack width line chart ────────────────────────────────────────────────────

function CrackWidthChart({
  data,
  period,
  loading,
}: {
  data: { label: string; avgWidth: number | null }[]
  period: Period
  loading: boolean
}) {
  const tickInterval = period <= 7 ? 0 : period <= 30 ? 4 : 9
  const hasData = data.some(d => d.avgWidth != null)

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Avg crack width trend</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-44 w-full" />
        ) : !hasData ? (
          <div className="flex h-44 items-center justify-center">
            <p className="text-sm text-muted-foreground">No measurement data in period</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={176}>
            <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
              <XAxis
                dataKey="label"
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
                interval={tickInterval}
              />
              <YAxis
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
                unit=" mm"
                width={48}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(v) => [v != null ? `${Number(v).toFixed(2)} mm` : '—', 'Avg width']}
              />
              <Line
                type="monotone"
                dataKey="avgWidth"
                stroke="#10b981"
                strokeWidth={2}
                dot={false}
                connectNulls
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}

// ── ticket pipeline ───────────────────────────────────────────────────────────

function TicketPipeline({
  counts,
  loading,
}: {
  counts: ReportSummary['ticketCounts'] | undefined
  loading: boolean
}) {
  const open = counts?.open ?? 0
  const inProgress = counts?.inProgress ?? 0
  const resolved = counts?.resolved ?? 0
  const total = open + inProgress + resolved

  const bars = [
    { label: 'Open', count: open, color: '#94a3b8' },
    { label: 'In progress', count: inProgress, color: '#3b82f6' },
    { label: 'Resolved', count: resolved, color: '#10b981' },
  ]

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Ticket pipeline</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-44 w-full" />
        ) : total === 0 ? (
          <div className="flex h-44 items-center justify-center">
            <p className="text-sm text-muted-foreground">No tickets in period</p>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Stacked bar */}
            <div className="flex h-3 w-full overflow-hidden rounded-full">
              {bars.map(b =>
                b.count > 0 ? (
                  <div
                    key={b.label}
                    style={{
                      width: `${(b.count / total) * 100}%`,
                      background: b.color,
                    }}
                  />
                ) : null,
              )}
            </div>

            {/* Row breakdown */}
            <div className="space-y-3">
              {bars.map(b => (
                <div key={b.label} className="flex items-center gap-3">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: b.color }}
                  />
                  <span className="flex-1 text-sm">{b.label}</span>
                  <div className="flex items-center gap-2.5">
                    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: total > 0 ? `${(b.count / total) * 100}%` : '0%',
                          background: b.color,
                        }}
                      />
                    </div>
                    <span className="w-8 text-right text-sm font-semibold tabular-nums">
                      {b.count}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Total callout */}
            <div className="rounded-lg bg-muted/40 px-3 py-2.5">
              <p className="text-xs text-muted-foreground">Total tickets</p>
              <p className="mt-0.5 text-lg font-bold tabular-nums">{total}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function Reports() {
  const [period, setPeriod] = useState<Period>(30)
  const { daily, summary, loading, error } = useReports(period)

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Reports</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Analytics for the last {period} days
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodToggle period={period} onChange={setPeriod} />
          <ExportButton period={period} />
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Stat cards */}
      <SummaryCards summary={summary} loading={loading} period={period} />

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DetectionsChart data={daily} period={period} loading={loading} />
        <CrackWidthChart data={daily} period={period} loading={loading} />
      </div>

      {/* Ticket pipeline */}
      <TicketPipeline counts={summary?.ticketCounts} loading={loading} />
    </div>
  )
}
