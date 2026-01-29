import React, { useState, useEffect } from 'react';

// 有趣的加载文案，增加 RPG 沉浸感
const LOADING_MESSAGES = [
  // 吐槽论文质量
  "这写的什么狗屁不通... 正在强行翻译成人话... (눈_눈)",
  "检测到大量装逼公式，正在进行降维打击... (╯°Д°)╯︵ ┻━┻",
  "正在从这堆学术废话里提炼干货... ( ˘•ω•˘ )",
  "排版是用脚写的吗？正在重构屎山... (ꐦ ಠ皿ಠ)",

  // 吐槽学术圈现状
  "正在顺着网线去暗杀 2 号审稿人... (ꐦ°Kf°)",
  "正在向学术之神祈祷：Please accept... (🙏ω🙏)",
  "正在计算这篇论文的水分... 滴答滴答... (🌊_🌊)",

  // 猫咪人设 (傲娇/摸鱼)
  "别催了，猫粮没到位，算力未就位... (￣^￣)",
  "本喵正在思考... 并不是在打瞌睡哦... _(:3」∠)_",
  "正在用 996 的速度疯狂阅读中... (Q_Q)",
  "喵？这图画得还没我踩的脚印好看... (→_→)",
  
  // 玩梗
  "正在试图理解作者的脑回路... 404 Not Found... (O_o)?",
  "正在构建思维殿堂... 哎呀塌了... (ﾉ>ω<)ﾉ",
  "Loading... 正在用爱发电中... (❤ω❤)"
];

const MagicalCatSVG = () => (
  <svg viewBox="0 0 200 200" className="w-full h-full drop-shadow-2xl overflow-visible">
    <defs>
      {/* 魔法光晕渐变 */}
      <radialGradient id="magicGlow" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
        <stop offset="0%" stopColor="#DAA520" stopOpacity="0.4" />
        <stop offset="100%" stopColor="#DAA520" stopOpacity="0" />
      </radialGradient>
      {/* 书本封面渐变 */}
      <linearGradient id="bookGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#8B4513" />
        <stop offset="100%" stopColor="#5D4037" />
      </linearGradient>
    </defs>

    {/* --- 底部魔法阵 (旋转) --- */}
    <g className="animate-spin-slow origin-center opacity-60">
      <circle cx="100" cy="160" r="40" stroke="#DAA520" strokeWidth="1" fill="url(#magicGlow)" strokeDasharray="5,3" />
      <circle cx="100" cy="160" r="30" stroke="#DAA520" strokeWidth="0.5" fill="none" />
      <path d="M100,130 L100,190 M70,160 L130,160" stroke="#DAA520" strokeWidth="0.5" />
      <rect x="85" y="145" width="30" height="30" stroke="#DAA520" strokeWidth="0.5" fill="none" transform="rotate(45 100 160)" />
    </g>

    {/* --- 悬浮的主体 (猫 + 书) --- */}
    <g className="animate-float">
      
      {/* 尾巴 (在身体后面摆动) */}
      <path 
        d="M130,120 Q150,110 145,90" 
        stroke="#2D2D2D" strokeWidth="8" strokeLinecap="round" fill="none" 
        className="animate-tail-wave"
      />

      {/* 身体 (罗小黑风格：黑色流体状) */}
      <path 
        d="M70,130 Q60,130 65,110 Q70,80 100,80 Q130,80 135,110 Q140,130 130,130 Z" 
        fill="#2D2D2D" 
      />

      {/* 耳朵 */}
      <path d="M75,90 L65,65 L90,82 Z" fill="#2D2D2D" />
      <path d="M125,90 L135,65 L110,82 Z" fill="#2D2D2D" />
      {/* 耳蜗 (增加细节) */}
      <path d="M78,88 L70,72 L85,82 Z" fill="#4A4A4A" />
      <path d="M122,88 L130,72 L115,82 Z" fill="#4A4A4A" />

      {/* 眼睛 (大眼萌) */}
      <g className="animate-blink">
        <ellipse cx="85" cy="100" rx="8" ry="9" fill="#FFF" />
        <circle cx="85" cy="100" r="3.5" fill="#000" />
        <circle cx="88" cy="97" r="2.5" fill="#FFF" opacity="0.8" /> {/* 高光 */}

        <ellipse cx="115" cy="100" rx="8" ry="9" fill="#FFF" />
        <circle cx="115" cy="100" r="3.5" fill="#000" />
        <circle cx="118" cy="97" r="2.5" fill="#FFF" opacity="0.8" /> {/* 高光 */}
      </g>

      {/* 腮红 */}
      <ellipse cx="75" cy="108" rx="4" ry="2.5" fill="#FFB6C1" opacity="0.6" />
      <ellipse cx="125" cy="108" rx="4" ry="2.5" fill="#FFB6C1" opacity="0.6" />

      {/* 爪子 (拿着书) */}
      <ellipse cx="85" cy="125" rx="7" ry="6" fill="#2D2D2D" />
      <ellipse cx="115" cy="125" rx="7" ry="6" fill="#2D2D2D" />

      {/* 悬浮的书本 */}
      <g transform="translate(70, 115) rotate(15)">
        <rect x="0" y="0" width="60" height="40" rx="2" fill="#F5F5DC" stroke="#8B4513" strokeWidth="1" /> {/* 内页 */}
        <rect x="-2" y="-2" width="64" height="44" rx="3" fill="url(#bookGradient)" /> {/* 封面 */}
        <text x="12" y="28" fontSize="20" fill="#DAA520" fontFamily="serif" fontWeight="bold">PDF</text>
        {/* 书页翻动效果 */}
        <path d="M60,5 Q55,20 60,35" stroke="#F5F5DC" strokeWidth="2" fill="none" className="animate-page-flip" />
      </g>
    </g>

    {/* --- 魔法粒子 (向上飘动) --- */}
    <g fill="#DAA520" opacity="0.6">
      <circle cx="60" cy="140" r="2" className="animate-particle-1" />
      <circle cx="140" cy="150" r="1.5" className="animate-particle-2" />
      <circle cx="100" cy="120" r="2.5" className="animate-particle-3" />
      <text x="150" y="100" fontSize="10" fill="#DAA520" className="animate-particle-math">∑</text>
      <text x="40" y="120" fontSize="10" fill="#DAA520" className="animate-particle-math" style={{animationDelay: '1s'}}>∫</text>
    </g>
  </svg>
);

