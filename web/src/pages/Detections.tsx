import { useEffect, useRef, useState } from 'react'
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ImageOff,
  Loader2,
  X,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { useDetections, PAGE_SIZE, type DetectionRow, type DetectionTicket, type Engineer } from '@/hooks/useDetections'

// ── color maps ────────────────────────────────────────────────────────────────

const detStatusClass: Record<string, string> = {
  unreviewed: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  reviewed: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  flagged: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300',
  closed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
}

const ticketStatusClass: Record<string, string> = {
  open: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  in_progress: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  resolved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
}

// ── helpers ───────────────────────────────────────────────────────────────────

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
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function mm(v: number | null, dec = 1) {
  return v != null ? `${v.toFixed(dec)} mm` : '—'
}

function fmtTicket(n: number) {
  return `TKT-${n}`
}

function activeTicket(tickets: DetectionTicket[]): DetectionTicket | null {
  return (
    tickets.find(t => t.status === 'open' || t.status === 'in_progress') ??
    tickets[tickets.length - 1] ??
    null
  )
}

// ── filter select ─────────────────────────────────────────────────────────────

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="whitespace-nowrap text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="h-8 rounded-md border bg-background px-2.5 py-0 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      >
        <option value="">All</option>
        {options.map(o => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

// ── detail drawer ─────────────────────────────────────────────────────────────

function DetectionDrawer({
  detection,
  engineers,
  onClose,
  onCreateTicket,
  onMarkFixed,
}: {
  detection: DetectionRow | null
  engineers: Engineer[]
  onClose: () => void
  onCreateTicket: (detectionId: string, assigneeId: string) => Promise<void>
  onMarkFixed: (ticketNumber: number) => Promise<unknown>
}) {
  const overlayUrl = detection?.overlay_url ?? null
  const imgLoading = false
  const [imgReady, setImgReady] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setImgReady(false) }, [overlayUrl])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false)
      }
    }
    if (pickerOpen) document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [pickerOpen])

  if (!detection) return null

  const ticket = activeTicket(detection.tickets ?? [])
  const hasOpenTicket = !!ticket && ticket.status !== 'resolved'

  async function handlePick(assigneeId: string) {
    setPickerOpen(false)
    setCreating(true)
    try {
      await onCreateTicket(detection!.id, assigneeId)
    } finally {
      setCreating(false)
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l bg-background shadow-xl sm:w-[480px]">
        {/* Header */}
        <div className="flex items-start justify-between border-b px-6 py-4">
          <div>
            <p className="text-xs text-muted-foreground">Detection</p>
            <p className="mt-0.5 font-semibold">{fmtDate(detection.captured_at)}</p>
            <p className="text-sm text-muted-foreground">{fmtTime(detection.captured_at)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-6 overflow-y-auto p-6">
          {/* Overlay image */}
          <div
            className="relative overflow-hidden rounded-lg bg-muted/40"
            style={{ minHeight: '200px' }}
          >
            {(imgLoading || (!!overlayUrl && !imgReady)) && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/40 backdrop-blur-sm">
                <Loader2 className="h-6 w-6 animate-spin text-white" />
                <span className="text-xs font-medium text-white">Loading image…</span>
              </div>
            )}
            {overlayUrl ? (
              <img
                key={overlayUrl}
                src={overlayUrl}
                alt="Crack overlay"
                onLoad={() => setImgReady(true)}
                className={cn(
                  'w-full object-contain transition-opacity duration-300',
                  imgReady ? 'opacity-100' : 'opacity-0',
                )}
              />
            ) : !imgLoading ? (
              <div className="flex h-48 flex-col items-center justify-center gap-2 text-muted-foreground">
                <ImageOff className="h-7 w-7 opacity-40" />
                <span className="text-xs">No image available</span>
              </div>
            ) : null}
          </div>

          {/* Status chips */}
          <div className="flex items-center gap-2">
            <Chip label={detection.status} map={detStatusClass} />
          </div>

          {/* Measurements */}
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Measurements
            </p>
            <div className="grid grid-cols-3 gap-3 rounded-lg bg-muted/40 p-3">
              <div>
                <p className="text-xs text-muted-foreground">Length</p>
                <p className="mt-0.5 font-semibold tabular-nums">
                  {mm(detection.crack_length_mm)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Width</p>
                <p className="mt-0.5 font-semibold tabular-nums">
                  {mm(detection.crack_width_mm)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Area</p>
                <p className="mt-0.5 font-semibold tabular-nums">
                  {detection.crack_area_mm2 != null
                    ? `${detection.crack_area_mm2.toFixed(1)} mm²`
                    : '—'}
                </p>
              </div>
            </div>
          </div>

          {/* Location */}
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Location
            </p>
            <p className="font-mono text-sm">
              {fmtCoords(detection.lat, detection.lng)}
            </p>
          </div>

          {/* Ticket */}
          <div>
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Maintenance Ticket
            </p>

            {hasOpenTicket ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm font-semibold">
                    {fmtTicket(ticket!.ticket_number)}
                  </span>
                  {ticket!.assignee && (
                    <div className="flex items-center gap-2">
                      <Avatar
                        code={ticket!.assignee.code}
                        name={ticket!.assignee.name}
                      />
                      <span className="text-sm">{ticket!.assignee.name}</span>
                    </div>
                  )}
                  <Chip label={ticket!.status} map={ticketStatusClass} />
                </div>
                <button
                  type="button"
                  onClick={() => onMarkFixed(ticket!.ticket_number)}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Mark as fixed
                </button>
              </div>
            ) : ticket?.status === 'resolved' ? (
              <span className="flex items-center gap-1.5 text-sm text-emerald-600">
                <CheckCircle2 className="h-4 w-4" />
                Resolved — {fmtTicket(ticket.ticket_number)}
              </span>
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
                  <div className="absolute left-0 top-full z-10 mt-1.5 w-48 rounded-lg border bg-popover shadow-lg">
                    <p className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
                      Assign to engineer
                    </p>
                    <ul className="py-1">
                      {engineers.length === 0 ? (
                        <li className="px-3 py-2 text-xs text-muted-foreground">
                          No engineers found
                        </li>
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
        </div>
      </div>
    </>
  )
}

// ── skeleton rows ─────────────────────────────────────────────────────────────

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 10 }).map((_, i) => (
        <TableRow key={i}>
          {Array.from({ length: 6 }).map((_, j) => (
            <TableCell key={j}>
              <Skeleton className="h-4 w-full" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  )
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function Detections() {
  const {
    rows,
    total,
    page,
    setPage,
    statusFilter,
    setStatusFilter,
    loading,
    error,
    engineers,
    createTicket,
    markFixed,
  } = useDetections()

  const [selected, setSelected] = useState<DetectionRow | null>(null)

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const hasFilters = !!statusFilter

  return (
    <>
      <div className="flex flex-col gap-4">
        {/* Header */}
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Detections</h2>
          {!loading && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {total.toLocaleString()} detection{total !== 1 ? 's' : ''} total
            </p>
          )}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4">
          <FilterSelect
            label="Status"
            value={statusFilter}
            onChange={v => {
              setStatusFilter(v)
              setPage(0)
            }}
            options={[
              { value: 'unreviewed', label: 'Unreviewed' },
              { value: 'reviewed', label: 'Reviewed' },
              { value: 'flagged', label: 'Flagged' },
              { value: 'closed', label: 'Closed' },
            ]}
          />
          {hasFilters && (
            <button
              type="button"
              onClick={() => {
                setStatusFilter('')
                setPage(0)
              }}
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Clear filters
            </button>
          )}
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Table */}
        <Card>
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Detected</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Length</TableHead>
                <TableHead>Width</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Ticket</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <SkeletonRows />
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-12 text-center text-sm text-muted-foreground"
                  >
                    No detections found
                    {hasFilters ? ' matching these filters' : ''}.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map(row => {
                  const ticket = activeTicket(row.tickets ?? [])
                  return (
                    <TableRow
                      key={row.id}
                      className="cursor-pointer"
                      onClick={() => setSelected(row)}
                    >
                      <TableCell>
                        <p className="text-sm tabular-nums">{fmtDate(row.captured_at)}</p>
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {fmtTime(row.captured_at)}
                        </p>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs">
                          {fmtCoords(row.lat, row.lng)}
                        </span>
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {mm(row.crack_length_mm)}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {mm(row.crack_width_mm)}
                      </TableCell>
                      <TableCell>
                        <Chip label={row.status} map={detStatusClass} />
                      </TableCell>
                      <TableCell>
                        {ticket ? (
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-semibold">
                              {fmtTicket(ticket.ticket_number)}
                            </span>
                            <Chip label={ticket.status} map={ticketStatusClass} />
                          </div>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
          </div>
        </Card>

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-between text-sm">
            <p className="text-muted-foreground">
              Page {page + 1} of {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page === 0}
                onClick={() => setPage(p => p - 1)}
                className="flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted/50 disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </button>
              <button
                type="button"
                disabled={page >= totalPages - 1}
                onClick={() => setPage(p => p + 1)}
                className="flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted/50 disabled:opacity-40"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail drawer */}
      {selected && (
        <DetectionDrawer
          detection={selected}
          engineers={engineers}
          onClose={() => setSelected(null)}
          onCreateTicket={async (detId, assigneeId) => {
            await createTicket(detId, assigneeId)
            setSelected(null)
          }}
          onMarkFixed={async ticketNumber => {
            await markFixed(ticketNumber)
            setSelected(null)
          }}
        />
      )}
    </>
  )
}
