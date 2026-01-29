import React from 'react';
import { PaperSummary } from '../types';
import GamifiedLoader from './GamifiedLoader';
import { FlameIcon, FlaskIcon, SparklesIcon, TrophyIcon, SwordIcon } from './IconComponents';

interface SummaryViewProps {
  summary: PaperSummary | null;
  isLoading: boolean;
  error: string | null;
}

const SummaryView: React.FC<SummaryViewProps> = ({ summary, isLoading, error }) => {
  if (isLoading) {
    return (
      <div className="h-full bg-[#f4ecd8] border-l-4 border-[#8B4513] relative overflow-hidden">
         <GamifiedLoader />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-[#f4ecd8] h-full flex items-center justify-center">
        <div className="bg-red-100 text-[#8B4513] border-4 border-[#8B4513] p-6 rounded text-center">
          <h3 className="font-bold pixel-font text-lg mb-2">鉴定失败 (APPRAISAL FAILED)</h3>
          <p className="serif">{error}</p>
        </div>
      </div>
    );
  }

  if (!summary) return null;

  return (
    <div className="h-full overflow-y-auto bg-[#f4ecd8] custom-scrollbar p-6 space-y-8 pb-20">
      
      {/* 1. Header & Attributes */}
      <div className="space-y-4">
        <div className="inline-block px-3 py-1 bg-[#2c1810] text-[#DAA520] pixel-font text-[10px] uppercase font-bold tracking-widest border border-[#DAA520]">
          Magic Item Appraisal Report
        </div>
        <h2 className="text-2xl font-bold text-[#2c1810] serif leading-tight border-b-4 border-[#8B4513] pb-4">
          {summary.title}
        </h2>
        <div className="flex flex-wrap gap-2">
          {summary.tags.map((tag, i) => (
            <span key={i} className="flex items-center gap-1 px-2 py-1 bg-[#8B4513] text-[#e8e4d9] text-xs font-bold rounded pixel-font border border-[#2c1810] shadow-[2px_2px_0_0_#2c1810]">
              <FlameIcon className="w-3 h-3 text-[#DAA520]" />
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* 2. Cat's TL;DR (RPG Panel) */}
      <div className="bg-[#e8e4d9] border-4 border-[#2c1810] p-4 relative shadow-[4px_4px_0_0_rgba(44,24,16,0.3)]">
         <div className="absolute -top-4 -left-4 bg-[#DAA520] border-4 border-[#2c1810] p-1 w-12 h-12 flex items-center justify-center shadow-lg">
           <span className="text-2xl">🐱</span>
         </div>
         <div className="ml-8 mt-2 space-y-4">
           <h3 className="pixel-font text-xs font-bold text-[#8B4513] uppercase mb-2">Cat's TL;DR (猫咪速读)</h3>
           
           <div className="flex gap-3 items-start">
             <div className="shrink-0 mt-1 bg-red-100 p-1 rounded border border-red-300">
               <span className="text-lg">🩸</span>
             </div>
             <div>
               <p className="text-[10px] font-bold text-red-800 uppercase pixel-font">The Curse (痛点)</p>
               <p className="text-sm serif text-[#2c1810] leading-relaxed">{summary.tldr.painPoint}</p>
             </div>
           </div>

           <div className="flex gap-3 items-start">
             <div className="shrink-0 mt-1 bg-green-100 p-1 rounded border border-green-300">
               <FlaskIcon className="w-5 h-5 text-green-700" />
             </div>
             <div>
               <p className="text-[10px] font-bold text-green-800 uppercase pixel-font">The Potion (解药)</p>
               <p className="text-sm serif text-[#2c1810] leading-relaxed">{summary.tldr.solution}</p>
             </div>
           </div>

           <div className="flex gap-3 items-start">
             <div className="shrink-0 mt-1 bg-yellow-100 p-1 rounded border border-yellow-300">
               <SparklesIcon className="w-5 h-5 text-yellow-700" />
             </div>
             <div>
               <p className="text-[10px] font-bold text-yellow-800 uppercase pixel-font">The Buff (效果)</p>
               <p className="text-sm serif text-[#2c1810] leading-relaxed">{summary.tldr.effect}</p>
             </div>
           </div>
         </div>
      </div>

      {/* 3. Methodology Skill Tree */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 border-b-2 border-[#8B4513]/30 pb-2">
           <SwordIcon className="w-5 h-5 text-[#8B4513]" />
           <h3 className="pixel-font text-sm font-bold text-[#2c1810] uppercase">Battle Plan (攻坚路线图)</h3>
        </div>
        
        <div className="relative pl-4 space-y-6">
           {/* Vertical Line */}
           <div className="absolute left-[19px] top-2 bottom-2 w-0.5 bg-[#8B4513]/30"></div>

           {summary.methodology.map((step, idx) => (
             <div key={idx} className="relative flex items-start gap-4">
                {/* Dot */}
                <div className="z-10 w-3 h-3 rounded-full bg-[#DAA520] border-2 border-[#2c1810] mt-1.5 shrink-0 shadow-sm"></div>
                <div className="bg-[#fffef0] p-3 rounded border border-[#8B4513]/20 flex-1 shadow-sm">
                   <p className="pixel-font text-[10px] font-bold text-[#8B4513] uppercase mb-1">Step {idx + 1}: {step.step}</p>
                   <p className="text-sm serif text-[#2c1810]">{step.desc}</p>
                </div>
             </div>
           ))}
        </div>
      </div>

      {/* 4. Loot (Key Takeaways) */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 border-b-2 border-[#8B4513]/30 pb-2">
           <TrophyIcon className="w-5 h-5 text-[#DAA520]" />
           <h3 className="pixel-font text-sm font-bold text-[#2c1810] uppercase">Loot (掉落战利品)</h3>
        </div>

        <ul className="space-y-3">
          {summary.takeaways.map((point, idx) => (
            <li key={idx} className="flex items-start gap-3 bg-[#fffef0] p-3 border-2 border-[#2c1810] shadow-[2px_2px_0_0_#2c1810]">
              <span className="text-green-600 font-bold text-lg leading-none">✅</span>
              <span className="text-sm serif text-[#2c1810] leading-relaxed">{point}</span>
            </li>
          ))}
        </ul>
      </div>

    </div>
  );
};

export default SummaryView;