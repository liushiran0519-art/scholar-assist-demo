import React, { useState, useEffect, useRef, forwardRef, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { ChevronLeftIcon, ChevronRightIcon, ZoomInIcon, ZoomOutIcon, LoaderIcon, InfoIcon, StarIcon } from './IconComponents';

// 配置 Worker (使用 CDN 加速)
pdfjs.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs`;

interface PDFViewerProps {
  fileUrl: string;
  pageNumber: number;
  onPageChange: (page: number) => void;
  onPageRendered: (pageCanvas: HTMLCanvasElement, pageNum: number) => void;
  highlightText?: string | null; // 接收：来自右侧翻译的高亮请求
  triggerCapture?: number;
  onTextSelected?: (text: string, action: 'explain' | 'save') => void;
  onTextHover?: (text: string | null) => void; // 发送：通知右侧滚动到对应翻译
}

interface HighlightRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const PDFViewer = forwardRef<HTMLDivElement, PDFViewerProps>(({ 
  fileUrl, 
  pageNumber, 
  onPageChange, 
  onPageRendered,
  highlightText,
  triggerCapture,
  onTextSelected,
  onTextHover
}, ref) => {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [scale, setScale] = useState(1.2); 
  const pageContainerRef = useRef<HTMLDivElement>(null);
  const [highlights, setHighlights] = useState<HighlightRect[]>([]);
  const [textLayerReady, setTextLayerReady] = useState(false);

  // Context Menu State (划词菜单)
  const [selectionMenu, setSelectionMenu] = useState<{x: number, y: number, text: string} | null>(null);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
  }

  const changeScale = (delta: number) => {
    setScale(prevScale => Math.min(Math.max(0.6, prevScale + delta), 2.5));
  };

  const captureCanvas = () => {
    if (!pageContainerRef.current) return;
    const pageDiv = pageContainerRef.current.querySelector(`.react-pdf__Page[data-page-number="${pageNumber}"]`);
    if (!pageDiv) return;
    const canvas = pageDiv.querySelector('canvas');
    if (canvas) {
      onPageRendered(canvas, pageNumber);
    }
  };

  useEffect(() => {
    if ((triggerCapture || 0) > 0) {
      const timer = setTimeout(captureCanvas, 500);
      return () => clearTimeout(timer);
    }
  }, [triggerCapture, pageNumber]);

  // 重置状态当翻页时
  useEffect(() => {
    setTextLayerReady(false);
    setHighlights([]);
    setSelectionMenu(null);
  }, [pageNumber, scale]);


  // --- 🌟 核心逻辑 1: 右 -> 左 高亮 (Normalized Mapping) ---
  // 接收 highlightText，在 PDF DOM 中找到位置并画出黄框
  useEffect(() => {
    if (!highlightText || highlightText.length < 3 || !textLayerReady || !pageContainerRef.current) {
      setHighlights([]);
      return;
    }

    const calculateHighlights = () => {
      const textLayer = pageContainerRef.current?.querySelector('.react-pdf__Page__textContent');
      if (!textLayer) return;

      // 1. 获取所有文本节点
      const textNodes: Text[] = [];
      const walker = document.createTreeWalker(textLayer, NodeFilter.SHOW_TEXT);
      let node;
      while (node = walker.nextNode()) {
        textNodes.push(node as Text);
      }
      
      if (textNodes.length === 0) return;

      // 2. 建立映射表：NormalizedString Index -> DOM Node & Offset
      // 我们只提取字母和数字进行匹配，忽略空格、标点和换行，以提高 AI 匹配率
      let normalizedPdfText = "";
      const mapping: { node: Text; index: number }[] = [];

      for (const txtNode of textNodes) {
        const str = txtNode.textContent || "";
        for (let i = 0; i < str.length; i++) {
           const char = str[i];
           // 宽泛匹配：保留中文、英文、数字
           if (/[a-zA-Z0-9\u4e00-\u9fa5]/.test(char)) {
             normalizedPdfText += char.toLowerCase();
             mapping.push({ node: txtNode, index: i });
           }
        }
      }

      // 3. 处理查询词：同样进行归一化
      // 注意：highlightText 来自 AI，可能只有前几个词，我们取前 40 个有效字符进行搜索
      const cleanQuery = highlightText.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '').toLowerCase();
      const searchKey = cleanQuery.slice(0, 50); // 搜索前50个字符

      if (searchKey.length < 3) return;

      // 4. 在归一化字符串中搜索
      let startIndex = normalizedPdfText.indexOf(searchKey);
      
      // 容错：如果找不到，尝试截断前几个字符再找（防止首字母识别错误）
      if (startIndex === -1 && searchKey.length > 10) {
         startIndex = normalizedPdfText.indexOf(searchKey.slice(5)); 
      }

      if (startIndex === -1) {
        setHighlights([]);
        return;
      }

      // 5. 确定高亮范围
      // 至少高亮匹配到的部分
      const endIndex = Math.min(startIndex + searchKey.length - 1, mapping.length - 1);
      
      const startData = mapping[startIndex];
      const endData = mapping[endIndex];

      // 6. 创建 Range 并获取矩形
      const range = document.createRange();
      try {
        range.setStart(startData.node, startData.index);
        range.setEnd(endData.node, endData.index + 1);
        
        const rects = range.getClientRects();
        const pageElement = pageContainerRef.current?.querySelector('.react-pdf__Page');
        const pageRect = pageElement?.getBoundingClientRect();
        
        if (!pageRect) return;

        const newHighlights: HighlightRect[] = [];
        for (let i = 0; i < rects.length; i++) {
          const r = rects[i];
          // 过滤掉不可见的杂乱矩形
          if (r.width < 1 || r.height < 1) continue;
          
          newHighlights.push({
            left: r.left - pageRect.left,
            top: r.top - pageRect.top,
            width: r.width,
            height: r.height
          });
        }
        setHighlights(newHighlights);

        // 自动滚动到高亮处
        if (newHighlights.length > 0) {
           const firstRect = newHighlights[0];
           // 计算滚动位置，使其居中
           if (pageContainerRef.current) {
              const containerH = pageContainerRef.current.clientHeight;
              pageContainerRef.current.scrollTo({
                  top: firstRect.top - containerH / 2 + 50, // 50px offset
                  behavior: 'smooth'
              });
           }
        }

      } catch (e) {
        console.error("Highlight Range Error:", e);
      }
    };

    const timer = setTimeout(calculateHighlights, 100);
    return () => clearTimeout(timer);

  }, [highlightText, textLayerReady, pageNumber, scale]);


  // --- 🌟 核心逻辑 2: 左 -> 右 联动 (Hover Detection) ---
  // 监听鼠标在 PDF 文本层的悬停，提取文字传给父组件
  useEffect(() => {
    if (!onTextHover || !textLayerReady) return;
    
    const container = pageContainerRef.current;
    if (!container) return;

    let hoverTimeout: NodeJS.Timeout;

    const handleMouseOver = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        // PDF.js 的文本层通常是 span 标签，且有文字内容
        if (target.tagName === 'SPAN' && target.textContent && target.textContent.trim().length > 3) {
            // 清除之前的定时器
            clearTimeout(hoverTimeout);
            // 立即触发，或者稍微延迟一点点防止闪烁
            onTextHover(target.textContent);
        }
    };

    const handleMouseOut = () => {
        // 稍微延迟清除，防止鼠标在 span 之间移动时频繁断开
        hoverTimeout = setTimeout(() => {
            onTextHover(null);
        }, 100);
    };

    container.addEventListener('mouseover', handleMouseOver);
    container.addEventListener('mouseout', handleMouseOut);

    return () => {
        container.removeEventListener('mouseover', handleMouseOver);
        container.removeEventListener('mouseout', handleMouseOut);
        clearTimeout(hoverTimeout);
    };
  }, [textLayerReady, onTextHover]);


  // --- 划词菜单逻辑 (解释/收藏) ---
  useEffect(() => {
    const handleMouseUp = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !pageContainerRef.current) {
        setSelectionMenu(null);
        return;
      }
      
      const text = selection.toString().trim();
      // 确保选区在 PDF 容器内
      if (text.length > 0 && pageContainerRef.current.contains(selection.anchorNode)) {
         const range = selection.getRangeAt(0);
         const rect = range.getBoundingClientRect();
         // 考虑容器的滚动偏移
         setSelectionMenu({
           x: rect.left + (rect.width / 2),
           y: rect.top - 10, // 在选区上方显示
           text: text
         });
      } else {
        setSelectionMenu(null);
      }
    };
    
    // 监听全局 mouseup，或者只监听 container
    // 建议监听 document 以确保鼠标移出容器释放也能捕捉（虽然菜单位置可能需要调整）
    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, []);


  return (
    <div className="flex flex-col h-full bg-[#5c4033] relative">
      <style>{`
        .react-pdf__Page { position: relative; display: block; }
        .react-pdf__Page__textContent {
          position: absolute !important; top: 0 !important; left: 0 !important; width: 100% !important; height: 100% !important;
          color: transparent !important; background: transparent !important; opacity: 1 !important;
          pointer-events: all; line-height: 1; user-select: text; z-index: 10;
        }
        /* 选中文本时的颜色 */
        .react-pdf__Page__textContent ::selection { background: rgba(218, 165, 32, 0.3); color: transparent; }
        .react-pdf__Page__textContent span { color: transparent !important; cursor: text; }
        
        /* 优化高亮层的动画 */
        .highlight-overlay { transition: all 0.2s ease; }
      `}</style>

      {/* Control Bar */}
      <div className="h-12 bg-[#2c1810] text-[#DAA520] flex items-center justify-between px-4 border-b border-[#8B4513] shadow-md z-10 shrink-0 select-none">
        <div className="flex items-center gap-4">
          <div className="flex items-center bg-[#2c1810] border-2 border-[#8B4513] p-1 rounded">
            <button onClick={() => onPageChange(pageNumber - 1)} disabled={pageNumber <= 1} className="p-1 hover:bg-[#8B4513] disabled:opacity-30 rounded"><ChevronLeftIcon className="w-4 h-4" /></button>
            <span className="mx-3 min-w-[60px] text-center font-bold text-xs pixel-font">{numPages ? `${pageNumber} / ${numPages}` : '--'}</span>
            <button onClick={() => onPageChange(pageNumber + 1)} disabled={pageNumber >= (numPages || 0)} className="p-1 hover:bg-[#8B4513] disabled:opacity-30 rounded"><ChevronRightIcon className="w-4 h-4" /></button>
          </div>
        </div>
        <div className="flex items-center bg-[#2c1810] border-2 border-[#8B4513] p-1 rounded">
           <button onClick={() => changeScale(-0.1)} className="p-1 hover:bg-[#8B4513] rounded"><ZoomOutIcon className="w-4 h-4" /></button>
            <span className="mx-2 min-w-[40px] text-center font-bold text-xs pixel-font">{Math.round(scale * 100)}%</span>
            <button onClick={() => changeScale(0.1)} className="p-1 hover:bg-[#8B4513] rounded"><ZoomInIcon className="w-4 h-4" /></button>
        </div>
      </div>

      {/* Main PDF Scroll Area */}
      <div 
        className="flex-1 overflow-auto flex justify-center p-4 relative bg-[#5c4033] scroll-smooth" 
        ref={(node) => {
            pageContainerRef.current = node;
            if (typeof ref === 'function') ref(node);
            else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
        }}
      >
        <div className="relative h-fit shadow-2xl border-4 border-[#2c1810] bg-white">
           <Document
              file={fileUrl}
              onLoadSuccess={onDocumentLoadSuccess}
              loading={<div className="flex items-center justify-center h-96 w-full text-[#DAA520]"><LoaderIcon className="w-8 h-8 animate-spin" /></div>}
              error={<div className="text-red-500 p-4 font-bold pixel-font">Error loading Scroll</div>}
            >
              <Page 
                pageNumber={pageNumber} 
                scale={scale}
                renderTextLayer={true} 
                renderAnnotationLayer={false} 
                className="bg-white shadow-lg relative"
                onRenderSuccess={() => setTimeout(captureCanvas, 300)}
                onGetTextSuccess={() => setTextLayerReady(true)}
              />
              
              {/* Highlight Overlay Layer (Yellow Box) */}
              <div className="absolute inset-0 pointer-events-none z-20">
                {highlights.map((h, i) => (
                  <div
                    key={i}
                    className="highlight-overlay absolute bg-[#DAA520] mix-blend-multiply opacity-40 border-b-2 border-[#8B4513] shadow-[0_0_8px_rgba(218,165,32,0.8)]"
                    style={{ left: h.left, top: h.top, width: h.width, height: h.height }}
                  />
                ))}
              </div>
            </Document>
        </div>

        {/* Context Menu (Pop-up) */}
        {selectionMenu && (
          <div className="fixed z-50 transform -translate-x-1/2 -translate-y-full mb-2" style={{ left: selectionMenu.x, top: selectionMenu.y }}>
             <div className="bg-[#2c1810] border-2 border-[#DAA520] p-1.5 rounded shadow-xl flex gap-2 animate-in fade-in zoom-in-95 duration-200">
                <button 
                  onClick={() => { onTextSelected?.(selectionMenu.text, 'explain'); setSelectionMenu(null); }} 
                  className="px-3 py-1.5 bg-[#8B4513] hover:bg-[#DAA520] text-[#e8e4d9] hover:text-[#2c1810] text-xs font-bold rounded flex gap-1 pixel-font transition-colors items-center"
                >
                  <InfoIcon className="w-3 h-3" /> 解释
                </button>
                <button 
                  onClick={() => { onTextSelected?.(selectionMenu.text, 'save'); setSelectionMenu(null); }} 
                  className="px-3 py-1.5 bg-[#8B4513] hover:bg-[#DAA520] text-[#e8e4d9] hover:text-[#2c1810] text-xs font-bold rounded flex gap-1 pixel-font transition-colors items-center"
                >
                  <StarIcon className="w-3 h-3" /> 收藏
                </button>
             </div>
             {/* 小三角箭头 */}
             <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-[#DAA520]"></div>
          </div>
        )}
      </div>
    </div>
  );
});

export default PDFViewer;
