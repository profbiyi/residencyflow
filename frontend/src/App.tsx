
import React, { useState, useEffect } from 'react';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { PipelineWizard } from './components/PipelineWizard';
import { DataInsights } from './components/DataInsights';
import { DataLineage } from './components/DataLineage';
import { LandingPage } from './components/LandingPage';
import { Auth } from './components/Auth';
import { ConnectorManager } from './components/ConnectorManager';
import { BackendViewer } from './components/BackendViewer';
import { Settings } from './components/Settings';
import { SuperAdminDashboard } from './components/SuperAdminDashboard';
import { MOCK_PIPELINES, MOCK_SOURCES, MOCK_DESTINATIONS, MOCK_TEAM, MOCK_AUDIT_LOGS, MOCK_BILLING, ICON_MAP, SOURCE_TYPES, DESTINATION_TYPES, MOCK_USERS, MOCK_RUN_HISTORY, STATUS_STYLES, MOCK_ORGANIZATIONS } from './constants';
import { Pipeline, PipelineStatus, User, ConnectorInstance, TeamMember, AuditLog, UserRole, Organization, RunHistory } from './types';
import { ArrowLeft, Play, ArrowRight, Clock, CheckCircle, XCircle, Terminal, Download, Zap } from 'lucide-react';
import { api } from './services/api';

type ViewState = 'landing' | 'login' | 'register' | 'dashboard' | 'sources' | 'destinations' | 'pipelines' | 'observability' | 'insights' | 'settings' | 'pipeline-detail' | 'backend' | 'super-admin';

