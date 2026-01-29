import React, { useState, useEffect, useRef, forwardRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { ChevronLeftIcon, ChevronRightIcon, ZoomInIcon, ZoomOutIcon, LoaderIcon, InfoIcon, StarIcon } from './IconComponents';

// 配置 Worker (保持你的 CDN 设置)
pdfjs.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs`;

interface PDFViewerProps {
  fileUrl: string;
  pageNumber: number;
  onPageChange: (page: number) => void;
  onPageRendered: (pageCanvas: HTMLCanvasElement, pageNum: number) => void;
  highlightText?: string | null;
  triggerCapture?: number;
  onTextSelected?: (text: string, action: 'explain' | 'save') => void;
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
  onTextSelected
}, ref) => {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [scale, setScale] = useState(1.2); 
  const pageContainerRef = useRef<HTMLDivElement>(null);
  const [highlights, setHighlights] = useState<HighlightRect[]>([]);
  const [textLayerReady, setTextLayerReady] = useState(false);

  // Context Menu State
  const [selectionMenu, setSelectionMenu] = useState<{x: number, y: number, text: string} | null>(null);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
  }

  const changeScale = (delta: number) => {
    setScale(prevScale => Math.min(Math.max(0.6, prevScale + delta), 2.5));
  };

  // --- 截图逻辑 (用于 AI 识别) ---
  const captureCanvas = () => {
    if (!pageContainerRef.current) return;
    // 查找当前页的 DOM 节点
    const pageDiv = pageContainerRef.current.querySelector(`.react-pdf__Page[data-page-number="${pageNumber}"]`);
    if (!pageDiv) return;
    const canvas = pageDiv.querySelector('canvas');
    if (canvas) {
      onPageRendered(canvas, pageNumber);
    }
  };

  // 监听外部截图触发信号
  useEffect(() => {
    if ((triggerCapture || 0) > 0) {
      const timer = setTimeout(() => {
        captureCanvas();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [triggerCapture, pageNumber]);

  // 翻页或缩放时重置状态
  useEffect(() => {
    setTextLayerReady(false);
    setHighlights([]);
  }, [pageNumber, scale]);


  // --- 核心高亮逻辑 (修复版) ---
  // 原理：遍历 PDF 文本层的 DOM 节点，找到匹配的文字，计算其坐标
  useEffect(() => {
    // 1. 基础检查
    if (!highlightText || highlightText.length < 2 || !textLayerReady || !pageContainerRef.current) {
      setHighlights([]);
      return;
    }

    const calculateHighlights = () => {
      // 找到 react-pdf 生成的文本层
      const textLayer = pageContainerRef.current?.querySelector('.react-pdf__Page__textContent');
      if (!textLayer) return;

      // 2. 提取所有文本节点
      const textNodes: Text[] = [];
      const walker = document.createTreeWalker(textLayer, NodeFilter.SHOW_TEXT);
      let node;
      while (node = walker.nextNode()) {
        textNodes.push(node as Text);
      }
      
      if (textNodes.length === 0) return;

      // 3. 建立映射：将分散的 DOM 节点映射到一个连续的字符串中
      let normalizedPdfText = "";
      const charMap: { node: Text; index: number }[] = [];
      
      // 过滤掉不可见字符，提高匹配率
      const isSignificant = (char: string) => /[a-zA-Z0-9\u4e00-\u9fa5]/.test(char);

      for (const txtNode of textNodes) {
        const str = txtNode.textContent || "";
        for (let i = 0; i < str.length; i++) {
           const char = str[i];
           if (isSignificant(char)) {
             normalizedPdfText += char.toLowerCase();
             charMap.push({ node: txtNode, index: i });
           }
        }
      }
      
      // 4. 在连续字符串中查找目标文字
      const normalizedQuery = highlightText.split('').filter(isSignificant).join('').toLowerCase();
      if (normalizedQuery.length < 2) return; 

      let startIndex = normalizedPdfText.indexOf(normalizedQuery);
      
      // 简单的模糊匹配重试 (如果完全匹配失败，尝试匹配头尾)
      if (startIndex === -1 && normalizedQuery.length > 20) {
         const head = normalizedQuery.substring(0, 10);
         startIndex = normalizedPdfText.indexOf(head);
      }

      if (startIndex === -1) {
        setHighlights([]);
        return;
      }

      const endIndex = startIndex + normalizedQuery.length - 1;
      
      // 5. 根据映射找回 DOM 节点，计算坐标
      if (!charMap[startIndex] || !charMap[endIndex]) return;
      
      const startNodeData = charMap[startIndex];
      const endNodeData = charMap[endIndex];
      
      const range = document.createRange();
      try {
        range.setStart(startNodeData.node, startNodeData.index);
        range.setEnd(endNodeData.node, endNodeData.index + 1);
        
        const rects = range.getClientRects();
        const pageElement = pageContainerRef.current?.querySelector('.react-pdf__Page');
        const pageRect = pageElement?.getBoundingClientRect();
        
        if (!pageRect) return;

        const newHighlights: HighlightRect[] = [];
        for (let i = 0; i < rects.length; i++) {
          const r = rects[i];
          if (r.width < 1 || r.height < 1) continue;
          
          // 计算相对于 PDF 页面的坐标
          newHighlights.push({
            left: r.left - pageRect.left,
            top: r.top - pageRect.top,
            width: r.width,
            height: r.height
          });
        }
        setHighlights(newHighlights);

        // 自动滚动到高亮位置
        if (newHighlights.length > 0) {
           startNodeData.node.parentElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

      } catch (e) {
        console.error("Highlight calculation error:", e);
        setHighlights([]);
      }
    };

    // 防抖执行
    const timer = setTimeout(calculateHighlights, 100);
    return () => clearTimeout(timer);

  }, [highlightText, textLayerReady, pageNumber, scale]);


  // --- 划词菜单逻辑 ---
  useEffect(() => {
    const handleMouseUp = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !pageContainerRef.current) {
        setSelectionMenu(null);
        return;
      }
      const text = selection.toString().trim();
      if (text.length > 0 && pageContainerRef.current.contains(selection.anchorNode)) {
         const range = selection.getRangeAt(0);
         const rect = range.getBoundingClientRect();
         // 考虑滚动偏移
         setSelectionMenu({
           x: rect.left + (rect.width / 2),
           y: rect.top - 10,
           text: text
         });
      } else {
        setSelectionMenu(null);
      }
    };
    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, []);


  return (
    <div className="flex flex-col h-full bg-[#5c4033] relative">
      
      {/* ⚠️ 强制样式修复：确保文本层覆盖在 Canvas 上且透明 */}
      <style>{`
        .react-pdf__Page {
          position: relative;
        }
        .react-pdf__Page__textContent {
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
          transform-origin: 0 0;
          color: transparent !important; /* 文字透明 */
          opacity: 0.5; /* 保持可选 */
          pointer-events: all;
          line-height: 1;
        }
        .react-pdf__Page__textContent ::selection {
          background: rgba(218, 165, 32, 0.4); /* 金色选区 */
        }
        /* 移除 textLayer 默认可能导致的换行间距 */
        .react-pdf__Page__textContent span {
            color: transparent;
            position: absolute;
            white-space: pre;
            cursor: text;
            transform-origin: 0% 0%;
        }
      `}</style>

      {/* Control Bar */}
      <div className="h-12 bg-[#2c1810] text-[#DAA520] flex items-center justify-between px-4 border-b border-[#8B4513] shadow-md z-10 shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center bg-[#2c1810] border-2 border-[#8B4513] p-1">
            <button 
              onClick={() => onPageChange(pageNumber - 1)} 
              disabled={pageNumber <= 1}
              className="p-1 hover:bg-[#8B4513] text-[#e8e4d9] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeftIcon className="w-4 h-4" />
            </button>
            <span className="mx-3 min-w-[60px] text-center font-bold text-xs pixel-font">
              {numPages ? `${pageNumber}/${numPages}` : '--'}
            </span>
            <button 
              onClick={() => onPageChange(pageNumber + 1)} 
              disabled={pageNumber >= (numPages || 0)}
              className="p-1 hover:bg-[#8B4513] text-[#e8e4d9] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRightIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex items-center bg-[#2c1810] border-2 border-[#8B4513] p-1">
           <button onClick={() => changeScale(-0.1)} className="p-1 hover:bg-[#8B4513] text-[#e8e4d9]"><ZoomOutIcon className="w-4 h-4" /></button>
            <span className="mx-2 min-w-[40px] text-center font-bold text-xs pixel-font">{Math.round(scale * 100)}%</span>
            <button onClick={() => changeScale(0.1)} className="p-1 hover:bg-[#8B4513] text-[#e8e4d9]"><ZoomInIcon className="w-4 h-4" /></button>
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
              loading={
                <div className="flex items-center justify-center h-96 w-full text-[#DAA520]">
                  <LoaderIcon className="w-8 h-8 animate-spin" />
                </div>
              }
              error={<div className="text-red-500 p-4">Error loading Scroll</div>}
            >
              <Page 
                pageNumber={pageNumber} 
                scale={scale}
                renderTextLayer={true} 
                renderAnnotationLayer={false} 
                className="bg-white shadow-lg"
                onRenderSuccess={() => {
                  setTimeout(captureCanvas, 300);
                }}
                onGetTextSuccess={() => setTextLayerReady(true)}
              />
              
              {/* Highlight Overlay Layer (z-20: on top of text layer) */}
              <div className="absolute inset-0 pointer-events-none z-20">
                {highlights.map((h, i) => (
                  <div
                    key={i}
                    className="absolute bg-yellow-400 mix-blend-multiply opacity-50 transition-all duration-300 border-b-2 border-yellow-600"
                    style={{
                      left: h.left,
                      top: h.top,
                      width: h.width,
                      height: h.height
                    }}
                  />
                ))}
              </div>
            </Document>
        </div>

        {/* Context Menu */}
        {selectionMenu && (
          <div 
            className="fixed z-50 transform -translate-x-1/2 -translate-y-full mb-2 flex gap-1 animate-in fade-in zoom-in duration-200"
            style={{ left: selectionMenu.x, top: selectionMenu.y }}
          >
             <div className="bg-[#2c1810] border-2 border-[#DAA520] p-1 rounded-lg shadow-xl flex gap-2">
                <button 
                  onClick={() => onTextSelected?.(selectionMenu.text, 'explain')}
                  className="px-3 py-1.5 bg-[#8B4513] hover:bg-[#DAA520] text-[#e8e4d9] hover:text-[#2c1810] text-xs font-bold rounded flex items-center gap-1 pixel-font transition-colors"
                >
                  <InfoIcon className="w-3 h-3" /> 小猫解释
                </button>
                <button 
                  onClick={() => onTextSelected?.(selectionMenu.text, 'save')}
                  className="px-3 py-1.5 bg-[#8B4513] hover:bg-[#DAA520] text-[#e8e4d9] hover:text-[#2c1810] text-xs font-bold rounded flex items-center gap-1 pixel-font transition-colors"
                >
                  <StarIcon className="w-3 h-3" /> 收藏金句
                </button>
             </div>
             <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-[#DAA520]"></div>
          </div>
        )}

      </div>
    </div>
  );
});

export default PDFViewer;
