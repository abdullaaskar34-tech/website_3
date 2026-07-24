import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UploadCloud, CheckCircle, AlertTriangle, XCircle, ChevronRight, Download, Activity,
  FileText, ShieldAlert, Database, Info, Layers, Workflow, Microscope, Dna, Merge, Scale,
  Printer, ImageIcon
} from 'lucide-react';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  Legend as RLegend, ResponsiveContainer
} from 'recharts';

// Derive the API base from the browser's current host so the app works both
// on localhost AND when opened from another device via the machine's LAN IP
// (e.g. http://192.168.x.x:5173 -> http://192.168.x.x:8001/api).
// Override explicitly with a VITE_API_URL env var if the backend lives
// elsewhere. Falls back to localhost for non-browser / SSR contexts.
const API_URL =
  (import.meta as any).env?.VITE_API_URL ||
  (typeof window !== 'undefined' && window.location?.hostname
    ? `${window.location.protocol}//${window.location.hostname}:8001/api`
    : 'http://localhost:8001/api');

// Okabe-Ito colorblind-safe palette, matching the son_model figures
// (0=Alpha, 1=Beta, 2=Gamma, 3=Delta).
const SUBTYPE_HEX: Record<number, string> = { 0: '#0072B2', 1: '#E69F00', 2: '#009E73', 3: '#D55E00' };

const CLASS_NAME: Record<number, string> = { 0: 'Alpha', 1: 'Beta', 2: 'Gamma', 3: 'Delta' };

// Pulsating high-contrast star marking the uploaded sample on the projection.
const NewSampleStar = (props: any) => {
  const { cx, cy } = props;
  if (cx == null || cy == null) return null;
  const star = 'M0,-11 L2.6,-3.4 L10.5,-3.4 L4,1.3 L6.5,9 L0,4.2 L-6.5,9 L-4,1.3 L-10.5,-3.4 L-2.6,-3.4 Z';
  return (
    <g transform={`translate(${cx},${cy})`}>
      <circle r="12" fill="#ffffff" opacity="0.3">
        <animate attributeName="r" values="10;20;10" dur="1.6s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.4;0;0.4" dur="1.6s" repeatCount="indefinite" />
      </circle>
      <path d={star} fill="#ffffff" stroke="#ef4444" strokeWidth="2" />
    </g>
  );
};

const ProjectionTooltip = ({ active, payload }: any) => {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0].payload;
  if (p.isNew) {
    return (
      <div className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs shadow-xl">
        <div className="font-black text-white mb-1">◆ Uploaded Sample</div>
        <div className="text-slate-400 font-mono truncate max-w-[220px]">{p.id}</div>
        <div className="font-bold text-blue-400">{p.subtype}</div>
        <div className="text-slate-400">Voting confidence: <span className="font-mono text-white">{Number(p.confidence).toFixed(3)}</span></div>
      </div>
    );
  }
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs shadow-xl">
      <div className="font-bold" style={{ color: SUBTYPE_HEX[p.cls] }}>Reference · Subtype {CLASS_NAME[p.cls]}</div>
      <div className="text-slate-500 font-mono truncate max-w-[200px]">{p.id}</div>
    </div>
  );
};

