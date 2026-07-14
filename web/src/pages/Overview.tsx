import { Activity, CheckCircle2, ClipboardList, ImageOff, Loader2, RefreshCw } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  useDashboard,
  type Engineer,
  type LatestDetection,
  type QueueTicket,
  type RecentDetection,
} from '@/hooks/useDashboard'


const statusClass: Record<string, string> = {
  open: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  in_progress: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  resolved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
}

// ── helpers ──────────────────────────────────────────────────────────────────

function Chip({ label, map }: { label: string; map: Record<string, string> }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize',
        map[label] ?? 'bg-slate-100 text-slate-600',
      )}
    >
      {label.replace('_', ' ')}
    </span>
  )
}

function Avatar({ code, name }: { code: string | null; name: string }) {
  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
      {code ?? name[0].toUpperCase()}
    </div>
  )
}

function fmtCoords(lat: number | null, lng: number | null) {
  if (lat == null || lng == null) return '—'
  return `${lat.toFixed(3)}, ${lng.toFixed(3)}`
}

function fmtTime(iso: string) {
  const d = new Date(iso)
  const isToday = d.toDateString() === new Date().toDateString()
  const t = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  return isToday ? `today ${t}` : `${d.toLocaleDateString('en-GB', { dateStyle: 'short' })} ${t}`
}

function fmtTimeOnly(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function fmtTicket(n: number) {
  return `TKT-${n}`
}

function mm(v: number | null, decimals = 1) {
  return v != null ? `${v.toFixed(decimals)} mm` : '—'
}

// ── stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
  iconClass,
  loading,
  suffix = '',
  href,
}: {
  label: string
  value: number | undefined
  icon: React.ElementType
  iconClass: string
  loading: boolean
  suffix?: string
  href?: string
}) {
  const inner = (
    <Card className={cn(href && 'transition-shadow hover:shadow-md cursor-pointer')}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className={cn('h-4 w-4', iconClass)} />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-9 w-20" />
        ) : (
          <p className="text-3xl font-bold tabular-nums">
            {value ?? 0}{suffix}
          </p>
        )}
      </CardContent>
    </Card>
  )

  return href ? <Link to={href}>{inner}</Link> : inner
}

// ── latest detection card ────────────────────────────────────────────────────

