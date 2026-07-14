import { useEffect, useRef, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  ImageOff,
  Loader2,
  X,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import {
  useMaintenance,
  PAGE_SIZE,
  type Engineer,
  type TicketRow,
} from '@/hooks/useMaintenance'

// ── color maps ────────────────────────────────────────────────────────────────

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
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function mm(v: number | null, dec = 1) {
  return v != null ? `${v.toFixed(dec)} mm` : '—'
}

function fmtTicket(n: number) {
  return `TKT-${String(n).padStart(3, '0')}`
}

// ── stat cards ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  valueClass,
  loading,
}: {
  label: string
  value: number
  valueClass: string
  loading: boolean
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <ClipboardList className="h-4 w-4 text-muted-foreground/50" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <p className={cn('text-3xl font-bold tabular-nums', valueClass)}>{value}</p>
        )}
      </CardContent>
    </Card>
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

// ── engineer picker dropdown ──────────────────────────────────────────────────

function EngineerPicker({
  engineers,
  onPick,
  onClose,
}: {
  engineers: Engineer[]
  onPick: (id: string | null) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [onClose])

  return (
    <div
      ref={ref}
      className="absolute left-0 top-full z-20 mt-1.5 w-52 rounded-lg border bg-popover shadow-lg"
    >
      <p className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
        Assign to engineer
      </p>
      <ul className="py-1">
        <li>
          <button
            type="button"
            onClick={() => onPick(null)}
            className="w-full px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted/50"
          >
            Unassigned
          </button>
        </li>
        {engineers.map(eng => (
          <li key={eng.id}>
            <button
              type="button"
              onClick={() => onPick(eng.id)}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50"
            >
              <Avatar code={eng.code} name={eng.name} />
              {eng.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── ticket drawer ─────────────────────────────────────────────────────────────

function TicketDrawer({
  ticket,
  engineers,
  onClose,
  onUpdateStatus,
  onReassign,
}: {
  ticket: TicketRow | null
  engineers: Engineer[]
  onClose: () => void
  onUpdateStatus: (ticketNumber: number, status: string) => Promise<void>
  onReassign: (ticketNumber: number, assigneeId: string | null) => Promise<void>
}) {
  const overlayUrl = ticket?.detection?.overlay_url ?? null
  const imgLoading = false
  const [imgReady, setImgReady] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [actionBusy, setActionBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => { setImgReady(false) }, [overlayUrl])

  useEffect(() => {
    setActionError(null)
    setPickerOpen(false)
  }, [ticket?.ticket_number])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!ticket) return null

  const det = ticket.detection

  async function handleStatus(newStatus: string) {
    setActionBusy(newStatus)
    setActionError(null)
    try {
      await onUpdateStatus(ticket!.ticket_number, newStatus)
      onClose()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setActionBusy(null)
    }
  }

  async function handleReassign(assigneeId: string | null) {
    setPickerOpen(false)
    setActionBusy('reassign')
    setActionError(null)
    try {
      await onReassign(ticket!.ticket_number, assigneeId)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Reassign failed')
    } finally {
      setActionBusy(null)
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l bg-background shadow-xl sm:w-[500px]">
        {/* Header */}
        <div className="flex items-start justify-between border-b px-6 py-4">
          <div>
            <p className="text-xs text-muted-foreground">Work order</p>
            <div className="mt-0.5 flex items-center gap-2">
              <p className="font-mono text-lg font-bold">
                {fmtTicket(ticket.ticket_number)}
              </p>
              <Chip label={ticket.status} map={ticketStatusClass} />
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Opened {fmtDate(ticket.created_at)} at {fmtTime(ticket.created_at)}
            </p>
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
          {det && (
            <div
              className="relative overflow-hidden rounded-lg bg-muted/40"
              style={{ minHeight: '180px' }}
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
                <div className="flex h-44 flex-col items-center justify-center gap-2 text-muted-foreground">
                  <ImageOff className="h-7 w-7 opacity-40" />
                  <span className="text-xs">No image available</span>
                </div>
              ) : null}
            </div>
          )}

          {/* Detection info */}
          {det && (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Detection
              </p>
              <div className="space-y-2 rounded-lg bg-muted/40 p-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">
                    {fmtCoords(det.lat, det.lng)}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Length</p>
                    <p className="mt-0.5 text-sm font-semibold tabular-nums">
                      {mm(det.crack_length_mm)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Width</p>
                    <p className="mt-0.5 text-sm font-semibold tabular-nums">
                      {mm(det.crack_width_mm)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Area</p>
                    <p className="mt-0.5 text-sm font-semibold tabular-nums">
                      {det.crack_area_mm2 != null
                        ? `${det.crack_area_mm2.toFixed(1)} mm²`
                        : '—'}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Captured {fmtDate(det.captured_at)} at {fmtTime(det.captured_at)}
                </p>
              </div>
            </div>
          )}

          {/* Assigned to */}
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Assigned to
            </p>
            <div className="flex items-center justify-between">
              {ticket.assignee ? (
                <div className="flex items-center gap-2">
                  <Avatar code={ticket.assignee.code} name={ticket.assignee.name} />
                  <span className="text-sm font-medium">{ticket.assignee.name}</span>
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">Unassigned</span>
              )}

              {ticket.status !== 'resolved' && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setPickerOpen(o => !o)}
                    disabled={actionBusy === 'reassign'}
                    className="flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:opacity-50"
                  >
                    {actionBusy === 'reassign' && (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    )}
                    {ticket.assignee ? 'Reassign' : 'Assign'}
                  </button>
                  {pickerOpen && (
                    <EngineerPicker
                      engineers={engineers}
                      onPick={handleReassign}
                      onClose={() => setPickerOpen(false)}
                    />
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Dates */}
          {(ticket.scheduled_for || ticket.resolved_at) && (
            <div className="grid grid-cols-2 gap-4">
              {ticket.scheduled_for && (
                <div>
                  <p className="text-xs text-muted-foreground">Scheduled for</p>
                  <p className="mt-0.5 text-sm font-medium">
                    {fmtDate(ticket.scheduled_for)}
                  </p>
                </div>
              )}
              {ticket.resolved_at && (
                <div>
                  <p className="text-xs text-muted-foreground">Resolved at</p>
                  <p className="mt-0.5 text-sm font-medium">
                    {fmtDate(ticket.resolved_at)} {fmtTime(ticket.resolved_at)}
                  </p>
                </div>
              )}
            </div>
          )}

          {actionError && (
            <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {actionError}
            </p>
          )}
        </div>

        {/* Footer actions */}
        {ticket.status !== 'resolved' && (
          <div className="flex gap-2 border-t p-4">
            {ticket.status === 'open' && (
              <button
                type="button"
                disabled={!!actionBusy}
                onClick={() => handleStatus('in_progress')}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted/50 disabled:opacity-50"
              >
                {actionBusy === 'in_progress' && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                )}
                Start work
              </button>
            )}
            <button
              type="button"
              disabled={!!actionBusy}
              onClick={() => handleStatus('resolved')}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {actionBusy === 'resolved' && (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              )}
              Mark resolved
            </button>
          </div>
        )}
      </div>
    </>
  )
}

// ── skeleton rows ─────────────────────────────────────────────────────────────

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <TableRow key={i}>
          {Array.from({ length: 5 }).map((_, j) => (
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

export default function Maintenance() {
  const {
    rows, total, counts, page, setPage,
    statusFilter, setStatusFilter,
    assigneeFilter, setAssigneeFilter,
    loading, error,
    engineers,
    updateStatus, reassign,
  } = useMaintenance()

  const [selected, setSelected] = useState<TicketRow | null>(null)

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const hasFilters = !!statusFilter || !!assigneeFilter

  async function handleStatusFromRow(e: React.MouseEvent, ticketNumber: number, newStatus: string) {
    e.stopPropagation()
    try {
      await updateStatus(ticketNumber, newStatus)
    } catch {
      // errors shown in drawer only; row action silently fails — user can open drawer
    }
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        {/* Header */}
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Maintenance</h2>
          {!loading && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {total.toLocaleString()} ticket{total !== 1 ? 's' : ''} total
            </p>
          )}
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
          <StatCard
            label="Open"
            value={counts.open}
            valueClass="text-amber-600 dark:text-amber-400"
            loading={loading}
          />
          <StatCard
            label="In progress"
            value={counts.inProgress}
            valueClass="text-blue-600 dark:text-blue-400"
            loading={loading}
          />
          <StatCard
            label="Resolved"
            value={counts.resolved}
            valueClass="text-emerald-600 dark:text-emerald-400"
            loading={loading}
          />
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
              { value: 'open', label: 'Open' },
              { value: 'in_progress', label: 'In progress' },
              { value: 'resolved', label: 'Resolved' },
            ]}
          />
          <FilterSelect
            label="Assignee"
            value={assigneeFilter}
            onChange={v => {
              setAssigneeFilter(v)
              setPage(0)
            }}
            options={engineers.map(e => ({ value: e.id, label: e.name }))}
          />
          {hasFilters && (
            <button
              type="button"
              onClick={() => {
                setStatusFilter('')
                setAssigneeFilter('')
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
                <TableHead>Ticket</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Crack size</TableHead>
                <TableHead>Assigned to</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <SkeletonRows />
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-12 text-center text-sm text-muted-foreground"
                  >
                    No tickets found{hasFilters ? ' matching these filters' : ''}.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map(row => (
                  <TableRow
                    key={row.ticket_number}
                    className="cursor-pointer"
                    onClick={() => setSelected(row)}
                  >
                    <TableCell>
                      <p className="font-mono text-sm font-semibold">
                        {fmtTicket(row.ticket_number)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {fmtDate(row.created_at)}
                      </p>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs">
                        {fmtCoords(row.detection?.lat ?? null, row.detection?.lng ?? null)}
                      </span>
                    </TableCell>
                    <TableCell className="tabular-nums text-sm">
                      {row.detection
                        ? `${mm(row.detection.crack_length_mm)} × ${mm(row.detection.crack_width_mm)}`
                        : '—'}
                    </TableCell>
                    <TableCell>
                      {row.assignee ? (
                        <div className="flex items-center gap-2">
                          <Avatar code={row.assignee.code} name={row.assignee.name} />
                          <span className="text-sm">{row.assignee.name}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Unassigned</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Chip label={row.status} map={ticketStatusClass} />
                        {row.status === 'open' && (
                          <button
                            type="button"
                            onClick={e => handleStatusFromRow(e, row.ticket_number, 'in_progress')}
                            className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                          >
                            Start
                          </button>
                        )}
                        {row.status === 'in_progress' && (
                          <button
                            type="button"
                            onClick={e => handleStatusFromRow(e, row.ticket_number, 'resolved')}
                            className="text-xs font-medium text-emerald-600 hover:underline dark:text-emerald-400"
                          >
                            Resolve
                          </button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
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

      {selected && (
        <TicketDrawer
          ticket={selected}
          engineers={engineers}
          onClose={() => setSelected(null)}
          onUpdateStatus={async (num, status) => {
            await updateStatus(num, status)
            setSelected(null)
          }}
          onReassign={reassign}
        />
      )}
    </>
  )
}
