import React, { forwardRef, useState, useEffect, useRef } from 'react';
import { PageTranslation, ContentBlock, GlossaryTerm, AppearanceSettings } from '../types';
import GamifiedLoader from './GamifiedLoader';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm'; // ✅ 核心：支持表格渲染
import katex from 'katex';
import 'katex/dist/katex.min.css'; // 务必确保安装了 katex

import { InfoIcon, FlameIcon, FlaskIcon, SparklesIcon } from './IconComponents'; 

interface TranslationViewerProps {
  translation: PageTranslation | undefined;
  isLoading: boolean;
  onHoverBlock: (text: string | null) => void;
  onRetry: () => void;
  onCitationClick: (id: string) => void;
  onEquationClick: (eq: string) => void;
  appearance: AppearanceSettings;
  highlightText?: string | null; // 接收来自 PDF 的高亮文本
}

// --- 懒加载容器：只渲染视口内的区块，优化长文档性能 ---
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
      { rootMargin: '400px' } // 提前渲染范围
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

  // --- 🌟 核心逻辑：监听 PDF 高亮并自动滚动 ---
  useEffect(() => {
    if (!highlightText || !translation || !containerRef.current) return;

    // 1. 简单模糊匹配：清洗特殊字符，只保留字母数字
    const cleanSearch = highlightText.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '').toLowerCase().slice(0, 50);
    
    if (cleanSearch.length < 3) return;

    // 2. 在 DOM 中查找对应的 Block
    const blocks = containerRef.current.querySelectorAll('[data-block-en]');
    
    for (let i = 0; i < blocks.length; i++) {
        const el = blocks[i] as HTMLElement;
        const enText = el.getAttribute('data-block-en') || "";
        const cleanEn = enText.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '').toLowerCase();

        // 3. 双向包含检测 (防止 OCR 误差)
        if (cleanEn.includes(cleanSearch) || cleanSearch.includes(cleanEn)) {
            // 4. 滚动并高亮
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            // 添加临时高亮样式
            el.classList.add('ring-2', 'ring-[#DAA520]', 'bg-[#DAA520]/20');
            setTimeout(() => {
                el.classList.remove('ring-2', 'ring-[#DAA520]', 'bg-[#DAA520]/20');
            }, 2500);
            break; // 找到第一个匹配项即可
        }
    }
  }, [highlightText, translation]);


  // --- 样式配置 ---
  const isSepia = appearance.theme === 'sepia';
  
  const styles = {
    container: isSepia 
      ? { backgroundColor: '#F4ECD8', color: '#433422' }
      : { backgroundColor: '#2c1810', color: '#e8e4d9' },
    
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

  // --- 辅助功能：复制公式 ---
  const copyLatex = (e: React.MouseEvent, latex: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(latex);
    const btn = e.currentTarget as HTMLButtonElement;
    const originalText = btn.innerText;
    btn.innerText = "已复制!";
    btn.style.opacity = "1";
    setTimeout(() => { 
        btn.innerText = originalText; 
        btn.style.opacity = "";
    }, 1500);
  };

  // --- 组件：魔法表格样式定义 (RPG Style Table) ---
  const MarkdownTableComponents = {
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

  // --- 组件：视觉遗物 (Visual Artifact - Image/Figure Placeholder) ---
  const renderVisualArtifact = (text: string) => {
    // 检测是否包含我们在 PDF 提取层定义的特殊标记
    const isDetectedPlaceholder = text.includes("Visual Content Detected") || text.includes("图表区域");
    
    return (
      <div className={`my-8 mx-2 relative group overflow-hidden rounded-xl border-2 border-dashed transition-all hover:scale-[1.01] hover:shadow-lg`}
           style={{ borderColor: styles.borderColor, backgroundColor: isSepia ? 'rgba(139, 69, 19, 0.03)' : 'rgba(218, 165, 32, 0.05)' }}>
        
        {/* 装饰角标 */}
        <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 rounded-tl-lg opacity-50" style={{borderColor: styles.accentColor}}></div>
        <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 rounded-br-lg opacity-50" style={{borderColor: styles.accentColor}}></div>

        <div className="flex flex-col items-center justify-center p-6 text-center">
           <div className="mb-3 p-3 rounded-full bg-black/5 border-2" style={{borderColor: styles.borderColor}}>
              {isDetectedPlaceholder ? (
                 <span className="text-2xl animate-pulse">🖼️</span> // 自动检测到的图片区域
              ) : (
                 <span className="text-2xl">📊</span> // 普通图表引用
              )}
           </div>
           
           <h4 className="pixel-font text-xs font-bold uppercase mb-2 tracking-widest" style={{color: styles.accentColor}}>
             {isDetectedPlaceholder ? "Visual Archive (视觉档案)" : "Figure / Chart"}
           </h4>
           
           <p className="font-serif text-sm italic opacity-80 max-w-md">
             {isDetectedPlaceholder 
               ? "此处检测到复杂的视觉内容（图表、公式或插图）。请查阅左侧原始卷轴以获取完整信息。" 
               : text}
           </p>

           {/* 交互提示 */}
           <div className="mt-4 px-4 py-1 text-[10px] border rounded-full opacity-60 flex items-center gap-2" style={{borderColor: styles.borderColor}}>
              <span>👀</span>
              <span>Look Left (请看左侧)</span>
           </div>
        </div>
      </div>
    );
  };

  // --- 辅助功能：富文本渲染 (Glossary & Citations) ---
  const renderRichText = (text: string, glossary: GlossaryTerm[]) => {
    if (!text) return null;
    
    // 拆分引用标记 [1], [1-3]
    const parts = text.split(/(\[\d+(?:-\d+)?(?:,\s*\d+)*\])/g);
    
    return parts.map((part, idx) => {
      // 1. 处理引用
      if (/^\[\d+(?:-\d+)?(?:,\s*\d+)*\]$/.test(part)) {
        const id = part.replace(/[\[\]]/g, '').split(',')[0].split('-')[0]; 
        return (
          <sup 
            key={idx} 
            onClick={(e) => { e.stopPropagation(); onCitationClick(id); }}
            className={`cursor-pointer font-bold mx-0.5 px-1 rounded transition-colors hover:scale-110 inline-block`}
            style={{ color: styles.accentColor, border: `1px dashed ${styles.borderColor}` }}
            title="点击查看文献详情 (Click to view citation)"
          >
            {part}
          </sup>
        );
      }

      let segments: React.ReactNode[] = [part];
      
      // 2. 处理术语表 (Glossary)
      if (glossary && glossary.length > 0) {
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
                     <span key={`${idx}-${g.term}-${spIdx}`} className="relative group/glossary inline-block cursor-help mx-0.5 border-b-2 border-dotted" style={{borderColor: styles.accentColor}}>
                       <span className="font-bold">{sp}</span>
                       {/* Tooltip */}
                       <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 hidden group-hover/glossary:block z-50 pointer-events-none animate-in fade-in zoom-in-95 duration-200">
                         <div className={`${styles.tooltip.bg} ${styles.tooltip.text} p-3 rounded shadow-xl border-2 ${styles.tooltip.border} relative`}>
                            <div className="flex items-center gap-2 mb-1 pb-1 border-b border-gray-500/20">
                               <span className="text-lg">🐱</span>
                               <span className="pixel-font text-[10px] font-bold uppercase tracking-wider opacity-70">Scholar Note</span>
                            </div>
                            <p className="text-xs serif leading-relaxed">{g.definition}</p>
                            <div className={`absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-[${styles.borderColor}]`}></div>
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
      }
      return <span key={idx}>{segments}</span>;
    });
  };

  // --- 核心渲染器 (Block Renderer) ---
  const renderBlockContent = (block: ContentBlock, idx: number) => {
    switch (block.type) {
      case 'title':
        return (
          <div className="mb-8 text-center px-4">
             <div className="inline-block px-3 py-1 mb-2 border rounded-full text-[10px] pixel-font uppercase opacity-60" style={{borderColor: styles.accentColor, color: styles.accentColor}}>
                Paper Title
             </div>
             <h1 className="text-2xl md:text-3xl font-bold leading-tight border-b-4 border-double pb-6" style={{ borderColor: styles.borderColor, ...styles.font }}>
               {block.cn}
             </h1>
          </div>
        );
      case 'authors':
        return (
          <div className="mb-8 text-center px-8">
             <div className="p-4 rounded bg-black/5 italic" style={{ ...styles.font, fontSize: '14px' }}>
                {block.cn}
             </div>
             <p className="text-[10px] opacity-50 mt-1 uppercase tracking-widest pixel-font">Author Affiliations</p>
          </div>
        );
      case 'abstract':
        return (
           <div className={`mb-8 p-6 rounded-lg border-l-4 shadow-sm relative overflow-hidden`} 
                style={{ 
                  backgroundColor: isSepia ? '#fffef0' : '#1a0f0a',
                  borderLeftColor: styles.accentColor 
                }}>
              <div className="absolute top-0 right-0 p-2 opacity-10">
                 <InfoIcon className="w-16 h-16" />
              </div>
              <span className="font-bold text-xs uppercase tracking-wider block mb-3 pixel-font" style={{color: styles.accentColor}}>Abstract (摘要)</span>
              <p className="text-sm italic leading-relaxed text-justify" style={styles.font}>{block.cn}</p>
           </div>
        );
      case 'heading':
        return (
          <div className="mt-10 mb-4 flex items-end gap-3 pb-2 border-b" style={{borderColor: styles.borderColor + '40'}}>
            <span className="text-2xl" style={{color: styles.accentColor}}>§</span>
            <h3 className="text-lg font-bold leading-none uppercase tracking-wide" style={{ ...styles.font, color: styles.accentColor }}>
              {block.cn}
            </h3>
          </div>
        );
      case 'reference':
        return (
          <div className="pl-8 -indent-8 text-xs opacity-80 mb-2 leading-relaxed font-serif hover:opacity-100 transition-opacity">
            <span className="inline-block w-6 font-bold text-right mr-2" style={{color: styles.accentColor}}>[Ref]</span> 
            {renderRichText(block.cn, [])}
          </div>
        );
      
      case 'equation':
         return (
            <div className={`my-8 mx-1 p-4 rounded-xl border-2 shadow-md group/eq relative overflow-hidden`}
                 style={{ backgroundColor: isSepia ? '#fffef0' : '#1e120d', borderColor: styles.borderColor }}>
                
                {/* 背景纹理 */}
                <div className="absolute inset-0 opacity-5 pointer-events-none" style={{backgroundImage: 'radial-gradient(circle, #888 1px, transparent 1px)', backgroundSize: '10px 10px'}}></div>

                {/* 顶部工具栏 */}
                <div className="flex justify-between items-center mb-3">
                    <span className="text-[10px] font-bold pixel-font uppercase opacity-50 tracking-widest" style={{color: styles.accentColor}}>Arcane Formula</span>
                    <button 
                       onClick={(e) => { e.stopPropagation(); onEquationClick(block.en); }} 
                       className={`flex items-center gap-1 text-[10px] font-bold px-3 py-1 border rounded-full hover:bg-[#DAA520] hover:text-[#2c1810] transition-all cursor-pointer z-10`}
                       style={{ borderColor: styles.borderColor, color: styles.accentColor }}
                    >
                       <FlaskIcon className="w-3 h-3" />
                       <span>解析 (Explain)</span>
                    </button>
                </div>

                {/* 公式主体 */}
                <div 
                  className="overflow-x-auto overflow-y-hidden py-2 text-center"
                  dangerouslySetInnerHTML={{ 
                    __html: katex.renderToString(block.en, { throwOnError: false, displayMode: true, output: 'html' }) 
                  }} 
                />

                {/* 中文解释 */}
                <div className="mt-4 pt-3 border-t border-dashed flex gap-3" style={{borderColor: styles.borderColor + '60'}}>
                   <div className="mt-1 shrink-0"><InfoIcon className="w-4 h-4 opacity-70" /></div>
                   <p className="text-sm italic opacity-90 font-serif leading-relaxed">{block.cn}</p>
                </div>
            </div>
         );

      case 'figure':
        return renderVisualArtifact(block.cn);

      case 'list':
        // 使用 remarkGfm 支持 Checkbox 列表等
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
                >
                    {block.cn}
                </ReactMarkdown>
            </div>
        )

      case 'paragraph':
      default:
        // 特殊处理：如果段落中包含 Markdown 表格语法
        if ((block.cn.includes('|') && block.cn.includes('---')) || block.cn.trim().startsWith('|')) {
           return (
             <div className="my-4">
               <ReactMarkdown 
                 remarkPlugins={[remarkGfm]} 
                 components={MarkdownTableComponents} // 应用自定义表格组件
               >
                 {block.cn}
               </ReactMarkdown>
             </div>
           );
        }

        // 普通段落
        return (
           <p className="mb-4 text-justify indent-8 leading-loose" style={styles.font}>
              {renderRichText(block.cn, translation?.glossary || [])}
           </p>
        );
    }
  };


  // --- Loading 状态 ---
  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center relative" style={styles.container}>
        <GamifiedLoader />
        <div className="absolute bottom-10 text-xs opacity-50 pixel-font animate-pulse">
           Deciphering Ancient Scrolls...
        </div>
      </div>
    );
  }

  // --- 空状态 / 错误状态 ---
  if (!translation || translation.blocks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center space-y-6" style={styles.container}>
        <div className="opacity-50 text-6xl">📜</div>
        <div>
            <h3 className="text-lg font-bold pixel-font mb-2">卷轴空白 (BLANK)</h3>
            <p className="text-xs serif opacity-70 max-w-xs mx-auto">
              此页面内容未能解析。可能是纯图片、网络波动或施法失败。
            </p>
        </div>
        
        <button 
          onClick={onRetry}
          className={`px-8 py-3 rounded-lg font-bold pixel-font flex items-center gap-2 transition-all hover:scale-105 active:scale-95 shadow-xl border-2 group`}
          style={{ 
             backgroundColor: styles.accentColor, 
             color: isSepia ? '#e8e4d9' : '#2c1810',
             borderColor: styles.container.color
          }}
        >
          <span className="group-hover:animate-spin">↻</span> 重新施法 (RECAST SPELL)
        </button>
      </div>
    );
  }

  // --- 主渲染内容 ---
  return (
    <div 
      className="h-full overflow-y-auto p-4 md:p-8 relative custom-scrollbar scroll-smooth" 
      style={styles.container}
      ref={(node) => {
        containerRef.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }}
    >
      {/* 纹理背景 */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-5 z-0 mix-blend-multiply" 
        style={{backgroundImage: 'url("https://www.transparenttextures.com/patterns/paper.png")'}}
      ></div>
      
      {/* 顶部页码导航 (粘性布局 + 刷新按钮) */}
      <div className={`sticky top-0 z-20 mb-6 pb-2 border-b-2 flex justify-between items-center backdrop-blur-md transition-colors duration-300`} 
           style={{ borderColor: styles.borderColor, backgroundColor: isSepia ? 'rgba(244, 236, 216, 0.85)' : 'rgba(44, 24, 16, 0.85)' }}>
        
        <div className="flex items-center gap-2">
            <span className="text-xl">📜</span>
            <h3 className="text-xs font-bold pixel-font uppercase" style={{ color: styles.accentColor }}>
            Chapter {translation.pageNumber}
            </h3>
        </div>

        <button 
          onClick={onRetry} 
          title="重新翻译本页"
          className="text-[10px] font-bold pixel-font flex items-center gap-1 px-3 py-1.5 rounded-full border transition-all hover:bg-black/5 active:scale-95"
          style={{ color: styles.accentColor, borderColor: styles.borderColor }}
        >
          <span>↻</span> RECAST
        </button>
      </div>
      
      {/* 内容区块列表 */}
      <div className="relative z-10 space-y-2 max-w-3xl mx-auto pb-20">
        {translation.blocks.map((block, idx) => (
            <LazyBlock key={idx} heightHint={block.type === 'paragraph' ? 100 : 200}>
            <div 
                // 存储原文前50字符，供左侧PDF高亮查找使用
                data-block-en={block.en ? block.en.substring(0, 50) : ""}
                className={`group relative p-1 md:p-2 transition-all duration-300 rounded-lg hover:bg-black/5 border border-transparent hover:border-black/10`}
                // 右 -> 左高亮
                onMouseEnter={() => block.en && block.en.length > 5 && onHoverBlock(block.en)}
                onMouseLeave={() => onHoverBlock(null)}
            >
                {/* 悬停时的左侧指示条 */}
                <div 
                    className="absolute left-[-10px] top-2 bottom-2 w-1.5 opacity-0 group-hover:opacity-100 transition-all duration-300 rounded-full scale-y-0 group-hover:scale-y-100 origin-center" 
                    style={{ backgroundColor: styles.accentColor }} 
                />
                
                {renderBlockContent(block, idx)}
            </div>
            </LazyBlock>
        ))}

        {/* 页脚装饰 */}
        <div className="text-center opacity-30 mt-10">
            <span className="text-xl">❦</span>
        </div>
      </div>
    </div>
  );
});

export default TranslationViewer;
