import { ChangeEvent, ElementType, FormEvent, ReactNode, useEffect, useRef, useState } from 'react'
import { Camera, Check, Copy, Loader2, Moon, Plus, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { applyTheme, getStoredTheme, type Theme } from '@/lib/theme'

// ── crypto helpers ────────────────────────────────────────────────────────────

async function sha256hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

function generateToken(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// ── small helpers ─────────────────────────────────────────────────────────────

function fmtLastSeen(iso: string | null): string {
  if (!iso) return 'Never'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function StatusLine({
  status,
  error,
}: {
  status: 'idle' | 'saved' | 'error'
  error: string
}) {
  if (status === 'saved')
    return <p className="text-sm text-emerald-600">Saved successfully.</p>
  if (status === 'error')
    return <p className="text-sm text-destructive">{error}</p>
  return null
}

// ── section wrapper ───────────────────────────────────────────────────────────

function Section({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <div className="border-t pt-6 pb-8">
      <div className="mb-5">
        <h3 className="text-base font-semibold">{title}</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  )
}

// ── profile ───────────────────────────────────────────────────────────────────

function AvatarEditor({
  url,
  initial,
  uploading,
  onFile,
}: {
  url: string | null
  initial: string
  uploading: boolean
  onFile: (file: File) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) onFile(file)
    e.target.value = ''
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="group relative h-20 w-20 overflow-hidden rounded-full border-2 border-border focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {url ? (
          <img src={url} alt="Profile" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-primary text-2xl font-bold text-primary-foreground">
            {initial}
          </div>
        )}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 bg-black/50 opacity-0 transition-opacity group-hover:opacity-100 group-disabled:opacity-0">
          {uploading ? (
            <Loader2 className="h-5 w-5 animate-spin text-white" />
          ) : (
            <>
              <Camera className="h-5 w-5 text-white" />
              <span className="text-[10px] font-medium text-white">Change</span>
            </>
          )}
        </div>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleChange}
      />
    </div>
  )
}

function ProfileSection() {
  const { user } = useAuth()
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [hasProfile, setHasProfile] = useState(false)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [statusMsg, setStatusMsg] = useState('')
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarError, setAvatarError] = useState('')

  const initial = name ? name[0].toUpperCase() : (user?.email?.[0].toUpperCase() ?? 'U')

  useEffect(() => {
    if (!user) return
    const metaAvatar = user.user_metadata?.avatar_url as string | null
    if (metaAvatar) setAvatarUrl(metaAvatar)

    supabase
      .from('engineers')
      .select('name, code, avatar_url')
      .eq('auth_user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setHasProfile(true)
          setName(data.name ?? '')
          type Eng = { code?: string; avatar_url?: string }
          const d = data as unknown as Eng
          setCode(d.code ?? '')
          if (d.avatar_url) setAvatarUrl(d.avatar_url)
        }
        setLoading(false)
      })
  }, [user])

  async function handleAvatarUpload(file: File) {
    if (!user) return
    if (file.size > 5 * 1024 * 1024) {
      setAvatarError('Image must be under 5 MB.')
      return
    }
    setAvatarUploading(true)
    setAvatarError('')
    const { error } = await supabase.storage
      .from('avatars')
      .upload(user.id, file, { upsert: true, contentType: file.type })
    if (error) {
      setAvatarError(error.message)
      setAvatarUploading(false)
      return
    }
    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(user.id)
    const baseUrl = urlData.publicUrl
    setAvatarUrl(`${baseUrl}?v=${Date.now()}`)
    await Promise.all([
      supabase.auth.updateUser({ data: { avatar_url: baseUrl } }),
      supabase.from('engineers').update({ avatar_url: baseUrl }).eq('auth_user_id', user.id),
    ])
    setAvatarUploading(false)
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!user) return
    setSaving(true)
    setStatus('idle')

    const payload = { name: name.trim(), code: code.trim() || null }

    const [dbResult] = await Promise.all([
      hasProfile
        ? supabase.from('engineers').update(payload).eq('auth_user_id', user.id)
        : supabase.from('engineers').insert({
            ...payload,
            email: user.email ?? '',
            auth_user_id: user.id,
          }),
      supabase.auth.updateUser({ data: { name: name.trim() } }),
    ])

    if (dbResult.error) {
      setStatusMsg(dbResult.error.message)
      setStatus('error')
    } else {
      setHasProfile(true)
      setStatus('saved')
      setTimeout(() => setStatus('idle'), 3000)
    }
    setSaving(false)
  }

  if (loading) return <Skeleton className="h-32 w-full" />

  return (
    <form onSubmit={handleSave} className="space-y-5">
      <div className="flex items-start gap-6">
        <div className="space-y-1.5 text-center">
          <AvatarEditor
            url={avatarUrl}
            initial={initial}
            uploading={avatarUploading}
            onFile={handleAvatarUpload}
          />
          <p className="text-xs text-muted-foreground">Click to change</p>
          {avatarError && (
            <p className="text-xs text-destructive">{avatarError}</p>
          )}
        </div>

        <div className="flex-1 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="prof-name">Display name</Label>
              <Input
                id="prof-name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Jane Smith"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prof-code">
                Code{' '}
                <span className="font-normal text-muted-foreground">(2–4 chars)</span>
              </Label>
              <Input
                id="prof-code"
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                placeholder="JS"
                maxLength={4}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input value={user?.email ?? ''} disabled />
            <p className="text-xs text-muted-foreground">
              Managed by Supabase Auth — change via the Auth dashboard.
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={saving || avatarUploading}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {hasProfile ? 'Save changes' : 'Create profile'}
        </Button>
        <StatusLine status={status} error={statusMsg} />
      </div>
    </form>
  )
}

