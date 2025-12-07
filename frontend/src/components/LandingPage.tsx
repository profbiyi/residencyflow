
import React, { useRef } from 'react';
import { Shield, Zap, Database, ArrowRight, Layers, RefreshCw, CheckCircle2 } from 'lucide-react';
import { SOURCE_TYPES, DESTINATION_TYPES, ICON_MAP } from '../constants';

interface Props {
  onLogin: () => void;
  onRegister: () => void;
}

export const LandingPage: React.FC<Props> = ({ onLogin, onRegister }) => {
  const catalogRef = useRef<HTMLDivElement>(null);

  const scrollToCatalog = () => {
    catalogRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white selection:bg-blue-500/30">
      {/* Navigation */}
      <nav className="container mx-auto px-6 py-6 flex justify-between items-center sticky top-0 bg-slate-950/80 backdrop-blur-md z-50 border-b border-white/5">
        <div className="flex items-center gap-2 text-blue-500">
          <Layers className="h-6 w-6" strokeWidth={2.5} />
          <span className="text-xl font-bold tracking-tight text-white">ResidencyFlow</span>
        </div>
        <div className="flex gap-4">
          <button onClick={onLogin} className="text-slate-300 hover:text-white font-medium px-4 py-2 transition-colors">
            Log in
          </button>
          <button onClick={onRegister} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-full font-medium transition-all hover:scale-105 shadow-lg shadow-blue-900/20">
            Get Started
          </button>
        </div>
      </nav>

      {/* Hero */}
      <header className="container mx-auto px-6 py-20 lg:py-32 text-center relative overflow-hidden">
        {/* Background decorations */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-blue-500/10 rounded-full blur-3xl -z-10"></div>
        
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs text-blue-400 font-medium mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></span>
          New: AI-Driven Schema Mapping
        </div>
        <h1 className="text-5xl lg:text-7xl font-bold tracking-tight mb-6 bg-gradient-to-b from-white to-slate-400 bg-clip-text text-transparent">
          The Universal Data Pipeline<br /> for Modern Teams.
        </h1>
        <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
          Sync data from any API, Database, or File to your Warehouse in minutes. 
          Powered by open-source standards (dlt + DuckDB) for maximum flexibility.
        </p>
        <div className="flex flex-col sm:flex-row justify-center gap-4">
          <button onClick={onRegister} className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-4 rounded-lg font-bold text-lg flex items-center justify-center gap-2 transition-all hover:shadow-[0_0_40px_-10px_rgba(37,99,235,0.5)]">
            Start Free Sync <ArrowRight size={20} />
          </button>
          <button onClick={scrollToCatalog} className="bg-slate-900 hover:bg-slate-800 text-white border border-slate-800 px-8 py-4 rounded-lg font-bold text-lg transition-colors">
            View Connectors
          </button>
        </div>
      </header>

      {/* Features Grid */}
      <section className="container mx-auto px-6 py-20 border-t border-slate-900">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="p-8 rounded-2xl bg-slate-900/50 border border-slate-800 hover:border-slate-700 transition-colors">
            <div className="w-12 h-12 bg-emerald-900/30 rounded-lg flex items-center justify-center text-emerald-400 mb-6">
              <RefreshCw size={24} />
            </div>
            <h3 className="text-xl font-bold mb-3">Reliable Syncs</h3>
            <p className="text-slate-400 leading-relaxed">
              Full load, incremental, or merge. We handle schema drift automatically so your pipelines never break.
            </p>
          </div>
          <div className="p-8 rounded-2xl bg-slate-900/50 border border-slate-800 hover:border-slate-700 transition-colors">
            <div className="w-12 h-12 bg-blue-900/30 rounded-lg flex items-center justify-center text-blue-400 mb-6">
              <Database size={24} />
            </div>
            <h3 className="text-xl font-bold mb-3">100+ Connectors</h3>
            <p className="text-slate-400 leading-relaxed">
              From Postgres to Salesforce, Notion to BigQuery. If it has an API, we can sync it.
            </p>
          </div>
          <div className="p-8 rounded-2xl bg-slate-900/50 border border-slate-800 hover:border-slate-700 transition-colors">
            <div className="w-12 h-12 bg-purple-900/30 rounded-lg flex items-center justify-center text-purple-400 mb-6">
              <Zap size={24} />
            </div>
            <h3 className="text-xl font-bold mb-3">Instant Setup</h3>
            <p className="text-slate-400 leading-relaxed">
              No long sales calls. Connect your source, define your destination, and start moving data in under 5 minutes.
            </p>
          </div>
        </div>
      </section>

      {/* Connector Catalog */}
      <section ref={catalogRef} className="bg-slate-900 py-24">
        <div className="container mx-auto px-6">
           <div className="text-center mb-16">
              <h2 className="text-3xl font-bold text-white mb-4">Supported Integrations</h2>
              <p className="text-slate-400 max-w-2xl mx-auto">
                Our platform connects to the tools you already use. Don't see yours? 
                Use our Generic API connector to build it in seconds.
              </p>
           </div>

           <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
              {/* Sources */}
              <div>
                 <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-6 flex items-center gap-2">
                    <Database size={16} /> Sources
                 </h3>
                 <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {SOURCE_TYPES.map(s => {
                       const Icon = ICON_MAP[s.icon] || ICON_MAP.default;
                       return (
                          <div key={s.id} className="flex items-center gap-3 p-3 rounded-lg bg-slate-950 border border-slate-800 text-slate-300">
                             <Icon size={18} className="text-blue-500" />
                             <span className="text-sm font-medium">{s.name}</span>
                          </div>
                       )
                    })}
                 </div>
              </div>

              {/* Destinations */}
              <div>
                 <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-6 flex items-center gap-2">
                    <ArrowRight size={16} /> Destinations
                 </h3>
                 <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {DESTINATION_TYPES.map(d => {
                       const Icon = ICON_MAP[d.icon] || ICON_MAP.default;
                       return (
                          <div key={d.id} className="flex items-center gap-3 p-3 rounded-lg bg-slate-950 border border-slate-800 text-slate-300">
                             <Icon size={18} className="text-emerald-500" />
                             <span className="text-sm font-medium">{d.name}</span>
                          </div>
                       )
                    })}
                 </div>
              </div>
           </div>
        </div>
      </section>
      
      <footer className="border-t border-slate-900 py-12 bg-slate-950">
        <div className="container mx-auto px-6 text-center">
           <div className="flex items-center justify-center gap-2 text-slate-600 mb-4">
              <Layers className="h-5 w-5" />
              <span className="font-bold">ResidencyFlow</span>
           </div>
           <p className="text-slate-500 text-sm">
             &copy; 2024 ResidencyFlow. The Data Movement Platform.
           </p>
        </div>
      </footer>
    </div>
  );
};