function App() {
  // Auth State
  const [user, setUser] = useState<User | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>(MOCK_ORGANIZATIONS);
  
  // Navigation State
  const [activeView, setActiveView] = useState<ViewState>('landing');
  const [showWizard, setShowWizard] = useState(false);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null);
  const [pipelineDetailTab, setPipelineDetailTab] = useState<'overview' | 'history'>('overview');
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [showToast, setShowToast] = useState<string | null>(null);

  // Global Data State
  const [pipelines, setPipelines] = useState<Pipeline[]>(api.system.isLive() ? [] : MOCK_PIPELINES);
  const [sources, setSources] = useState<ConnectorInstance[]>(api.system.isLive() ? [] : MOCK_SOURCES);
  const [destinations, setDestinations] = useState<ConnectorInstance[]>(api.system.isLive() ? [] : MOCK_DESTINATIONS);
  const [team, setTeam] = useState<TeamMember[]>(api.system.isLive() ? [] : MOCK_TEAM);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(api.system.isLive() ? [] : MOCK_AUDIT_LOGS);
  const [runHistory, setRunHistory] = useState<RunHistory[]>(api.system.isLive() ? [] : MOCK_RUN_HISTORY);
  
  // SESSION RESTORATION: Restore user from localStorage on mount
  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      try {
        const userProfile = JSON.parse(savedUser);
        setUser(userProfile);
        
        // Restore last view from sessionStorage
        const savedView = sessionStorage.getItem('activeView');
        if (savedView && savedView !== 'landing' && savedView !== 'login' && savedView !== 'register') {
          setActiveView(savedView as ViewState);
        } else if (userProfile.role === 'SuperAdmin') {
          setActiveView('super-admin');
        } else {
          setActiveView('dashboard');
        }
      } catch (e) {
        console.error('Failed to restore user session', e);
        localStorage.removeItem('user');
        localStorage.removeItem('token');
      }
    }
  }, []);
  
  // Save activeView to sessionStorage whenever it changes
  useEffect(() => {
    if (user && activeView !== 'landing' && activeView !== 'login' && activeView !== 'register') {
      sessionStorage.setItem('activeView', activeView);
    }
  }, [activeView, user]);
  
  // HYDRATION: If Live, load from backend
  useEffect(() => {
     if (api.system.isLive()) {
        const loadData = async () => {
           try {
              if (user?.role === 'SuperAdmin') {
                 const orgs = await api.admin.listOrganizations();
                 setOrganizations(orgs);
              }
              const [p, s, d] = await Promise.all([
                 api.pipelines.list(),
                 api.connectors.list('source'),
                 api.connectors.list('destination')
              ]);
              setPipelines(p);
              setSources(s);
              setDestinations(d);
           } catch (e) { console.error("Failed to hydrate", e); }
        };
        if (user) loadData();
     }
  }, [user]);

  // Derived State (Filtered by Tenant/Organization)
  const myPipelines = pipelines.filter(p => p.organizationId === user?.organizationId);
  const mySources = sources.filter(s => s.organizationId === user?.organizationId);
  const myDestinations = destinations.filter(d => d.organizationId === user?.organizationId);
  const myLogs = auditLogs.filter(l => l.organizationId === user?.organizationId);
  const myTeam = team.filter(t => t.organizationId === user?.organizationId);

  const logAction = (action: string, target: string) => {
    if (!user || !user.organizationId) return; // SuperAdmin doesn't log actions
    const newLog: AuditLog = {
      id: `log-${Date.now()}`,
      action,
      actor: user.email,
      target,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
      status: 'Success',
      organizationId: user.organizationId
    };
    setAuditLogs([newLog, ...auditLogs]);
  };

  const triggerToast = (msg: string) => {
    setShowToast(msg);
    setTimeout(() => setShowToast(null), 3000);
  };

  const downloadLogs = (runId: string, logs: string[], e: React.MouseEvent) => {
    e.stopPropagation();
    const content = logs.join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pipeline-run-${runId}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleManualRun = async (id: string) => {
     // UI Optimistic Update
     setPipelines(prev => prev.map(p => p.id === id ? { ...p, status: PipelineStatus.Running } : p));
     triggerToast("Job Submitted to Worker Pool");
     
     // Live API Call
     await api.pipelines.run(id);

     // Create history entry (Simulated if no live backend socket)
     const newRunId = `run-${Date.now()}`;
     const newHistoryEntry: RunHistory = {
        id: newRunId,
        pipelineId: id,
        status: 'Running',
        startTime: new Date().toISOString().replace('T', ' ').substring(0, 19),
        duration: '...',
        rows: 0,
        logs: ['[INFO] Job initialized via UI trigger', '[INFO] Allocating Polars worker...']
     };
     setRunHistory(prev => [newHistoryEntry, ...prev]);

     if (!api.system.isLive()) {
        setTimeout(() => {
            setPipelines(prev => prev.map(p => p.id === id ? { ...p, status: PipelineStatus.Completed, lastRun: 'Just now', rowsProcessed: p.rowsProcessed + 1400 } : p));
            setRunHistory(prev => prev.map(r => r.id === newRunId ? {
                ...r,
                status: 'Success',
                duration: '4s',
                rows: 1400,
                logs: [...r.logs, '[INFO] Connected to Source', '[INFO] Polars Transformation: PII Masking applied (Arrow Zero-Copy)', '[INFO] Loaded 1400 rows to Destination', '[SUCCESS] Pipeline Completed']
            } : r));
            triggerToast("Pipeline Sync Completed Successfully");
        }, 4000);
     }
  };

  const handleLoginAuth = async (email: string, pass: string): Promise<void> => {
    const userProfile = await api.auth.login(email, pass);
    setUser(userProfile);
    localStorage.setItem('user', JSON.stringify(userProfile));
    if (userProfile.role === 'SuperAdmin') {
        setActiveView('super-admin');
    } else {
        setActiveView('dashboard');
    }
  };

  const handleCreateOrganization = async (name: string, adminEmail: string, adminName: string, initialPass: string, plan: 'Starter' | 'Pro' | 'Enterprise') => {
    const newOrg = await api.admin.createOrganization({ name, adminEmail, adminName, password: initialPass, plan });
    setOrganizations([...organizations, newOrg]);
    triggerToast(`Tenant ${name} created successfully`);
  };

  const handleUpdatePlan = async (orgId: string, newPlan: 'Starter' | 'Pro' | 'Enterprise') => {
    await api.admin.updatePlan(orgId, newPlan);
    setOrganizations(organizations.map(org => org.id === orgId ? { ...org, plan: newPlan } : org));
    triggerToast(`Subscription updated to ${newPlan}`);
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setActiveView('landing');
  };

  const handleCreatePipeline = async (newPipeline: Pipeline) => {
    if (!user || !user.organizationId) return; // SuperAdmin can't create pipelines directly
    const p = { ...newPipeline, status: PipelineStatus.Running, organizationId: user.organizationId, createdBy: user.id };
    const created = await api.pipelines.create(p);
    setPipelines([created, ...pipelines]);
    logAction('Create Pipeline', newPipeline.name);
    setShowWizard(false);
    triggerToast("Pipeline Deployed & Started");
    setActiveView('pipelines'); // Stay on pipelines page
  };

  const handleAddConnector = async (c: ConnectorInstance, type: 'source' | 'destination') => {
    if (!user || !user.organizationId) return; // SuperAdmin can't create connectors directly
    const connector = { ...c, organizationId: user.organizationId, createdBy: user.id };
    const created = await api.connectors.create(connector);
    
    if (type === 'source') setSources([created, ...sources]);
    else setDestinations([created, ...destinations]);
    
    logAction(`Create ${type}`, c.name);
    triggerToast(`${c.name} saved successfully`);
  };

  const handleUpdateConnector = (c: ConnectorInstance, type: 'source' | 'destination') => {
    if (type === 'source') setSources(sources.map(item => item.id === c.id ? c : item));
    else setDestinations(destinations.map(item => item.id === c.id ? c : item));
    logAction(`Update ${type}`, c.name);
  };

  const handleDeleteConnector = async (id: string, type: 'source' | 'destination') => {
    await api.connectors.delete(id);
    if (type === 'source') setSources(sources.filter(item => item.id !== id));
    else setDestinations(destinations.filter(item => item.id !== id));
    logAction(`Delete ${type}`, id);
    triggerToast('Connector deleted');
  };

  const handleInviteMember = (email: string, role: string) => {
     if (!user) return;
     const newMember: TeamMember = {
       id: `u-${Date.now()}`,
       organizationId: user.organizationId,
       name: email.split('@')[0], 
       email,
       role: role as UserRole,
       status: 'Pending',
       joinedAt: new Date().toISOString().split('T')[0]
     };
     setTeam([...team, newMember]);
     logAction('Invite User', email);
     triggerToast("Invitation Sent");
  };

  const handleRemoveMember = (id: string) => {
    setTeam(team.filter(t => t.id !== id));
  };

  const navigateToPipeline = (id: string) => {
    setSelectedPipelineId(id);
    setPipelineDetailTab('overview');
    setActiveView('pipeline-detail');
  };

  if (!user) {
    if (activeView === 'login') return <Auth mode="login" onLogin={handleLoginAuth} onRegister={async () => {}} onBack={() => setActiveView('landing')} onSwitchMode={() => {}} />;
    return <LandingPage onLogin={() => setActiveView('login')} onRegister={() => setActiveView('login')} />;
  }

  // RENDER HELPERS
  const renderAuthenticatedContent = () => {
    if (showWizard) {
      return (
        <PipelineWizard 
          sources={mySources}
          destinations={myDestinations}
          onSave={handleCreatePipeline} 
          onCancel={() => setShowWizard(false)} 
        />
      );
    }

    if (activeView === 'pipeline-detail' && selectedPipelineId) {
       const p = myPipelines.find(pl => pl.id === selectedPipelineId);
       const s = mySources.find(src => src.id === p?.sourceId);
       const d = myDestinations.find(dest => dest.id === p?.destinationId);
       const history = runHistory.filter(h => h.pipelineId === selectedPipelineId);

       if (!p) return <div>Pipeline not found</div>;
       
       const statusStyle = STATUS_STYLES[p.status] || STATUS_STYLES[PipelineStatus.Idle];
       const StatusIcon = statusStyle.icon;

       return (
         <div className="space-y-6 h-[calc(100vh-140px)] flex flex-col">
            <button onClick={() => setActiveView('pipelines')} className="flex items-center gap-2 text-slate-400 hover:text-white mb-2 shrink-0">
              <ArrowLeft size={16} /> Back to Pipelines
            </button>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 shrink-0">
               <div className="flex justify-between items-start mb-6">
                  <div>
                    <h2 className="text-2xl font-bold text-white mb-1">{p.name}</h2>
                    <div className="flex items-center gap-3 text-slate-400 text-sm mt-2">
                       <span className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold uppercase border ${statusStyle.bg} ${statusStyle.border} ${statusStyle.text} ${statusStyle.additional || ''}`}>
                          <StatusIcon size={12} className={statusStyle.pulse ? 'animate-spin' : ''} />
                          {p.status}
                       </span>
                      <span>•</span>
                      <span className="flex items-center gap-1"><Clock size={12}/> {p.frequency}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                     <button 
                        onClick={() => handleManualRun(p.id)}
                        disabled={p.status === PipelineStatus.Running}
                        className="bg-blue-600 disabled:opacity-50 text-white px-4 py-2 rounded-lg hover:bg-blue-500 font-bold shadow-lg shadow-blue-900/20 active:scale-95 transition-all flex items-center gap-2"
                     >
                        <Play size={16} /> {p.status === PipelineStatus.Running ? 'Running...' : 'Run Now'}
                     </button>
                  </div>
               </div>
               <div className="flex gap-6 text-sm border-b border-slate-800">
                  <button onClick={() => setPipelineDetailTab('overview')} className={`pb-3 px-1 border-b-2 transition-colors font-medium ${pipelineDetailTab === 'overview' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-500 hover:text-white'}`}>Overview</button>
                  <button onClick={() => setPipelineDetailTab('history')} className={`pb-3 px-1 border-b-2 transition-colors font-medium ${pipelineDetailTab === 'history' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-500 hover:text-white'}`}>Run History</button>
               </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                {pipelineDetailTab === 'overview' && (
                    <div className="space-y-6 py-2">
                        <div className="flex items-center gap-4 bg-slate-900 p-6 rounded-lg border border-slate-800 overflow-x-auto">
                            <div className="flex-1 min-w-[200px] text-center p-4 border border-slate-800 rounded-lg bg-slate-950">
                                <div className="text-xs text-slate-500 uppercase mb-2">Source</div>
                                <div className="font-bold text-white">{s?.name}</div>
                            </div>
                            <ArrowRight className="text-slate-600" />
                            <div className="flex-1 min-w-[200px] text-center p-4 border border-slate-800 rounded-lg bg-slate-950">
                                <div className="text-xs text-slate-500 uppercase mb-2">Destination</div>
                                <div className="font-bold text-white">{d?.name}</div>
                            </div>
                        </div>
                        {/* Metrics Cards would go here */}
                    </div>
                )}
                {pipelineDetailTab === 'history' && (
                    <div className="space-y-4 py-2">
                        {history.map(run => (
                            <React.Fragment key={run.id}>
                                <div onClick={() => setExpandedRunId(expandedRunId === run.id ? null : run.id)} className="bg-slate-900 border border-slate-800 p-4 rounded-lg flex justify-between items-center cursor-pointer hover:border-slate-700">
                                   <div className="flex items-center gap-4">
                                      {run.status === 'Success' ? <CheckCircle className="text-emerald-500" size={18}/> : run.status === 'Failed' ? <XCircle className="text-red-500" size={18} /> : <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"/>}
                                      <span className="text-white font-mono text-sm">{run.startTime}</span>
                                   </div>
                                   <div className="text-slate-400 text-sm">{run.rows.toLocaleString()} rows</div>
                                </div>
                                {expandedRunId === run.id && (
                                    <div className="bg-black border border-slate-800 rounded-lg p-4 font-mono text-xs text-slate-400">
                                        <div className="flex justify-end mb-2">
                                            <button onClick={(e) => downloadLogs(run.id, run.logs, e)} className="flex items-center gap-1 text-blue-400 hover:text-white">
                                                <Download size={12} /> Download
                                            </button>
                                        </div>
                                        {run.logs.map((l, i) => <div key={i}>{l}</div>)}
                                    </div>
                                )}
                            </React.Fragment>
                        ))}
                    </div>
                )}
            </div>
         </div>
       );
    }

    switch (activeView) {
      case 'super-admin':
        return <SuperAdminDashboard organizations={organizations} users={MOCK_USERS} pipelines={pipelines} onCreateOrganization={handleCreateOrganization} onUpdatePlan={handleUpdatePlan} />;
      case 'dashboard':
        return <Dashboard pipelines={myPipelines} sources={mySources} destinations={myDestinations} onViewPipeline={navigateToPipeline} />;
      case 'sources':
        return <ConnectorManager type="source" existing={mySources} onAdd={(c) => handleAddConnector(c, 'source')} onUpdate={(c) => handleUpdateConnector(c, 'source')} onDelete={(id) => handleDeleteConnector(id, 'source')} />;
      case 'destinations':
        return <ConnectorManager type="destination" existing={myDestinations} onAdd={(c) => handleAddConnector(c, 'destination')} onUpdate={(c) => handleUpdateConnector(c, 'destination')} onDelete={(id) => handleDeleteConnector(id, 'destination')} />;
      case 'pipelines':
        return (
          <div className="space-y-6">
             <div className="flex justify-between items-center">
                 <h2 className="text-xl font-bold text-white">Pipelines</h2>
                 <button onClick={() => setShowWizard(true)} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-lg shadow-blue-900/20">Create Pipeline</button>
             </div>
             <div className="grid gap-4">
                {myPipelines.map(p => (
                   <div key={p.id} onClick={() => navigateToPipeline(p.id)} className="bg-slate-900 border border-slate-800 p-6 rounded-xl flex justify-between items-center cursor-pointer hover:border-blue-500/50 transition-colors">
                      <div>
                         <h3 className="font-bold text-white">{p.name}</h3>
                         <p className="text-sm text-slate-500">{p.syncMode}</p>
                      </div>
                      <div className={`px-3 py-1 rounded-full text-xs font-bold uppercase border ${STATUS_STYLES[p.status].bg} ${STATUS_STYLES[p.status].text} ${STATUS_STYLES[p.status].border}`}>
                         {p.status}
                      </div>
                   </div>
                ))}
             </div>
          </div>
        );
      case 'observability': return <DataLineage pipelines={myPipelines} sources={mySources} destinations={myDestinations} />;
      case 'insights': return <DataInsights pipelines={myPipelines} />;
      case 'backend': return <BackendViewer />;
      case 'settings': return <Settings user={user} team={myTeam} logs={myLogs} billing={MOCK_BILLING} onInvite={handleInviteMember} onRemoveMember={handleRemoveMember} />;
      default: return <div>Not Found</div>;
    }
  };

  return (
    <Layout activeTab={activeView === 'pipeline-detail' ? 'pipelines' : activeView} onTabChange={(t) => { setShowWizard(false); setActiveView(t as ViewState); }} user={user} onLogout={handleLogout}>
      {renderAuthenticatedContent()}
      {showToast && (
         <div className="fixed bottom-8 right-8 bg-slate-900 border border-emerald-500/50 text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-5 z-50">
            <Zap size={18} className="text-emerald-400" />
            <div>
               <h4 className="font-bold text-sm">System Notification</h4>
               <p className="text-xs text-slate-300">{showToast}</p>
            </div>
         </div>
      )}
    </Layout>
  );
}

export default App;
