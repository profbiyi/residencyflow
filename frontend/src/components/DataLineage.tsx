
import React, { useState, useMemo } from 'react';
import { Pipeline, ConnectorInstance, LineageNode, LineageEdge, DataQualityMetric } from '../types';
import { ICON_MAP, SOURCE_TYPES, DESTINATION_TYPES } from '../constants';
import { Activity, CheckCircle, Clock, Shield, Database, Search, BarChart2, GitBranch, ArrowRight } from 'lucide-react';

interface Props {
  pipelines?: Pipeline[];
  sources?: ConnectorInstance[];
  destinations?: ConnectorInstance[];
}

export const DataLineage: React.FC<Props> = ({ pipelines = [], sources = [], destinations = [] }) => {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // --- DYNAMIC GRAPH BUILDER ---
  const { nodes, edges } = useMemo(() => {
    const newNodes: LineageNode[] = [];
    const newEdges: LineageEdge[] = [];
    const processedIds = new Set<string>();

    // Helper to add node if unique
    const addNode = (id: string, label: string, type: LineageNode['type'], iconKey: string, extra: Partial<LineageNode> = {}) => {
        if (!processedIds.has(id)) {
            newNodes.push({
                id,
                label,
                type,
                status: 'healthy',
                icon: iconKey,
                freshness: 'Now',
                volume: 'Unknown',
                ...extra
            });
            processedIds.add(id);
        }
    };

    pipelines.forEach((p, idx) => {
        const src = sources.find(s => s.id === p.sourceId);
        const dest = destinations.find(d => d.id === p.destinationId);
        if (!src || !dest) return;

        const srcType = SOURCE_TYPES.find(t => t.id === src.typeId);
        const destType = DESTINATION_TYPES.find(t => t.id === dest.typeId);

        // 1. Source Node
        addNode(src.id, src.name, 'source', srcType?.icon || 'database', { volume: 'Live' });

        // 2. Governance/Transform Node (Middle Layer)
        // Created unique ID per pipeline to show distinct processing paths
        const transformId = `transform-${p.id}`;
        const hasGovernance = p.schemaPolicy !== 'evolve' || (p.notifications?.onFailure);
        addNode(transformId, 'ResidencyFlow Engine', 'transform', hasGovernance ? 'shield' : 'layers', { 
            volume: `${p.rowsProcessed.toLocaleString()} rows`,
            freshness: p.lastRun
        });

        // Edge: Source -> Transform
        newEdges.push({ from: src.id, to: transformId });

        // 3. Destination Node
        addNode(dest.id, dest.name, 'storage', destType?.icon || 'server', { volume: 'Synced' });

        // Edge: Transform -> Destination
        newEdges.push({ from: transformId, to: dest.id });

        // 4. dbt Model Node (Optional)
        if (p.transformation?.runAfterLoad) {
            const dbtId = `dbt-${p.id}`;
            addNode(dbtId, p.transformation.dbtModelName || 'dbt Models', 'model', 'git-branch', { freshness: 'After Load' });
            newEdges.push({ from: dest.id, to: dbtId });
        }
    });

    // If empty, show at least one node to avoid crash/empty screen confusion
    if (newNodes.length === 0) {
       return { nodes: [], edges: [] };
    }

    // --- AUTO LAYOUT (Simple Layering) ---
    const LEVEL_GAP = 250;
    const Y_SPACING = 100;
    const layoutNodes = newNodes.map((node) => {
        let x = 50;
        if (node.type === 'transform') x += LEVEL_GAP;
        if (node.type === 'storage') x += LEVEL_GAP * 2;
        if (node.type === 'model') x += LEVEL_GAP * 3;
        
        // Simple Y distribution based on index to prevent overlap
        // In a real app, we'd use dagre or elkjs for layout
        const indexInType = newNodes.filter(n => n.type === node.type).indexOf(node);
        const y = 100 + (indexInType * Y_SPACING);
        
        return { ...node, x, y };
    });

    return { nodes: layoutNodes, edges: newEdges };
  }, [pipelines, sources, destinations]);

  // Find selected node details
  const selectedNode = nodes.find(n => n.id === selectedNodeId);
  
  // Mock Metrics generator based on selected node type
  const metrics: DataQualityMetric[] = useMemo(() => {
      if (!selectedNode) return [];
      if (selectedNode.type === 'source') {
          return [
              { column: 'id', nullCount: 0, uniqueCount: 1500, score: 100 },
              { column: 'created_at', nullCount: 0, uniqueCount: 1500, score: 100 }
          ];
      }
      if (selectedNode.type === 'transform') {
          return [
              { column: 'PII_check', nullCount: 0, uniqueCount: 1, score: 100 },
              { column: 'schema_validation', nullCount: 0, uniqueCount: 1, score: 100 }
          ];
      }
      return [
          { column: 'synced_at', nullCount: 0, uniqueCount: 1500, score: 100 },
          { column: '_dlt_load_id', nullCount: 0, uniqueCount: 45, score: 100 }
      ];
  }, [selectedNode]);

  // SVG Edge Rendering
  const renderEdge = (fromId: string, toId: string) => {
    const source = nodes.find(n => n.id === fromId);
    const target = nodes.find(n => n.id === toId);
    if (!source || !target) return null;

    const NODE_WIDTH = 180;
    const NODE_HEIGHT = 60;

    const startX = (source.x || 0) + NODE_WIDTH;
    const startY = (source.y || 0) + (NODE_HEIGHT / 2);
    const endX = target.x || 0;
    const endY = (target.y || 0) + (NODE_HEIGHT / 2);
    
    const controlX1 = startX + 80;
    const controlX2 = endX - 80;

    return (
      <path
        key={`${fromId}-${toId}`}
        d={`M ${startX} ${startY} C ${controlX1} ${startY}, ${controlX2} ${endY}, ${endX} ${endY}`}
        fill="none"
        stroke="#334155"
        strokeWidth="2"
        className="animate-[dash_2s_linear_infinite]"
        style={{ strokeDasharray: '10, 5' }}
      />
    );
  };

  return (
    <div className="h-[calc(100vh-140px)] flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Data Lineage & Observability</h2>
          <p className="text-slate-400 text-sm">Real-time map of your active pipelines.</p>
        </div>
        <div className="flex gap-2">
           <span className="flex items-center gap-2 text-xs font-bold uppercase px-3 py-1 bg-emerald-900/30 text-emerald-400 rounded-full border border-emerald-900">
             <Activity size={14} /> Observability Active
           </span>
        </div>
      </div>

      <div className="flex-1 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col lg:flex-row">
         {/* SVG GRAPH AREA */}
         <div className="flex-1 relative bg-[url('https://grainy-gradients.vercel.app/noise.svg')] bg-slate-950 overflow-hidden relative">
            <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-transparent to-slate-950/50" />
            
            {nodes.length === 0 ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500">
                    <GitBranch size={48} className="mb-4 opacity-50" />
                    <p>No active pipelines to visualize.</p>
                    <p className="text-xs mt-2">Create a pipeline to generate lineage.</p>
                </div>
            ) : (
                <svg className="w-full h-full min-h-[500px] cursor-grab active:cursor-grabbing">
                {/* Edges */}
                {edges.map(edge => renderEdge(edge.from, edge.to))}

                {/* Nodes */}
                {nodes.map(node => {
                    const Icon = ICON_MAP[node.icon] || ICON_MAP.default;
                    const isSelected = selectedNodeId === node.id;

                    return (
                    <foreignObject 
                        key={node.id} 
                        x={node.x} 
                        y={node.y} 
                        width={180} 
                        height={100}
                        className="overflow-visible"
                    >
                        <div 
                            onClick={() => setSelectedNodeId(node.id)}
                            className={`
                            group cursor-pointer rounded-lg p-3 border transition-all duration-300 relative
                            ${isSelected ? 'bg-slate-800 border-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.3)] scale-105' : 'bg-slate-900 border-slate-700 hover:border-slate-500'}
                            `}
                        >
                            <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-md ${node.type === 'transform' ? 'bg-purple-900/30 text-purple-400' : 'bg-slate-800 text-blue-400'}`}>
                                <Icon size={18} />
                                </div>
                                <div>
                                <div className="text-xs font-bold text-slate-300 group-hover:text-white truncate max-w-[100px]">{node.label}</div>
                                <div className="text-[10px] text-slate-500 uppercase">{node.type}</div>
                                </div>
                            </div>
                            
                            {/* Status Dot */}
                            <div className={`absolute top-0 right-0 -mt-1 -mr-1 w-3 h-3 rounded-full border-2 border-slate-900 ${node.status === 'healthy' ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
                        </div>
                    </foreignObject>
                    );
                })}
                </svg>
            )}
         </div>

         {/* INSPECTOR PANEL */}
         <div className="w-full lg:w-96 border-t lg:border-t-0 lg:border-l border-slate-800 bg-slate-900 flex flex-col animate-in slide-in-from-right-10">
            {selectedNode ? (
              <>
                <div className="p-6 border-b border-slate-800">
                   <div className="flex items-start gap-4 mb-4">
                      <div className="p-3 bg-slate-800 rounded-xl border border-slate-700">
                         {(() => { const I = ICON_MAP[selectedNode.icon] || ICON_MAP.default; return <I size={24} className="text-blue-400" />; })()}
                      </div>
                      <div>
                         <h3 className="text-lg font-bold text-white">{selectedNode.label}</h3>
                         <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
                            <span className="uppercase px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700">{selectedNode.type}</span>
                            <span>•</span>
                            <span>{selectedNode.volume}</span>
                         </div>
                      </div>
                   </div>

                   <div className="grid grid-cols-2 gap-3">
                      <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                         <div className="text-xs text-slate-500 mb-1">Data Freshness</div>
                         <div className="text-sm font-mono text-emerald-400 flex items-center gap-1">
                            <CheckCircle size={12} /> {selectedNode.freshness}
                         </div>
                      </div>
                      <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                         <div className="text-xs text-slate-500 mb-1">Quality Score</div>
                         <div className="text-sm font-mono text-blue-400">100%</div>
                      </div>
                   </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                   <h4 className="text-xs font-bold text-slate-500 uppercase mb-4 flex items-center gap-2">
                      <BarChart2 size={14} /> Column Quality Metrics
                   </h4>
                   
                   {metrics.length > 0 ? (
                     <div className="space-y-4">
                        {metrics.map((m, i) => (
                           <div key={i} className="bg-slate-950/50 rounded-lg border border-slate-800 p-3 hover:border-slate-700 transition-colors">
                              <div className="flex justify-between items-center mb-2">
                                 <span className="font-mono text-sm text-slate-300">{m.column}</span>
                                 <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${m.score === 100 ? 'text-emerald-400 bg-emerald-900/20' : 'text-amber-400 bg-amber-900/20'}`}>
                                    {m.score}%
                                 </span>
                              </div>
                              
                              <div className="w-full bg-slate-800 h-1.5 rounded-full mb-3 overflow-hidden">
                                 <div className={`h-full rounded-full ${m.score === 100 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${m.score}%` }} />
                              </div>

                              <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-500">
                                 <div className="flex justify-between">
                                    <span>Nulls:</span>
                                    <span className="text-slate-300">{m.nullCount}</span>
                                 </div>
                                 <div className="flex justify-between">
                                    <span>Unique:</span>
                                    <span className="text-slate-300">{m.uniqueCount.toLocaleString()}</span>
                                 </div>
                              </div>
                           </div>
                        ))}
                     </div>
                   ) : (
                      <div className="text-center py-10 text-slate-500 text-sm">
                         <Search size={24} className="mx-auto mb-2 opacity-50" />
                         No metrics collected for this node yet.
                      </div>
                   )}
                </div>
              </>
            ) : (
               <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
                  <ArrowRight size={24} className="mb-2 opacity-50" />
                  <p>Select a node to view details</p>
               </div>
            )}
         </div>
      </div>
    </div>
  );
};