function ProjectionScatter({ reference, newPoint }: { reference: any; newPoint: any }) {
  // Debug: prove the FULL cohort is loaded and every point is drawn (no
  // aggregation, no truncation). Open the browser console to verify "328".
  React.useEffect(() => {
    if (reference?.points) {
      const n = reference.points.length;
      const distinct = new Set(reference.points.map((p: any) => `${p.pc1},${p.pc2}`)).size;
      console.log(`Rendering ${n} samples`);
      if (n !== 328) {
        console.warn(`Expected 328 samples but got ${n} — JSON may be truncated / backend not serving the full file.`);
      } else {
        console.log(`All ${n} circles drawn across 4 subtype series; ${distinct} distinct (PC1,PC2) coordinates (overlap is expected in co-association PC space, not downsampling).`);
      }
    }
  }, [reference]);

  if (!reference) {
    return <div className="pca-plot-wrap flex items-center justify-center text-slate-500 text-sm">Loading reference space…</div>;
  }
  const groups = [0, 1, 2, 3].map((c) => ({ cls: c, data: reference.points.filter((p: any) => p.cls === c) }));
  const ev = reference.explained || [0, 0];
  return (
    <div className="pca-plot-wrap">
      <ResponsiveContainer width="100%" height={480}>
        <ScatterChart margin={{ top: 8, right: 28, bottom: 56, left: 16 }}>
          <CartesianGrid stroke="#1e293b" />
          {/* Legend pinned to the TOP row so it can never collide with the bottom X-axis title */}
          <RLegend verticalAlign="top" align="center" height={40} wrapperStyle={{ fontSize: 11, paddingBottom: 14 }} />
          <XAxis type="number" dataKey="pc1" name="PC1" tick={{ fill: '#64748b', fontSize: 11 }} stroke="#334155"
            label={{ value: `PC1  (${ev[0]}% variance)`, position: 'bottom', offset: 14, fill: '#94a3b8', fontSize: 12 }} />
          <YAxis type="number" dataKey="pc2" name="PC2" tick={{ fill: '#64748b', fontSize: 11 }} stroke="#334155"
            label={{ value: `PC2  (${ev[1]}% variance)`, angle: -90, position: 'insideLeft', offset: 0, fill: '#94a3b8', fontSize: 12 }} />
          <RTooltip content={<ProjectionTooltip />} cursor={{ strokeDasharray: '3 3', stroke: '#475569' }} />
          {groups.map((g) => (
            <Scatter key={g.cls} name={`Subtype ${CLASS_NAME[g.cls]}`} data={g.data} fill={SUBTYPE_HEX[g.cls]} fillOpacity={0.55} isAnimationActive={false} />
          ))}
          {newPoint && <Scatter name="This sample" data={[newPoint]} shape={<NewSampleStar />} legendType="star" />}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

const PROGRESS_STATES = [
  'idle',
  'upload_received',
  'preprocessing',
  'branches_running',
  'mapping',
  'voting',
  'completed',
  'error'
];

const TOOLTIP_CONTENT: Record<string, { title: string; desc: string; interpret: string; effect: string }> = {
  'Branch': {
    title: 'Branch Pipeline',
    desc: 'An independent preprocessing and prediction path.',
    interpret: 'Branch A, B, and C process the same raw sample using different normalization strategies to ensure consensus.',
    effect: 'Multiple branches reduce normalization bias and increase prediction robustness.'
  },
  'Branch_A': {
    title: 'Branch A — TPM / log2TPM',
    desc: 'Uses tpm_unstranded and applies log2(TPM + 1).',
    interpret: 'TPM (Transcripts Per Million) accounts for gene length and sequencing depth.',
    effect: 'Standardizes expression relative to the total transcriptome size.'
  },
  'Branch_B': {
    title: 'Branch B — CPM / log2CPM',
    desc: 'Uses raw unstranded counts and applies log2(CPM + 1).',
    interpret: 'CPM (Counts Per Million) calculates relative abundance using library size.',
    effect: 'Normalizes for sequencing depth without considering gene length.'
  },
  'Branch_C': {
    title: 'Branch C — VST Proxy / log2Count',
    desc: 'Uses an approximate single-sample proxy: log2(raw counts + 1).',
    interpret: 'This is not true DESeq2 VST, which requires a cohort for variance stabilization.',
    effect: 'A 15% reliability penalty (0.85 factor) is applied due to the approximation.'
  },
  'Genes': {
    title: 'Selected Informative Genes',
    desc: 'Number of specific gene features used by this branch for projection.',
    interpret: 'The model uses a fixed set of 500 (A/B) or 2000 (C) highly variable genes.',
    effect: 'Focusing on informative genes improves signal-to-noise ratio in clustering.'
  },
  'Coverage': {
    title: 'Feature Coverage',
    desc: 'Fraction of the required branch genes found in the uploaded sample.',
    interpret: 'Coverage of 1.00 means all 500 or 2000 required ENSG identifiers were matched.',
    effect: 'Low coverage (<0.60) skips the branch; moderate coverage reduces vote weight.'
  },
  'PCA': {
    title: 'Principal Component Analysis',
    desc: 'Projects high-dimensional gene expression into a 5D coordinate space.',
    interpret: 'Reduces noise while preserving the variance that separates subtypes.',
    effect: 'Allows for stable distance calculation in a lower-dimensional manifold.'
  },
  'Centroid Distance': {
    title: 'Centroid Proximity',
    desc: 'Euclidean distance from the sample PCA point to cluster centers.',
    interpret: 'Calculated in the internal 5D space specific to each branch.',
    effect: 'The nearest centroid determines the initial raw cluster assignment.'
  },
  'Raw Cluster': {
    title: 'Internal Raw Cluster',
    desc: 'The cluster predicted inside this branch’s internal mathematical space.',
    interpret: 'Raw clusters (0-4) are specific to the branch and cannot be compared directly across branches.',
    effect: 'Acts as the primary classification before cross-branch mapping.'
  },
  'Mapped Shared Class': {
    title: 'Consensus Shared Class',
    desc: 'Universal class (0-3) that the internal cluster corresponds to.',
    interpret: 'Allows branches with different normalizations to "vote" in a single label space.',
    effect: 'Essential for resolving disagreements and calculating weighted consensus.'
  },
  'Subtype': {
    title: 'Subtype Label',
    desc: 'Readable name for the mapped shared class (Alpha/Beta/Gamma/Delta).',
    interpret: 'These are computational placeholders representing distinct transcriptomic profiles.',
    effect: 'Note: These are research-level labels, not clinical diagnostic results.'
  },
  'Confidence': {
    title: 'Distance-Based Confidence',
    desc: 'Derived from the margin between the nearest and second-nearest centroids.',
    interpret: 'High confidence means the sample is much closer to one centroid than any other.',
    effect: 'Forms a core component of the final consensus vote weight.'
  },
  'Purity': {
    title: 'Mapping Purity',
    desc: 'How reliably a raw branch cluster maps to a specific shared class.',
    interpret: 'Derived from training data cross-tabulation stability.',
    effect: 'Low purity reduces the influence of that branch’s vote.'
  },
  'Branch Reliability': {
    title: 'Method-Level Reliability',
    desc: 'A constant multiplier based on the branch transformation strategy.',
    interpret: 'Branch A/B use 1.00; Branch C uses 0.85 due to VST approximation.',
    effect: 'Statically de-weights less rigorous normalization paths.'
  },
  'Outlier Penalty': {
    title: 'Outlier Boundary Penalty',
    desc: 'Applied if the sample is significantly further from centroids than typical samples.',
    interpret: 'Prevents "forced" classification of samples that do not fit the model space.',
    effect: 'Reduces vote strength to 0.50–0.85 if the sample is a geometric outlier.'
  },
  'Vote Weight': {
    title: 'Consensus Vote Weight',
    desc: 'Final strength of the branch influence on the final decision.',
    interpret: 'Formula: Confidence × Purity × Coverage × Reliability × Outlier Penalty.',
    effect: 'Determines the "weighted winner" in cases of branch disagreement.'
  },
  'Agreement': {
    title: 'Cross-Branch Agreement',
    desc: 'How many branches support the same final subtype.',
    interpret: 'Concordance (3/3) leads to the highest possible decision certainty.',
    effect: 'Used by the decision engine to determine final prediction status.'
  },
  'Weighted Vote': {
    title: 'Weighted Consensus Decision',
    desc: 'Decision method where stronger branch votes count more than ambiguous ones.',
    interpret: 'Sums the Vote Weights for each subtype across all branches.',
    effect: 'Enables high-reliability branches to override low-confidence noise.'
  },
  'Soft Support': {
    title: 'Inverse-Distance Soft Support',
    desc: 'Support across all subtypes based on all centroid distances.',
    interpret: 'Calculated using 1/distance to provide a continuous support profile.',
    effect: 'Provides a safety check against "hard" assignment errors.'
  }
};

const MetricTooltip = ({ id, children }: { id: string; children: React.ReactNode }) => {
  const [visible, setVisible] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0, position: 'bottom' });
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const content = TOOLTIP_CONTENT[id];

  const updatePosition = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;
      
      const tooltipWidth = Math.min(420, windowWidth - 40);
      let left = rect.left + rect.width / 2 - tooltipWidth / 2;
      let top = rect.bottom + 10;
      let position = 'bottom';

      // Horizontal collision
      if (left < 20) left = 20;
      if (left + tooltipWidth > windowWidth - 20) left = windowWidth - tooltipWidth - 20;

      // Vertical collision
      if (top + 280 > windowHeight) { // Estimate max tooltip height
        top = rect.top - 10;
        position = 'top';
      }

      setCoords({ top, left, position });
    }
  };

  useLayoutEffect(() => {
    if (visible || pinned) {
      updatePosition();
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
    }
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [visible, pinned]);

  // Click outside to unpin
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pinned && 
          triggerRef.current && !triggerRef.current.contains(e.target as Node) && 
          tooltipRef.current && !tooltipRef.current.contains(e.target as Node)) {
        setPinned(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [pinned]);

  if (!content) return <>{children}</>;

  const showTooltip = visible || pinned;

  return (
    <div 
      ref={triggerRef}
      className="relative inline-block" 
      onMouseEnter={() => setVisible(true)} 
      onMouseLeave={() => setVisible(false)}
      onClick={(e) => {
        e.stopPropagation();
        setPinned(!pinned);
      }}
    >
      <div className={`cursor-help transition-all ${pinned ? 'ring-2 ring-blue-500/50 rounded-lg bg-blue-500/5' : ''}`}>
        {children}
      </div>
      
      {showTooltip && createPortal(
        <motion.div 
          ref={tooltipRef}
          initial={{ opacity: 0, scale: 0.95, y: coords.position === 'bottom' ? -10 : 10 }} 
          animate={{ opacity: 1, scale: 1, y: 0 }} 
          exit={{ opacity: 0, scale: 0.95 }}
          style={{ 
            position: 'fixed', 
            top: coords.position === 'bottom' ? coords.top : 'auto',
            bottom: coords.position === 'top' ? (window.innerHeight - coords.top) : 'auto',
            left: coords.left,
            width: 'max-content',
            maxWidth: Math.min(420, window.innerWidth - 40),
            zIndex: 9999
          }}
          className="p-5 bg-slate-900 border border-slate-700 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.6)] pointer-events-auto"
        >
          <div className="flex justify-between items-center mb-3 pb-2 border-b border-slate-800">
            <div className="text-[11px] font-black text-blue-400 uppercase tracking-widest">{content.title}</div>
            {pinned && <div className="text-[8px] bg-blue-600 text-white px-2 py-0.5 rounded font-black uppercase tracking-tighter">Pinned</div>}
          </div>
          <div className="space-y-4 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
            <div>
              <div className="text-[9px] text-slate-500 font-bold uppercase mb-1 tracking-wider">Definition</div>
              <p className="text-[12px] text-slate-200 leading-snug">{content.desc}</p>
            </div>
            <div>
              <div className="text-[9px] text-slate-500 font-bold uppercase mb-1 tracking-wider">Scientific Interpretation</div>
              <p className="text-[12px] text-slate-400 leading-snug italic">{content.interpret}</p>
            </div>
            <div>
              <div className="text-[9px] text-slate-500 font-bold uppercase mb-1 tracking-wider">Effect on Prediction</div>
              <p className="text-[12px] text-blue-300/90 leading-snug font-medium">{content.effect}</p>
            </div>
          </div>
          {/* Arrow */}
          {triggerRef.current && (
            <div 
              style={{ 
                left: triggerRef.current.getBoundingClientRect().left + triggerRef.current.getBoundingClientRect().width/2 - coords.left 
              }}
              className={`absolute w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent ${
                coords.position === 'bottom' 
                  ? 'bottom-full border-b-[6px] border-b-slate-700' 
                  : 'top-full border-t-[6px] border-t-slate-700'
              }`}
            ></div>
          )}
        </motion.div>,
        document.body
      )}
    </div>
  );
};

