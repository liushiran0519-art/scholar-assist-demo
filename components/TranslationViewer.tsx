import React, { forwardRef, useState, useEffect, useRef } from 'react';
import { PageTranslation, ContentBlock, GlossaryTerm, AppearanceSettings } from '../types';
import GamifiedLoader from './GamifiedLoader';
import ReactMarkdown from 'react-markdown';
import katex from 'katex';
import 'katex/dist/katex.min.css'; // 确保引入样式

// 图标组件 (如果没有单独文件，可以使用之前的 IconComponents)
import { InfoIcon, StarIcon } from './IconComponents'; 

interface TranslationViewerProps {
  translation: PageTranslation | undefined;
  isLoading: boolean;
  onHoverBlock: (text: string | null) => void;
  onRetry: () => void;
  onCitationClick: (id: string) => void;
  onEquationClick: (eq: string) => void;
  appearance: AppearanceSettings;
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
      { rootMargin: '200px' } // 提前 200px 渲染
    );
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} style={{ minHeight: isVisible ? 'auto' : heightHint }}>
      {isVisible ? children : <div className="animate-pulse bg-gray-400/10 rounded w-full" style={{height: heightHint}} />}
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

  // --- 1. 样式配置 (根据主题动态变化) ---
  const isSepia = appearance.theme === 'sepia';
  
  const styles = {
    container: isSepia 
      ? { backgroundColor: '#F4ECD8', color: '#433422' }
      : { backgroundColor: '#2c1810', color: '#e8e4d9' },
    
    highlight: isSepia 
      ? 'bg-[#DAA520]/20 border-[#8B4513] text-[#8B4513]' 
      : 'bg-[#DAA520]/10 border-[#DAA520] text-[#DAA520]',
    
    tooltip: {
      bg: isSepia ? 'bg-[#fffef0]' : 'bg-[#1a0f0a]',
      border: isSepia ? 'border-[#8B4513]' : 'border-[#DAA520]',
      text: isSepia ? 'text-[#433422]' : 'text-[#e8e4d9]',
    },

    accentColor: isSepia ? '#8B4513' : '#DAA520',
    borderColor: isSepia ? '#8B4513' : '#DAA520',
    
    font: {
      fontSize: `${appearance.fontSize}px`,
      fontFamily: appearance.fontFamily === 'serif' ? '"Noto Serif SC", serif' : 'system-ui, sans-serif',
      lineHeight: '1.8'
    }
  };

  // --- 2. 辅助功能：复制公式 ---
  const copyLatex = (e: React.MouseEvent, latex: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(latex);
    const btn = e.currentTarget as HTMLButtonElement;
    const originalText = btn.innerText;
    btn.innerText = "已复制 (COPIED!)";
    btn.style.opacity = "1";
    setTimeout(() => { 
        btn.innerText = originalText; 
        btn.style.opacity = "";
    }, 1500);
  };

  // --- 3. 辅助功能：富文本渲染 (处理引用 [1] 和 术语高亮) ---
  const renderRichText = (text: string, glossary: GlossaryTerm[]) => {
    if (!text) return null;
    
    // 分割引用标记 [1], [1-3], [1, 2]
    // Regex 解释: 匹配 [数字...] 格式
    const parts = text.split(/(\[\d+(?:-\d+)?(?:,\s*\d+)*\])/g);
    
    return parts.map((part, idx) => {
      // 如果是引用标记
      if (/^\[\d+(?:-\d+)?(?:,\s*\d+)*\]$/.test(part)) {
        const id = part.replace(/[\[\]]/g, '').split(',')[0].split('-')[0]; // 提取第一个数字作为ID
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

      // 如果是普通文本，进行术语 (Glossary) 匹配
      let segments: React.ReactNode[] = [part];
      
      if (glossary && glossary.length > 0) {
        glossary.forEach(g => {
          const term = g.term;
          const newSegments: React.ReactNode[] = [];
          segments.forEach(seg => {
            if (typeof seg === 'string') {
              // 忽略大小写匹配
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
                            {/* 底部小三角 */}
                            <div className={`absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-[${isSepia ? '#8B4513' : '#DAA520'}]`}></div>
                         </div>
                       </span>
                     </span>
                   );
                 } else { 
                   newSegments.push(sp); 
                 }
              });
            } else { 
              newSegments.push(seg); 
            }
          });
          segments = newSegments;
        });
      }
      return <span key={idx}>{segments}</span>;
    });
  };

  // --- 4. 核心渲染器：根据 block.type 渲染不同组件 ---
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
          <div className="mt-8 mb-4 flex items-center gap-2">
            <span className="w-2 h-6 rounded-sm" style={{backgroundColor: styles.accentColor}}></span>
            <h3 className="text-lg font-bold leading-tight" style={{ ...styles.font, color: styles.accentColor }}>
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
            <div className={`my-6 mx-2 p-1 rounded-lg border-2 shadow-inner group/eq transition-all hover:scale-[1.01]`}
                 style={{ 
                   backgroundColor: isSepia ? '#fffef0' : '#1a0f0a',
                   borderColor: styles.borderColor 
                 }}>
                
                {/* Header Bar */}
                <div className="flex justify-between items-center px-3 py-1 border-b border-dashed border-opacity-30" style={{borderColor: styles.borderColor}}>
                    <div className="flex items-center gap-2">
                      <span className="text-lg">⚡</span>
                      <span className="text-[10px] opacity-50 pixel-font uppercase">Formula Spell</span>
                    </div>
                    <button 
                       onClick={(e) => copyLatex(e, block.en)} 
                       className={`text-[9px] font-bold px-2 py-1 border rounded hover:opacity-80 transition-opacity uppercase pixel-font`}
                       style={{ borderColor: styles.borderColor, color: styles.accentColor }}
                    >
                       Copy Latex
                    </button>
                </div>

                {/* Math Display */}
                <div 
                  className="overflow-x-auto overflow-y-hidden py-4 px-2 text-center cursor-help"
                  onClick={(e) => { e.stopPropagation(); onEquationClick(block.en); }}
                  title="点击让学术猫解释公式 (Click to explain)"
                  dangerouslySetInnerHTML={{ 
                    __html: katex.renderToString(block.en, { 
                      throwOnError: false, 
                      displayMode: true,
                      output: 'html'
                    }) 
                  }} 
                />

                {/* Explanation */}
                <div className="px-3 py-2 text-xs text-left border-t border-dashed opacity-80 italic bg-black/5" style={{borderColor: styles.borderColor, ...styles.font, fontSize: '13px'}}>
                   <span className="font-bold not-italic mr-2" style={{color: styles.accentColor}}>解:</span>
                   {block.cn}
                </div>
            </div>
         );

      case 'figure':
        return (
           <div className="my-6 mx-4 border-2 border-dashed p-6 text-center rounded opacity-90 relative"
                style={{ borderColor: styles.borderColor, backgroundColor: isSepia ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)' }}>
             <p className="text-[10px] font-bold pixel-font uppercase mb-2" style={{color: styles.accentColor}}>Figure / Table Area</p>
             <p className="text-sm italic font-serif">{block.cn}</p>
           </div>
        );
        
      case 'list':
        return (
            <div className="pl-4 my-2">
                <ReactMarkdown 
                    components={{
                        li: ({node, ...props}) => (
                            <li className="list-disc marker:text-[#8B4513] pl-1 mb-1" style={{ color: styles.accentColor, ...styles.font }}>
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
        return (
           <p className="mb-4 text-justify indent-8" style={styles.font}>
              {renderRichText(block.cn, translation?.glossary || [])}
           </p>
        );
    }
  };


  // --- 5. 加载状态 ---
  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center" style={styles.container}>
        <GamifiedLoader />
      </div>
    );
  }

  // --- 6. 空状态 / 错误状态 (支持重试) ---
  if (!translation || translation.blocks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center space-y-6" style={styles.container}>
        <div className="opacity-50">
           <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
        </div>
        <div>
            <h3 className="text-lg font-bold pixel-font mb-2">卷轴内容空白 (BLANK SCROLL)</h3>
            <p className="text-xs serif opacity-70 max-w-xs mx-auto">
              此页面可能是空白页，或者是纯图片导致提取失败。如果确认有内容，请尝试重新施法。
            </p>
        </div>
        
        {/* 修复：重试按钮 */}
        <button 
          onClick={onRetry}
          className={`px-6 py-2 rounded font-bold pixel-font flex items-center gap-2 transition-transform active:scale-95 shadow-lg border-2`}
          style={{ 
             backgroundColor: styles.accentColor, 
             color: isSepia ? '#e8e4d9' : '#2c1810',
             borderColor: styles.container.color
          }}
        >
          <span>↻</span> 重新施法 (RECAST SPELL)
        </button>
      </div>
    );
  }

  // --- 7. 主渲染内容 ---
  return (
    <div 
      className="h-full overflow-y-auto p-4 md:p-8 relative custom-scrollbar scroll-smooth" 
      style={styles.container}
      ref={ref}
    >
      {/* 纹理背景 */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-5 z-0 mix-blend-multiply" 
        style={{backgroundImage: 'url("https://www.transparenttextures.com/patterns/paper.png")'}}
      ></div>
      
      {/* 顶部页码导航 */}
      <div className={`sticky top-0 z-20 mb-6 pb-2 border-b-2 flex justify-between items-center backdrop-blur-sm`} 
           style={{ borderColor: styles.borderColor, backgroundColor: isSepia ? 'rgba(244, 236, 216, 0.8)' : 'rgba(44, 24, 16, 0.8)' }}>
        
        <div className="flex items-center gap-2">
            <span className="text-xl">📜</span>
            <h3 className="text-xs font-bold pixel-font uppercase" style={{ color: styles.accentColor }}>
            Chapter {translation.pageNumber}
            </h3>
        </div>

        <button 
          onClick={onRetry} 
          title="重新翻译本页"
          className="text-[10px] font-bold pixel-font flex items-center gap-1 hover:opacity-70 px-2 py-1 rounded border border-transparent hover:border-current transition-all"
          style={{ color: styles.accentColor }}
        >
          <span>↻</span> REFRESH
        </button>
      </div>
      
      {/* 内容区块列表 */}
      <div className="relative z-10 space-y-2 max-w-3xl mx-auto pb-20">
        {translation.blocks.map((block, idx) => (
            <LazyBlock key={idx} heightHint={block.type === 'paragraph' ? 100 : 200}>
            <div 
                className={`group relative p-1 md:p-2 transition-colors duration-300 rounded-lg hover:bg-black/5`}
                // 鼠标移入时触发左侧 PDF 的高亮
                onMouseEnter={() => block.en && block.en.length > 5 && onHoverBlock(block.en)}
                onMouseLeave={() => onHoverBlock(null)}
            >
                {/* 悬停时的左侧指示条 */}
                <div 
                    className="absolute left-[-10px] top-2 bottom-2 w-1 opacity-0 group-hover:opacity-100 transition-all duration-300 rounded-full scale-y-0 group-hover:scale-y-100 origin-center" 
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
