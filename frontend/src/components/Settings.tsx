
import React, { useState } from 'react';
import { User, TeamMember, AuditLog, BillingStats } from '../types';
import { Building, Users, Shield, CreditCard, Plus, Mail, Trash2, Key, Check, Copy } from 'lucide-react';

interface Props {
  user: User;
  team: TeamMember[];
  logs: AuditLog[];
  billing: BillingStats;
  onInvite: (email: string, role: string) => void;
  onRemoveMember: (id: string) => void;
}

export const Settings: React.FC<Props> = ({ user, team, logs, billing, onInvite, onRemoveMember }) => {
  const [activeTab, setActiveTab] = useState<'general' | 'team' | 'security' | 'billing'>('team');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('Viewer');

  const handleSendInvite = (e: React.FormEvent) => {
    e.preventDefault();
    onInvite(inviteEmail, inviteRole);
    setInviteEmail('');
    setShowInviteModal(false);
  };

  const Tabs = () => (
    <div className="flex border-b border-slate-800 mb-6">
      <button onClick={() => setActiveTab('general')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'general' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-white'}`}>
        <Building size={16} /> General
      </button>
      <button onClick={() => setActiveTab('team')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'team' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-white'}`}>
        <Users size={16} /> Team
      </button>
       <button onClick={() => setActiveTab('billing')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'billing' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-white'}`}>
        <CreditCard size={16} /> Billing
      </button>
      <button onClick={() => setActiveTab('security')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'security' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-white'}`}>
        <Shield size={16} /> Security & Logs
      </button>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto h-[calc(100vh-140px)] flex flex-col">
      <div className="mb-2">
        <h2 className="text-2xl font-bold text-white">Organization Settings</h2>
        <p className="text-slate-400 text-sm">Manage your company profile, team, and security.</p>
      </div>

      <Tabs />

      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
        
        {/* GENERAL TAB */}
        {activeTab === 'general' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Company Profile</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Company Name</label>
                  <input type="text" value={user.companyName} disabled className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Owner Email</label>
                  <input type="text" value={user.email} disabled className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white" />
                </div>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4">API Access</h3>
              <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium text-white">Service Token (Read-Only)</p>
                  <p className="text-xs text-slate-500">pk_live_51M...</p>
                </div>
                <button className="text-blue-400 hover:text-white flex items-center gap-1 text-xs font-medium">
                  <Copy size={12} /> Copy
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TEAM TAB */}
        {activeTab === 'team' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-semibold text-white">Team Members</h3>
                <p className="text-xs text-slate-400">{team.length} / 4 Seats Used</p>
              </div>
              <button 
                onClick={() => setShowInviteModal(true)}
                disabled={team.length >= 4}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2"
              >
                <Plus size={16} /> Invite Member
              </button>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-950 text-slate-400">
                  <tr>
                    <th className="px-6 py-3 font-medium">Name / Email</th>
                    <th className="px-6 py-3 font-medium">Role</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {team.map(member => (
                    <tr key={member.id} className="hover:bg-slate-800/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-medium text-white">{member.name}</div>
                        <div className="text-xs text-slate-500">{member.email}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${member.role === 'Owner' ? 'bg-purple-900/30 text-purple-400' : 'bg-slate-800 text-slate-300'}`}>
                          {member.role}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                         <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${member.status === 'Active' ? 'bg-emerald-900/30 text-emerald-400' : 'bg-amber-900/30 text-amber-400'}`}>
                          {member.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {member.role !== 'Owner' && (
                          <button onClick={() => onRemoveMember(member.id)} className="text-slate-500 hover:text-red-400 transition-colors">
                            <Trash2 size={16} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Invite Modal */}
            {showInviteModal && (
              <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
                <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-md shadow-2xl animate-in fade-in zoom-in-95">
                  <h3 className="text-xl font-bold text-white mb-4">Invite Team Member</h3>
                  <form onSubmit={handleSendInvite} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Email Address</label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-2.5 text-slate-500 w-4 h-4" />
                        <input 
                          type="email" 
                          required
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg py-2 pl-9 pr-3 text-white focus:outline-none focus:border-blue-500"
                          placeholder="colleague@company.com"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Role</label>
                      <select 
                        value={inviteRole}
                        onChange={(e) => setInviteRole(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg py-2 px-3 text-white focus:outline-none focus:border-blue-500"
                      >
                        <option value="Admin">Admin (Can edit pipelines)</option>
                        <option value="Viewer">Viewer (Read-only)</option>
                      </select>
                    </div>
                    <div className="flex gap-3 pt-4">
                      <button type="button" onClick={() => setShowInviteModal(false)} className="flex-1 bg-slate-800 hover:bg-slate-700 text-white py-2 rounded-lg font-medium">Cancel</button>
                      <button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-lg font-bold">Send Invite</button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* SECURITY TAB */}
        {activeTab === 'security' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-6">Audit Log</h3>
              <div className="relative border-l border-slate-800 ml-3 space-y-8">
                {logs.map((log, idx) => (
                  <div key={log.id} className="relative pl-8">
                    <div className={`absolute -left-1.5 mt-1.5 w-3 h-3 rounded-full border-2 border-slate-900 ${log.status === 'Success' ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
                    <div className="flex justify-between items-start">
                      <div>
                         <p className="text-sm font-medium text-white">{log.action}</p>
                         <p className="text-xs text-slate-400 mt-0.5">
                           <span className="text-blue-400">{log.actor}</span> acted on <span className="text-slate-300">{log.target}</span>
                         </p>
                      </div>
                      <span className="text-xs text-slate-600 font-mono">{log.timestamp}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* BILLING TAB */}
        {activeTab === 'billing' && (
           <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div className="bg-gradient-to-br from-slate-900 to-slate-900 border border-slate-800 rounded-xl p-6">
                    <div className="flex justify-between items-start mb-6">
                       <div>
                          <p className="text-sm text-slate-400">Current Plan</p>
                          <h2 className="text-2xl font-bold text-white mt-1">{billing.planName}</h2>
                       </div>
                       <div className="bg-emerald-900/20 text-emerald-400 px-3 py-1 rounded-full text-xs font-bold uppercase">Active</div>
                    </div>
                    <div className="flex items-end gap-1 mb-2">
                       <span className="text-4xl font-bold text-white">${billing.costCurrent}</span>
                       <span className="text-slate-500 mb-1">/ month (est)</span>
                    </div>
                    <p className="text-xs text-slate-500">Renews on {billing.renewalDate}</p>
                 </div>

                 <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col justify-center">
                    <div className="flex justify-between text-sm mb-2">
                       <span className="text-slate-300 font-medium">Monthly Row Usage</span>
                       <span className="text-slate-400">{((billing.rowsUsed / billing.rowsLimit) * 100).toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-4 mb-3 overflow-hidden">
                       <div className="bg-blue-600 h-full rounded-full" style={{ width: `${(billing.rowsUsed / billing.rowsLimit) * 100}%` }}></div>
                    </div>
                    <div className="flex justify-between text-xs text-slate-500 font-mono">
                       <span>{billing.rowsUsed.toLocaleString()}</span>
                       <span>{billing.rowsLimit.toLocaleString()} Limit</span>
                    </div>
                 </div>
              </div>

               <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                 <h3 className="text-lg font-semibold text-white mb-4">Payment Method</h3>
                 <div className="flex items-center justify-between bg-slate-950 p-4 rounded-lg border border-slate-800">
                    <div className="flex items-center gap-4">
                       <div className="bg-slate-800 p-2 rounded">
                          <CreditCard className="text-white" />
                       </div>
                       <div>
                          <p className="text-white text-sm font-medium">Visa ending in 4242</p>
                          <p className="text-xs text-slate-500">Expires 12/25</p>
                       </div>
                    </div>
                    <button className="text-sm text-blue-400 hover:text-white">Edit</button>
                 </div>
               </div>
           </div>
        )}

      </div>
    </div>
  );
};