// ── devices ───────────────────────────────────────────────────────────────────

interface Device {
  id: string
  name: string
  mm_per_px: number | null
  camera_height_mm: number | null
  last_seen: string | null
  created_at: string
}

function TokenCard({
  token,
  onDismiss,
}: {
  token: string
  onDismiss: () => void
}) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(token)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-900/20">
      <p className="mb-2 text-sm font-semibold text-amber-900 dark:text-amber-200">
        Save this token — it won't be shown again
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 break-all rounded bg-amber-100 px-2 py-1.5 font-mono text-xs dark:bg-amber-900/40">
          {token}
        </code>
        <button
          type="button"
          onClick={copy}
          className="flex shrink-0 items-center gap-1 rounded-md border border-amber-300 bg-amber-100 px-2.5 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-200 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
        Flash this token into your ESP32-CAM firmware as{' '}
        <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/40">DEVICE_TOKEN</code>.
      </p>
      <button
        type="button"
        onClick={onDismiss}
        className="mt-3 text-xs font-medium text-amber-700 hover:underline dark:text-amber-300"
      >
        I've saved it ✓
      </button>
    </div>
  )
}

function DevicesSection() {
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editMmPerPx, setEditMmPerPx] = useState('')
  const [editCamHeight, setEditCamHeight] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState('')

  const [showAdd, setShowAdd] = useState(false)
  const [addName, setAddName] = useState('')
  const [addToken, setAddToken] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')
  const [newToken, setNewToken] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('devices')
      .select('id, name, mm_per_px, camera_height_mm, last_seen, created_at')
      .order('created_at')
      .then(({ data }) => {
        setDevices((data as Device[]) ?? [])
        setLoading(false)
      })
  }, [refreshKey])

  function startEdit(d: Device) {
    setEditingId(d.id)
    setEditMmPerPx(d.mm_per_px?.toString() ?? '')
    setEditCamHeight(d.camera_height_mm?.toString() ?? '')
    setEditError('')
  }

  async function saveEdit() {
    if (!editingId) return
    setSavingEdit(true)
    setEditError('')
    const mmVal = parseFloat(editMmPerPx)
    const camVal = parseFloat(editCamHeight)
    const { error } = await supabase
      .from('devices')
      .update({
        mm_per_px: isNaN(mmVal) ? null : mmVal,
        camera_height_mm: isNaN(camVal) ? null : camVal,
      })
      .eq('id', editingId)
    if (error) {
      setEditError(error.message)
    } else {
      setEditingId(null)
      setRefreshKey(k => k + 1)
    }
    setSavingEdit(false)
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    setAdding(true)
    setAddError('')
    const plainToken = addToken.trim() || generateToken()
    try {
      const hash = await sha256hex(plainToken)
      const { error } = await supabase.from('devices').insert({
        name: addName.trim(),
        device_token_hash: hash,
      })
      if (error) {
        setAddError(error.message)
      } else {
        setNewToken(plainToken)
        setAddName('')
        setAddToken('')
        setShowAdd(false)
        setRefreshKey(k => k + 1)
      }
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add device')
    }
    setAdding(false)
  }

  if (loading) return <Skeleton className="h-24 w-full" />

  return (
    <div className="space-y-4">
      {newToken && (
        <TokenCard token={newToken} onDismiss={() => setNewToken(null)} />
      )}

      {devices.length > 0 && (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Name
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Last seen
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  mm / px
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Camera height
                </th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y">
              {devices.map(d => (
                <tr key={d.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{d.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {fmtLastSeen(d.last_seen)}
                  </td>
                  <td className="px-4 py-3">
                    {editingId === d.id ? (
                      <Input
                        value={editMmPerPx}
                        onChange={e => setEditMmPerPx(e.target.value)}
                        className="h-7 w-24 text-xs"
                        placeholder="0.05"
                        type="number"
                        step="0.001"
                        min="0"
                      />
                    ) : (
                      <span className="tabular-nums">
                        {d.mm_per_px != null ? d.mm_per_px : '—'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editingId === d.id ? (
                      <Input
                        value={editCamHeight}
                        onChange={e => setEditCamHeight(e.target.value)}
                        className="h-7 w-24 text-xs"
                        placeholder="200"
                        type="number"
                        step="1"
                        min="0"
                      />
                    ) : (
                      <span className="tabular-nums">
                        {d.camera_height_mm != null ? `${d.camera_height_mm} mm` : '—'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {editingId === d.id ? (
                      <div className="flex items-center justify-end gap-2">
                        {editError && (
                          <span className="text-xs text-destructive">{editError}</span>
                        )}
                        <button
                          type="button"
                          onClick={saveEdit}
                          disabled={savingEdit}
                          className="flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:opacity-50"
                        >
                          {savingEdit && <Loader2 className="h-3 w-3 animate-spin" />}
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startEdit(d)}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        Edit calibration
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {devices.length === 0 && !showAdd && (
        <p className="text-sm text-muted-foreground">No devices registered yet.</p>
      )}

      {showAdd ? (
        <form
          onSubmit={handleAdd}
          className="rounded-lg border bg-muted/20 p-4 space-y-3"
        >
          <p className="text-sm font-medium">Add device</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="dev-name">Device name</Label>
              <Input
                id="dev-name"
                value={addName}
                onChange={e => setAddName(e.target.value)}
                placeholder="Track-Cam-01"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dev-token">
                Token{' '}
                <span className="font-normal text-muted-foreground">
                  (leave blank to generate)
                </span>
              </Label>
              <div className="flex gap-2">
                <Input
                  id="dev-token"
                  value={addToken}
                  onChange={e => setAddToken(e.target.value)}
                  placeholder="Auto-generated"
                  className="font-mono text-xs"
                />
                <button
                  type="button"
                  onClick={() => setAddToken(generateToken())}
                  className="shrink-0 rounded-md border px-3 text-xs hover:bg-muted"
                >
                  Generate
                </button>
              </div>
            </div>
          </div>
          {addError && <p className="text-xs text-destructive">{addError}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={adding}>
              {adding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add device
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => { setShowAdd(false); setAddError('') }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          <Plus className="h-4 w-4" />
          Add device
        </button>
      )}
    </div>
  )
}

// ── team ──────────────────────────────────────────────────────────────────────

interface Engineer {
  id: string
  name: string
  email: string
  code: string | null
  auth_user_id: string | null
  created_at: string
}

function TeamSection() {
  const [engineers, setEngineers] = useState<Engineer[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  const [showAdd, setShowAdd] = useState(false)
  const [addName, setAddName] = useState('')
  const [addEmail, setAddEmail] = useState('')
  const [addCode, setAddCode] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')
  const [addStatus, setAddStatus] = useState<'idle' | 'saved'>('idle')

  useEffect(() => {
    supabase
      .from('engineers')
      .select('id, name, email, code, auth_user_id, created_at')
      .order('name')
      .then(({ data }) => {
        setEngineers((data as unknown as Engineer[]) ?? [])
        setLoading(false)
      })
  }, [refreshKey])

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    setAdding(true)
    setAddError('')
    const { error } = await supabase.from('engineers').insert({
      name: addName.trim(),
      email: addEmail.trim(),
      code: addCode.trim().toUpperCase() || null,
    })
    if (error) {
      setAddError(error.message)
    } else {
      setAddName('')
      setAddEmail('')
      setAddCode('')
      setShowAdd(false)
      setAddStatus('saved')
      setTimeout(() => setAddStatus('idle'), 3000)
      setRefreshKey(k => k + 1)
    }
    setAdding(false)
  }

  if (loading) return <Skeleton className="h-24 w-full" />

  return (
    <div className="space-y-4">
      {engineers.length > 0 && (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Name
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Email
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Code
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  App access
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {engineers.map(eng => (
                <tr key={eng.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{eng.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{eng.email}</td>
                  <td className="px-4 py-3">
                    {eng.code ? (
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-xs font-semibold text-primary">
                        {eng.code}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {eng.auth_user_id ? (
                      <span className="flex items-center gap-1 text-xs text-emerald-600">
                        <Check className="h-3.5 w-3.5" />
                        Active
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">No account</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {engineers.length === 0 && !showAdd && (
        <p className="text-sm text-muted-foreground">No engineers registered yet.</p>
      )}

      {addStatus === 'saved' && (
        <p className="text-sm text-emerald-600">Engineer added successfully.</p>
      )}

      {showAdd ? (
        <form
          onSubmit={handleAdd}
          className="rounded-lg border bg-muted/20 p-4 space-y-3"
        >
          <p className="text-sm font-medium">Add engineer</p>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="eng-name">Full name</Label>
              <Input
                id="eng-name"
                value={addName}
                onChange={e => setAddName(e.target.value)}
                placeholder="Jane Smith"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="eng-email">Email</Label>
              <Input
                id="eng-email"
                type="email"
                value={addEmail}
                onChange={e => setAddEmail(e.target.value)}
                placeholder="j.smith@railway.com"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="eng-code">
                Code{' '}
                <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="eng-code"
                value={addCode}
                onChange={e => setAddCode(e.target.value.toUpperCase())}
                placeholder="JS"
                maxLength={4}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            This creates an engineer record for ticket assignment. To grant app access,
            invite them via Supabase Auth.
          </p>
          {addError && <p className="text-xs text-destructive">{addError}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={adding}>
              {adding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add engineer
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => { setShowAdd(false); setAddError('') }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          <Plus className="h-4 w-4" />
          Add engineer
        </button>
      )}
    </div>
  )
}

// ── appearance ────────────────────────────────────────────────────────────────

function AppearanceSection() {
  const [theme, setTheme] = useState<Theme>(getStoredTheme)

  function handleTheme(next: Theme) {
    applyTheme(next)
    setTheme(next)
  }

  const options: { value: Theme; label: string; icon: ElementType }[] = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
  ]

  return (
    <div className="flex items-center justify-between rounded-lg border p-4">
      <div>
        <p className="text-sm font-medium">Theme</p>
        <p className="text-xs text-muted-foreground">Light or dark interface</p>
      </div>
      <div className="flex items-center gap-1 rounded-lg border bg-muted/40 p-1">
        {options.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            onClick={() => handleTheme(value)}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              theme === value
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function Settings() {
  return (
    <div className="max-w-3xl space-y-0">
      <div className="pb-6">
        <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Manage your profile, devices, and team
        </p>
      </div>

      <Section
        title="Profile"
        description="Your display name and short code shown in ticket assignments."
      >
        <ProfileSection />
      </Section>

      <Section
        title="Devices"
        description="Registered ESP32-CAM sensor nodes. Edit mm-per-pixel calibration to improve measurement accuracy."
      >
        <DevicesSection />
      </Section>

      <Section
        title="Team"
        description="Engineers available for ticket assignment. App access is granted separately via Supabase Auth."
      >
        <TeamSection />
      </Section>

      <Section
        title="Appearance"
        description="Customize the dashboard appearance."
      >
        <AppearanceSection />
      </Section>
    </div>
  )
}