function LatestDetectionCard({
  detection,
  rawImageUrl,
  overlayUrl,
  imageLoading,
  engineers,
  onCreateTicket,
  onMarkFixed,
}: {
  detection: LatestDetection
  rawImageUrl: string | null
  overlayUrl: string | null
  imageLoading: boolean
  engineers: Engineer[]
  onCreateTicket: (assigneeId: string) => Promise<void>
  onMarkFixed: () => void
}) {
  const [overlayReady, setOverlayReady] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)

  useEffect(() => { setOverlayReady(false) }, [overlayUrl])
  const [creating, setCreating] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)
  const ticket = detection.tickets?.[0] ?? null
  const engineer = ticket?.assignee ?? null
  const overlaySpinner = imageLoading || (!!overlayUrl && !overlayReady)

  // Close picker when clicking outside
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false)
      }
    }
    if (pickerOpen) document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [pickerOpen])

  async function handlePick(assigneeId: string) {
    setPickerOpen(false)
    setCreating(true)
    try { await onCreateTicket(assigneeId) } finally { setCreating(false) }
  }

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Latest detection</p>
            <p className="mt-0.5 text-sm font-semibold tracking-tight">
              <span className="text-muted-foreground font-normal">Location: </span>
              <span className="font-mono">{fmtCoords(detection.lat, detection.lng)}</span>
            </p>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">{fmtTime(detection.captured_at)}</span>
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-5">
        {/* Dual image panel: captured (instant) + resolved (with spinner) */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Captured image — shown as soon as URL is ready */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Captured</p>
            <div className="relative overflow-hidden rounded-lg bg-muted/40 min-h-44">
              {imageLoading ? (
                <Skeleton className="h-44 w-full" />
              ) : rawImageUrl ? (
                <img
                  key={rawImageUrl}
                  src={rawImageUrl}
                  alt="Captured image"
                  className="w-full object-contain"
                />
              ) : (
                <div className="flex h-44 flex-col items-center justify-center gap-2 text-muted-foreground">
                  <ImageOff className="h-6 w-6 opacity-40" />
                  <span className="text-xs">No image</span>
                </div>
              )}
            </div>
          </div>

          {/* Resolved image — spinner while analysing */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Analysis</p>
            <div className="relative overflow-hidden rounded-lg bg-muted/40 min-h-44">
              {overlaySpinner && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/50 backdrop-blur-sm rounded-lg">
                  <Loader2 className="h-7 w-7 animate-spin text-white" />
                  <span className="text-xs font-medium text-white">Analysing…</span>
                </div>
              )}
              {overlayUrl ? (
                <img
                  key={overlayUrl}
                  src={overlayUrl}
                  alt="Crack analysis"
                  onLoad={() => setOverlayReady(true)}
                  className={cn(
                    'w-full object-contain transition-opacity duration-300',
                    overlayReady ? 'opacity-100' : 'opacity-0',
                  )}
                />
              ) : !imageLoading ? (
                <div className="flex h-44 flex-col items-center justify-center gap-2 text-muted-foreground">
                  <ImageOff className="h-6 w-6 opacity-40" />
                  <span className="text-xs">No analysis</span>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* Measurement summary */}
        <div>
          <p className="text-xs text-muted-foreground">Crack width</p>
          <p className="mt-0.5 text-2xl font-bold tabular-nums">{mm(detection.crack_width_mm)}</p>
        </div>

        {/* Detail grid */}
        <div className="grid grid-cols-3 gap-3 rounded-lg bg-muted/40 p-3">
          <div>
            <p className="text-xs text-muted-foreground">Length</p>
            <p className="mt-0.5 font-semibold tabular-nums">{mm(detection.crack_length_mm)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Max width</p>
            <p className="mt-0.5 font-semibold tabular-nums">{mm(detection.crack_width_mm)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Area</p>
            <p className="mt-0.5 font-semibold tabular-nums">
              {detection.crack_area_mm2 != null ? `${detection.crack_area_mm2.toFixed(1)} mm²` : '—'}
            </p>
          </div>
        </div>

        {/* Ticket row */}
        <div className="flex items-center justify-between border-t pt-4">
          {ticket && ticket.status !== 'resolved' ? (
            <>
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm font-semibold">{fmtTicket(ticket.ticket_number)}</span>
                {engineer && (
                  <div className="flex items-center gap-2">
                    <Avatar code={engineer.code} name={engineer.name} />
                    <span className="text-sm">{engineer.name}</span>
                  </div>
                )}
              </div>
              {ticket.status !== 'resolved' ? (
                <button
                  type="button"
                  onClick={onMarkFixed}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Mark as fixed
                </button>
              ) : (
                <span className="flex items-center gap-1 text-xs text-emerald-600">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Resolved
                </span>
              )}
            </>
          ) : (
            <div ref={pickerRef} className="relative">
              <button
                type="button"
                onClick={() => setPickerOpen(o => !o)}
                disabled={creating}
                className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {creating && <Loader2 className="h-3 w-3 animate-spin" />}
                {creating ? 'Creating…' : 'Create ticket'}
              </button>

              {pickerOpen && (
                <div className="absolute bottom-full right-0 mb-1.5 w-48 rounded-lg border bg-popover shadow-lg">
                  <p className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
                    Assign to engineer
                  </p>
                  <ul className="py-1">
                    {engineers.length === 0 ? (
                      <li className="px-3 py-2 text-xs text-muted-foreground">No engineers found</li>
                    ) : (
                      engineers.map(eng => (
                        <li key={eng.id}>
                          <button
                            type="button"
                            onClick={() => handlePick(eng.id)}
                            className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50"
                          >
                            <Avatar code={eng.code} name={eng.name} />
                            {eng.name}
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ── recent detections list ───────────────────────────────────────────────────

function RecentDetectionsList({ detections }: { detections: RecentDetection[] }) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Recent detections</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 p-0">
        {detections.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">No recent detections.</p>
        ) : (
          <ul className="divide-y">
            {detections.map((d) => (
              <li key={d.id} className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors">
                <div className="min-w-0">
                  <p className="text-sm">
                    <span className="text-muted-foreground text-xs">Location: </span>
                    <span className="font-mono">{fmtCoords(d.lat, d.lng)}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                    {mm(d.crack_length_mm)} long · {mm(d.crack_width_mm)} wide
                  </p>
                </div>
                <div className="ml-3 flex shrink-0 flex-col items-end gap-1">
                  <span className="text-xs tabular-nums text-muted-foreground">{fmtTimeOnly(d.captured_at)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

// ── maintenance queue ────────────────────────────────────────────────────────

function MaintenanceQueue({
  tickets,
  counts,
}: {
  tickets: QueueTicket[]
  counts: { open: number; inProgress: number; resolved: number }
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">Maintenance Tickets</CardTitle>
          <div className="flex gap-4 text-sm text-muted-foreground">
            <span>
              Open <strong className="text-foreground">{counts.open}</strong>
            </span>
            <span>
              In progress <strong className="text-foreground">{counts.inProgress}</strong>
            </span>
            <span>
              Resolved <strong className="text-foreground">{counts.resolved}</strong>
            </span>
          </div>
        </div>
      </CardHeader>

      {tickets.length === 0 ? (
        <CardContent>
          <p className="py-4 text-center text-sm text-muted-foreground">No open or in-progress tickets.</p>
        </CardContent>
      ) : (
        <ul className="divide-y">
          {tickets.map((t) => (
            <li
              key={t.ticket_number}
              className="flex items-center justify-between px-6 py-3 hover:bg-muted/30 transition-colors"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-semibold">{fmtTicket(t.ticket_number)}</span>
                  {t.detection && (
                    <span className="text-xs text-muted-foreground">
                      · Location: <span className="font-mono">{fmtCoords(t.detection.lat, t.detection.lng)}</span>
                    </span>
                  )}
                </div>
                {t.detection && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {mm(t.detection.crack_length_mm)}
                  </p>
                )}
              </div>

              <div className="ml-4 flex shrink-0 items-center gap-3">
                {t.assignee && (
                  <div className="flex items-center gap-1.5">
                    <Avatar code={t.assignee.code} name={t.assignee.name} />
                    <span className="hidden text-xs sm:block">{t.assignee.name}</span>
                  </div>
                )}
                <Chip label={t.status} map={statusClass} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

// ── page ─────────────────────────────────────────────────────────────────────

export default function Overview() {
  const { stats, latest, recent, queue, engineers, loading, imageLoading, rawImageUrl, overlayUrl, error, createTicket, markFixed } = useDashboard()

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <StatCard
          label="Total cracks detected"
          value={stats?.totalDetections}
          icon={Activity}
          iconClass="text-primary"
          loading={loading}
          href="/detections"
        />
        <StatCard
          label="Open tickets"
          value={stats?.openTickets}
          icon={ClipboardList}
          iconClass="text-amber-500"
          loading={loading}
          href="/maintenance"
        />
        <StatCard
          label="Resolved Cracks"
          value={stats?.resolvedCracks}
          icon={CheckCircle2}
          iconClass="text-emerald-500"
          loading={loading}
          href="/maintenance"
        />
      </div>

      {/* Latest detection — full width */}
      {loading ? (
        <Skeleton className="h-72 w-full" />
      ) : latest ? (
        <LatestDetectionCard
          detection={latest}
          rawImageUrl={rawImageUrl}
          overlayUrl={overlayUrl}
          imageLoading={imageLoading}
          engineers={engineers}
          onCreateTicket={(assigneeId) => createTicket(latest.id, assigneeId)}
          onMarkFixed={() => {
            const t = latest.tickets?.[0]
            if (t) markFixed(t.ticket_number)
          }}
        />
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <RefreshCw className="h-7 w-7 text-muted-foreground/40" />
            <p className="text-sm font-medium">No detections yet</p>
            <p className="text-xs text-muted-foreground">Deploy a device to start capturing crack data.</p>
          </CardContent>
        </Card>
      )}

      {/* Recent detections — below the image viewer */}
      {!loading && recent.length > 0 && (
        <RecentDetectionsList detections={recent} />
      )}

      {/* Maintenance queue */}
      {(loading || queue.length > 0 || (stats?.queueCounts.open ?? 0) + (stats?.queueCounts.inProgress ?? 0) > 0) && (
        loading ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <MaintenanceQueue tickets={queue} counts={stats!.queueCounts} />
        )
      )}
    </div>
  )
}
