import { useState } from 'react'
import { NavLink, Link } from 'react-router-dom'
import {
  LayoutDashboard,
  ScanSearch,
  MapPin,
  Wrench,
  FileBarChart,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth'
import { useTheme } from '@/lib/theme-context'
import logoLight from '@/assets/crackmonitor-logo.svg'
import logoDark from '@/assets/crackmonitor-logo-dark.svg'

const mainNav = [
  { to: '/overview', label: 'Home', icon: LayoutDashboard },
  { to: '/detections', label: 'Detections', icon: ScanSearch },
  { to: '/map', label: 'Map', icon: MapPin },
  { to: '/maintenance', label: 'Maintenance', icon: Wrench },
  { to: '/reports', label: 'Reports', icon: FileBarChart },
]

function NavItem({
  to,
  label,
  icon: Icon,
  collapsed,
}: {
  to: string
  label: string
  icon: React.ElementType
  collapsed: boolean
}) {
  return (
    <NavLink
      to={to}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        cn(
          'flex items-center rounded-md text-sm font-medium transition-colors',
          collapsed ? 'justify-center p-2' : 'gap-3 px-3 py-2',
          isActive
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
        )
      }
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed && label}
    </NavLink>
  )
}

export default function Sidebar() {
  const { user, signOut } = useAuth()
  const { theme } = useTheme()
  const [collapsed, setCollapsed] = useState(false)

  const displayName =
    (user?.user_metadata?.name as string | undefined) ??
    user?.email?.split('@')[0] ??
    'Engineer'

  const initial = displayName[0].toUpperCase()
  const logo = theme === 'dark' ? logoDark : logoLight

  return (
    <aside
      className={cn(
        'relative flex shrink-0 flex-col border-r bg-card transition-[width] duration-200',
        collapsed ? 'w-14' : 'w-60',
      )}
    >
      {/* Brand */}
      <div className={cn('flex h-16 items-center border-b', collapsed ? 'justify-center px-2' : 'px-5')}>
        <Link to="/overview" className="flex items-center">
          {collapsed ? (
            <img src="/crackmonitor-icon.svg" alt="CrackMonitor" className="h-8 w-8" />
          ) : (
            <img src={logo} alt="CrackMonitor" className="h-9" />
          )}
        </Link>
      </div>

      {/* Collapse toggle */}
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="absolute -right-3 top-[1.125rem] z-10 flex h-6 w-6 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
      </button>

      {/* Main navigation */}
      <nav className="flex flex-1 flex-col gap-0.5 p-3">
        {mainNav.map((item) => (
          <NavItem key={item.to} {...item} collapsed={collapsed} />
        ))}
      </nav>

      {/* Bottom: settings + user */}
      <div className="border-t p-3">
        <NavItem to="/settings" label="Settings" icon={Settings} collapsed={collapsed} />

        <div
          className={cn(
            'mt-1 flex items-center rounded-md py-2',
            collapsed ? 'justify-center px-0' : 'gap-3 px-3',
          )}
        >
          {(user?.user_metadata?.avatar_url as string | undefined) ? (
            <img
              src={user!.user_metadata.avatar_url as string}
              alt={displayName}
              className="h-8 w-8 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div
              title={collapsed ? displayName : undefined}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
            >
              {initial}
            </div>
          )}
          {!collapsed && (
            <>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{displayName}</p>
                <p className="truncate text-xs text-muted-foreground">{user?.email ?? ''}</p>
              </div>
              <button
                type="button"
                onClick={signOut}
                title="Sign out"
                className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </>
          )}
        </div>

        {collapsed && (
          <button
            type="button"
            onClick={signOut}
            title="Sign out"
            className="mt-1 flex w-full items-center justify-center rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <LogOut className="h-4 w-4" />
          </button>
        )}
      </div>
    </aside>
  )
}
