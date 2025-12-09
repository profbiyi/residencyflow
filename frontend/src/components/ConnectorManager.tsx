

import React, { useState, useEffect } from 'react';
import { ConnectorType, ConnectorInstance, JsonSchemaProperty } from '../types';
import { ICON_MAP, SOURCE_TYPES, DESTINATION_TYPES } from '../constants';
import { Plus, Search, CheckCircle, MoreVertical, Trash2, Edit2, Loader2, AlertCircle, Eye, EyeOff, Lock, Key, Globe, Database, Server, Info, Code, Hash, Type } from 'lucide-react';
import { api } from '../services/api';

interface Props {
  type: 'source' | 'destination';
  existing: ConnectorInstance[];
  onAdd: (connector: ConnectorInstance) => void;
  onUpdate: (connector: ConnectorInstance) => void;
  onDelete: (id: string) => void;
}

export const ConnectorManager: React.FC<Props> = ({ type, existing, onAdd, onUpdate, onDelete }) => {
  const [mode, setMode] = useState<'list' | 'add' | 'edit'>('list');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedType, setSelectedType] = useState<ConnectorType | null>(null);
  
  // Form State
  const [editId, setEditId] = useState<string | null>(null);
  const [configName, setConfigName] = useState('');
  const [configValues, setConfigValues] = useState<Record<string, any>>({});
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState<Record<string, boolean>>({});

  // Testing State
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');
  const [testMessage, setTestMessage] = useState<string>('');

  const AVAILABLE_TYPES = type === 'source' ? SOURCE_TYPES : DESTINATION_TYPES;
  const categories = ['All', ...Array.from(new Set(AVAILABLE_TYPES.map(t => t.category || 'Other')))];

  const filteredTypes = AVAILABLE_TYPES.filter(t => {
    const matchesSearch = t.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          t.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || t.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Reset form when type changes or mode changes
  useEffect(() => {
    if (selectedType && mode === 'add') {
      setConfigName(`${selectedType.name} Connection`);
      setConfigValues({});
      setTestStatus('idle');
      setTestMessage('');
      
      // Initialize defaults from schema
      if (selectedType.schema.properties) {
        const defaults: Record<string, any> = {};
        Object.entries(selectedType.schema.properties).forEach(([key, prop]) => {
          if (prop.default !== undefined) defaults[key] = prop.default;
        });
        setConfigValues(defaults);
      }
    }
  }, [selectedType, mode]);

  const handleEditClick = (instance: ConnectorInstance) => {
    setEditId(instance.id);
    setConfigName(instance.name);
    setConfigValues(instance.configuration || {});
    const typeDef = AVAILABLE_TYPES.find(t => t.id === instance.typeId);
    if (typeDef) setSelectedType(typeDef);
    setMode('edit');
    setActiveMenuId(null);
    setTestStatus('idle');
    setTestMessage('');
  };

  const handleTestConnection = async () => {
    if (!selectedType) return;
    
    // Client-side validation first
    const missingFields = selectedType.schema.required.filter(key => 
        !configValues[key] || configValues[key].toString().trim() === ''
    );
    
    if (missingFields.length > 0) {
        setTestStatus('failed');
        setTestMessage(`Missing required fields: ${missingFields.join(', ')}`);
        return;
    }
    
    // Real backend test
    setTestStatus('testing');
    setTestMessage('Testing connection to data source...');
    
    try {
        const result = await api.connectors.test(selectedType.id, configValues);
        if (result.success) {
            setTestStatus('success');
            setTestMessage(result.message);
        } else {
            setTestStatus('failed');
            setTestMessage(result.message);
        }
    } catch (error) {
        setTestStatus('failed');
        setTestMessage(`Connection test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleSave = async () => {
    const finalName = configName || `${selectedType?.name || 'New'} Connection`;
    if (!selectedType) return;

    if (testStatus === 'failed') {
        if (!window.confirm("The connection test failed. Save anyway?")) return;
    }

    const newInstance: ConnectorInstance = {
        id: editId || `${type}-${Date.now()}`,
        name: finalName,
        typeId: selectedType.id,
        status: testStatus === 'success' ? 'active' : 'pending',
        configuration: configValues,
        region: 'Auto-detected',
        organizationId: '', // Placeholder, populated by parent
        createdBy: '' // Placeholder, populated by parent
    };

    if (mode === 'add') {
      await onAdd(newInstance);
    } else {
      await onUpdate(newInstance);
    }
    resetForm();
  };

  const handleDeleteClick = (id: string) => {
    if (window.confirm("Are you sure you want to delete this connector? Pipelines using this may break.")) {
      onDelete(id);
    }
    setActiveMenuId(null);
  };

  const resetForm = () => {
    setMode('list');
    setEditId(null);
    setSelectedType(null);
    setConfigName('');
    setSearchTerm('');
    setSelectedCategory('All');
    setTestStatus('idle');
    setTestMessage('');
    setConfigValues({});
  };

  // --- DYNAMIC FORM RENDERER ---
  const renderSchemaField = (key: string, prop: JsonSchemaProperty, required: boolean) => {
    const isPassword = prop.format === 'password' || prop.secret;
    const isTextarea = prop.format === 'json';
    const isSelect = !!prop.enum;
    const isBoolean = prop.type === 'boolean';

    if (isBoolean) {
         return (
              <div key={key} className="animate-in fade-in slide-in-from-bottom-1 duration-300">
                  <div className="flex items-center gap-3 p-3 bg-slate-950 border border-slate-800 rounded-lg hover:border-slate-700 transition-colors">
                    <input
                        type="checkbox"
                        checked={!!configValues[key]}
                        onChange={(e) => setConfigValues({...configValues, [key]: e.target.checked})}
                        className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-900 cursor-pointer"
                    />
                    <div className="flex-1">
                        <label className="text-sm font-bold text-slate-300 cursor-pointer select-none flex items-center gap-2">
                            {prop.title || key}
                            {required && <span className="text-blue-500 text-[10px]">REQUIRED</span>}
                        </label>
                        {prop.description && <p className="text-xs text-slate-500 mt-0.5">{prop.description}</p>}
                    </div>
                  </div>
              </div>
         );
    }

    return (
      <div key={key} className="animate-in fade-in slide-in-from-bottom-1 duration-300">
         <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 flex items-center justify-between">
            {prop.title || key}
            {required && <span className="text-blue-500 text-[10px]">REQUIRED</span>}
         </label>
         
         <div className="relative group">
            {/* Icon Decoration */}
            <div className="absolute left-3 top-2.5 text-slate-600 w-4 h-4 pointer-events-none group-focus-within:text-blue-500 transition-colors">
              {isPassword ? <Key size={14}/> : 
               prop.type === 'integer' ? <Hash size={14}/> :
               isSelect ? <Globe size={14} /> :
               <Type size={14} />}
            </div>

            {isSelect ? (
               <select
                 value={configValues[key] || ''}
                 onChange={(e) => setConfigValues({...configValues, [key]: e.target.value})}
                 className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 pl-10 pr-3 text-sm text-white focus:outline-none focus:border-blue-500 appearance-none transition-colors"
               >
                 <option value="" disabled>Select {prop.title}</option>
                 {prop.enum?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
               </select>
            ) : isTextarea ? (
               <textarea 
                  value={configValues[key] || ''}
                  onChange={(e) => setConfigValues({...configValues, [key]: e.target.value})}
                  rows={4}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 pl-10 pr-3 text-sm text-white focus:outline-none focus:border-blue-500 font-mono"
                  placeholder={prop.description || prop.title}
               />
            ) : (
               <input 
                 type={isPassword && !showPassword[key] ? 'password' : (prop.type === 'integer' ? 'number' : 'text')}
                 value={configValues[key] || ''}
                 onChange={(e) => setConfigValues({...configValues, [key]: prop.type === 'integer' ? parseInt(e.target.value) || 0 : e.target.value})}
                 placeholder={prop.description || `Enter ${prop.title}`}
                 className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 pl-10 pr-10 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
               />
            )}

            {isPassword && (
              <button 
                type="button"
                onClick={() => setShowPassword(prev => ({...prev, [key]: !prev[key]}))}
                className="absolute right-3 top-2.5 text-slate-600 hover:text-slate-400"
              >
                {showPassword[key] ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            )}
         </div>
         {prop.description && !isTextarea && <p className="text-[10px] text-slate-600 mt-1">{prop.description}</p>}
      </div>
    );
  };

  if (mode === 'add' || mode === 'edit') {
    return (
      <div className="max-w-6xl mx-auto h-[calc(100vh-140px)] flex flex-col">
        <div className="flex items-center justify-between mb-4 shrink-0">
           <h2 className="text-2xl font-bold text-white">
             {mode === 'add' ? `Add New ${type === 'source' ? 'Source' : 'Destination'}` : `Edit ${configName}`}
           </h2>
           <button onClick={resetForm} className="text-slate-400 hover:text-white px-3 py-1 rounded hover:bg-slate-800 transition-colors">Cancel</button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 flex-1 min-h-0">
          
          {/* Left Column: Selection */}
          <div className="md:col-span-4 lg:col-span-3 bg-slate-900 border border-slate-800 rounded-xl flex flex-col overflow-hidden">
             {mode === 'add' ? (
               <div className="flex h-full flex-col">
                  {/* Category Tabs */}
                  <div className="flex overflow-x-auto border-b border-slate-800 p-2 gap-1 custom-scrollbar shrink-0">
                      {categories.map(cat => (
                        <button
                          key={cat}
                          onClick={() => setSelectedCategory(cat)}
                          className={`whitespace-nowrap px-3 py-1 rounded-full text-xs font-bold transition-colors ${selectedCategory === cat ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                        >
                          {cat}
                        </button>
                     ))}
                  </div>

                  {/* Search */}
                  <div className="p-3 border-b border-slate-800 shrink-0">
                    <div className="relative">
                       <Search className="absolute left-3 top-2.5 text-slate-500 w-4 h-4" />
                       <input 
                          type="text" 
                          placeholder="Search connectors..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg py-2 pl-9 pr-3 text-xs text-white focus:outline-none focus:border-blue-500"
                        />
                    </div>
                  </div>

                  {/* List */}
                  <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
                      {filteredTypes.map(t => {
                          const Icon = ICON_MAP[t.icon] || ICON_MAP.default;
                          return (
                            <div 
                              key={t.id}
                              onClick={() => { setSelectedType(t); setTestStatus('idle'); }}
                              className={`cursor-pointer p-3 mb-2 rounded-lg border flex items-center gap-3 transition-all
                                ${selectedType?.id === t.id 
                                  ? 'bg-blue-600/10 border-blue-500' 
                                  : 'bg-transparent border-transparent hover:bg-slate-800'}`}
                            >
                              <Icon className={`${selectedType?.id === t.id ? 'text-blue-400' : 'text-slate-500'} w-5 h-5 shrink-0`} />
                              <div className="overflow-hidden">
                                <div className={`text-sm font-medium truncate ${selectedType?.id === t.id ? 'text-white' : 'text-slate-300'}`}>{t.name}</div>
                                <div className="text-[10px] text-slate-500 truncate">{t.description}</div>
                              </div>
                            </div>
                          );
                      })}
                      {filteredTypes.length === 0 && <div className="p-4 text-center text-slate-500 text-xs">No connectors found.</div>}
                  </div>
               </div>
             ) : (
                <div className="flex items-center justify-center h-full p-8 bg-slate-900/50">
                   <div className="flex flex-col items-center gap-6">
                      {selectedType && (() => {
                          const Icon = ICON_MAP[selectedType.icon] || ICON_MAP.default;
                          return <div className="p-6 bg-slate-950 rounded-full border border-slate-800 shadow-xl"><Icon className="text-blue-400 w-16 h-16" /></div>;
                      })()}
                      <div className="text-center">
                         <h3 className="text-xl font-bold text-white mb-1">{selectedType?.name}</h3>
                         <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px] uppercase font-bold tracking-wide">{selectedType?.category}</span>
                      </div>
                   </div>
                </div>
             )}
          </div>
          
          {/* Right Column: Configuration */}
          <div className="md:col-span-8 lg:col-span-9 flex flex-col h-full overflow-hidden">
             {selectedType ? (
               <div className="bg-slate-900 border border-slate-800 rounded-xl flex flex-col h-full animate-in fade-in slide-in-from-right-4 overflow-hidden shadow-2xl">
                  
                  {/* Header */}
                  <div className="p-6 border-b border-slate-800 flex items-center justify-between shrink-0">
                     <div className="flex items-center gap-3">
                        <div className="p-2 bg-slate-950 rounded-lg border border-slate-800">
                           {(() => { const I = ICON_MAP[selectedType.icon]; return <I className="text-blue-500 w-5 h-5" />; })()}
                        </div>
                        <div>
                           <h3 className="text-lg font-bold text-white">Configure {selectedType.name}</h3>
                           <p className="text-xs text-slate-400">Fill in the connection details below.</p>
                        </div>
                     </div>
                     <div className="text-xs text-slate-500 font-mono bg-slate-950 px-2 py-1 rounded">
                        ID: {selectedType.id}
                     </div>
                  </div>
                  
                  {/* Scrollable Form Area */}
                  <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                     <div className="max-w-3xl mx-auto space-y-6">
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Display Name</label>
                          <input 
                            type="text" 
                            value={configName}
                            onChange={(e) => setConfigName(e.target.value)}
                            placeholder={`My ${selectedType.name} Connection`}
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors text-base"
                          />
                        </div>

                        {/* DYNAMIC SCHEMA RENDERER */}
                        <div className="p-6 bg-slate-950/50 rounded-xl border border-slate-800 space-y-5">
                           {Object.entries(selectedType.schema.properties).map(([key, prop]) => (
                              renderSchemaField(key, prop, selectedType.schema.required.includes(key))
                           ))}
                        </div>
                     </div>
                  </div>
                  
                  {/* Footer Actions */}
                  <div className="p-6 border-t border-slate-800 bg-slate-900 shrink-0">
                     <div className="max-w-3xl mx-auto space-y-4">
                       {/* Result Banner */}
                       {testStatus !== 'idle' && (
                         <div className={`p-3 rounded-lg border flex items-center gap-3 text-sm animate-in fade-in slide-in-from-bottom-2
                            ${testStatus === 'testing' ? 'bg-blue-900/20 border-blue-900 text-blue-400' : ''}
                            ${testStatus === 'success' ? 'bg-emerald-900/20 border-emerald-900 text-emerald-400' : ''}
                            ${testStatus === 'failed' ? 'bg-red-900/20 border-red-900 text-red-400' : ''}
                          `}>
                            {testStatus === 'testing' && <Loader2 className="animate-spin w-4 h-4" />}
                            {testStatus === 'success' && <CheckCircle className="w-4 h-4" />}
                            {testStatus === 'failed' && <AlertCircle className="w-4 h-4" />}
                            <span className="flex-1 font-medium">{testMessage}</span>
                        </div>
                       )}

                       <div className="flex gap-4">
                          <button 
                              onClick={handleTestConnection}
                              disabled={testStatus === 'testing'}
                              className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-medium py-3 rounded-lg transition-colors border border-slate-700 disabled:opacity-50 flex justify-center items-center gap-2"
                          >
                              {testStatus === 'testing' && <Loader2 className="animate-spin w-4 h-4"/>}
                              Test Connection
                          </button>
                          <button 
                              onClick={handleSave}
                              disabled={!configName || testStatus === 'testing'}
                              className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg shadow-lg shadow-blue-900/20 transition-all hover:scale-[1.01]"
                          >
                              {mode === 'add' ? 'Save Connector' : 'Update Connector'}
                          </button>
                       </div>
                     </div>
                  </div>
               </div>
             ) : (
                <div className="bg-slate-900/50 border border-slate-800 rounded-xl h-full flex flex-col justify-center items-center text-center text-slate-500">
                   <div className="w-20 h-20 rounded-full bg-slate-900 flex items-center justify-center mb-6 border border-slate-800">
                      <Search size={32} className="opacity-50" />
                   </div>
                   <h3 className="text-white font-bold text-lg mb-2">No Connector Selected</h3>
                   <p className="text-sm max-w-xs">Select a {type} from the list on the left to begin configuration.</p>
                </div>
             )}
          </div>
        </div>
      </div>
    );
  }

  // LIST VIEW
  return (
    <div className="space-y-6 h-[calc(100vh-140px)] flex flex-col">
      <div className="flex justify-between items-center shrink-0">
        <div>
           <h2 className="text-xl font-bold text-white capitalize">Your {type}s</h2>
           <p className="text-sm text-slate-400">Manage connections to your {type} systems.</p>
        </div>
        <button 
          onClick={() => { setMode('add'); setSelectedType(null); }}
          className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-all hover:scale-105"
        >
          <Plus size={16} /> Add New {type === 'source' ? 'Source' : 'Destination'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar pb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {existing.map(item => {
            const typeDef = AVAILABLE_TYPES.find(t => t.id === item.typeId);
            const Icon = typeDef ? (ICON_MAP[typeDef.icon] || ICON_MAP.default) : ICON_MAP.default;
            
            return (
              <div key={item.id} className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-600 transition-all group relative shadow-lg shadow-black/20">
                  {/* Dropdown Menu */}
                  <div className="absolute top-4 right-4">
                      <button 
                        onClick={() => setActiveMenuId(activeMenuId === item.id ? null : item.id)} 
                        className="text-slate-600 hover:text-white transition-colors p-1 bg-slate-900/50 rounded-full hover:bg-slate-800"
                      >
                        <MoreVertical size={16} />
                      </button>
                      
                      {activeMenuId === item.id && (
                        <div className="absolute right-0 mt-2 w-32 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-20 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                            <button 
                              onClick={() => handleEditClick(item)}
                              className="w-full px-4 py-2 text-left text-xs text-slate-300 hover:bg-slate-700 flex items-center gap-2"
                            >
                              <Edit2 size={12} /> Edit
                            </button>
                            <button 
                              onClick={() => handleDeleteClick(item.id)}
                              className="w-full px-4 py-2 text-left text-xs text-red-400 hover:bg-slate-700 flex items-center gap-2"
                            >
                              <Trash2 size={12} /> Delete
                            </button>
                        </div>
                      )}
                  </div>

                  {/* Card Overlay to close menu if clicked outside */}
                  {activeMenuId === item.id && (
                    <div className="fixed inset-0 z-10" onClick={() => setActiveMenuId(null)} />
                  )}

                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-center text-slate-300 group-hover:text-blue-400 group-hover:border-blue-500/30 transition-colors">
                        <Icon size={24} />
                    </div>
                    <div>
                        <h3 className="font-semibold text-white truncate max-w-[150px]">{item.name}</h3>
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-1">
                          <span className={`w-1.5 h-1.5 rounded-full ${item.status === 'active' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                          <span className="capitalize">{item.status}</span>
                        </div>
                    </div>
                  </div>
                  <div className="pt-4 border-t border-slate-800 flex justify-between items-center text-xs">
                    <span className="text-slate-500 bg-slate-950 px-2 py-1 rounded border border-slate-800">{typeDef?.category || 'Generic'}</span>
                    <span className="text-slate-500 font-mono">{typeDef?.name || 'Unknown Type'}</span>
                  </div>
              </div>
            );
          })}
          
          {existing.length === 0 && (
            <div className="col-span-full py-16 text-center border-2 border-dashed border-slate-800 rounded-xl bg-slate-900/30">
              <div className="w-16 h-16 bg-slate-900 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-600 border border-slate-800">
                  <Search size={24} />
              </div>
              <p className="text-slate-400 font-medium">No {type}s configured yet.</p>
              <button onClick={() => { setMode('add'); setSelectedType(null); }} className="text-blue-500 text-sm mt-2 hover:underline">Configure your first {type}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
