import React, { useState, useEffect } from 'react';
import { generatePipelineInsights } from '../services/geminiService';
import { Pipeline, InsightResult } from '../types';
import { Bot, Sparkles, AlertTriangle, CheckCircle, Info, Database } from 'lucide-react';

interface Props {
  pipelines: Pipeline[];
}

export const DataInsights: React.FC<Props> = ({ pipelines }) => {
  const [selectedPipeline, setSelectedPipeline] = useState<string>(pipelines[0]?.id || '');
  const [loading, setLoading] = useState(false);
  const [insights, setInsights] = useState<InsightResult[]>([]);

  const currentPipeline = pipelines.find(p => p.id === selectedPipeline);

  useEffect(() => {
    if (currentPipeline) {
      handleGenerateInsights(currentPipeline);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPipeline]);

  const handleGenerateInsights = async (p: Pipeline) => {
    setLoading(true);
    setInsights([]);
    
    // Simulate slight network delay for realism if API is instant
    await new Promise(r => setTimeout(r, 800));

    const results = await generatePipelineInsights(
      p.name, 
      p.sourceId, 
      p.destinationId, 
      p.rowsProcessed
    );
    setInsights(results);
    setLoading(false);
  };

  const SeverityIcon = ({ severity }: { severity: string }) => {
    switch(severity) {
      case 'warning': return <AlertTriangle className="text-amber-500" />;
      case 'positive': return <CheckCircle className="text-emerald-500" />;
      default: return <Info className="text-blue-500" />;
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 h-[calc(100vh-140px)]">
      {/* Left Panel: Context Selector */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-2 rounded-lg">
            <Bot className="text-white w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">AI Data Analyst</h2>
            <p className="text-xs text-slate-400">Powered by Gemini 2.5 Flash</p>
          </div>
        </div>
        
        <h3 className="text-xs font-semibold text-slate-500 uppercase mb-3">Select Pipeline Context</h3>
        <div className="space-y-2 overflow-y-auto flex-1 pr-2">
          {pipelines.map(p => (
             <button
              key={p.id}
              onClick={() => setSelectedPipeline(p.id)}
              className={`w-full text-left p-3 rounded-lg border text-sm transition-all
                ${selectedPipeline === p.id 
                  ? 'bg-blue-600/10 border-blue-500 text-white' 
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'
                }`}
             >
                <div className="font-medium">{p.name}</div>
                <div className="text-xs opacity-70 mt-1 flex justify-between">
                   <span>{p.residency}</span>
                   <span>{p.rowsProcessed.toLocaleString()} rows</span>
                </div>
             </button>
          ))}
        </div>
      </div>

      {/* Right Panel: Results */}
      <div className="lg:col-span-2 space-y-6 overflow-y-auto pb-12">
        {loading ? (
           <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-4">
              <Sparkles className="w-12 h-12 animate-spin text-blue-500" />
              <p>Analyzing schema and compliance metadata...</p>
           </div>
        ) : (
          <div className="space-y-6">
             <div className="flex justify-between items-end">
                <div>
                  <h2 className="text-2xl font-bold text-white">Analysis Results</h2>
                  <p className="text-slate-400">Insights for <span className="text-blue-400">{currentPipeline?.name}</span></p>
                </div>
                <button 
                  onClick={() => currentPipeline && handleGenerateInsights(currentPipeline)}
                  className="text-sm text-slate-400 hover:text-white underline decoration-slate-600 hover:decoration-white"
                >
                  Refresh Analysis
                </button>
             </div>

             {insights.map((insight, idx) => (
                <div key={idx} className="bg-slate-900 border border-slate-800 rounded-xl p-6 animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: `${idx * 150}ms` }}>
                  <div className="flex items-start gap-4">
                    <div className="mt-1"><SeverityIcon severity={insight.severity} /></div>
                    <div className="flex-1">
                      <h4 className="text-lg font-semibold text-white mb-2">{insight.title}</h4>
                      <p className="text-slate-300 leading-relaxed text-sm mb-4">{insight.description}</p>
                      
                      {insight.sqlQuery && (
                        <div className="bg-slate-950 rounded-lg border border-slate-800 overflow-hidden">
                           <div className="bg-slate-800/50 px-4 py-2 flex items-center gap-2 border-b border-slate-800">
                              <Database className="w-3 h-3 text-slate-400" />
                              <span className="text-xs font-mono text-slate-400">Suggested Transformation (DuckDB SQL)</span>
                           </div>
                           <pre className="p-4 text-xs font-mono text-emerald-400 overflow-x-auto">
                              {insight.sqlQuery}
                           </pre>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
             ))}
          </div>
        )}
      </div>
    </div>
  );
};