import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { Receipt, MessageSquareText, FolderKanban, GraduationCap, BookOpen, LogOut, Menu, X, FlaskConical, Network, Globe, Sun, Moon, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/projetos', label: 'Projetos Financiados', icon: FolderKanban, color: 'text-yellow-600', bg: 'bg-yellow-50', activeBg: 'bg-yellow-100' },
  { to: '/orientacoes', label: 'Orientações', icon: GraduationCap, color: 'text-pink-600', bg: 'bg-pink-50', activeBg: 'bg-pink-100' },
  { to: '/nucleacao', label: 'Nucleação', icon: Network, color: 'text-orange-600', bg: 'bg-orange-50', activeBg: 'bg-orange-100' },
  { to: '/producao', label: 'Produção Científica', icon: BookOpen, color: 'text-teal-600', bg: 'bg-teal-50', activeBg: 'bg-teal-100' },
  { to: '/internacionalizacao', label: 'Internacionalização', icon: Globe, color: 'text-indigo-600', bg: 'bg-indigo-50', activeBg: 'bg-indigo-100' },
  { to: '/discursos', label: 'Discursos Qualificados', icon: MessageSquareText, color: 'text-green-600', bg: 'bg-green-50', activeBg: 'bg-green-100' },
  { to: '/prestacoes', label: 'Prestações de Contas', icon: Receipt, color: 'text-blue-600', bg: 'bg-blue-50', activeBg: 'bg-blue-100' },
]

function SidebarContent({ onClose, onCollapse }: { onClose?: () => void; onCollapse?: () => void }) {
  const { user, signOut, isDemoMode } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()

  const displayName = user?.displayName ?? user?.email ?? 'Usuário'
  const email = user?.email ?? ''
  const avatarUrl = user?.photoURL ?? ''
  const initials = displayName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()

  const handleLogout = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-5 border-b border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
            <FlaskConical className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="text-sm font-bold text-gray-900 dark:text-white">SucupiraLAB</div>
            <div className="text-xs text-gray-400 dark:text-gray-500">coLAB/UFF</div>
          </div>
        </div>
        {onClose ? (
          <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md text-gray-500 dark:text-gray-400">
            <X className="w-4 h-4" />
          </button>
        ) : onCollapse ? (
          <button onClick={onCollapse} title="Recolher sidebar" className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
            <PanelLeftClose className="w-4 h-4" />
          </button>
        ) : null}
      </div>

      {/* Demo badge */}
      {isDemoMode && (
        <div className="mx-4 mt-3 px-3 py-1.5 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700 rounded-lg">
          <p className="text-xs text-yellow-700 dark:text-yellow-400 font-medium">Modo Demonstração</p>
          <p className="text-xs text-yellow-600 dark:text-yellow-500">Configure o GitHub para persistência</p>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map(({ to, label, icon: Icon, color, activeBg }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onClose}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? cn(activeBg, color)
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100'
              )
            }
          >
            {({ isActive }) => (
              <>
                <div className={cn('w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0', isActive ? 'bg-white/70' : 'bg-gray-100 dark:bg-gray-800')}>
                  <Icon className={cn('w-4 h-4', isActive ? color : 'text-gray-500 dark:text-gray-400')} />
                </div>
                <span className="truncate">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User area */}
      <div className="px-3 py-3 border-t border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-3 px-2 py-2 rounded-lg">
          <Avatar className="h-8 w-8 flex-shrink-0">
            {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName} />}
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{displayName}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{email}</p>
          </div>
          <button
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <button
            onClick={handleLogout}
            title="Sair"
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

export function Sidebar({ collapsed = false, onToggle }: { collapsed?: boolean; onToggle?: () => void }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const { theme, toggleTheme } = useTheme()

  return (
    <>
      {/* Desktop sidebar */}
      <div className={`hidden lg:flex flex-shrink-0 h-screen sticky top-0 transition-all duration-200 ${collapsed ? 'w-12' : 'w-64'}`}>
        {collapsed ? (
          <div className="flex flex-col items-center w-full h-full bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 py-4 gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
              <FlaskConical className="w-4 h-4 text-white" />
            </div>
            <button
              onClick={onToggle}
              title="Expandir sidebar"
              className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <SidebarContent onCollapse={onToggle} />
        )}
      </div>

      {/* Mobile top navbar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 h-14 flex items-center justify-between px-4 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
            <FlaskConical className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-sm font-bold text-gray-900 dark:text-white">SucupiraLAB</span>
        </div>
        <button
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
          className="p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <>
          <div className="lg:hidden fixed inset-0 z-40 bg-black/40" onClick={() => setMobileOpen(false)} />
          <div className="lg:hidden fixed inset-y-0 left-0 z-50 w-64">
            <SidebarContent onClose={() => setMobileOpen(false)} />
          </div>
        </>
      )}
    </>
  )
}
