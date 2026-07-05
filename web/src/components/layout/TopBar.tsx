import { Bell, Sun, Moon } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { useTheme } from '@/lib/theme-context'

const routeTitles: Record<string, string> = {
  '/overview': 'Home',
  '/detections': 'Detections',
  '/map': 'Map',
  '/maintenance': 'Maintenance',
  '/reports': 'Reports',
  '/settings': 'Settings',
}

export default function TopBar() {
  const { pathname } = useLocation()
  const title = routeTitles[pathname] ?? 'CrackMonitor'
  const { theme, toggleTheme } = useTheme()

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b bg-card px-6">
      <h1 className="text-xl font-semibold">{title}</h1>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={toggleTheme}
          className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>
        <button
          type="button"
          className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
        </button>
      </div>
    </header>
  )
}
