
import React from 'react';
import { LayoutDashboard, Network, Settings, BarChart3, Database, ArrowRightLeft, LogOut, Layers, Server, GitGraph, Crown } from 'lucide-react';
import { User } from '../types';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
  user: User | null;
  onLogout: () => void;
}

const NavItem = ({ icon: Icon, label, active, onClick, highlight }: { icon: any, label: string, active: boolean, onClick: () => void, highlight?: boolean }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors duration-200 rounded-r-full mr-2
      ${active 
        ? 'bg-blue-600/10 text-blue-400 border-l-4 border-blue-500' 
        : highlight 
            ? 'text-amber-400 hover:text-amber-200 hover:bg-slate-800 border-l-4 border-transparent'
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800 border-l-4 border-transparent'
      }`}
  >
    <Icon size={18} className={highlight ? "text-amber-400" : ""} />
    {label}
  </button>
);

export const Layout: React.FC<LayoutProps> = ({ children, activeTab, onTabChange, user, onLogout }) => {
  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col">
        <div className="p-6">
          <div className="flex items-center gap-2 text-blue-500 mb-1">
            <Layers className="h-6 w-6" strokeWidth={2.5} />
            <span className="text-xl font-bold tracking-tight text-white">ResidencyFlow</span>
          </div>
          <p className="text-xs text-slate-500 pl-8">Universal Data Pipeline</p>
        </div>

        <nav className="flex-1 space-y-1 mt-4 overflow-y-auto custom-scrollbar">
          {/* SUPER ADMIN SECTION */}
          {user?.role === 'SuperAdmin' && (
            <div className="mb-6 bg-slate-950/50 pb-2 border-b border-slate-800">
               <div className="px-4 py-2 text-xs font-bold text-amber-500 uppercase flex items-center gap-1">
                  <Crown size={12} /> Super Admin
               </div>
               <NavItem icon={Crown} label="Platform Admin" active={activeTab === 'super-admin'} onClick={() => onTabChange('super-admin')} highlight />
            </div>
          )}

          <NavItem icon={LayoutDashboard} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => onTabChange('dashboard')} />
          
          <div className="px-4 py-2 mt-4 text-xs font-bold text-slate-600 uppercase">Connect</div>
          <NavItem icon={Database} label="Sources" active={activeTab === 'sources'} onClick={() => onTabChange('sources')} />
          <NavItem icon={ArrowRightLeft} label="Destinations" active={activeTab === 'destinations'} onClick={() => onTabChange('destinations')} />
          
          <div className="px-4 py-2 mt-4 text-xs font-bold text-slate-600 uppercase">Orchestrate</div>
          <NavItem icon={Network} label="Pipelines" active={activeTab === 'pipelines'} onClick={() => onTabChange('pipelines')} />
          <NavItem icon={GitGraph} label="Observability" active={activeTab === 'observability'} onClick={() => onTabChange('observability')} />
          
          <div className="px-4 py-2 mt-4 text-xs font-bold text-slate-600 uppercase">System</div>
          <NavItem icon={BarChart3} label="Insights (AI)" active={activeTab === 'insights'} onClick={() => onTabChange('insights')} />
          <NavItem icon={Server} label="Backend Engine" active={activeTab === 'backend'} onClick={() => onTabChange('backend')} />
          <NavItem icon={Settings} label="Settings" active={activeTab === 'settings'} onClick={() => onTabChange('settings')} />
        </nav>

        <div className="p-4 border-t border-slate-800">
           <button 
             onClick={onLogout}
             className="flex items-center gap-2 text-xs text-slate-500 hover:text-red-400 w-full px-2 py-2 mb-2 transition-colors"
           >
             <LogOut size={14} /> Sign Out
           </button>
          <div className="bg-slate-800/50 rounded-lg p-3">
            <p className="text-xs text-slate-400 uppercase font-bold mb-2">Workspace</p>
            <div className="flex items-center gap-2 text-xs text-emerald-400">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
              Orchestrator: Online
            </div>
             <div className="flex items-center gap-2 text-xs text-blue-400 mt-1">
              <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
              Workers: 4/4 Idle
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto bg-slate-950">
        <header className="h-16 border-b border-slate-800 flex items-center justify-between px-8 bg-slate-950/80 backdrop-blur sticky top-0 z-10">
          <h1 className="text-lg font-semibold text-white capitalize">{activeTab.replace('-', ' ')}</h1>
          <div className="flex items-center gap-4">
            <span className="px-3 py-1 rounded-full bg-slate-800 text-xs text-slate-300 border border-slate-700">
              {user?.companyName || 'Guest'}
            </span>
             <span className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center text-xs font-bold text-white uppercase">
              {user?.name.substring(0,2) || 'GU'}
            </span>
          </div>
        </header>
        <div className="p-8">
          {children}
        </div>
      </main>
    </div>
  );
};
