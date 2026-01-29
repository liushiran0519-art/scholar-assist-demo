// src/components/CursorSystem.tsx
import React from 'react';

/**
 * Scholar Scroll - Cursor System
 * * 包含三套光标设计：
 * 1. Default: 羽毛笔 (Quill)
 * 2. Pointer: 魔法手套 (Gauntlet)
 * 3. Text: 魔法杖 (Staff)
 */

// --- 1. SVG Assets (Base64 Encoded for performance) ---

// 🪶 羽毛笔 (Default) - 笔尖在左上角 (0,0)
// 金色笔身，深褐色轮廓，适合浅色和深色背景
const CURSOR_DEFAULT = `url('data:image/svg+xml;utf8,<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><path d="M2,2 L12,14 C16,18 24,20 28,16 C30,14 28,6 24,4 C20,2 14,8 14,8" stroke="%232c1810" stroke-width="2" fill="%23DAA520"/><path d="M2,2 L8,8" stroke="%232c1810" stroke-width="2"/><circle cx="2" cy="2" r="1" fill="%232c1810"/></svg>') 0 0, auto`;

// 🧤 魔法手套 (Pointer) - 食指指尖在 (10, 2)
// 只有当鼠标悬停在按钮上时显示
const CURSOR_POINTER = `url('data:image/svg+xml;utf8,<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><path d="M10,2 L14,12 L18,12 L18,24 C18,26 14,28 10,28 C6,28 2,26 2,24 L2,12 L6,12 Z" fill="%238B4513" stroke="%23DAA520" stroke-width="2"/><rect x="8" y="14" width="4" height="4" fill="%23DAA520"/><circle cx="10" cy="2" r="1.5" fill="%23fff"/></svg>') 10 0, pointer`;

// 🪄 魔法杖 (Text Selection) - 中心点在 (16, 16)
// 替换原本枯燥的 "I" 形光标
const CURSOR_TEXT = `url('data:image/svg+xml;utf8,<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><path d="M16,4 L16,28" stroke="%23DAA520" stroke-width="2" stroke-linecap="round"/><path d="M13,4 L19,4" stroke="%232c1810" stroke-width="2"/><path d="M13,28 L19,28" stroke="%232c1810" stroke-width="2"/><circle cx="16" cy="16" r="2" fill="%23DAA520" stroke="%232c1810"/></svg>') 16 16, text`;


export const CursorSystem: React.FC = () => {
  
  // 点击时的粒子特效
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const particle = document.createElement('div');
      particle.className = 'magic-click-particle';
      particle.style.left = `${e.pageX}px`;
      particle.style.top = `${e.pageY}px`;
      document.body.appendChild(particle);

      // 动画结束后移除
      setTimeout(() => {
        particle.remove();
      }, 600);
    };

    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  return (
    <>
      <style>{`
        /* --- Cursors --- */
        body, html { cursor: ${CURSOR_DEFAULT}; }
        button, a, .cursor-pointer, [role="button"], summary { cursor: ${CURSOR_POINTER} !important; }
        .prose, p, h1, h2, h3, h4, span, textarea, input[type="text"], .react-pdf__Page__textContent { cursor: ${CURSOR_TEXT}; }
        .react-pdf__Page__textContent span { cursor: ${CURSOR_TEXT} !important; }

        /* --- Magic Particle Animation --- */
        .magic-click-particle {
          position: absolute;
          width: 10px;
          height: 10px;
          background: #DAA520;
          border-radius: 50%;
          pointer-events: none;
          z-index: 9999;
          transform: translate(-50%, -50%);
          animation: particle-explode 0.6s ease-out forwards;
          box-shadow: 0 0 10px #DAA520, 0 0 20px #8B4513;
        }

        @keyframes particle-explode {
          0% {
            transform: translate(-50%, -50%) scale(1);
            opacity: 1;
          }
          100% {
            transform: translate(-50%, -50%) scale(3);
            opacity: 0;
            background: transparent;
            border: 2px solid #DAA520;
          }
        }
      `}</style>
    </>
  );
};
