

import React, { useState, useEffect } from 'react';
import { Pipeline, PipelineStatus, ConnectorInstance, SyncMode, Frequency, SchemaPolicy, NotificationConfig, TransformationConfig, PerformanceConfig } from '../types';
import { Check, ArrowRight, RefreshCw, Clock, Settings, Play, Zap, Shield, Bell, GitBranch, AlertTriangle, Cpu, Database, Loader } from 'lucide-react';
import { ICON_MAP, SOURCE_TYPES, DESTINATION_TYPES, SYNC_MODE_OPTIONS, FREQUENCY_OPTIONS } from '../constants';
import { api } from '../services/api';

interface WizardProps {
  sources: ConnectorInstance[];
  destinations: ConnectorInstance[];
  onSave: (pipeline: Pipeline) => void;
  onCancel: () => void;
}

export const PipelineWizard: React.FC<WizardProps> = ({ sources, destinations, onSave, onCancel }) => {
  const [step, setStep] = useState(1);
  const [deploying, setDeploying] = useState(false);
  
  // Form State
  const [name, setName] = useState('');
  const [selectedSource, setSelectedSource] = useState<ConnectorInstance | null>(null);
  const [selectedDest, setSelectedDest] = useState<ConnectorInstance | null>(null);
  const [syncMode, setSyncMode] = useState<SyncMode>('incremental_merge');
  const [frequency, setFrequency] = useState<Frequency>('hourly');
  
  // Table/Resource Selection (from dlt introspection)
  const [loadingSchema, setLoadingSchema] = useState(false);
  const [availableResources, setAvailableResources] = useState<Array<{name: string, type: string, selected: boolean}>>([]);
  const [sourceType, setSourceType] = useState<string>('');
  
  // Fetch schema when source is selected
  useEffect(() => {
    if (selectedSource) {
      setLoadingSchema(true);
      api.connectors.getSchema(selectedSource.id)
        .then(schema => {
          setAvailableResources(schema.resources);
          setSourceType(schema.source_type);
          setLoadingSchema(false);
        })
        .catch(err => {
          console.error('Schema introspection failed:', err);
          setLoadingSchema(false);
          // If introspection fails, skip to destination selection
          setAvailableResources([]);
          setSourceType('unknown');
        });
    }
  }, [selectedSource]);

  // Enterprise / Governance State
  const [schemaPolicy, setSchemaPolicy] = useState<SchemaPolicy>('evolve');
  const [notifyConfig, setNotifyConfig] = useState<NotificationConfig>({ onFailure: true, onSuccess: false, slackWebhook: '' });
  const [dbtConfig, setDbtConfig] = useState<TransformationConfig>({ runAfterLoad: false, dbtRepoUrl: '' });
  
  // Enterprise / Performance State
  const [perfConfig, setPerfConfig] = useState<PerformanceConfig>({ batchSize: 10000, parallelism: 4, memoryLimit: '512MB' });
  const [showPerf, setShowPerf] = useState(false);

  const handleSave = () => {
    if (selectedSource && selectedDest && name) {
      setDeploying(true);
      
      // Prepare transformation config with selected tables/resources
      const selectedTables = availableResources
        .filter(r => r.selected)
        .map(r => r.name);
      
      const transformationWithTables = {
        ...dbtConfig,
        selectedResources: selectedTables.length > 0 ? selectedTables : undefined
      };
      
      // Simulate Backend API Call latency
      setTimeout(() => {
        onSave({
          id: `new-${Date.now()}`,
          name,
          sourceId: selectedSource.id,
          destinationId: selectedDest.id,
          frequency,
          syncMode,
          status: PipelineStatus.Idle,
          lastRun: 'Never',
          rowsProcessed: 0,
          latency: '0ms',
          errorRate: '0%',
          residency: 'Local (Lagos)',
          schemaPolicy,
          notifications: notifyConfig,
          transformation: transformationWithTables,
          performance: perfConfig,
          organizationId: '', // Filled by parent
          createdBy: '' // Filled by parent
        });
        setDeploying(false);
      }, 1500);
    }
  };

  const ConnectorCard = ({ connector, selected, onSelect, type }: { connector: ConnectorInstance, selected: boolean, onSelect: () => void, type: 'source'|'destination' }) => {
    const typeDef = type === 'source' 
      ? SOURCE_TYPES.find(t => t.id === connector.typeId)
      : DESTINATION_TYPES.find(t => t.id === connector.typeId);
      
    const Icon = typeDef ? (ICON_MAP[typeDef.icon] || ICON_MAP.default) : ICON_MAP.default;

    return (
      <div 
        onClick={onSelect}
        className={`cursor-pointer p-4 rounded-xl border transition-all duration-200 flex flex-col gap-3
          ${selected 
            ? 'bg-blue-600/10 border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.2)]' 
            : 'bg-slate-900 border-slate-800 hover:border-slate-600 hover:bg-slate-800'
          }`}
      >
        <div className="flex justify-between items-start">
          <div className={`p-2 rounded-lg bg-slate-950`}>
            <Icon className="text-slate-300 w-6 h-6" />
          </div>
          {selected && <Check className="text-blue-500 w-5 h-5" />}
        </div>
        <div>
          <h4 className="font-semibold text-slate-200">{connector.name}</h4>
          <p className="text-xs text-slate-500 mt-1 capitalize">{typeDef?.name}</p>
        </div>
      </div>
    );
  };

  // Helper for step indicator
  const StepIndicator = ({ num, label }: { num: number, label: string }) => (
    <div className={`flex flex-col items-center ${step >= num ? 'text-blue-500' : 'text-slate-600'}`}>
        <div className={`w-8 h-8 rounded-full flex items-center justify-center mb-2 font-bold transition-colors duration-500 text-sm ${step >= num ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50' : 'bg-slate-800'}`}>{num}</div>
        <span className="text-xs font-medium hidden md:block">{label}</span>
    </div>
  );

  const StepLine = ({ num }: { num: number }) => (
     <div className={`h-0.5 flex-1 mx-2 md:mx-4 rounded transition-colors duration-500 ${step >= num ? 'bg-blue-600' : 'bg-slate-800'}`} />
  );

  return (
    <div className="max-w-5xl mx-auto h-[calc(100vh-140px)] flex flex-col justify-center">
      {/* Stepper */}
      <div className="flex items-center justify-between mb-8 px-8 shrink-0">
        <StepIndicator num={1} label="Source" />
        <StepLine num={2} />
        <StepIndicator num={2} label="Tables" />
        <StepLine num={3} />
        <StepIndicator num={3} label="Destination" />
        <StepLine num={4} />
        <StepIndicator num={4} label="Config" />
        <StepLine num={5} />
        <StepIndicator num={5} label="Governance" />
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl relative overflow-hidden min-h-[400px] flex flex-col">
        {step === 1 && (
          <div className="animate-in fade-in slide-in-from-right-8 duration-300 h-full flex flex-col">
            <h2 className="text-3xl font-bold text-white mb-2">Where is the data coming from?</h2>
            <p className="text-slate-400 mb-8">Select a configured source connector.</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 flex-1 overflow-y-auto custom-scrollbar p-1">
              {sources.map(s => (
                <ConnectorCard key={s.id} connector={s} selected={selectedSource?.id === s.id} onSelect={() => setSelectedSource(s)} type="source" />
              ))}
              {sources.length === 0 && (
                <div className="col-span-full py-12 text-center border-2 border-dashed border-slate-800 rounded-xl bg-slate-900/50">
                   <p className="text-slate-500 mb-4">No sources configured.</p>
                   <button onClick={onCancel} className="text-blue-500 hover:underline">Go create a Source first</button>
                </div>
              )}
            </div>
            
            <div className="mt-8 flex justify-between pt-6 border-t border-slate-800 shrink-0">
              <button onClick={onCancel} className="text-slate-400 hover:text-white px-4 py-2 font-medium">Cancel</button>
              <button 
                disabled={!selectedSource || loadingSchema}
                onClick={() => setStep(2)}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-8 py-3 rounded-lg font-bold transition-all hover:scale-105 shadow-lg shadow-blue-900/20"
              >
                {loadingSchema ? (
                  <>Discovering Schema... <Loader size={18} className="animate-spin" /></>
                ) : (
                  <>Next Step <ArrowRight size={18} /></>
                )}
              </button>
            </div>
          </div>
        )}

        {step === 2 && sourceType === 'database' && (
           <div className="animate-in fade-in slide-in-from-right-8 duration-300 h-full flex flex-col">
            <h2 className="text-3xl font-bold text-white mb-2">Select Tables to Sync</h2>
            <p className="text-slate-400 mb-8">dlt discovered these tables. Choose which ones to sync.</p>
            
            {availableResources.length === 0 && !loadingSchema ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center text-slate-500">
                  <Database size={48} className="mx-auto mb-4 opacity-50" />
                  <p>No tables found or schema introspection unavailable.</p>
                  <p className="text-sm mt-2">All tables will be synced automatically.</p>
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto custom-scrollbar">
                {/* Check if we have multi-schema resources (schema.table format) */}
                {availableResources.some((r: any) => r.schema) ? (
                  /* Multi-schema view: Group by schema */
                  <div className="space-y-4 pr-2">
                    {(() => {
                      // Group resources by schema
                      const bySchema: Record<string, any[]> = {};
                      availableResources.forEach((resource: any) => {
                        const schema = resource.schema || 'public';
                        if (!bySchema[schema]) bySchema[schema] = [];
                        bySchema[schema].push(resource);
                      });
                      
                      return Object.entries(bySchema).map(([schema, tables]) => (
                        <div key={schema} className="border border-slate-800 rounded-lg overflow-hidden">
                          <div className="bg-slate-950 px-4 py-2 border-b border-slate-800">
                            <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wide">
                              {schema} <span className="text-slate-500 font-normal">({tables.length} tables)</span>
                            </h3>
                          </div>
                          <div className="p-2 space-y-1">
                            {tables.map((resource: any, idx: number) => {
                              const globalIdx = availableResources.indexOf(resource);
                              return (
                                <div
                                  key={resource.name}
                                  onClick={() => {
                                    const updated = [...availableResources];
                                    updated[globalIdx].selected = !updated[globalIdx].selected;
                                    setAvailableResources(updated);
                                  }}
                                  className={`cursor-pointer p-3 rounded border transition-all ${
                                    resource.selected
                                      ? 'bg-blue-600/10 border-blue-500'
                                      : 'bg-slate-900/50 border-slate-800/50 hover:border-slate-600'
                                  }`}
                                >
                                  <div className="flex items-center gap-3">
                                    <input
                                      type="checkbox"
                                      checked={resource.selected}
                                      readOnly
                                      className="rounded bg-slate-800 border-slate-600 text-blue-500"
                                    />
                                    <Database size={14} className="text-slate-400" />
                                    <span className="text-white text-sm">{resource.table}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                ) : (
                  /* Single schema view: Simple list */
                  <div className="space-y-2 pr-2">
                    {availableResources.map((resource, idx) => (
                      <div
                        key={resource.name}
                        onClick={() => {
                          const updated = [...availableResources];
                          updated[idx].selected = !updated[idx].selected;
                          setAvailableResources(updated);
                        }}
                        className={`cursor-pointer p-4 rounded-lg border transition-all ${
                          resource.selected
                            ? 'bg-blue-600/10 border-blue-500'
                            : 'bg-slate-900 border-slate-800 hover:border-slate-600'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={resource.selected}
                            readOnly
                            className="rounded bg-slate-800 border-slate-600 text-blue-500"
                          />
                          <Database size={16} className="text-slate-400" />
                          <span className="text-white font-medium">{resource.name}</span>
                          <span className="text-xs text-slate-500 ml-auto capitalize">{resource.type}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            
            <div className="mt-8 flex justify-between pt-6 border-t border-slate-800 shrink-0">
              <button onClick={() => setStep(1)} className="text-slate-400 hover:text-white px-4 py-2 font-medium">Back</button>
              <button 
                onClick={() => setStep(3)}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-lg font-bold transition-all hover:scale-105 shadow-lg shadow-blue-900/20"
              >
                Next Step <ArrowRight size={18} />
              </button>
            </div>
          </div>
        )}

        {step === 2 && sourceType !== 'database' && (
           <div className="animate-in fade-in slide-in-from-right-8 duration-300 h-full flex flex-col">
            <h2 className="text-3xl font-bold text-white mb-2">Resource Selection</h2>
            <p className="text-slate-400 mb-4">This source type will sync all available resources automatically via dlt.</p>
            
            <div className="flex-1 flex items-center justify-center bg-slate-950/50 rounded-xl border border-slate-800">
              <div className="text-center p-12">
                <Zap size={64} className="mx-auto mb-6 text-blue-500" />
                <h3 className="text-2xl font-bold text-white mb-3">Intelligent Sync</h3>
                <p className="text-slate-400 max-w-md mx-auto">
                  dlt will automatically discover and sync all available resources from this {sourceType} source.
                  No manual configuration needed.
                </p>
              </div>
            </div>
            
            <div className="mt-8 flex justify-between pt-6 border-t border-slate-800 shrink-0">
              <button onClick={() => setStep(1)} className="text-slate-400 hover:text-white px-4 py-2 font-medium">Back</button>
              <button 
                onClick={() => setStep(3)}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-lg font-bold transition-all hover:scale-105 shadow-lg shadow-blue-900/20"
              >
                Next Step <ArrowRight size={18} />
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
           <div className="animate-in fade-in slide-in-from-right-8 duration-300 h-full flex flex-col">
            <h2 className="text-3xl font-bold text-white mb-2">Where should the data go?</h2>
            <p className="text-slate-400 mb-8">Select a destination warehouse or lake.</p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 flex-1 overflow-y-auto custom-scrollbar p-1">
              {destinations.map(d => (
                <ConnectorCard key={d.id} connector={d} selected={selectedDest?.id === d.id} onSelect={() => setSelectedDest(d)} type="destination" />
              ))}
               {destinations.length === 0 && (
                <div className="col-span-full py-12 text-center border-2 border-dashed border-slate-800 rounded-xl bg-slate-900/50">
                   <p className="text-slate-500 mb-4">No destinations configured.</p>
                   <button onClick={onCancel} className="text-blue-500 hover:underline">Go create a Destination first</button>
                </div>
              )}
            </div>
            
            <div className="mt-8 flex justify-between pt-6 border-t border-slate-800 shrink-0">
              <button onClick={() => setStep(2)} className="text-slate-400 hover:text-white px-4 py-2 font-medium">Back</button>
              <button 
                disabled={!selectedDest}
                onClick={() => setStep(4)}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-8 py-3 rounded-lg font-bold transition-all hover:scale-105 shadow-lg shadow-blue-900/20"
              >
                Next Step <ArrowRight size={18} />
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
           <div className="animate-in fade-in slide-in-from-right-8 duration-300 h-full flex flex-col">
            <h2 className="text-3xl font-bold text-white mb-2">Sync Configuration</h2>
            <p className="text-slate-400 mb-8">How should we move the data?</p>

            <div className="flex-1 space-y-8 overflow-y-auto custom-scrollbar pr-2">
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-300 uppercase tracking-wide">Pipeline Name</label>
                <input 
                  type="text" 
                  value={name} 
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Production Postgres -> Snowflake Sync"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none text-lg transition-all"
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm font-bold text-slate-300 uppercase tracking-wide">
                        <RefreshCw size={14} className="text-blue-500" /> Sync Mode
                    </label>
                    <div className="relative">
                        <select
                            value={syncMode}
                            onChange={(e) => setSyncMode(e.target.value as SyncMode)}
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-4 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none appearance-none"
                        >
                            {SYNC_MODE_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                        <div className="absolute right-4 top-4 pointer-events-none text-slate-500">
                            <Settings size={16} />
                        </div>
                    </div>
                    <p className="text-xs text-slate-500 mt-2 px-1">
                        {SYNC_MODE_OPTIONS.find(o => o.value === syncMode)?.description}
                    </p>
                </div>

                <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm font-bold text-slate-300 uppercase tracking-wide">
                        <Clock size={14} className="text-blue-500" /> Frequency
                    </label>
                    <div className="relative">
                        <select
                            value={frequency}
                            onChange={(e) => setFrequency(e.target.value as Frequency)}
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-4 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none appearance-none"
                        >
                            {FREQUENCY_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                         <div className="absolute right-4 top-4 pointer-events-none text-slate-500">
                            <Zap size={16} />
                        </div>
                    </div>
                    <p className="text-xs text-slate-500 mt-2 px-1">Orchestration handled automatically by internal scheduler.</p>
                </div>
              </div>

               {/* PERFORMANCE TUNING */}
               <div className="pt-6 border-t border-slate-800">
                  <button onClick={() => setShowPerf(!showPerf)} className="flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-white transition-colors">
                     {showPerf ? 'Hide' : 'Show'} Enterprise Performance Settings <Cpu size={14} />
                  </button>
                  
                  {showPerf && (
                      <div className="grid grid-cols-3 gap-4 mt-4 bg-slate-950/50 p-4 rounded-xl border border-slate-800 animate-in fade-in slide-in-from-top-2">
                          <div>
                             <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Batch Size</label>
                             <input type="number" value={perfConfig.batchSize} onChange={e => setPerfConfig({...perfConfig, batchSize: parseInt(e.target.value)})} className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-white" />
                             <p className="text-[10px] text-slate-500 mt-1">Rows per chunk</p>
                          </div>
                          <div>
                             <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Parallelism</label>
                             <input type="number" value={perfConfig.parallelism} onChange={e => setPerfConfig({...perfConfig, parallelism: parseInt(e.target.value)})} className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-white" />
                             <p className="text-[10px] text-slate-500 mt-1">Threads/Workers</p>
                          </div>
                          <div>
                             <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Memory Limit</label>
                             <select value={perfConfig.memoryLimit} onChange={e => setPerfConfig({...perfConfig, memoryLimit: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-white">
                                <option value="256MB">256 MB</option>
                                <option value="512MB">512 MB</option>
                                <option value="1GB">1 GB</option>
                                <option value="2GB">2 GB</option>
                                <option value="Unlimited">Unlimited</option>
                             </select>
                             <p className="text-[10px] text-slate-500 mt-1">Container RAM</p>
                          </div>
                      </div>
                  )}
               </div>

            </div>

            <div className="mt-8 flex justify-between pt-6 border-t border-slate-800 shrink-0">
              <button onClick={() => setStep(3)} className="text-slate-400 hover:text-white px-4 py-2 font-medium">Back</button>
              <button 
                disabled={!name}
                onClick={() => setStep(5)}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-8 py-3 rounded-lg font-bold transition-all hover:scale-105 shadow-lg shadow-blue-900/20"
              >
                Next Step <ArrowRight size={18} />
              </button>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="animate-in fade-in slide-in-from-right-8 duration-300 h-full flex flex-col">
            <h2 className="text-3xl font-bold text-white mb-2">Governance & Reliability</h2>
            <p className="text-slate-400 mb-8">Ensure schema quality and set up alerts.</p>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-8 pr-2">
              
              {/* Schema Drift Section */}
              <div className="p-5 border border-slate-800 rounded-xl bg-slate-950/50">
                 <div className="flex items-center gap-2 mb-4 text-blue-400">
                    <Shield size={20} />
                    <h3 className="font-bold text-lg text-white">Schema Drift Policy</h3>
                 </div>
                 <p className="text-sm text-slate-400 mb-4">What should happen if the source adds new columns?</p>
                 <div className="grid grid-cols-3 gap-3">
                   {['evolve', 'freeze', 'fail'].map((policy) => (
                      <button
                        key={policy}
                        onClick={() => setSchemaPolicy(policy as SchemaPolicy)}
                        className={`p-3 rounded-lg border text-sm font-medium capitalize transition-all ${schemaPolicy === policy ? 'bg-blue-600 text-white border-blue-500' : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800'}`}
                      >
                        {policy}
                      </button>
                   ))}
                 </div>
              </div>

              {/* Notifications Section */}
              <div className="p-5 border border-slate-800 rounded-xl bg-slate-950/50">
                 <div className="flex items-center gap-2 mb-4 text-amber-400">
                    <Bell size={20} />
                    <h3 className="font-bold text-lg text-white">Notifications</h3>
                 </div>
                 <div className="flex items-center gap-6 mb-4">
                    <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                       <input type="checkbox" checked={notifyConfig.onFailure} onChange={e => setNotifyConfig({...notifyConfig, onFailure: e.target.checked})} className="rounded bg-slate-800 border-slate-600 text-blue-500" />
                       Alert on Failure
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                       <input type="checkbox" checked={notifyConfig.onSuccess} onChange={e => setNotifyConfig({...notifyConfig, onSuccess: e.target.checked})} className="rounded bg-slate-800 border-slate-600 text-blue-500" />
                       Alert on Success
                    </label>
                 </div>
                 <div className="relative">
                    <input 
                      type="text" 
                      value={notifyConfig.slackWebhook || ''}
                      onChange={e => setNotifyConfig({...notifyConfig, slackWebhook: e.target.value})}
                      placeholder="https://hooks.slack.com/services/..."
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 pl-3 pr-3 text-sm text-white focus:outline-none focus:border-blue-500"
                    />
                    <div className="absolute right-3 top-2.5 text-xs text-slate-500">Slack Webhook URL</div>
                 </div>
              </div>

               {/* Transformation Section */}
               <div className="p-5 border border-slate-800 rounded-xl bg-slate-950/50">
                 <div className="flex items-center gap-2 mb-4 text-purple-400">
                    <GitBranch size={20} />
                    <h3 className="font-bold text-lg text-white">Post-Load Transformation (dbt)</h3>
                 </div>
                 <div className="mb-4">
                    <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer mb-2">
                       <input type="checkbox" checked={dbtConfig.runAfterLoad} onChange={e => setDbtConfig({...dbtConfig, runAfterLoad: e.target.checked})} className="rounded bg-slate-800 border-slate-600 text-blue-500" />
                       Run dbt project after sync
                    </label>
                 </div>
                 {dbtConfig.runAfterLoad && (
                   <div className="animate-in fade-in slide-in-from-top-2">
                       <input 
                        type="text" 
                        value={dbtConfig.dbtRepoUrl || ''}
                        onChange={e => setDbtConfig({...dbtConfig, dbtRepoUrl: e.target.value})}
                        placeholder="git@github.com:my-org/my-dbt-project.git"
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 pl-3 pr-3 text-sm text-white focus:outline-none focus:border-blue-500 font-mono"
                      />
                   </div>
                 )}
              </div>
            </div>

            <div className="mt-8 flex justify-between pt-6 border-t border-slate-800 shrink-0">
              <button onClick={() => setStep(4)} className="text-slate-400 hover:text-white px-4 py-2 font-medium">Back</button>
              <button 
                onClick={handleSave}
                disabled={deploying}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-10 py-3 rounded-lg font-bold transition-all hover:scale-105 shadow-lg shadow-emerald-900/20"
              >
                 {deploying ? (
                    <>Deploying Workers...</>
                ) : (
                    <><Play size={18} fill="currentColor" /> Start Pipeline</>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
