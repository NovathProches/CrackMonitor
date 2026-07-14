import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import {
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
  ZoomControl,
  useMap,
} from 'react-leaflet'
import { Loader2, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMapDetections, type MapDetection } from '@/hooks/useMapDetections'

const MARKER_COLOR = '#7F77DD'

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtCoords(lat: number, lng: number) {
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`
}

function mm(v: number | null, dec = 1) {
  return v != null ? `${v.toFixed(dec)} mm` : '—'
}

function fmtTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ── map controller: flies to selected detection ───────────────────────────────

function MapController({ selected }: { selected: MapDetection | null }) {
  const map = useMap()
  const prevId = useRef<string | null>(null)

  useEffect(() => {
    if (!selected || selected.id === prevId.current) return
    prevId.current = selected.id
    map.flyTo([selected.lat, selected.lng], Math.max(map.getZoom(), 15), {
      duration: 0.8,
    })
  }, [selected, map])

  return null
}

// ── bounds fitter: zooms to all detections on initial load ────────────────────

function BoundsFitter({ detections }: { detections: MapDetection[] }) {
  const map = useMap()
  const fitted = useRef(false)

  useEffect(() => {
    if (fitted.current || detections.length === 0) return
    fitted.current = true
    if (detections.length === 1) {
      map.setView([detections[0].lat, detections[0].lng], 15)
    } else {
      const bounds = L.latLngBounds(
        detections.map(d => [d.lat, d.lng] as [number, number]),
      )
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 })
    }
  }, [detections, map])

  return null
}

// ── detection list item ───────────────────────────────────────────────────────

function DetectionListItem({
  detection: d,
  selected,
  onClick,
  elRef,
}: {
  detection: MapDetection
  selected: boolean
  onClick: () => void
  elRef: (el: HTMLButtonElement | null) => void
}) {
  const ticket =
    d.tickets?.find(t => t.status !== 'resolved') ?? d.tickets?.[0] ?? null

  return (
    <button
      ref={elRef}
      type="button"
      onClick={onClick}
      className={cn(
        'w-full border-b px-4 py-3 text-left transition-colors hover:bg-muted/50',
        selected
          ? 'border-l-4 border-l-primary bg-primary/5'
          : 'border-l-4 border-l-transparent',
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          {fmtTimeAgo(d.captured_at)}
        </span>
      </div>
      <p className="mt-1 font-mono text-xs text-muted-foreground">
        {fmtCoords(d.lat, d.lng)}
      </p>
      <p className="mt-0.5 text-xs tabular-nums">
        {mm(d.crack_length_mm)} × {mm(d.crack_width_mm)}
      </p>
      {ticket && (
        <p className="mt-1 text-xs text-muted-foreground">
          TKT-{ticket.ticket_number} · {ticket.status.replace('_', ' ')}
        </p>
      )}
    </button>
  )
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function Map() {
  const { detections, loading, error } = useMapDetections()
  const [selected, setSelected] = useState<MapDetection | null>(null)
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  useEffect(() => {
    if (selected) {
      itemRefs.current[selected.id]?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      })
    }
  }, [selected])

  return (
    /* -m-6 escapes the layout's p-6, h = 100vh minus the h-16 topbar */
    <div className="-m-6 flex" style={{ height: 'calc(100vh - 4rem)' }}>
      {/* ── Left panel ── */}
      <div className="flex w-72 shrink-0 flex-col border-r bg-card">
        {/* Header */}
        <div className="border-b px-4 py-3">
          <p className="font-semibold">Detections</p>
          <p className="text-xs text-muted-foreground">
            {loading ? 'Loading…' : `${detections.length} with GPS`}
          </p>
        </div>

        {/* Detection list */}
        <div className="flex-1 overflow-y-auto">
          {error ? (
            <p className="p-4 text-xs text-destructive">{error}</p>
          ) : !loading && detections.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <MapPin className="h-6 w-6 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                No detections with GPS data
              </p>
            </div>
          ) : (
            detections.map(det => (
              <DetectionListItem
                key={det.id}
                detection={det}
                selected={selected?.id === det.id}
                onClick={() => setSelected(det)}
                elRef={el => {
                  itemRefs.current[det.id] = el
                }}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Map ── */}
      <div className="relative flex-1">
        <MapContainer
          center={[20, 0]}
          zoom={2}
          className="h-full w-full"
          zoomControl={false}
        >
          <ZoomControl position="bottomright" />
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          />

          <MapController selected={selected} />
          <BoundsFitter detections={detections} />

          {detections.map(det => {
            const isSelected = selected?.id === det.id
            const ticket =
              det.tickets?.find(t => t.status !== 'resolved') ??
              det.tickets?.[0] ??
              null

            return (
              <CircleMarker
                key={det.id}
                center={[det.lat, det.lng]}
                radius={isSelected ? 11 : 7}
                pathOptions={{
                  fillColor: MARKER_COLOR,
                  fillOpacity: isSelected ? 1 : 0.8,
                  color: isSelected ? '#fff' : 'rgba(255,255,255,0.5)',
                  weight: isSelected ? 2.5 : 1.5,
                }}
                eventHandlers={{ click: () => setSelected(det) }}
              >
                <Popup closeButton={false} offset={[0, -4]}>
                  <div style={{ minWidth: 180, padding: '2px 4px' }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        marginBottom: 6,
                      }}
                    >
                      <span style={{ fontSize: 11, color: '#64748b' }}>
                        {fmtTimeAgo(det.captured_at)}
                      </span>
                    </div>
                    <p
                      style={{
                        fontFamily: 'monospace',
                        fontSize: 12,
                        fontWeight: 500,
                        margin: 0,
                      }}
                    >
                      {fmtCoords(det.lat, det.lng)}
                    </p>
                    <p style={{ fontSize: 12, marginTop: 4, marginBottom: 0 }}>
                      {mm(det.crack_length_mm)} × {mm(det.crack_width_mm)}
                    </p>
                    {ticket && (
                      <p
                        style={{
                          fontSize: 11,
                          color: '#64748b',
                          marginTop: 6,
                          marginBottom: 0,
                        }}
                      >
                        TKT-{ticket.ticket_number} ·{' '}
                        {ticket.status.replace('_', ' ')}
                      </p>
                    )}
                  </div>
                </Popup>
              </CircleMarker>
            )
          })}
        </MapContainer>

        {/* Loading overlay */}
        {loading && (
          <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-background/60 backdrop-blur-sm">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}
      </div>
    </div>
  )
}
