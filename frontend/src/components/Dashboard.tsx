
import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, AreaChart, Area } from 'recharts';
import { Pipeline, PipelineStatus, ConnectorInstance } from '../types';
import { ICON_MAP, SOURCE_TYPES, DESTINATION_TYPES, STATUS_STYLES } from '../constants';
import { ArrowUpRight, Activity, ArrowRight, Clock, Zap, AlertTriangle } from 'lucide-react';

interface DashboardProps {
  pipelines: Pipeline[];
  sources: ConnectorInstance[];
  destinations: ConnectorInstance[];
  onViewPipeline: (id: string) => void;
}

const StatCard = ({ title, value, sub, icon: Icon, color }: any) => (
  <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 hover:border-slate-700 transition-colors">
    <div className="flex justify-between items-start mb-4">
      <div>
        <p className="text-slate-400 text-sm font-medium">{title}</p>
        <h3 className="text-2xl font-bold text-white mt-1">{value}</h3>
      </div>
      <div className={`p-2 rounded-lg ${color} bg-opacity-20`}>
        <Icon className={`w-5 h-5 ${color.replace('bg-', 'text-')}`} />
      </div>
    </div>
    <div className="flex items-center gap-1 text-xs">
      <ArrowUpRight className="w-3 h-3 text-emerald-400" />
      <span className="text-emerald-400 font-medium">{sub}</span>
      <span className="text-slate-500 ml-1">last 24h</span>
    </div>
  </div>
);

export const Dashboard: React.FC<DashboardProps> = ({ pipelines, sources, destinations, onViewPipeline }) => {
  const data = [
    { name: 'Mon', volume: 4000 },
    { name: 'Tue', volume: 3000 },
    { name: 'Wed', volume: 5000 },
    { name: 'Thu', volume: 2780 },
    { name: 'Fri', volume: 1890 },
    { name: 'Sat', volume: 2390 },
    { name: 'Sun', volume: 3490 },
  ];

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Total Rows Synced" 
          value="45.2M" 
          sub="+12%" 
          icon={Activity} 
          color="bg-blue-500" 
        />
        <StatCard 
          title="Avg. Latency" 
          value="480ms" 
          sub="-5%" 
          icon={Zap} 
          color="bg-purple-500" 
        />
        <StatCard 
          title="Active Pipelines" 
          value={pipelines.length} 
          sub="All Healthy" 
          icon={Clock} 
          color="bg-emerald-500" 
        />
        <StatCard 
          title="Failed Records" 
          value="12" 
          sub="0.001%" 
          icon={AlertTriangle} 
          color="bg-amber-500" 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Chart */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-6">Throughput (Rows/Hour)</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data}>
                <defs>
                  <linearGradient id="colorVolume" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px' }} 
                  itemStyle={{ color: '#f8fafc' }}
                  cursor={{stroke: '#475569', strokeWidth: 1}}
                />
                <Area type="monotone" dataKey="volume" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorVolume)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pipeline List Status */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Pipeline Health</h3>
          <div className="space-y-4">
            {pipelines.map((p) => {
              // Lookup actual icons based on IDs
              const source = sources.find(s => s.id === p.sourceId);
              const dest = destinations.find(d => d.id === p.destinationId);
              
              const sourceType = SOURCE_TYPES.find(t => t.id === source?.typeId);
              const destType = DESTINATION_TYPES.find(t => t.id === dest?.typeId);

              const SourceIcon = sourceType ? ICON_MAP[sourceType.icon] : ICON_MAP.default;
              const DestIcon = destType ? ICON_MAP[destType.icon] : ICON_MAP.default;
              
              const statusStyle = STATUS_STYLES[p.status] || STATUS_STYLES[PipelineStatus.Idle];
              const StatusIcon = statusStyle.icon;

              return (
                <div 
                  key={p.id} 
                  onClick={() => onViewPipeline(p.id)}
                  className="flex items-center justify-between p-3 rounded-lg bg-slate-950/50 border border-slate-800 hover:border-slate-700 transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 text-slate-500">
                       <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center border border-slate-800">
                          <SourceIcon size={14} className="text-slate-300" />
                       </div>
                       <ArrowRight size={12} />
                       <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center border border-slate-800">
                          <DestIcon size={14} className="text-slate-300" />
                       </div>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-200 group-hover:text-blue-400 transition-colors">{p.name}</p>
                      <p className="text-xs text-slate-500">{p.syncMode}</p>
                    </div>
                  </div>
                  <div className={`flex items-center gap-2 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase border ${statusStyle.bg} ${statusStyle.border} ${statusStyle.text} ${statusStyle.additional || ''}`}>
                     <StatusIcon size={10} className={statusStyle.pulse ? 'animate-spin' : ''} />
                     {p.status}
                  </div>
                </div>
              );
            })}
          </div>
          <button className="w-full mt-4 py-2 text-sm text-blue-400 hover:text-blue-300 font-medium border border-blue-900/50 hover:bg-blue-900/20 rounded-lg transition-colors">
            View All Pipelines
          </button>
        </div>
      </div>
    </div>
  );
};
