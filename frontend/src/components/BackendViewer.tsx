
import React, { useState } from 'react';
import { MAIN_PY, MODELS_PY, DATABASE_PY, DOCKER_COMPOSE, BACKEND_DOCKERFILE, FRONTEND_DOCKERFILE, REQUIREMENTS_TXT, WORKER_PY } from '../backend_code';
import { Terminal, Copy, Box, Server, Database, Code, FileText, ChevronRight, Container, Cpu } from 'lucide-react';

export const BackendViewer: React.FC = () => {
  const [activeFile, setActiveFile] = useState<'docker-compose' | 'Dockerfile.api' | 'Dockerfile.web' | 'main.py' | 'models.py' | 'database.py' | 'worker.py' | 'requirements'>('docker-compose');

  const getCode = () => {
    switch(activeFile) {
      case 'docker-compose': return DOCKER_COMPOSE;
      case 'Dockerfile.api': return BACKEND_DOCKERFILE;
      case 'Dockerfile.web': return FRONTEND_DOCKERFILE;
      case 'main.py': return MAIN_PY;
      case 'models.py': return MODELS_PY;
      case 'database.py': return DATABASE_PY;
      case 'worker.py': return WORKER_PY;
      case 'requirements': return REQUIREMENTS_TXT;
      default: return '';
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(getCode());
    alert("Copied to clipboard!");
  };

  return (
    <div className="space-y-6">
      {/* Intro Banner */}
      <div className="bg-gradient-to-r from-blue-900/40 to-slate-900 border border-blue-900/50 rounded-xl p-6 flex items-start gap-4">
        <div className="p-3 bg-blue-600 rounded-lg shadow-lg shadow-blue-900/50">
           <Container className="text-white w-6 h-6" />
        </div>
        <div>
           <h2 className="text-xl font-bold text-white">Production Container Kit</h2>
           <p className="text-slate-300 text-sm mt-1 max-w-2xl">
             This configuration allows you to run the full <strong>ResidencyFlow</strong> stack (Frontend, API, Postgres, Worker) on any machine with Docker installed.
             It supports data persistence and real-time communication between the React app and Python backend.
           </p>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl flex h-[600px]">
         {/* File Explorer */}
         <div className="w-64 bg-slate-950/50 border-r border-slate-800 flex flex-col">
            <div className="p-4 border-b border-slate-800">
               <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Project Files</span>
            </div>
            
            <div className="p-2 space-y-1 overflow-y-auto custom-scrollbar">
               <div className="px-3 py-2 text-xs font-semibold text-blue-400 uppercase mt-2">Orchestration</div>
               <FileBtn label="docker-compose.yml" icon={Box} active={activeFile === 'docker-compose'} onClick={() => setActiveFile('docker-compose')} />
               <FileBtn label="backend/Dockerfile" icon={Container} active={activeFile === 'Dockerfile.api'} onClick={() => setActiveFile('Dockerfile.api')} />
               <FileBtn label="frontend/Dockerfile" icon={Container} active={activeFile === 'Dockerfile.web'} onClick={() => setActiveFile('Dockerfile.web')} />

               <div className="px-3 py-2 text-xs font-semibold text-emerald-400 uppercase mt-4">Backend Logic</div>
               <FileBtn label="main.py" icon={Server} active={activeFile === 'main.py'} onClick={() => setActiveFile('main.py')} />
               <FileBtn label="worker.py" icon={Cpu} active={activeFile === 'worker.py'} onClick={() => setActiveFile('worker.py')} />
               <FileBtn label="models.py" icon={Database} active={activeFile === 'models.py'} onClick={() => setActiveFile('models.py')} />
               <FileBtn label="database.py" icon={Database} active={activeFile === 'database.py'} onClick={() => setActiveFile('database.py')} />
               <FileBtn label="requirements.txt" icon={FileText} active={activeFile === 'requirements'} onClick={() => setActiveFile('requirements')} />
            </div>
         </div>

         {/* Code View */}
         <div className="flex-1 flex flex-col min-w-0">
            <div className="h-12 border-b border-slate-800 bg-slate-950 flex items-center justify-between px-4">
               <div className="flex items-center gap-2 text-sm text-slate-400 font-mono">
                  <span className="text-slate-600">residency-flow/</span>
                  <span className="text-white">{activeFile}</span>
               </div>
               <button onClick={copyToClipboard} className="text-xs flex items-center gap-1.5 text-slate-400 hover:text-white bg-slate-900 px-2 py-1 rounded border border-slate-800 hover:border-slate-600 transition-colors">
                  <Copy size={12} /> Copy
               </button>
            </div>
            <div className="flex-1 bg-slate-950 overflow-auto p-4 custom-scrollbar">
               <pre className="font-mono text-xs sm:text-sm text-blue-100 leading-relaxed">
                  {getCode()}
               </pre>
            </div>
         </div>
      </div>
    </div>
  );
};

const FileBtn = ({ label, icon: Icon, active, onClick }: any) => (
  <button 
    onClick={onClick}
    className={`w-full text-left px-3 py-2 rounded-lg text-sm font-mono transition-colors flex items-center gap-2 ${active ? 'bg-blue-600/10 text-blue-400 border border-blue-600/20' : 'text-slate-400 hover:bg-slate-800 border border-transparent'}`}
  >
    <Icon size={14} className={active ? 'text-blue-400' : 'text-slate-500'} />
    <span className="truncate">{label}</span>
  </button>
);
