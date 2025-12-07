
import React, { useState } from 'react';
import { Organization, User, Pipeline, BillingStats } from '../types';
import { Building, Plus, Mail, Lock, User as UserIcon, CheckCircle, Search, Crown, ArrowLeft, Activity, CreditCard, Database, PauseOctagon, PlayCircle, ArrowRight } from 'lucide-react';

interface Props {
  organizations: Organization[];
  users: User[];
  pipelines: Pipeline[];
  onCreateOrganization: (name: string, adminEmail: string, adminName: string, initialPass: string, plan: 'Starter' | 'Pro' | 'Enterprise') => void;
  onUpdatePlan: (orgId: string, newPlan: 'Starter' | 'Pro' | 'Enterprise') => void;
}

export const SuperAdminDashboard: React.FC<Props> = ({ organizations, users, pipelines, onCreateOrganization, onUpdatePlan }) => {
  const [showModal, setShowModal] = useState(false);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'pipelines' | 'billing'>('overview');
  const [isSendingInvite, setIsSendingInvite] = useState(false);
  
  // Create Form State
  const [orgName, setOrgName] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [password, setPassword] = useState('');
  const [initialPlan, setInitialPlan] = useState<'Starter' | 'Pro' | 'Enterprise'>('Starter');
  const [targetPlan, setTargetPlan] = useState<'Starter' | 'Pro' | 'Enterprise'>('Starter');

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSendingInvite(true);
    setTimeout(() => {
        onCreateOrganization(orgName, adminEmail, adminName, password, initialPlan);
        setIsSendingInvite(false);
        setShowModal(false);
        setOrgName(''); setAdminName(''); setAdminEmail(''); setPassword(''); setInitialPlan('Starter');
    }, 1500);
  };

  const handleChangePlan = () => {
    if (selectedOrgId) {
        onUpdatePlan(selectedOrgId, targetPlan);
        setShowPlanModal(false);
    }
  };

  const filteredOrgs = organizations.filter(org => 
    org.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    org.slug.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedOrg = organizations.find(o => o.id === selectedOrgId);
  const orgUsers = users.filter(u => u.organizationId === selectedOrgId);
  const orgPipelines = pipelines.filter(p => p.organizationId === selectedOrgId);
  
  const getBilling = (org: Organization): BillingStats => {
     const isEnt = org.plan === 'Enterprise';
     const isPro = org.plan === 'Pro';
     return {
        planName: org.plan + ' Plan',
        rowsUsed: isEnt ? 45000000 : isPro ? 4500000 : 120000,
        rowsLimit: isEnt ? 100000000 : isPro ? 10000000 : 1000000,
        costCurrent: isEnt ? 899 : isPro ? 299 : 49,
        renewalDate: '2024-04-01'
     };
  };

  if (selectedOrg) {
    const billing = getBilling(selectedOrg);
    return (
       <div className="space-y-6 animate-in fade-in slide-in-from-right-8 duration-300 h-[calc(100vh-140px)] overflow-y-auto custom-scrollbar pr-2">
          <button onClick={() => setSelectedOrgId(null)} className="flex items-center gap-2 text-slate-400 hover:text-white mb-2 transition-colors sticky top-0 bg-slate-950 py-2 z-10 w-full">
             <ArrowLeft size={16} /> Back to Tenants
          </button>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-8">
             <div className="flex justify-between items-start">
                <div className="flex items-center gap-4">
                   <div className="w-16 h-16 bg-gradient-to-br from-blue-900 to-purple-900 rounded-xl flex items-center justify-center text-2xl font-bold text-white border border-white/10">
                      {selectedOrg.name.substring(0,2).toUpperCase()}
                   </div>
                   <div>
                      <h1 className="text-3xl font-bold text-white">{selectedOrg.name}</h1>
                      <div className="flex items-center gap-3 mt-2 text-sm">
                         <span className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase border ${selectedOrg.status === 'Active' ? 'bg-emerald-900/30 text-emerald-400 border-emerald-900' : 'bg-red-900/30 text-red-400 border-red-900'}`}>{selectedOrg.status}</span>
                      </div>
                   </div>
                </div>
                <div className="flex gap-3">
                   {selectedOrg.status === 'Active' ? <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-900/20 text-red-400 border border-red-900/50"><PauseOctagon size={16} /> Suspend</button> : <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-900/20 text-emerald-400 border border-emerald-900/50"><PlayCircle size={16} /> Reactivate</button>}
                </div>
             </div>
             <div className="flex gap-8 mt-10 border-b border-slate-800 text-sm font-medium">
                {['overview', 'users', 'pipelines', 'billing'].map(tab => (
                   <button key={tab} onClick={() => setActiveTab(tab as any)} className={`pb-3 capitalize transition-colors ${activeTab === tab ? 'text-blue-400 border-b-2 border-blue-500' : 'text-slate-500 hover:text-white border-b-2 border-transparent'}`}>{tab}</button>
                ))}
             </div>
          </div>
          <div className="grid grid-cols-1 gap-6 pb-10">
             {activeTab === 'overview' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-2">
                   <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl"><h3 className="font-bold text-white mb-2">Total Users</h3><p className="text-3xl font-bold text-white">{orgUsers.length}</p></div>
                   <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl"><h3 className="font-bold text-white mb-2">Active Pipelines</h3><p className="text-3xl font-bold text-white">{orgPipelines.length}</p></div>
                   <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl"><h3 className="font-bold text-white mb-2">Revenue</h3><p className="text-3xl font-bold text-white">${billing.costCurrent}</p></div>
                </div>
             )}
             {activeTab === 'users' && <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden p-4"><table className="w-full text-left text-sm text-slate-300"><thead><tr><th className="p-2">Name</th><th className="p-2">Role</th></tr></thead><tbody>{orgUsers.map(u => <tr key={u.id}><td className="p-2">{u.name} <span className="text-slate-500 text-xs block">{u.email}</span></td><td className="p-2">{u.role}</td></tr>)}</tbody></table></div>}
             {activeTab === 'billing' && (
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                   <div className="flex justify-between mb-6"><h3 className="font-bold text-white">Subscription</h3><button onClick={() => { setTargetPlan(selectedOrg.plan); setShowPlanModal(true); }} className="text-blue-400 underline">Change Plan</button></div>
                   <div className="p-4 bg-slate-950 rounded-lg"><p className="text-white text-xl font-bold">{selectedOrg.plan}</p><p className="text-slate-500 text-sm">Usage: {billing.rowsUsed.toLocaleString()} / {billing.rowsLimit.toLocaleString()} rows</p></div>
                </div>
             )}
          </div>
          {showPlanModal && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
                <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-md shadow-2xl">
                    <h3 className="text-xl font-bold text-white mb-4">Update Plan</h3>
                    <div className="grid grid-cols-3 gap-3 mb-6">
                        {['Starter', 'Pro', 'Enterprise'].map(p => (
                            <button key={p} onClick={() => setTargetPlan(p as any)} className={`p-2 rounded border ${targetPlan === p ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-950 border-slate-700 text-slate-400'}`}>{p}</button>
                        ))}
                    </div>
                    <div className="flex gap-3"><button onClick={() => setShowPlanModal(false)} className="flex-1 bg-slate-800 text-white py-2 rounded">Cancel</button><button onClick={handleChangePlan} className="flex-1 bg-blue-600 text-white py-2 rounded">Confirm</button></div>
                </div>
            </div>
          )}
       </div>
    );
  }

  return (
    <div className="space-y-6 h-[calc(100vh-140px)] overflow-y-auto custom-scrollbar pr-2">
      <div className="flex items-center justify-between">
        <div><h2 className="text-2xl font-bold text-white flex items-center gap-2"><Crown className="text-amber-500" /> Platform Admin</h2></div>
        <button onClick={() => setShowModal(true)} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 shadow-lg shadow-blue-900/20"><Plus size={16} /> Onboard Tenant</button>
      </div>
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
         <div className="p-4 border-b border-slate-800 bg-slate-950/50 flex justify-between"><h3 className="font-bold text-white">Active Tenants</h3><div className="relative"><Search className="absolute left-3 top-2 text-slate-500 w-4 h-4" /><input type="text" placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-full py-1.5 pl-9 pr-4 text-xs text-white" /></div></div>
         <table className="w-full text-left text-sm"><thead className="bg-slate-950 text-slate-400"><tr><th className="px-6 py-3">Company</th><th className="px-6 py-3">Plan</th><th className="px-6 py-3">Status</th><th className="px-6 py-3 text-right">Action</th></tr></thead><tbody className="divide-y divide-slate-800">{filteredOrgs.map(org => (<tr key={org.id} onClick={() => setSelectedOrgId(org.id)} className="hover:bg-slate-800/50 cursor-pointer"><td className="px-6 py-4 font-bold text-white">{org.name}</td><td className="px-6 py-4"><span className="bg-slate-800 text-slate-400 px-2 py-1 rounded text-xs uppercase">{org.plan}</span></td><td className="px-6 py-4"><span className="text-emerald-400 text-xs font-bold uppercase flex items-center gap-1"><CheckCircle size={10} /> Active</span></td><td className="px-6 py-4 text-right text-slate-500 hover:text-blue-400"><ArrowRight size={16} className="inline"/></td></tr>))}</tbody></table>
      </div>
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-lg shadow-2xl">
                <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2"><Building className="text-blue-500" /> Onboard Tenant</h3>
                <form onSubmit={handleCreate} className="space-y-4">
                   <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Company Name</label><input type="text" required value={orgName} onChange={e => setOrgName(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white" /></div>
                   <div className="grid grid-cols-2 gap-4">
                      <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Admin Name</label><input type="text" required value={adminName} onChange={e => setAdminName(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white" /></div>
                      <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Password</label><input type="text" required value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white" /></div>
                   </div>
                   <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Admin Email</label><input type="email" required value={adminEmail} onChange={e => setAdminEmail(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white" /></div>
                   <div className="grid grid-cols-3 gap-3">{['Starter', 'Pro', 'Enterprise'].map(p => (<button type="button" key={p} onClick={() => setInitialPlan(p as any)} className={`p-2 rounded border text-sm font-bold ${initialPlan === p ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-950 border-slate-700 text-slate-400'}`}>{p}</button>))}</div>
                   <div className="flex gap-3 pt-4"><button type="button" onClick={() => setShowModal(false)} className="flex-1 bg-slate-800 text-white py-2 rounded">Cancel</button><button type="submit" disabled={isSendingInvite} className="flex-1 bg-blue-600 text-white py-2 rounded font-bold flex justify-center items-center gap-2">{isSendingInvite ? <Activity className="animate-spin w-4 h-4"/> : 'Create Tenant'}</button></div>
                </form>
            </div>
        </div>
      )}
    </div>
  );
};
