import { useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
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
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatCard
        label="Total detections"
        value={summary?.totalDetections ?? null}
        sub={`last ${period} days`}
        icon={Activity}
        iconClass="text-primary"
        loading={loading}
      />
      <StatCard
        label="Critical + high"
        value={summary?.criticalHighCount ?? null}
        sub="at-risk detections"
        icon={AlertTriangle}
        iconClass="text-orange-500"
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
    <Card className="lg:col-span-2">
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

// ── severity donut ────────────────────────────────────────────────────────────

function SeverityChart({
  data,
  loading,
}: {
  data: { name: string; value: number; color: string }[]
  loading: boolean
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Severity breakdown</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="mx-auto h-56 w-56 rounded-full" />
        ) : data.length === 0 ? (
          <div className="flex h-56 items-center justify-center">
            <p className="text-sm text-muted-foreground">No detections in period</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={224}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="45%"
                innerRadius={52}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
              >
                {data.map((entry, i) => (
                  <Cell key={i} fill={entry.color} strokeWidth={0} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(v, name) => [v, name]}
              />
              <Legend
                iconType="circle"
                iconSize={8}
                formatter={value => (
                  <span style={{ fontSize: 12, color: '#64748b' }}>{value}</span>
                )}
              />
            </PieChart>
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
    <Card className="lg:col-span-2">
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

            {/* MTTR callout */}
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
  const { daily, severity, summary, loading, error } = useReports(period)

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Reports</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Analytics for the last {period} days
          </p>
        </div>
        <PeriodToggle period={period} onChange={setPeriod} />
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Stat cards */}
      <SummaryCards summary={summary} loading={loading} period={period} />

      {/* Chart row 1: area chart + severity donut */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <DetectionsChart data={daily} period={period} loading={loading} />
        <SeverityChart data={severity} loading={loading} />
      </div>

      {/* Chart row 2: crack width trend + ticket pipeline */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <CrackWidthChart data={daily} period={period} loading={loading} />
        <TicketPipeline counts={summary?.ticketCounts} loading={loading} />
      </div>
    </div>
  )
}
