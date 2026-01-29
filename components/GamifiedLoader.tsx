import React, { useState, useEffect } from 'react';

const LOADING_MESSAGES = [
  "正在与审稿人搏斗... (Fighting Reviewer #2...)",
  "正在解析复杂的 LaTeX 咒语... (Parsing LaTeX spells...)",
  "猫咪正在查阅字典... (Cat is checking the dictionary...)",
  "正在给论文施加‘易读’魔法... (Casting 'Readable' buff...)",
  "正在提取核心知识晶体... (Mining knowledge crystals...)",
  "喵？这个公式有点难啃... (Meow? This formula is chewy...)",
  "正在召唤学术先贤的灵魂... (Summoning academic spirits...)"
];

const GamifiedLoader: React.FC = () => {
  const [progress, setProgress] = useState(0);
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    // Asymptotic progress curve: Fast start, slows down, never stops
    // Formula: next = current + (target - current) * factor
    // We change the target and factor over time
    const interval = setInterval(() => {
      setProgress(prev => {
        const remaining = 100 - prev;
        // The closer to 100, the smaller the step, but always > 0.05
        const step = Math.max(remaining * 0.02, 0.05); 
        const next = prev + step;
        return next >= 99.5 ? 99.5 : next; // Cap at 99.5 until real load finishes
      });
    }, 100);

    // Rotate messages
    const msgInterval = setInterval(() => {
      setMessageIndex(prev => (prev + 1) % LOADING_MESSAGES.length);
    }, 2500);

    return () => {
      clearInterval(interval);
      clearInterval(msgInterval);
    };
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-[#2c1810]">
      {/* Pixel Cat Animation (CSS constructed) */}
      <div className="mb-8 relative">
        <div className="text-6xl animate-bounce">🐱⚡️</div>
        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-16 h-2 bg-[#2c1810]/20 rounded-full blur-sm"></div>
      </div>

      <div className="w-64 mb-4">
        {/* HP Bar Container */}
        <div className="border-4 border-[#2c1810] bg-[#2c1810] p-1 relative shadow-lg">
          <div className="h-6 bg-[#5c4033] relative overflow-hidden">
             {/* Fill */}
             <div 
               className="h-full bg-gradient-to-r from-red-500 to-yellow-500 transition-all duration-200 ease-linear"
               style={{ width: `${Math.min(100, progress)}%` }}
             ></div>
             {/* Pixel Glint */}
             <div className="absolute top-1 left-0 right-0 h-1 bg-white/30"></div>
          </div>
          <div className="absolute -top-6 right-0 pixel-font text-[10px] text-[#2c1810] font-bold">
            HP: {Math.floor(progress)}/100
          </div>
        </div>
      </div>

      <p className="pixel-font text-xs text-center font-bold text-[#8B4513] animate-pulse">
        {LOADING_MESSAGES[messageIndex]}
      </p>
      
      <p className="mt-4 text-[10px] serif italic text-[#2c1810]/60">
        Tip: Press 'SPACE' to auto-scroll...
      </p>
    </div>
  );
};

export default GamifiedLoader;