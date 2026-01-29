import React, { useState, useEffect } from 'react';

// 定义小猫的几种心情状态
export type CatMood = 'IDLE' | 'THINKING' | 'SEARCHING' | 'ERROR' | 'SUCCESS' | 'SLEEPING';

interface MascotProps {
  mood: CatMood;
  message?: string | null;
  onClick?: () => void;
}

export const ScholarCatMascot: React.FC<MascotProps> = ({ mood, message, onClick }) => {
  const [isHovered, setIsHovered] = useState(false);
  const [internalMood, setInternalMood] = useState<CatMood>(mood);

  // 当外部 mood 改变时，同步更新，但允许 hover 临时改变状态
  useEffect(() => {
    setInternalMood(mood);
  }, [mood]);

  // 罗小黑风格颜色
  const CAT_COLOR = "#2D2D2D"; // 柔和的黑色
  const EYE_COLOR = "#FFFFFF";
  const PUPIL_COLOR = "#000000";
  const BLUSH_COLOR = "#FFB6C1"; // 腮红

  // 动态渲染不同状态的猫咪部件
  const renderCatContent = () => {
    // 基础身体 (类似小黑的圆润身体)
    const Body = (
      <path 
        d="M20,85 Q10,85 15,65 Q20,35 50,35 Q80,35 85,65 Q90,85 80,85 Z" 
        fill={CAT_COLOR} 
      />
    );

    // 耳朵
    const Ears = (
      <g>
        <path d="M25,45 L15,20 L40,38 Z" fill={CAT_COLOR} />
        <path d="M75,45 L85,20 L60,38 Z" fill={CAT_COLOR} />
        {/* 耳蜗 */}
        <path d="M28,40 L22,28 L35,38 Z" fill="#4a4a4a" />
        <path d="M72,40 L78,28 L65,38 Z" fill="#4a4a4a" />
      </g>
    );

    // 尾巴 (不同状态尾巴位置不同)
    const renderTail = () => {
      if (internalMood === 'THINKING' || internalMood === 'SEARCHING') {
        return <path d="M80,80 Q95,70 90,50" stroke={CAT_COLOR} strokeWidth="6" strokeLinecap="round" fill="none" className="animate-tail-fast" />;
      }
      return <path d="M80,80 Q95,75 90,65" stroke={CAT_COLOR} strokeWidth="6" strokeLinecap="round" fill="none" className="animate-tail-slow" />;
    };

    // 眼睛 (核心表情区域)
    const renderEyes = () => {
      switch (internalMood) {
        case 'THINKING': // 盯着屏幕/书本
        case 'SEARCHING':
          return (
            <g className="animate-scan">
              <circle cx="35" cy="55" r="8" fill={EYE_COLOR} />
              <circle cx="35" cy="55" r="3" fill={PUPIL_COLOR} />
              <circle cx="65" cy="55" r="8" fill={EYE_COLOR} />
              <circle cx="65" cy="55" r="3" fill={PUPIL_COLOR} />
              {/* 眼镜特效 */}
              <g opacity="0.8">
                 <circle cx="35" cy="55" r="9" stroke="#DAA520" strokeWidth="1.5" fill="none" />
                 <line x1="44" y1="55" x2="56" y2="55" stroke="#DAA520" strokeWidth="1.5" />
                 <circle cx="65" cy="55" r="9" stroke="#DAA520" strokeWidth="1.5" fill="none" />
              </g>
            </g>
          );
        case 'ERROR': // 晕头转向
          return (
             <g>
               <text x="28" y="60" fontSize="14" fill="#FFF" className="font-bold">X</text>
               <text x="60" y="60" fontSize="14" fill="#FFF" className="font-bold">X</text>
               <path d="M45,65 Q50,75 55,65" stroke="#FFF" strokeWidth="2" fill="none" />
             </g>
          );
        case 'SUCCESS': // 星星眼
          return (
            <g>
              <text x="28" y="60" fontSize="12" fill="#FFD700">★</text>
              <text x="58" y="60" fontSize="12" fill="#FFD700">★</text>
              <path d="M45,60 Q50,65 55,60" stroke="#FFB6C1" strokeWidth="2" fill="none" />
            </g>
          );
        case 'SLEEPING': // 闭眼
          return (
            <g>
              <path d="M28,55 Q35,58 42,55" stroke="#FFF" strokeWidth="2" fill="none" />
              <path d="M58,55 Q65,58 72,55" stroke="#FFF" strokeWidth="2" fill="none" />
              <text x="65" y="40" fontSize="10" fill="#DAA520" className="animate-float-z">Zzz</text>
            </g>
          );
        case 'IDLE':
        default: // 大眼睛眨眼
          return (
            <g>
               <g className="cat-eyes-blink">
                 <ellipse cx="35" cy="55" rx="7" ry="8" fill={EYE_COLOR} />
                 <circle cx="35" cy="55" r="3" fill={PUPIL_COLOR} />
                 <ellipse cx="65" cy="55" rx="7" ry="8" fill={EYE_COLOR} />
                 <circle cx="65" cy="55" r="3" fill={PUPIL_COLOR} />
                 {/* 高光 */}
                 <circle cx="38" cy="52" r="2" fill="white" />
                 <circle cx="68" cy="52" r="2" fill="white" />
               </g>
               {/* 腮红 */}
               <ellipse cx="25" cy="62" rx="3" ry="2" fill={BLUSH_COLOR} opacity="0.6" />
               <ellipse cx="75" cy="62" rx="3" ry="2" fill={BLUSH_COLOR} opacity="0.6" />
            </g>
          );
      }
    };

    // 道具 (书、电脑、魔法球)
    const renderProp = () => {
      if (internalMood === 'THINKING') {
        return (
          <g className="animate-hover-item">
            <rect x="25" y="75" width="50" height="15" rx="2" fill="#8B4513" />
            <rect x="30" y="78" width="40" height="1" fill="#e8e4d9" />
            <rect x="30" y="81" width="40" height="1" fill="#e8e4d9" />
          </g>
        );
      }
      if (internalMood === 'SEARCHING') {
        return (
          <text x="75" y="45" fontSize="20" className="animate-spin-slow origin-center">🔍</text>
        );
      }
      return null;
    };

    return (
      <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible drop-shadow-xl">
        {/* 动态阴影 */}
        <ellipse cx="50" cy="90" rx="30" ry="5" fill="#000" opacity="0.2" className="animate-shadow-breathe" />
        
        <g className={internalMood === 'ERROR' ? 'animate-shake' : 'animate-breathe-body'}>
          {renderTail()}
          {Ears}
          {Body}
          {renderEyes()}
          {renderProp()}
          {/* 爪子 */}
          <ellipse cx="35" cy="85" rx="6" ry="5" fill={CAT_COLOR} />
          <ellipse cx="65" cy="85" rx="6" ry="5" fill={CAT_COLOR} />
        </g>
      </svg>
    );
  };

  return (
    <div 
      className="fixed bottom-8 right-8 z-[100] flex flex-col items-end"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <style>{`
        /* 尾巴动画 */
        @keyframes tail-slow { 0%,100%{d:path("M80,80 Q95,75 90,65");} 50%{d:path("M80,80 Q100,85 95,55");} }
        @keyframes tail-fast { 0%,100%{d:path("M80,80 Q95,70 90,50");} 50%{d:path("M80,80 Q70,70 65,50");} }
        
        /* 眨眼 */
        @keyframes blink { 0%,90%,100%{transform: scaleY(1);} 95%{transform: scaleY(0.1);} }
        
        /* 呼吸感 */
        @keyframes breathe-body { 0%,100%{transform: translateY(0) scale(1);} 50%{transform: translateY(-1px) scale(1.02);} }
        @keyframes shadow-breathe { 0%,100%{transform: scale(1); opacity: 0.2;} 50%{transform: scale(0.9); opacity: 0.3;} }

        /* 状态特效 */
        @keyframes shake { 0%,100%{transform:translateX(0);} 25%{transform:translateX(-2px) rotate(-2deg);} 75%{transform:translateX(2px) rotate(2deg);} }
        @keyframes float-z { 0%{transform:translate(0,0);opacity:0;} 50%{opacity:1;} 100%{transform:translate(10px,-15px);opacity:0;} }
        @keyframes spin-slow { from{transform:rotate(0deg);} to{transform:rotate(360deg);} }
        @keyframes hover-item { 0%,100%{transform:translateY(0);} 50%{transform:translateY(-2px);} }
        @keyframes pop-in { 0%{transform:scale(0);opacity:0;} 80%{transform:scale(1.1);} 100%{transform:scale(1);opacity:1;} }

        .animate-tail-slow { animation: tail-slow 4s ease-in-out infinite alternate; }
        .animate-tail-fast { animation: tail-fast 0.5s ease-in-out infinite alternate; }
        .cat-eyes-blink { transform-origin: center; animation: blink 4s infinite; }
        .animate-breathe-body { animation: breathe-body 3s ease-in-out infinite; }
        .animate-shadow-breathe { transform-origin: center; animation: shadow-breathe 3s ease-in-out infinite; }
        .animate-shake { animation: shake 0.5s linear infinite; }
        .animate-float-z { animation: float-z 2s linear infinite; }
        .animate-spin-slow { transform-origin: 75px 45px; animation: spin-slow 3s linear infinite; }
        .animate-hover-item { animation: hover-item 2s ease-in-out infinite; }
        .animate-pop-in { animation: pop-in 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
      `}</style>

      {/* 气泡消息框 */}
      {message && (
        <div className="mb-2 mr-6 relative animate-pop-in origin-bottom-right">
          <div className="bg-white border-2 border-[#2D2D2D] px-4 py-3 rounded-2xl shadow-[4px_4px_0px_rgba(0,0,0,0.1)] max-w-[200px]">
            <p className="font-serif text-xs text-[#2D2D2D] leading-relaxed">
              {message}
            </p>
          </div>
          {/* 气泡尖角 */}
          <div className="absolute -bottom-2 right-8 w-4 h-4 bg-white border-r-2 border-b-2 border-[#2D2D2D] transform rotate-45"></div>
        </div>
      )}

      {/* 猫咪本体 */}
      <div 
        onClick={onClick}
        className="w-24 h-24 md:w-32 md:h-32 cursor-pointer transition-transform duration-200 hover:scale-110 active:scale-95"
      >
        {renderCatContent()}
      </div>
    </div>
  );
};