const GamifiedLoader: React.FC = () => {
  const [progress, setProgress] = useState(0);
  const [messageIndex, setMessageIndex] = useState(0);

  // 模拟进度条逻辑
  useEffect(() => {
    const interval = setInterval(() => {
      setProgress(prev => {
        const remaining = 100 - prev;
        // 越接近100越慢，制造真实感
        const step = Math.max(remaining * 0.05, 0.1); 
        const next = prev + step;
        return next >= 99 ? 99 : next;
      });
    }, 150);

    const msgInterval = setInterval(() => {
      setMessageIndex(prev => (prev + 1) % LOADING_MESSAGES.length);
    }, 3000);

    return () => {
      clearInterval(interval);
      clearInterval(msgInterval);
    };
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-full w-full bg-[#fcfbf9] relative overflow-hidden select-none">
      
      {/* CSS 动画注入 */}
      <style>{`
        @keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-15px); } }
        @keyframes blink { 0%, 48%, 52%, 100% { transform: scaleY(1); } 50% { transform: scaleY(0.1); } }
        @keyframes spin-slow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes tail-wave { 0%, 100% { d: path("M130,120 Q150,110 145,90"); } 50% { d: path("M130,120 Q110,110 115,90"); } }
        @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        @keyframes particle-up { 0% { transform: translateY(0) scale(1); opacity: 0.8; } 100% { transform: translateY(-60px) scale(0); opacity: 0; } }
        
        .animate-float { animation: float 4s ease-in-out infinite; }
        .animate-blink { transform-origin: center; animation: blink 4s infinite; }
        .animate-spin-slow { transform-origin: 100px 160px; animation: spin-slow 10s linear infinite; }
        .animate-tail-wave { animation: tail-wave 3s ease-in-out infinite; }
        .magic-shimmer { background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.6) 50%, transparent 100%); background-size: 200% 100%; animation: shimmer 2s infinite; }
        
        .animate-particle-1 { animation: particle-up 3s ease-out infinite; }
        .animate-particle-2 { animation: particle-up 4s ease-out infinite 1s; }
        .animate-particle-3 { animation: particle-up 5s ease-out infinite 0.5s; }
        .animate-particle-math { animation: particle-up 6s linear infinite; opacity: 0.5; }
      `}</style>

      {/* 1. 核心视觉区域：小猫 + 魔法阵 */}
      <div className="relative w-64 h-64 mb-4">
        {/* 背景光晕装饰 */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-[#DAA520] opacity-10 rounded-full blur-2xl animate-pulse"></div>
        <MagicalCatSVG />
      </div>

      {/* 2. 魔法进度条 */}
      <div className="w-80 max-w-[90%] relative mb-6">
        <div className="flex justify-between items-end mb-2">
           <span className="pixel-font text-[10px] text-[#5d4037] font-bold tracking-widest flex items-center gap-1">
             <span>✦</span> LOADING MANA
           </span>
           <span className="font-mono text-xs text-[#8B4513] font-bold">{Math.floor(progress)}%</span>
        </div>
        
        {/* 进度条轨道 */}
        <div className="h-4 bg-[#2c1810] p-[3px] rounded-full shadow-inner border border-[#5d4037] relative overflow-hidden">
           <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/wood-pattern.png')] opacity-30"></div>
           
           {/* 进度条填充 */}
           <div 
             className="h-full rounded-full bg-gradient-to-r from-[#8B4513] via-[#DAA520] to-[#FFD700] transition-all duration-200 ease-out relative overflow-hidden shadow-[0_0_10px_#DAA520]"
             style={{ width: `${progress}%` }}
           >
             {/* 扫光效果 */}
             <div className="absolute inset-0 magic-shimmer"></div>
           </div>
        </div>
      </div>

      {/* 3. 动态文字区域 */}
      <div className="h-12 flex flex-col items-center justify-center text-center px-4">
        <p className="pixel-font text-xs md:text-sm font-bold text-[#2c1810] animate-pulse">
          {LOADING_MESSAGES[messageIndex]}
        </p>
        <p className="mt-2 text-[10px] serif italic text-[#8B4513] opacity-60">
          (Tip: 学术猫咪正在为您重构知识...)
        </p>
      </div>

    </div>
  );
};

export default GamifiedLoader;
