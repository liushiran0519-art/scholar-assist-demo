import React, { forwardRef, useState, useEffect, useRef } from 'react';
import { PageTranslation, ContentBlock, GlossaryTerm, AppearanceSettings } from '../types';
import GamifiedLoader from './GamifiedLoader';
import ReactMarkdown from 'react-markdown';
import katex from 'katex';

interface TranslationViewerProps {
  translation: PageTranslation | undefined;
  isLoading: boolean;
  onHoverBlock: (text: string | null) => void;
  onRetry: () => void;
  onCitationClick: (id: string) => void;
  onEquationClick: (eq: string) => void;
  appearance: AppearanceSettings;
}

const LazyBlock = ({ children, heightHint = 100 }: { children: React.ReactNode, heightHint?: number }) => {
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect(); 
        }
      },
      { rootMargin: '300px' } 
    );
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} style={{ minHeight: isVisible ? 'auto' : heightHint }}>
      {isVisible ? children : <div className="animate-pulse bg-gray-200/20 rounded" style={{height: heightHint}} />}
    </div>
  );
};

const TranslationViewer = forwardRef<HTMLDivElement, TranslationViewerProps>(({ 
  translation, 
  isLoading, 
  onHoverBlock, 
  onRetry,
  onCitationClick,
  onEquationClick,
  appearance
}, ref) => {

  const containerStyle = appearance.theme === 'sepia' 
    ? { backgroundColor: '#F4ECD8', color: '#433422' }
    : { backgroundColor: '#2c1810', color: '#e8e4d9' }; 

  const textStyle = {
    fontSize: `${appearance.fontSize}px`,
    fontFamily: appearance.fontFamily === 'serif' ? '"Noto Serif SC", serif' : 'system-ui, sans-serif'
  };

  const highlightClass = appearance.theme === 'sepia' 
    ? 'bg-[#DAA520]/20 border-[#8B4513]' 
    : 'bg-[#DAA520]/10 border-[#DAA520]';

  const tooltipBg = appearance.theme === 'sepia' ? 'bg-[#fffef0]' : 'bg-[#2c1810]';
  const tooltipText = appearance.theme === 'sepia' ? 'text-[#433422]' : 'text-[#e8e4d9]';

  // 复制 LaTeX 功能
  const copyLatex = (e: React.MouseEvent, latex: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(latex);
    // 简单的视觉反馈
    const btn = e.currentTarget as HTMLButtonElement;
    const originalText = btn.innerText;
    btn.innerText = "已复制 (COPIED!)";
    setTimeout(() => { btn.innerText = originalText; }, 1500);
  };

  if (isLoading) {
    return (
      <div className="h-full" style={containerStyle}>
        <GamifiedLoader />
      </div>
    );
  }

  if (!translation || translation.blocks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center" style={containerStyle}>
        <div className="mb-4 opacity-50">
           <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
        </div>
        <p className="mb-4 pixel-font text-xs">卷轴内容空白</p>
        <button 
          onClick={onRetry}
          className="px-4 py-2 rpg-btn text-xs font-bold bg-[#8B4513] text-[#DAA520] border-2 border-[#2c1810]"
        >
          重新施法 (Retry)
        </button>
      </div>
    );
  }

  const renderRichText = (text: string, glossary: GlossaryTerm[]) => {
    if (text.length > 5000) return <span>{text.slice(0, 500)}... (Text too long, truncated)</span>;
    const parts = text.split(/(\[\d+(?:-\d+)?(?:,\s*\d+)*\])/g);
    
    return parts.map((part, idx) => {
      if (/^\[\d+(?:-\d+)?(?:,\s*\d+)*\]$/.test(part)) {
        const id = part.replace(/[\[\]]/g, '');
        return (
          <span 
            key={idx} 
            onClick={(e) => { e.stopPropagation(); onCitationClick(id); }}
            className={`font-bold cursor-pointer border-b border-dotted mx-0.5 px-0.5 rounded transition-colors ${appearance.theme === 'sepia' ? 'text-[#8B4513] border-[#8B4513] hover:bg-[#8B4513]/10' : 'text-[#DAA520] border-[#DAA520] hover:bg-[#DAA520]/20'}`}
            title="点击查看文献详情"
          >
            {part}
          </span>
        );
      }

      let segments: React.ReactNode[] = [part];
      glossary.forEach(g => {
        const term = g.term;
        const newSegments: React.ReactNode[] = [];
        segments.forEach(seg => {
          if (typeof seg === 'string') {
            const splitRegex = new RegExp(`(${term})`, 'gi');
            const subParts = seg.split(splitRegex);
            subParts.forEach((sp, spIdx) => {
               if (sp.toLowerCase() === term.toLowerCase()) {
                 newSegments.push(
                   <span key={`${idx}-${g.term}-${spIdx}`} className="relative group/glossary inline-block cursor-help mx-0.5">
                     <span className={`font-bold border-b-2 px-1 rounded transition-all flex items-center gap-1 ${highlightClass} ${appearance.theme === 'sepia' ? 'text-[#8B4513]' : 'text-[#DAA520]'}`}>
                        {sp}
                        <span className="text-[10px] opacity-70">✨</span>
                     </span>
                     <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-56 hidden group-hover/glossary:block z-50 pointer-events-none tooltip-anim">
                       <div className={`${tooltipBg} ${tooltipText} p-3 rounded-lg border-2 border-[#DAA520] shadow-xl relative`}>
                          <p className="pixel-font text-[10px] text-[#DAA520] mb-1 uppercase tracking-wider">Scholar Cat Note:</p>
                          <p className="text-xs serif leading-relaxed">{g.definition}</p>
                          <div className={`absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-[${appearance.theme === 'sepia' ? '#fffef0' : '#2c1810'}]`}></div>
                       </div>
                     </span>
                   </span>
                 );
               } else { newSegments.push(sp); }
            });
          } else { newSegments.push(seg); }
        });
        segments = newSegments;
      });
      return <span key={idx}>{segments}</span>;
    });
  };

  return (
    <div 
      className="h-full overflow-y-auto p-8 space-y-6 relative custom-scrollbar scroll-smooth" 
      style={containerStyle}
      ref={ref}
    >
      <div className="absolute inset-0 pointer-events-none opacity-10 z-0" style={{backgroundImage: 'url("https://www.transparenttextures.com/patterns/paper.png")'}}></div>
      
      <div className={`mb-6 pb-2 border-b-2 flex justify-between items-center relative z-10 ${appearance.theme === 'sepia' ? 'border-[#8B4513]' : 'border-[#DAA520]'}`}>
        <h3 className={`text-xs font-bold pixel-font uppercase ${appearance.theme === 'sepia' ? 'text-[#8B4513]' : 'text-[#DAA520]'}`}>
          第 {translation.pageNumber} 章 (Chapter {translation.pageNumber})
        </h3>
        <button 
          onClick={onRetry} 
          className={`text-[10px] font-bold pixel-font flex items-center gap-1 hover:opacity-70`}
        >
          <span>↻</span> 重铸法术 (REFRESH)
        </button>
      </div>
      
      {translation.blocks.map((block, idx) => (
        <LazyBlock key={idx} heightHint={block.type === 'figure' ? 200 : 80}>
          <div 
            className={`group relative p-3 transition-colors cursor-pointer z-10 rounded hover:bg-black/5`}
            onMouseEnter={() => onHoverBlock(block.en)}
            onMouseLeave={() => onHoverBlock(null)}
          >
            {/* 左侧装饰条 */}
            <div className={`absolute left-0 top-3 bottom-3 w-1 opacity-0 group-hover:opacity-100 transition-opacity rounded-full ${appearance.theme === 'sepia' ? 'bg-[#8B4513]' : 'bg-[#DAA520]'}`} />
            
            {block.type === 'heading' && (
              <h3 className="text-lg font-bold mb-2 mt-2 leading-tight" style={textStyle}>
                {block.cn}
              </h3>
            )}

            {block.type === 'paragraph' && (
              <p className="leading-relaxed text-justify" style={textStyle}>
                {renderRichText(block.cn, translation.glossary)}
              </p>
            )}

            {block.type === 'list' && (
              <div className={`p-3 rpg-border ${appearance.theme === 'sepia' ? 'bg-[#fffef0]' : 'bg-[#1a0f0a]'}`}>
                <div className="prose prose-sm max-w-none" style={{...textStyle, color: 'inherit'}}>
                  <ReactMarkdown>{block.cn}</ReactMarkdown>
                </div>
              </div>
            )}

            {/* ✅ 【问题4修复】公式单独展示 + 复制按钮 */}
            {/* 假设 AI 返回的 type 为 'equation' 或翻译文本中包含公式 */}
            {block.type === 'equation' && (
              <div className={`my-4 p-4 border-2 text-center relative group/eq rounded shadow-inner ${appearance.theme === 'sepia' ? 'bg-[#fffef0] border-[#8B4513] text-[#2c1810]' : 'bg-[#1a0f0a] border-[#DAA520] text-[#DAA520]'}`}>
                
                {/* 顶部标签 */}
                <div className="flex justify-between items-center mb-2 border-b border-dashed border-opacity-30 pb-1" style={{borderColor: 'currentColor'}}>
                    <span className="text-[10px] opacity-50 pixel-font">SPELL FORMULA</span>
                    {/* 复制按钮 */}
                    <button 
                       onClick={(e) => copyLatex(e, block.en)} // block.en 通常存储原始 Latex
                       className={`text-[9px] font-bold px-2 py-1 border rounded hover:opacity-80 transition-opacity ${appearance.theme === 'sepia' ? 'bg-[#8B4513] text-[#e8e4d9]' : 'bg-[#DAA520] text-[#2c1810]'}`}
                    >
                       复制咒语 (COPY LATEX)
                    </button>
                </div>

                {/* 渲染公式 */}
                <div 
                  className="overflow-x-auto overflow-y-hidden py-2 cursor-help"
                  onClick={(e) => { e.stopPropagation(); onEquationClick(block.en); }}
                  title="点击解析公式含义"
                  dangerouslySetInnerHTML={{ 
                    __html: katex.renderToString(block.en, { 
                      throwOnError: false, 
                      displayMode: true,
                      output: 'html'
                    }) 
                  }} 
                />

                {/* 公式解释/中文翻译 */}
                <p className="mt-2 text-xs text-left border-t pt-1 italic opacity-80" style={{borderColor: 'currentColor'}}>
                  {block.cn !== '公式' ? block.cn : '此处为数学咒语'}
                </p>
              </div>
            )}

            {block.type === 'figure' && (
              <div className={`my-4 border-2 border-dashed p-4 text-center rounded ${appearance.theme === 'sepia' ? 'border-[#8B4513] bg-[#fffef0]' : 'border-[#DAA520] bg-[#1a0f0a]'}`}>
                <p className={`text-[10px] font-bold pixel-font uppercase mb-2 ${appearance.theme === 'sepia' ? 'text-[#8B4513]' : 'text-[#DAA520]'}`}>Illustration</p>
                <p className="text-sm italic" style={textStyle}>{block.cn}</p>
              </div>
            )}
          </div>
        </LazyBlock>
      ))}
      <div className="h-20" />
    </div>
  );
});

export default TranslationViewer;
