import React from 'react';

type CatMood = 'IDLE' | 'THINKING' | 'ERROR' | 'SUCCESS' | 'READING';

interface MascotProps {
  mood: CatMood;
  message?: string | null;
  onClick?: () => void;
}

export const ScholarCatMascot: React.FC<MascotProps> = ({ mood, message, onClick }) => {
  
  // --- 动态渲染逻辑 ---
  const renderCatContent = () => {
    switch (mood) {
      case 'THINKING': // 疯狂翻书/敲键盘
        return (
          <g className="animate-bounce-fast">
            {/* 身体 */}
            <ellipse cx="50" cy="80" rx="30" ry="25" fill="#1a1a1a" />
            <circle cx="50" cy="50" r="25" fill="#1a1a1a" />
            {/* 耳朵 */}
            <path d="M30 35 L20 10 L45 28 Z" fill="#1a1a1a" />
            <path d="M70 35 L80 10 L55 28 Z" fill="#1a1a1a" />
            {/* 眼睛 (专注的大圆眼) */}
            <circle cx="40" cy="50" r="6" fill="#FFF" />
            <circle cx="40" cy="50" r="2" fill="#000" className="animate-ping" />
            <circle cx="60" cy="50" r="6" fill="#FFF" />
            <circle cx="60" cy="50" r="2" fill="#000" className="animate-ping" />
            {/* 爪子 (快速敲击) */}
            <ellipse cx="35" cy="85" rx="8" ry="8" fill="#FFF" className="animate-typing-l" />
            <ellipse cx="65" cy="85" rx="8" ry="8" fill="#FFF" className="animate-typing-r" />
            {/* 汗水 */}
            <path d="M80 40 Q85 30 90 45" stroke="#00BFFF" strokeWidth="2" fill="none" className="opacity-0 animate-sweat" />
          </g>
        );

      case 'ERROR': // 炸毛 + 问号
        return (
          <g className="animate-shake">
            {/* 炸毛的身体 (锯齿状) */}
            <path d="M20 80 Q15 70 20 60 Q10 50 25 40 L20 10 L45 25 Q50 15 55 25 L80 10 L75 40 Q90 50 80 60 Q85 70 80 80 Z" fill="#1a1a1a" />
            {/* 眼睛 (晕圈) */}
            <g stroke="#FFF" strokeWidth="2" fill="none">
               <path d="M35 45 L45 55 M45 45 L35 55" />
               <path d="M55 45 L65 55 M65 45 L55 55" />
            </g>
            {/* 问号 */}
            <text x="90" y="30" fill="#FF4500" className="text-2xl font-bold animate-pulse">?</text>
          </g>
        );

      case 'SUCCESS': // 举牌子
        return (
          <g>
            {/* 正常身体 */}
            <ellipse cx="50" cy="85" rx="30" ry="20" fill="#1a1a1a" />
            <circle cx="50" cy="55" r="22" fill="#1a1a1a" />
            <path d="M30 40 L20 15 L45 33 Z" fill="#1a1a1a" />
            <path d="M70 40 L80 15 L55 33 Z" fill="#1a1a1a" />
            {/* 笑眼 */}
            <path d="M38 55 Q42 50 46 55" stroke="#FFF" strokeWidth="2" fill="none" />
            <path d="M54 55 Q58 50 62 55" stroke="#FFF" strokeWidth="2" fill="none" />
            <path d="M48 62 Q50 65 52 62" stroke="#FFF" strokeWidth="2" fill="none" />
            {/* 牌子 */}
            <line x1="80" y1="80" x2="80" y2="40" stroke="#8B4513" strokeWidth="3" />
            <rect x="60" y="10" width="40" height="30" fill="#FFF" stroke="#8B4513" strokeWidth="2" transform="rotate(10 80 80)" />
            <text x="65" y="32" fontSize="12" fill="#008000" fontWeight="bold" transform="rotate(10 80 80)" className="pixel-font">PASS</text>
          </g>
        );

      case 'IDLE': 
      default: // 睡觉/舔爪子
        return (
          <g className="animate-breathe">
            {/* 趴着的身体 */}
            <ellipse cx="50" cy="85" rx="40" ry="25" fill="#1a1a1a" />
            {/* 头 */}
            <circle cx="30" cy="75" r="20" fill="#1a1a1a" />
            <path d="M15 65 L5 50 L25 60 Z" fill="#1a1a1a" />
            <path d="M45 65 L55 50 L35 60 Z" fill="#1a1a1a" />
            {/* 闭眼 */}
            <path d="M22 75 L30 75" stroke="#FFF" strokeWidth="2" />
            <path d="M35 75 L43 75" stroke="#FFF" strokeWidth="2" />
            {/* 尾巴晃动 */}
            <path d="M85 80 Q95 70 90 60" stroke="#1a1a1a" strokeWidth="6" strokeLinecap="round" className="animate-tail" />
            {/* Zzz */}
            <text x="60" y="40" fill="#DAA520" fontSize="14" className="animate-float-z">Zzz</text>
          </g>
        );
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col items-end pointer-events-none">
      <style>{`
        @keyframes bounce-fast { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
        @keyframes typing-l { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
        @keyframes typing-r { 0%, 100% { transform: translateY(-5px); } 50% { transform: translateY(0); } }
        @keyframes sweat { 0% { opacity: 0; transform: translateY(0); } 50% { opacity: 1; } 100% { opacity: 0; transform: translateY(10px); } }
        @keyframes shake { 0% { transform: translate(1px, 1px) rotate(0deg); } 10% { transform: translate(-1px, -2px) rotate(-1deg); } 20% { transform: translate(-3px, 0px) rotate(1deg); } 30% { transform: translate(3px, 2px) rotate(0deg); } 40% { transform: translate(1px, -1px) rotate(1deg); } 50% { transform: translate(-1px, 2px) rotate(-1deg); } 60% { transform: translate(-3px, 1px) rotate(0deg); } 70% { transform: translate(3px, 1px) rotate(-1deg); } 80% { transform: translate(-1px, -1px) rotate(1deg); } 90% { transform: translate(1px, 2px) rotate(0deg); } 100% { transform: translate(1px, -2px) rotate(-1deg); } }
        @keyframes breathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.02); } }
        @keyframes tail { 0%, 100% { d: path("M85 80 Q95 70 90 60"); } 50% { d: path("M85 80 Q95 90 90 100"); } }
        @keyframes float-z { 0% { transform: translate(0, 0) scale(1); opacity: 0; } 50% { opacity: 1; } 100% { transform: translate(10px, -20px) scale(1.5); opacity: 0; } }
        
        .animate-bounce-fast { animation: bounce-fast 0.2s infinite; }
        .animate-typing-l { animation: typing-l 0.2s infinite; }
        .animate-typing-r { animation: typing-r 0.2s infinite; }
        .animate-sweat { animation: sweat 1s infinite; }
        .animate-shake { animation: shake 0.5s infinite; }
        .animate-breathe { animation: breathe 3s ease-in-out infinite; }
        .animate-tail { animation: tail 2s ease-in-out infinite alternate; }
        .animate-float-z { animation: float-z 2s linear infinite; }
      `}</style>

      {/* 气泡消息 */}
      {message && (
        <div className="mb-3 mr-8 bg-white border-2 border-black p-3 rounded-2xl shadow-lg max-w-xs animate-in slide-in-from-bottom-2 duration-300 pointer-events-auto relative">
          <p className="pixel-font text-xs text-black leading-relaxed">{message}</p>
          {/* 漫画式尖角 */}
          <div className="absolute -bottom-3 right-8 w-0 h-0 border-l-[10px] border-l-transparent border-r-[0px] border-r-transparent border-t-[12px] border-t-black"></div>
          <div className="absolute -bottom-[9px] right-[33px] w-0 h-0 border-l-[8px] border-l-transparent border-r-[0px] border-r-transparent border-t-[10px] border-t-white"></div>
        </div>
      )}

      {/* SVG 猫咪容器 */}
      <div 
        onClick={onClick} 
        className="relative w-32 h-32 pointer-events-auto cursor-pointer hover:scale-110 transition-transform duration-200"
      >
        <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-xl overflow-visible">
           {renderCatContent()}
        </svg>
      </div>
    </div>
  );
};