function App() {
  const [file, setFile] = useState<File | null>(null);
  const [pipelineState, setPipelineState] = useState<string>('idle');
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [detailedMode, setDetailedMode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const timeoutsRef = useRef<number[]>([]);

  const clearAllTimeouts = () => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
  };

  const [simulatedProgress, setSimulatedProgress] = useState(0);

  // Per-sample geometric affinity distribution, derived purely from the existing
  // soft_subtype_support output (total_support per subtype). No backend change.
  const affinity = React.useMemo(() => {
    const rows = result?.soft_subtype_support;
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const items = rows.map((r: any) => ({
      cls: Number(r.subtype_class),
      name: String(r.subtype_name || '').replace('Subtype ', '') || `Class ${r.subtype_class}`,
      support: Number(r.total_support) || 0,
    }));
    const total = items.reduce((s, d) => s + d.support, 0) || 1;
    const withPct = items.map((d) => ({ ...d, pct: d.support / total }));
    const ranked = [...withPct].sort((a, b) => b.pct - a.pct);
    // "Cross-over" = top two subtypes are geometrically close (boundary case)
    const crossover = ranked.length >= 2 && ranked[0].pct - ranked[1].pct < 0.15;
    return {
      byClass: [...withPct].sort((a, b) => a.cls - b.cls),
      top: ranked[0],
      second: ranked[1],
      crossover,
    };
  }, [result]);

  // Reference PCA projection dataset (328 cohort samples + PCA model), loaded once.
  const [refProjection, setRefProjection] = useState<any>(null);
  React.useEffect(() => {
    let alive = true;
    // Canonical coordinates from son_model/reference_tables/pca_projection_data.json
    // (copied into public/ for static serving). No sampling, no jitter.
    fetch('/pca_projection_data.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) setRefProjection(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // Out-of-sample projection of the uploaded sample into the reference PC space,
  // computed from its branch cluster labels (co-association vector -> PCA model).
  const newProjection = React.useMemo(() => {
    if (!result?.branch_predictions || !refProjection) return null;
    const bp = result.branch_predictions;
    const active = ([['A', 'Branch_A'], ['B', 'Branch_B'], ['C', 'Branch_C']] as const)
      .map(([k, name]) => {
        const b = bp.find((x: any) => x.branch === name);
        const raw = b ? Number(b.raw_cluster) : NaN;
        return { k, raw, w: Number(refProjection.weights[k]) };
      })
      .filter((x) => Number.isFinite(x.raw));
    if (!active.length) return null;
    const ws = active.reduce((s, x) => s + x.w, 0) || 1;
    const { mean, comp1, comp2, points } = refProjection;
    let pc1 = 0, pc2 = 0;
    for (let j = 0; j < points.length; j++) {
      const p = points[j];
      let s = 0;
      for (const x of active) {
        const ref = x.k === 'A' ? p.a : x.k === 'B' ? p.b : p.c;
        if (ref === x.raw) s += x.w;
      }
      const d = s / ws - mean[j];
      pc1 += d * comp1[j];
      pc2 += d * comp2[j];
    }
    return {
      pc1: +pc1.toFixed(3),
      pc2: +pc2.toFixed(3),
      isNew: true,
      id: result.sample_id,
      subtype: result.prediction_summary?.final_subtype_name,
      confidence: Number(result.prediction_summary?.weighted_margin || 0),
    };
  }, [result, refProjection]);

  React.useEffect(() => {
    return () => clearAllTimeouts();
  }, []);

  const extractSampleId = (fileName: string) => {
    return fileName.split(".")[0];
  };

  const handleFile = (selectedFile: File) => {
    setFile(selectedFile);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFile(e.target.files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    clearAllTimeouts();
    setPipelineState('upload_received');
    setError(null);
    const formData = new FormData();
    formData.append('file', file);
    
    // Simulate pipeline steps while waiting for backend
    const simInterval = setInterval(() => {
      setSimulatedProgress(p => Math.min(p + 10, 90));
    }, 500);

    timeoutsRef.current.push(window.setTimeout(() => setPipelineState('preprocessing'), 1500));
    timeoutsRef.current.push(window.setTimeout(() => setPipelineState('branches_running'), 3500));

    try {
      const response = await axios.post(`${API_URL}/predict`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      clearInterval(simInterval);
      clearAllTimeouts();
      setSimulatedProgress(100);
      
      // Story telling transitions
      setPipelineState('mapping');
      timeoutsRef.current.push(window.setTimeout(() => setPipelineState('voting'), 1500));
      timeoutsRef.current.push(window.setTimeout(() => {
        setResult(response.data);
        setPipelineState('completed');
      }, 3000));

    } catch (err: any) {
      clearInterval(simInterval);
      clearAllTimeouts();
      setPipelineState('error');
      // Distinguish "backend unreachable" (no HTTP response) from a real
      // server-side error, and make the message actionable.
      if (err.response) {
        // Server responded with an error status (e.g. 400/500)
        setError(err.response.data?.detail || `Server returned HTTP ${err.response.status}.`);
      } else if (err.request) {
        // Request sent but NO response -> backend down / unreachable / CORS
        setError(
          `Cannot reach the backend at ${API_URL}. ` +
          `The API server is not responding — make sure it is running ` +
          `(uvicorn on port 8001, same machine/network), then try again.`
        );
      } else {
        setError(err.message || 'An error occurred during prediction.');
      }
    }
  };

  const getDistanceData = (branch: string) => {
    if (!result?.centroid_distances) return [];
    const branchDist = result.centroid_distances.find((d: any) => d.branch === branch);
    if (!branchDist) return [];
    
    return Object.entries(branchDist)
      .filter(([key]) => key.startsWith('cluster_'))
      .map(([key, value]) => ({
        cluster: key.split('_')[1],
        distance: parseFloat(value as string)
      }))
      .filter(d => !isNaN(d.distance))
      .sort((a, b) => parseInt(a.cluster) - parseInt(b.cluster));
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-blue-500/30 overflow-x-hidden pb-20">
      
      {/* HEADER */}
      <header className="border-b border-slate-800/60 bg-slate-900/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <img src="/assets/logo.png" alt="KBU-MedLab Logo" className="h-10 w-auto object-contain bg-white rounded-md p-1" />
            <div className="border-l border-slate-700 pl-4">
              <h1 className="text-xl font-bold tracking-tight text-white">KBU-MedLab</h1>
              <p className="text-xs text-blue-400 uppercase tracking-widest font-semibold">Precision Oncology Pipeline</p>
            </div>
          </div>
          <div className="hidden md:flex items-center space-x-6">
            <div className="flex items-center space-x-2 px-3 py-1.5 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <Activity className="w-3 h-3 text-blue-400" />
              <span className="text-[10px] text-blue-300 uppercase tracking-widest font-bold">Consensus model: son_model</span>
            </div>
            <a href="#about" className="text-xs text-slate-400 hover:text-white transition-colors uppercase tracking-wider font-bold">About</a>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-12">
        
        {/* SECTION 1: HERO */}
        {pipelineState === 'idle' && (
          <motion.section 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-10 md:py-16 text-center"
          >
            <div className="mb-6 rounded-full bg-blue-500/10 border border-blue-500/20 px-4 py-1.5 text-xs text-blue-400 uppercase font-bold tracking-widest inline-flex items-center">
              <Microscope className="w-4 h-4 mr-2" /> Research Platform
            </div>
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-white mb-6 tracking-tight leading-tight">
              Reliability-Weighted RNA-seq <br className="hidden md:block"/> Subtype Inference
            </h2>
            <p className="text-lg text-slate-400 max-w-3xl mb-12 leading-relaxed">
              An interactive precision oncology platform for Glioblastoma Multiforme (GBM) transcriptomic analysis. 
              This pipeline processes a STAR-aligned RNA-seq file through three parallel normalizations, maps branch-specific clusters into a shared subtype space, and combines evidence using reliability-weighted consensus.
            </p>
            
            <div 
              role="button"
              tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  fileInputRef.current?.click();
                }
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              className="w-full max-w-xl glass-panel p-10 flex flex-col items-center border-dashed border-2 border-slate-700 hover:border-blue-500/50 transition-all cursor-pointer group relative bg-slate-900/50 shadow-2xl"
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept=".tsv,.txt,.csv,text/tab-separated-values,text/plain,text/csv" 
                onChange={handleFileChange} 
              />
              <div className="w-20 h-20 bg-slate-950 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-slate-900 border border-slate-800 transition-colors shadow-inner">
                <UploadCloud className="w-10 h-10 text-slate-500 group-hover:text-blue-400 transition-colors" />
              </div>
              
              <h3 className="text-xl font-bold text-white mb-2">
                {file ? 'File Selected' : 'Upload RNA-seq Data'}
              </h3>
              
              <p className="text-sm text-slate-500 mb-6 font-medium">
                {file ? 'Ready for consensus analysis' : 'STAR-aligned TSV with unstranded counts'}
              </p>

              {file && (
                <div className="w-full mb-8 rounded-xl border border-slate-800 bg-slate-950/50 p-4 text-left space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Filename</span>
                    <span className="text-xs text-white truncate max-w-[200px] font-mono">{file.name}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Size</span>
                    <span className="text-xs text-white font-mono">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Sample ID</span>
                    <span className="text-xs text-blue-400 font-mono font-bold">{extractSampleId(file.name)}</span>
                  </div>
                </div>
              )}

              {file && (
                <button 
                  onClick={(e) => { e.stopPropagation(); handleUpload(); }}
                  className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-lg shadow-blue-900/20 transform transition active:scale-[0.98] uppercase tracking-widest"
                >
                  Initiate Pipeline
                </button>
              )}
            </div>
          </motion.section>
        )}

        {/* LIVE PIPELINE ANIMATION SECTION */}
        {pipelineState !== 'idle' && pipelineState !== 'completed' && pipelineState !== 'error' && (
          <div className="flex flex-col items-center justify-center py-20 space-y-12">
            <h3 className="text-2xl font-black text-white tracking-tight">Pipeline Executing</h3>
            
            <div className="w-full max-w-4xl relative">
              <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden absolute top-1/2 -translate-y-1/2 -z-10">
                <div className="h-full bg-blue-600 transition-all duration-500 ease-out" style={{width: `${simulatedProgress}%`}}></div>
              </div>
              <div className="flex justify-between">
                {[
                  { id: 'upload_received', icon: Database, label: 'Ingest' },
                  { id: 'preprocessing', icon: Dna, label: 'QC & Filter' },
                  { id: 'branches_running', icon: Merge, label: 'Parallel Branches' },
                  { id: 'mapping', icon: Layers, label: 'Consensus Map' },
                  { id: 'voting', icon: Scale, label: 'Vote Assembly' }
                ].map((step, idx) => {
                  const active = PROGRESS_STATES.indexOf(pipelineState) >= PROGRESS_STATES.indexOf(step.id);
                  const current = pipelineState === step.id;
                  return (
                    <div key={idx} className="flex flex-col items-center">
                      <div className={`w-12 h-12 rounded-full border-4 flex items-center justify-center transition-colors duration-500 ${active ? 'bg-blue-900 border-blue-500 text-blue-400 shadow-[0_0_20px_rgba(59,130,246,0.5)]' : 'bg-slate-950 border-slate-800 text-slate-600'} ${current ? 'scale-110' : ''}`}>
                        <step.icon className="w-5 h-5" />
                      </div>
                      <span className={`mt-3 text-xs font-bold uppercase tracking-wider ${active ? 'text-blue-300' : 'text-slate-600'}`}>{step.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="text-center space-y-2 h-16">
              <AnimatePresence mode="wait">
                <motion.div key={pipelineState} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="text-slate-400">
                  {pipelineState === 'upload_received' && 'Reading TSV and identifying sample...'}
                  {pipelineState === 'preprocessing' && 'Removing technical rows and stripping ENSG versions...'}
                  {pipelineState === 'branches_running' && 'Applying TPM, CPM, and VST-proxy transformations to 3 parallel branches...'}
                  {pipelineState === 'mapping' && 'Projecting into 5D space and mapping raw clusters to shared consensus classes...'}
                  {pipelineState === 'voting' && 'Calculating reliability-weighted formulas and computing soft subtype support...'}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        )}

        {/* ERROR STATE */}
        {pipelineState === 'error' && (
          <div className="py-20 flex flex-col items-center text-center">
            <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mb-6 border border-red-500/20">
              <XCircle className="w-10 h-10 text-red-500" />
            </div>
            <h3 className="text-2xl font-bold text-white mb-4">Pipeline Execution Failed</h3>
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl text-left max-w-2xl w-full text-slate-400 font-mono text-sm overflow-auto">
              {error}
            </div>
            <button onClick={() => setPipelineState('idle')} className="mt-8 px-6 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-white font-bold transition-colors">
              Reset Pipeline
            </button>
          </div>
        )}

        {/* COMPLETED DASHBOARD */}
        {pipelineState === 'completed' && result && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-12">
            
            {/* 1. FINAL DECISION & QC SUMMARY GRID */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Final Decision Card */}
              <div className="lg:col-span-2 relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/40 shadow-2xl p-8 md:p-10 border-t-4 border-t-blue-500">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-purple-500/5 z-0 pointer-events-none"></div>
                <div className="relative z-10 space-y-6">
                  <div>
                    <h2 className="text-xs text-blue-500 uppercase tracking-[0.2em] font-bold mb-2 flex items-center"><Activity className="w-4 h-4 mr-2"/> Primary Inference Result</h2>
                    <div className="flex flex-col md:flex-row md:items-end space-y-4 md:space-y-0 md:space-x-6">
                      <h3 className={`text-6xl md:text-7xl font-black tracking-tighter ${result.prediction_summary.final_status.includes('uncertain') ? 'text-amber-400' : 'text-white'}`}>
                        {result.prediction_summary.final_subtype_name}
                      </h3>
                      <div className="bg-slate-900 border border-slate-800 px-5 py-2 rounded-xl mb-2 shadow-inner">
                         <span className="text-[10px] text-slate-500 block uppercase tracking-widest font-bold mb-0.5">Class</span>
                         <span className="text-2xl font-mono text-blue-400 font-bold leading-none">{result.prediction_summary.final_shared_class}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <div className={`flex items-center space-x-2 px-3 py-1.5 bg-slate-900/80 rounded-lg border text-[11px] font-black uppercase tracking-wider ${result.prediction_summary.final_status === 'predicted' ? 'border-green-500/30 text-green-400' : 'border-amber-500/30 text-amber-400'}`}>
                      {result.prediction_summary.final_status === 'predicted' ? <CheckCircle className="w-3.5 h-3.5" /> : <ShieldAlert className="w-3.5 h-3.5" />}
                      <span>{result.prediction_summary.final_status.replace(/_/g, ' ')}</span>
                    </div>
                    <div className="flex items-center space-x-2 px-3 py-1.5 bg-slate-900/80 rounded-lg border border-slate-800 text-[11px] font-bold">
                      <span className="text-slate-500">WEIGHTED MARGIN:</span>
                      <span className="text-white font-mono">{parseFloat(result.prediction_summary.weighted_margin || 0).toFixed(3)}</span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-400 font-medium italic border-l-2 border-slate-700 pl-3 py-1">
                    "{result.prediction_summary.decision_reason}"
                  </p>
                </div>
              </div>

              {/* QC Quick Summary */}
              <div className="glass-panel p-8 border-slate-800 bg-slate-900/30 rounded-3xl flex flex-col justify-between">
                <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-6 flex items-center">
                  <Activity className="w-3.5 h-3.5 mr-2" /> Data Quality Profile
                </h3>
                <div className="space-y-6">
                  {[
                    { label: 'Total Rows', val: result.qc_data.total_rows?.toLocaleString(), color: 'text-white' },
                    { label: 'TPM Data', val: result.qc_data.tpm_unstranded_detected ? 'DETECTED' : 'MISSING', color: result.qc_data.tpm_unstranded_detected ? 'text-green-400' : 'text-amber-400' },
                    { label: 'Library Size', val: `${(result.qc_data.total_raw_count / 1e6).toFixed(2)}M`, color: 'text-blue-400' }
                  ].map((item, i) => (
                    <div key={i} className="flex justify-between items-end border-b border-slate-800/50 pb-2">
                      <span className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">{item.label}</span>
                      <span className={`text-sm font-mono font-bold ${item.color}`}>{item.val}</span>
                    </div>
                  ))}
                </div>
                <a href={`${API_URL}/download/${result.run_id}`} download className="mt-8 flex items-center justify-center space-x-2 px-6 py-3 bg-white text-slate-950 hover:bg-slate-200 rounded-xl transition-all text-xs font-black uppercase tracking-widest shadow-xl print:hidden">
                  <Download className="w-4 h-4" /> <span>All Artifacts</span>
                </a>
                <button onClick={() => window.print()} className="mt-3 flex items-center justify-center space-x-2 px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl transition-all text-xs font-black uppercase tracking-widest shadow-xl print:hidden">
                  <Printer className="w-4 h-4" /> <span>Print Patient Sheet</span>
                </button>
              </div>
            </div>

            {/* 2. PIPELINE FLOW DIAGRAM */}
            <div className="glass-panel p-8 border-slate-800 bg-slate-900/20 rounded-3xl overflow-hidden relative">
              <div className="absolute top-0 right-0 p-8 opacity-5">
                <Workflow className="w-32 h-32 text-blue-400" />
              </div>
              <div className="relative z-10">
                <h3 className="text-xl font-black text-white flex items-center space-x-3 mb-10">
                  <Workflow className="w-6 h-6 text-blue-400" /> <span>Consensus Prediction Pipeline</span>
                </h3>
                
                <div className="flex flex-col md:flex-row items-center justify-between gap-4 relative">
                  {/* Global Connecting Line */}
                  <div className="absolute top-6 left-10 right-10 h-0.5 bg-slate-800 -z-0 hidden md:block"></div>
                  
                  {[
                    { id: 'Branch', label: 'Input Data', val: 'RNA-seq TSV', icon: Database },
                    { id: 'Agreement', label: 'Branch Split', val: 'A / B / C', icon: Layers },
                    { id: 'PCA', label: 'PCA Projection', val: '5D Coordinates', icon: Microscope },
                    { id: 'Centroid Distance', label: 'Distance Eval', val: 'Euclidean', icon: Activity },
                    { id: 'Raw Cluster', label: 'Cluster Mapping', val: 'Branch Specific', icon: Merge },
                    { id: 'Weighted Vote', label: 'Vote Assembly', val: 'Weighted Sum', icon: Scale },
                    { id: 'Subtype', label: 'Final Result', val: result.prediction_summary.final_subtype_name, icon: CheckCircle, highlight: true }
                  ].map((node, i) => (
                    <div key={i} className="flex flex-col items-center relative z-10 w-full md:w-auto">
                      <MetricTooltip id={node.id}>
                        <div className={`flex flex-col items-center cursor-help group transition-all duration-300 ${node.highlight ? 'scale-110' : ''}`}>
                          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-500 border-2 ${node.highlight ? 'bg-blue-600 border-blue-400 text-white shadow-[0_0_20px_rgba(59,130,246,0.5)]' : 'bg-slate-950 border-slate-800 text-slate-500 group-hover:border-slate-600 group-hover:text-blue-400'}`}>
                            <node.icon className="w-5 h-5" />
                          </div>
                          <div className="mt-4 text-center">
                            <div className="text-[9px] text-slate-600 uppercase font-black tracking-widest leading-none mb-1 group-hover:text-slate-400">{node.label}</div>
                            <div className={`text-[11px] font-bold tracking-tight whitespace-nowrap ${node.highlight ? 'text-blue-400' : 'text-slate-400 group-hover:text-white'}`}>{node.val}</div>
                          </div>
                        </div>
                      </MetricTooltip>
                      {i < 6 && <div className="h-6 w-0.5 bg-slate-800 my-2 md:hidden"></div>}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 3. BRANCH COMPARISON MATRIX */}
            <div className="space-y-6">
              <h3 className="text-xl font-black text-white flex items-center space-x-3">
                <Database className="w-6 h-6 text-blue-400" /> <span>Analytical Branch Matrix</span>
              </h3>
              
              <div className="overflow-x-auto rounded-3xl border border-slate-800 bg-slate-950 shadow-2xl">
                <table className="w-full text-left border-collapse table-fixed">
                  <thead>
                    <tr className="bg-slate-900/80 border-b border-slate-800">
                      <th className="p-5 w-48 text-[10px] text-slate-500 uppercase font-black tracking-[0.2em] bg-slate-900/50 sticky left-0 z-20 backdrop-blur-md">Feature Analysis</th>
                      {result.branch_predictions?.map((b: any) => (
                        <th key={b.branch} className="p-5 min-w-[220px]">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-black text-white">{b.branch.replace('_', ' ')}</span>
                            {(b.mapped_consensus_class ?? b.mapped_shared_class) === result.prediction_summary.final_shared_class && (
                              <span className="text-[8px] bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded font-black uppercase tracking-widest">Consensus</span>
                            )}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900">
                    {[
                      { id: 'Branch', label: 'Normalization Method', key: 'branch', val: (b: any) => b.branch === 'Branch_A' ? 'TPM / log2TPM' : b.branch === 'Branch_B' ? 'CPM / log2CPM' : 'VST Proxy / log2Count' },
                      { id: 'Branch', label: 'Input Column', key: 'input', val: (b: any) => b.branch === 'Branch_A' ? 'tpm_unstranded' : 'unstranded (raw)' },
                      { id: 'Genes', label: 'Selected Genes', key: 'genes', val: (b: any) => b.branch === 'Branch_C' ? '2000' : '500' },
                      { id: 'Coverage', label: 'Feature Coverage', key: 'coverage', val: (b: any) => parseFloat(b.feature_coverage).toFixed(2), highlight: true },
                      { id: 'Raw Cluster', label: 'Internal Raw Cluster', key: 'raw_cluster', val: (b: any) => `C${b.raw_cluster}` },
                      { id: 'Mapped Shared Class', label: 'Consensus Class', key: 'mapped_class', val: (b: any) => b.mapped_shared_class ?? b.mapped_consensus_class, mono: true },
                      { id: 'Subtype', label: 'Mapped Subtype', key: 'mapped_subtype', val: (b: any) => ((b.mapped_subtype_name ?? b.mapped_subtype) || 'N/A').split(' ')[1], bold: true },
                      { id: 'Confidence', label: 'Dist. Confidence', key: 'confidence', val: (b: any) => parseFloat(b.distance_confidence || b.confidence || 0).toFixed(3) },
                      { id: 'Purity', label: 'Mapping Purity', key: 'purity', val: (b: any) => parseFloat(b.mapping_purity || 0).toFixed(3) },
                      { id: 'Branch Reliability', label: 'Branch Reliability', key: 'rel', val: (b: any) => parseFloat(b.branch_reliability || (b.branch === 'Branch_C' ? 0.85 : 1.0)).toFixed(2) },
                      { id: 'Outlier Penalty', label: 'Outlier Penalty', key: 'outlier', val: (b: any) => parseFloat(b.outlier_penalty || 1).toFixed(2) },
                      { id: 'Vote Weight', label: 'Final Vote Weight', key: 'weight', val: (b: any) => parseFloat(b.final_vote_weight || 0).toFixed(3), color: 'text-purple-400' },
                      { id: 'Agreement', label: 'Branch Status', key: 'status', val: (b: any) => b.status === 'completed' ? 'SUCCESS' : 'SKIPPED', color: 'text-green-500' }
                    ].map((row, i) => (
                      <tr key={i} className="hover:bg-white/5 transition-colors group">
                        <td className="p-4 bg-slate-900/30 sticky left-0 z-10 backdrop-blur-sm border-r border-slate-800">
                          <MetricTooltip id={row.id}>
                            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest cursor-help group-hover:text-slate-300 transition-colors">{row.label}</span>
                          </MetricTooltip>
                        </td>
                        {result.branch_predictions?.map((b: any) => (
                          <td key={b.branch} className="p-4">
                            <span className={`text-xs font-mono ${row.bold ? 'font-black uppercase' : ''} ${row.color || 'text-slate-300'}`}>
                              {row.val(b)}
                            </span>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 4. VOTING EVIDENCE & SOFT SUPPORT */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Voting evidence rows */}
              <div className="glass-panel p-8 border-slate-800 bg-slate-900/30 rounded-3xl space-y-8">
                <div>
                   <h3 className="text-xl font-black text-white flex items-center space-x-3 mb-2">
                     <Scale className="w-6 h-6 text-purple-400" /> <span>Evidence Assembly</span>
                   </h3>
                   <p className="text-xs text-slate-500">Aggregating weighted evidence from independent normalized branches.</p>
                </div>
                
                <div className="space-y-4">
                  {result.branch_predictions?.map((b: any) => {
                    const isWinner = (b.mapped_consensus_class ?? b.mapped_shared_class) === result.prediction_summary.final_shared_class;
                    return (
                      <div key={b.branch} className="flex items-center justify-between p-4 rounded-2xl bg-slate-950/50 border border-slate-800">
                        <div className="flex items-center space-x-4">
                           <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-[10px] ${b.branch === 'Branch_A' ? 'bg-blue-500/10 text-blue-500' : b.branch === 'Branch_B' ? 'bg-green-500/10 text-green-500' : 'bg-slate-800 text-slate-400'}`}>
                             {b.branch.split('_')[1]}
                           </div>
                           <div>
                             <div className="text-[10px] text-slate-600 font-black uppercase tracking-tighter leading-none mb-1">Method Path</div>
                             <div className="text-xs font-bold text-slate-300 uppercase">{b.branch === 'Branch_A' ? 'TPM' : b.branch === 'Branch_B' ? 'CPM' : 'VST Proxy'}</div>
                           </div>
                        </div>
                        <div className="flex-1 px-8">
                           <div className="h-1 w-full bg-slate-900 rounded-full overflow-hidden">
                              <motion.div initial={{ width: 0 }} animate={{ width: `${(b.final_vote_weight || 0) * 100}%` }} className="h-full bg-purple-500" />
                           </div>
                        </div>
                        <div className="text-right">
                           <div className={`text-xs font-black uppercase ${isWinner ? 'text-blue-400' : 'text-slate-500'}`}>
                             {((b.mapped_subtype_name ?? b.mapped_subtype) ?? 'N/A').split(' ')[1]}
                           </div>
                           <div className="text-[10px] text-purple-400 font-mono font-bold">W: {parseFloat(b.final_vote_weight || 0).toFixed(3)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="pt-6 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-600 font-bold uppercase tracking-widest">
                   <span>Deterministic Tie Handling: Enabled</span>
                   <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 rounded bg-purple-500"></div>
                      <span>Weighted Influence</span>
                   </div>
                </div>
              </div>

              {/* Total support horizontal bars */}
              <div className="glass-panel p-8 border-slate-800 bg-slate-900/30 rounded-3xl space-y-8">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-black text-white flex items-center space-x-3">
                    <Layers className="w-6 h-6 text-green-400" /> <span>Weighted Subtype Support</span>
                  </h3>
                  <MetricTooltip id="Weighted Vote">
                    <Info className="w-4 h-4 text-slate-600 cursor-help" />
                  </MetricTooltip>
                </div>

                <div className="space-y-6">
                  {result.voting_decision?.map((entry: any) => {
                    const isFinal = entry.subtype_class === result.prediction_summary.final_shared_class;
                    const maxWeight = Math.max(...result.voting_decision.map((v: any) => v.weighted_vote_sum));
                    const percentage = maxWeight > 0 ? (entry.weighted_vote_sum / maxWeight) * 100 : 0;
                    
                    return (
                      <div key={entry.subtype_class} className="space-y-2">
                        <div className="flex justify-between items-end">
                           <span className={`text-xs font-black uppercase tracking-wider ${isFinal ? 'text-blue-400' : 'text-slate-500'}`}>
                             {entry.subtype_name}
                           </span>
                           <span className={`text-xs font-mono font-bold ${isFinal ? 'text-white' : 'text-slate-600'}`}>
                             {parseFloat(entry.weighted_vote_sum).toFixed(3)}
                           </span>
                        </div>
                        <div className="h-3 bg-slate-900 rounded-full overflow-hidden border border-slate-800/50">
                           <motion.div 
                             initial={{ width: 0 }} 
                             animate={{ width: `${percentage}%` }} 
                             transition={{ duration: 1, ease: "easeOut" }}
                             className={`h-full rounded-full ${isFinal ? 'bg-gradient-to-r from-blue-600 to-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.3)]' : 'bg-slate-800'}`}
                           />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800">
                  <div className="flex items-center space-x-3 mb-2">
                     <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                     <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Scientific Disclaimer</span>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-relaxed italic">
                    Support values are derived from mathematical proximity in 5-dimensional transcriptomic manifold space. These values represent computational evidence, not clinical probability.
                  </p>
                </div>
              </div>
            </div>

            {/* 4b. VISUALIZATIONS & SIMILARITY ANALYSIS */}
            <div className="space-y-8 print:hidden">
              <h3 className="text-xl font-black text-white flex items-center space-x-3">
                <ImageIcon className="w-6 h-6 text-blue-400" /> <span>Visualizations &amp; Similarity Analysis</span>
              </h3>

              {/* Interactive per-sample geometric affinity distribution */}
              {affinity && (
                <div className="glass-panel p-8 border-slate-800 bg-slate-900/30 rounded-3xl space-y-6">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div>
                      <h4 className="text-lg font-black text-white flex items-center space-x-2">
                        <Scale className="w-5 h-5 text-purple-400" /><span>Geometric Affinity Distribution</span>
                      </h4>
                      <p className="text-xs text-slate-500">Inverse-distance soft support of this sample toward each consensus subtype.</p>
                    </div>
                    {affinity.crossover && (
                      <div className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                        <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest">
                          Cross-Over: {affinity.top.name} ↔ {affinity.second.name}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-4">
                    {affinity.byClass.map((d: any) => (
                      <div key={d.cls} className="space-y-1.5">
                        <div className="flex justify-between items-end">
                          <span className="text-xs font-black uppercase tracking-wider" style={{ color: SUBTYPE_HEX[d.cls] }}>{d.name}</span>
                          <span className="text-xs font-mono font-bold text-slate-300">{(d.pct * 100).toFixed(1)}%</span>
                        </div>
                        <div className="h-3 bg-slate-900 rounded-full overflow-hidden border border-slate-800/50">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${d.pct * 100}%` }}
                            transition={{ duration: 1, ease: 'easeOut' }}
                            className="h-full rounded-full"
                            style={{ backgroundColor: SUBTYPE_HEX[d.cls] }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  {affinity.crossover && (
                    <div className="bg-slate-950/50 p-4 rounded-2xl border border-amber-500/20">
                      <div className="text-[10px] font-black text-amber-400 uppercase tracking-widest mb-1">Cross-Over Feature Analysis</div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        This sample shows a strong secondary geometric pull:{' '}
                        <b style={{ color: SUBTYPE_HEX[affinity.top.cls] }}>{affinity.top.name}</b> ({(affinity.top.pct * 100).toFixed(1)}%) and{' '}
                        <b style={{ color: SUBTYPE_HEX[affinity.second.cls] }}>{affinity.second.name}</b> ({(affinity.second.pct * 100).toFixed(1)}%) are within{' '}
                        {((affinity.top.pct - affinity.second.pct) * 100).toFixed(1)} points — a boundary / transitional profile. Interpret the dominant call with caution.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Interactive PCA projection of THIS sample onto the reference cohort */}
              <div className="glass-panel p-6 md:p-8 border-slate-800 bg-slate-900/30 rounded-3xl space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h4 className="text-lg font-black text-white flex items-center space-x-2">
                      <Microscope className="w-5 h-5 text-blue-400" /><span>PCA Projection onto Reference Cohort</span>
                    </h4>
                    <p className="text-xs text-slate-500">
                      Full reference cohort in the consensus PC space; your uploaded sample is projected as the pulsating white/red star.
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/30 text-[10px] font-black text-blue-300 uppercase tracking-widest">
                      Visualizing {refProjection?.points?.length ?? 0} of {refProjection?.n_samples ?? refProjection?.points?.length ?? 0} Reference Samples
                    </span>
                    <div className="flex items-center space-x-2 text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                      <span className="text-lg leading-none text-white">★</span><span>This Sample</span>
                    </div>
                  </div>
                </div>
                <ProjectionScatter reference={refProjection} newPoint={newProjection} />
                <p className="text-[10px] text-slate-600 italic leading-relaxed">
                  All {refProjection?.points?.length ?? 328} samples are rendered with no downsampling or jitter — coordinates come directly
                  from <span className="font-mono">reference_tables/pca_projection_data.json</span>. In co-association PC space, samples in the
                  same consensus cluster share (near-)identical coordinates, so points overlap by design; density (opacity) reflects how many
                  samples occupy a location. Out-of-sample projection maps the uploaded sample's co-association vector through the same PCA model.
                </p>
              </div>
            </div>

            {/* 5. DETAILED DIAGNOSTICS (ACCORDION) */}
            <div className="pt-8 border-t border-slate-900">
              <button 
                onClick={() => setDetailedMode(!detailedMode)}
                className="w-full flex items-center justify-between p-6 bg-slate-900/20 hover:bg-slate-900/40 rounded-3xl border border-slate-800 transition-all group"
              >
                <div className="flex items-center space-x-4">
                  <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 group-hover:text-blue-400 transition-colors">
                    <Microscope className="w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <h4 className="text-lg font-black text-white">Detailed Branch Diagnostics</h4>
                    <p className="text-xs text-slate-500">Expose raw centroid distances, outlier profiles, and method-specific penalties.</p>
                  </div>
                </div>
                <div className={`transform transition-transform duration-300 ${detailedMode ? 'rotate-180' : ''}`}>
                  <ChevronRight className="w-6 h-6 text-slate-600" />
                </div>
              </button>

              <AnimatePresence>
                {detailedMode && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }} 
                    animate={{ opacity: 1, height: 'auto' }} 
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="py-10 grid grid-cols-1 lg:grid-cols-3 gap-8">
                      {result.branch_predictions?.map((branch: any) => {
                        const branchColor = branch.branch === 'Branch_A' ? 'blue' : branch.branch === 'Branch_B' ? 'green' : 'slate';
                        return (
                          <div key={branch.branch} className={`glass-panel p-6 border-t-4 bg-slate-900/40 shadow-xl border-t-${branchColor}-500`}>
                            <h4 className="text-xl font-black text-white mb-6 flex items-center justify-between">
                              {branch.branch.replace('_', ' ')}
                              <Info className="w-4 h-4 text-slate-700" />
                            </h4>
                            
                            <div className="space-y-6">
                              <div className="h-32 bg-slate-950/60 rounded-2xl border border-slate-800/50 p-4 flex items-end justify-between gap-1 shadow-inner overflow-hidden">
                                {getDistanceData(branch.branch).map((entry: any, idx: number) => {
                                  const isWinner = parseInt(entry.cluster) === parseInt(branch.raw_cluster);
                                  const maxDist = Math.max(...getDistanceData(branch.branch).map(d => d.distance));
                                  const height = 100 - (entry.distance / maxDist * 80);
                                  return (
                                    <div key={idx} className="flex-1 flex flex-col items-center group/bar relative">
                                      <div className={`w-full rounded-t-md transition-all ${isWinner ? `bg-${branchColor}-500 shadow-[0_0_10px_rgba(59,130,246,0.3)]` : 'bg-slate-800'}`} style={{ height: `${height}%` }} />
                                      <span className="mt-2 text-[8px] font-mono text-slate-600">C{entry.cluster}</span>
                                      <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-slate-950 border border-slate-800 px-1 py-0.5 rounded text-[8px] text-slate-400 opacity-0 group-hover/bar:opacity-100 transition-opacity">
                                        {entry.distance.toFixed(1)}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                              
                              <div className="grid grid-cols-2 gap-3">
                                {[
                                  { label: 'Outlier Ratio', val: parseFloat(branch.outlier_ratio || 0).toFixed(2) },
                                  { label: 'Outlier Penalty', val: parseFloat(branch.outlier_penalty || 1).toFixed(2) },
                                  { label: 'Purity Score', val: parseFloat(branch.mapping_purity || 0).toFixed(3) },
                                  { label: 'Final Weight', val: parseFloat(branch.final_vote_weight || 0).toFixed(3), color: 'text-purple-400' }
                                ].map((item, i) => (
                                  <div key={i} className="p-3 bg-slate-950/50 rounded-xl border border-slate-800/50">
                                    <div className="text-[8px] text-slate-600 uppercase font-black mb-1">{item.label}</div>
                                    <div className={`text-xs font-mono font-bold ${item.color || 'text-slate-300'}`}>{item.val}</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* DOWNLOADS & QC FILES */}
            <div className="glass-panel p-8 mt-20 relative border-b-4 border-b-slate-700 rounded-3xl">
               <div className="flex flex-col md:flex-row items-center justify-between mb-8 gap-4">
                 <div>
                   <h3 className="text-xl font-black text-white flex items-center space-x-3">
                     <FileText className="w-6 h-6 text-slate-500" /> <span>Generated Analytical Artifacts</span>
                   </h3>
                   <p className="text-xs text-slate-500 mt-1">Download raw mathematical reports and reference Excel workbooks.</p>
                 </div>
                 <span className="text-[10px] px-3 py-1 bg-slate-800 rounded-full border border-slate-700 text-slate-400 uppercase font-bold tracking-widest">{result.files_generated?.length || 0} Artifacts</span>
               </div>
               
               <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                 {result.files_generated && result.files_generated.map((file: string) => (
                    <a href={`${API_URL}/download/${result.run_id}/${file}`} download key={file} className="group flex items-center justify-between space-x-2 text-xs p-4 bg-slate-900/80 hover:bg-slate-800 border border-slate-800 hover:border-blue-500/30 rounded-xl transition-all shadow-lg">
                      <div className="flex items-center space-x-3 truncate">
                        <div className={`w-7 h-7 rounded flex items-center justify-center shrink-0 ${file.endsWith('.xlsx') ? 'bg-green-500/10 text-green-500' : file.endsWith('.json') ? 'bg-purple-500/10 text-purple-500' : 'bg-slate-800 text-slate-400'}`}>
                          <FileText className="w-3.5 h-3.5" />
                        </div>
                        <span className="truncate text-slate-400 group-hover:text-white transition-colors font-mono">{file}</span>
                      </div>
                      <Download className="w-3.5 h-3.5 text-slate-600 group-hover:text-white transition-colors shrink-0" />
                    </a>
                 ))}
               </div>
            </div>

            {/* PRINTABLE PATIENT SHEET — hidden on screen, isolated to one clean page on print */}
            <div className="print-sheet">
              <div style={{ fontFamily: 'Georgia, "Times New Roman", serif', color: '#000' }}>
                <div style={{ borderBottom: '2px solid #000', paddingBottom: 8, marginBottom: 16 }}>
                  <div style={{ fontSize: 20, fontWeight: 'bold' }}>KBU-MedLab — Consensus Subtype Report</div>
                  <div style={{ fontSize: 11, color: '#444' }}>son_model · Evidence Accumulation Clustering · Research use only</div>
                </div>

                <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                  <tbody>
                    <tr><td style={{ padding: '4px 8px', fontWeight: 'bold', width: '42%' }}>Sample ID</td><td style={{ padding: '4px 8px', fontFamily: 'monospace' }}>{result.sample_id}</td></tr>
                    <tr><td style={{ padding: '4px 8px', fontWeight: 'bold' }}>Consensus Class</td><td style={{ padding: '4px 8px' }}>{String(result.prediction_summary.final_shared_class)}</td></tr>
                    <tr><td style={{ padding: '4px 8px', fontWeight: 'bold' }}>Predicted Subtype</td><td style={{ padding: '4px 8px' }}>{result.prediction_summary.final_subtype_name}</td></tr>
                    <tr><td style={{ padding: '4px 8px', fontWeight: 'bold' }}>Expression Profile</td><td style={{ padding: '4px 8px' }}>{result.prediction_summary.final_subtype_profile || '—'}</td></tr>
                    <tr><td style={{ padding: '4px 8px', fontWeight: 'bold' }}>Decision Status</td><td style={{ padding: '4px 8px' }}>{String(result.prediction_summary.final_status).replace(/_/g, ' ')}</td></tr>
                    <tr><td style={{ padding: '4px 8px', fontWeight: 'bold' }}>Voting Confidence (weighted margin)</td><td style={{ padding: '4px 8px' }}>{parseFloat(result.prediction_summary.weighted_margin || 0).toFixed(3)}</td></tr>
                  </tbody>
                </table>

                <div style={{ marginTop: 16, fontWeight: 'bold', fontSize: 13 }}>Geometric Affinity Matrix</div>
                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', marginTop: 6 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', borderBottom: '1px solid #000', padding: '4px 8px' }}>Subtype</th>
                      <th style={{ textAlign: 'right', borderBottom: '1px solid #000', padding: '4px 8px' }}>Total Support</th>
                      <th style={{ textAlign: 'right', borderBottom: '1px solid #000', padding: '4px 8px' }}>Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {affinity ? affinity.byClass.map((d: any) => (
                      <tr key={d.cls}>
                        <td style={{ padding: '4px 8px' }}>{d.name}</td>
                        <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{d.support.toFixed(4)}</td>
                        <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{(d.pct * 100).toFixed(1)}%</td>
                      </tr>
                    )) : null}
                  </tbody>
                </table>

                <div style={{ marginTop: 20, fontSize: 10, color: '#555', borderTop: '1px solid #ccc', paddingTop: 8 }}>
                  Computational transcriptomic hypothesis for research settings only — completely absent of clinical pathology
                  validation. Not for diagnosis, prognosis, or treatment. Downstream preclinical validation is mandatory before
                  any therapeutic translation. Generated by the KBU-MedLab son_model consensus pipeline.
                </div>
              </div>
            </div>

            {/* SCIENTIFIC LIMITATIONS SECTION */}
            <div id="about" className="pt-16 pb-10 border-t border-slate-900 mt-20">
              <h3 className="text-xs font-black text-slate-600 uppercase tracking-[0.4em] mb-12 text-center">Protocol Architecture & Scientific Framework</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
                <div className="bg-slate-900/30 p-8 rounded-3xl border border-slate-800/50 flex flex-col justify-center">
                  <h4 className="text-white font-black mb-4 flex items-center uppercase tracking-widest text-sm"><Microscope className="w-4 h-4 mr-2 text-blue-500"/> KBU-MedLab Research</h4>
                  <p className="text-xs text-slate-400 leading-relaxed mb-4">
                    The precision oncology pipeline implements a tri-branch normalization consensus strategy. By processing raw RNA-seq counts through parallel TPM, CPM, and VST-proximal paths, the system mitigates normalization-specific clustering artifacts.
                  </p>
                  <p className="text-xs text-slate-500 leading-relaxed italic">
                    Developed for Glioblastoma Multiforme (GBM) transcriptomic characterization as part of the TEKNOFEST Oncology 2026 academic demonstration.
                  </p>
                </div>
                <div className="space-y-4">
                  {[
                    { t: 'CONCORDANCE POLICY', d: 'Final predictions require weighted agreement between multiple branches. Ambiguous margins result in uncertain classification.' },
                    { t: 'FEATURE SELECTION', d: 'Top 500-2000 most variant genes are selected based on branch-specific training cohorts to maximize cluster separation signal.' },
                    { t: 'MANIFOLD ANALYSIS', d: 'Cluster assignment is performed in a reduced 5-dimensional PCA manifold using Euclidean distance to historical centroids.' },
                  ].map((lim, idx) => (
                    <div key={idx} className="flex items-start space-x-4 p-5 bg-slate-900/20 border border-slate-800/50 rounded-2xl group hover:border-slate-700 transition-colors">
                      <ShieldAlert className="w-5 h-5 text-slate-600 group-hover:text-blue-500 transition-colors shrink-0 mt-0.5" />
                      <div>
                        <div className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-1">{lim.t}</div>
                        <div className="text-[10px] text-slate-500 leading-relaxed">{lim.d}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </motion.div>
        )}
      </main>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-6 py-8 text-center border-t border-slate-900 bg-slate-950">
        <p className="text-[10px] text-slate-600 uppercase tracking-widest font-bold flex items-center justify-center">
          <img src="/assets/logo.png" alt="KBU" className="h-4 w-auto opacity-50 mr-2 mix-blend-screen" />
          KBU-MEDLAB \u2022 TEKNOFEST ONCOLOGY 2026 \u2022 BIOINFORMATICS PIPELINE
        </p>
      </footer>
    </div>
  );
}

export default App;
