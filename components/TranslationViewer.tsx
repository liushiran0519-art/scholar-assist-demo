// components/TranslationViewer.tsx
import React, { forwardRef, useState, useEffect, useRef } from 'react';
import { PageTranslation, ContentBlock, GlossaryTerm, AppearanceSettings } from '../types';
import GamifiedLoader from './GamifiedLoader';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm'; // 需要 npm install remark-gfm
import katex from 'katex';
import 'katex/dist/katex.min.css';

import { InfoIcon, FlameIcon, FlaskIcon } from './IconComponents'; 

interface TranslationViewerProps {
  translation: PageTranslation | undefined;
  isLoading: boolean;
  onHoverBlock: (text: string | null) => void;
  onRetry: () => void;
  onCitationClick: (id: string) => void;
  onEquationClick: (eq: string) => void;
  appearance: AppearanceSettings;
  highlightText?: string | null;
}

// 懒加载组件：优化长文档性能
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
      { rootMargin: '400px' } 
    );
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} style={{ minHeight: isVisible ? 'auto' : heightHint }}>
      {isVisible ? children : <div className="animate-pulse bg-gray-400/5 rounded w-full" style={{height: heightHint}} />}
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
  appearance,
  highlightText
}, ref) => {

  const containerRef = useRef<HTMLDivElement>(null);

  // --- 高亮联动逻辑 ---
  useEffect(() => {
    if (!highlightText || !translation || !containerRef.current) return;

    const cleanSearch = highlightText.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '').toLowerCase().slice(0, 50);
    if (cleanSearch.length < 3) return;

    const blocks = containerRef.current.querySelectorAll('[data-block-en]');
    for (let i = 0; i < blocks.length; i++) {
        const el = blocks[i] as HTMLElement;
        const enText = el.getAttribute('data-block-en') || "";
        const cleanEn = enText.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '').toLowerCase();

        if (cleanEn.includes(cleanSearch) || cleanSearch.includes(cleanEn)) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.classList.add('ring-2', 'ring-[#DAA520]', 'bg-[#DAA520]/20');
            setTimeout(() => {
                el.classList.remove('ring-2', 'ring-[#DAA520]', 'bg-[#DAA520]/20');
            }, 2500);
            break;
        }
    }
  }, [highlightText, translation]);

  // --- 样式变量 ---
  const isSepia = appearance.theme === 'sepia';
  const styles = {
    container: isSepia ? { backgroundColor: '#F4ECD8', color: '#433422' } : { backgroundColor: '#2c1810', color: '#e8e4d9' },
    accentColor: isSepia ? '#8B4513' : '#DAA520',
    borderColor: isSepia ? '#8B4513' : '#DAA520',
    tooltip: {
      bg: isSepia ? 'bg-[#fffef0]' : 'bg-[#1a0f0a]',
      border: isSepia ? 'border-[#8B4513]' : 'border-[#DAA520]',
      text: isSepia ? 'text-[#433422]' : 'text-[#e8e4d9]',
    },
    font: {
      fontSize: `${appearance.fontSize}px`,
      fontFamily: appearance.fontFamily === 'serif' ? '"Noto Serif SC", serif' : 'system-ui, sans-serif',
      lineHeight: '1.8'
    }
  };

  // --- 自定义 Markdown 表格渲染器 ---
  const MarkdownComponents = {
    table: ({node, ...props}: any) => (
      <div className="overflow-x-auto my-6 rounded-lg shadow-md border-2" style={{ borderColor: styles.borderColor }}>
        <table className="w-full text-sm text-left border-collapse" {...props} />
      </div>
    ),
    thead: ({node, ...props}: any) => (
      <thead className="uppercase pixel-font text-xs font-bold" 
             style={{ backgroundColor: isSepia ? '#e8e4d9' : '#3e2723', color: styles.accentColor }} {...props} />
    ),
    tbody: ({node, ...props}: any) => <tbody className="font-serif" {...props} />,
    tr: ({node, ...props}: any) => (
      <tr className={`border-b last:border-0 hover:bg-black/5 transition-colors`} 
          style={{ borderColor: styles.borderColor + '40' }} {...props} />
    ),
    th: ({node, ...props}: any) => <th className="px-4 py-3 whitespace-nowrap" {...props} />,
    td: ({node, ...props}: any) => <td className="px-4 py-2" {...props} />,
  };

  // --- 视觉占位符渲染 (Image/Chart) ---
  const renderVisualArtifact = (text: string) => {
    // 匹配 PDF 提取层生成的标记
    const isDetectedPlaceholder = text.includes("Visual Content Detected") || text.includes("图表区域");
    
    return (
      <div className={`my-8 mx-2 relative group overflow-hidden rounded-xl border-2 border-dashed transition-all hover:scale-[1.01] hover:shadow-lg`}
           style={{ borderColor: styles.borderColor, backgroundColor: isSepia ? 'rgba(139, 69, 19, 0.03)' : 'rgba(218, 165, 32, 0.05)' }}>
        
        <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 rounded-tl-lg opacity-50" style={{borderColor: styles.accentColor}}></div>
        <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 rounded-br-lg opacity-50" style={{borderColor: styles.accentColor}}></div>

        <div className="flex flex-col items-center justify-center p-6 text-center">
           <div className="mb-3 p-3 rounded-full bg-black/5 border-2" style={{borderColor: styles.borderColor}}>
              {isDetectedPlaceholder ? (
                 <span className="text-2xl animate-pulse">🖼️</span> 
              ) : (
                 <span className="text-2xl">📊</span> 
              )}
           </div>
           <h4 className="pixel-font text-xs font-bold uppercase mb-2 tracking-widest" style={{color: styles.accentColor}}>
             {isDetectedPlaceholder ? "Visual Archive (视觉档案)" : "Figure / Chart"}
           </h4>
           <p className="font-serif text-sm italic opacity-80 max-w-md">
             {isDetectedPlaceholder 
               ? "检测到复杂的视觉内容（图表、公式或插图）。请查阅左侧原始卷轴。" 
               : text}
           </p>
           <div className="mt-4 px-4 py-1 text-[10px] border rounded-full opacity-60 flex items-center gap-2" style={{borderColor: styles.borderColor}}>
              <span>👀</span><span>Look Left</span>
           </div>
        </div>
      </div>
    );
  };

  // --- 富文本渲染 (引用/术语) ---
  const renderRichText = (text: string, glossary: GlossaryTerm[]) => {
    if (!text) return null;
    const parts = text.split(/(\[\d+(?:-\d+)?(?:,\s*\d+)*\])/g);
    
    return parts.map((part, idx) => {
      if (/^\[\d+(?:-\d+)?(?:,\s*\d+)*\]$/.test(part)) {
        const id = part.replace(/[\[\]]/g, '').split(',')[0].split('-')[0]; 
        return (
          <sup 
            key={idx} 
            onClick={(e) => { e.stopPropagation(); onCitationClick(id); }}
            className="cursor-pointer font-bold mx-0.5 px-1 rounded transition-colors hover:scale-110 inline-block border border-dashed"
            style={{ color: styles.accentColor, borderColor: styles.borderColor }}
          >
            {part}
          </sup>
        );
      }
      
      // 简单处理术语高亮 (略去复杂逻辑以保持代码清晰)
      return <span key={idx}>{part}</span>;
    });
  };

  // --- 主 Block 渲染逻辑 ---
  const renderBlockContent = (block: ContentBlock, idx: number) => {
    switch (block.type) {
      case 'title':
        return (
          <div className="mb-8 text-center px-4">
             <div className="inline-block px-3 py-1 mb-2 border rounded-full text-[10px] pixel-font uppercase opacity-60" style={{borderColor: styles.accentColor, color: styles.accentColor}}>Paper Title</div>
             <h1 className="text-2xl md:text-3xl font-bold leading-tight border-b-4 border-double pb-6" style={{ borderColor: styles.borderColor, ...styles.font }}>{block.cn}</h1>
          </div>
        );
      case 'heading':
        return (
          <div className="mt-10 mb-4 flex items-end gap-3 pb-2 border-b" style={{borderColor: styles.borderColor + '40'}}>
            <span className="text-2xl" style={{color: styles.accentColor}}>§</span>
            <h3 className="text-lg font-bold leading-none uppercase tracking-wide" style={{ ...styles.font, color: styles.accentColor }}>{block.cn}</h3>
          </div>
        );
      case 'equation':
         return (
            <div className={`my-8 mx-1 p-4 rounded-xl border-2 shadow-md group/eq relative overflow-hidden`}
                 style={{ backgroundColor: isSepia ? '#fffef0' : '#1e120d', borderColor: styles.borderColor }}>
                <div className="flex justify-between items-center mb-3">
                    <span className="text-[10px] font-bold pixel-font uppercase opacity-50 tracking-widest" style={{color: styles.accentColor}}>Arcane Formula</span>
                    <button 
                       onClick={(e) => { e.stopPropagation(); onEquationClick(block.en); }} 
                       className="flex items-center gap-1 text-[10px] font-bold px-3 py-1 border rounded-full hover:bg-black/10 transition-all cursor-pointer z-10"
                       style={{ borderColor: styles.borderColor, color: styles.accentColor }}
                    >
                       <FlaskIcon className="w-3 h-3" /><span>解析</span>
                    </button>
                </div>
                <div className="overflow-x-auto overflow-y-hidden py-2 text-center"
                  dangerouslySetInnerHTML={{ __html: katex.renderToString(block.en, { throwOnError: false, displayMode: true, output: 'html' }) }} 
                />
                <div className="mt-4 pt-3 border-t border-dashed flex gap-3" style={{borderColor: styles.borderColor + '60'}}>
                   <div className="mt-1 shrink-0"><InfoIcon className="w-4 h-4 opacity-70" /></div>
                   <p className="text-sm italic opacity-90 font-serif leading-relaxed">{block.cn}</p>
                </div>
            </div>
         );
      case 'figure':
        return renderVisualArtifact(block.cn);
      case 'list':
        return (
            <div className="pl-2 my-4">
                <ReactMarkdown 
                    remarkPlugins={[remarkGfm]}
                    components={{
                        li: ({node, ...props}) => (
                            <li className="list-none relative pl-6 mb-2 leading-relaxed" style={{ ...styles.font }}>
                                <span className="absolute left-0 top-2 w-1.5 h-1.5 rounded-full" style={{backgroundColor: styles.accentColor}}></span>
                                <span style={{ color: styles.container.color }}>{props.children}</span>
                            </li>
                        )
                    }}
                >{block.cn}</ReactMarkdown>
            </div>
        )
      case 'paragraph':
      default:
        // 检测表格
        if ((block.cn.includes('|') && block.cn.includes('---')) || block.cn.trim().startsWith('|')) {
           return <div className="my-4"><ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>{block.cn}</ReactMarkdown></div>;
        }
        return <p className="mb-4 text-justify indent-8 leading-loose" style={styles.font}>{renderRichText(block.cn, translation?.glossary || [])}</p>;
    }
  };

  if (isLoading) return <div className="h-full flex items-center justify-center relative" style={styles.container}><GamifiedLoader /></div>;

  if (!translation || translation.blocks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center space-y-6" style={styles.container}>
        <div className="opacity-50 text-6xl">📜</div>
        <h3 className="text-lg font-bold pixel-font mb-2">卷轴空白 (BLANK)</h3>
        <button onClick={onRetry} className="px-8 py-3 rounded-lg font-bold pixel-font border-2 group" style={{ backgroundColor: styles.accentColor, color: isSepia ? '#e8e4d9' : '#2c1810', borderColor: styles.container.color }}>
          <span className="group-hover:animate-spin">↻</span> 重新施法
        </button>
      </div>
    );
  }

  return (
    <div 
      className="h-full overflow-y-auto p-4 md:p-8 relative custom-scrollbar scroll-smooth" 
      style={styles.container}
      ref={(node) => { containerRef.current = node; if (typeof ref === 'function') ref(node); else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node; }}
    >
      <div className="absolute inset-0 pointer-events-none opacity-5 z-0 mix-blend-multiply" style={{backgroundImage: 'url("https://www.transparenttextures.com/patterns/paper.png")'}}></div>
      
      <div className={`sticky top-0 z-20 mb-6 pb-2 border-b-2 flex justify-between items-center backdrop-blur-md transition-colors duration-300`} 
           style={{ borderColor: styles.borderColor, backgroundColor: isSepia ? 'rgba(244, 236, 216, 0.85)' : 'rgba(44, 24, 16, 0.85)' }}>
        <div className="flex items-center gap-2"><span className="text-xl">📜</span><h3 className="text-xs font-bold pixel-font uppercase" style={{ color: styles.accentColor }}>Chapter {translation.pageNumber}</h3></div>
        <button onClick={onRetry} className="text-[10px] font-bold pixel-font flex items-center gap-1 px-3 py-1.5 rounded-full border transition-all hover:bg-black/5 active:scale-95" style={{ color: styles.accentColor, borderColor: styles.borderColor }}><span>↻</span> RECAST</button>
      </div>
      
      <div className="relative z-10 space-y-6 max-w-3xl mx-auto pb-20">
        {translation.blocks.map((block, idx) => (
            <LazyBlock key={idx} heightHint={block.type === 'paragraph' ? 100 : 200}>
            <div 
                data-block-en={block.en ? block.en.substring(0, 50) : ""}
                className={`group relative p-2 transition-all duration-300 rounded-xl hover:bg-black/5 border border-transparent hover:border-black/5`}
                onMouseEnter={() => block.en && block.en.length > 5 && onHoverBlock(block.en)}
                onMouseLeave={() => onHoverBlock(null)}
            >
                <div className="absolute left-[-12px] top-4 bottom-4 w-1 opacity-0 group-hover:opacity-100 transition-all duration-300 rounded-full scale-y-0 group-hover:scale-y-100 origin-center shadow-[0_0_5px_currentColor]" style={{ backgroundColor: styles.accentColor, color: styles.accentColor }} />
                {renderBlockContent(block, idx)}
            </div>
            </LazyBlock>
        ))}
      </div>
    </div>
  );
});

export default TranslationViewer;
