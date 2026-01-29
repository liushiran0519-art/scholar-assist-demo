import React, { useState, useEffect, useRef, forwardRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';
import { ChevronLeftIcon, ChevronRightIcon, ZoomInIcon, ZoomOutIcon, LoaderIcon, InfoIcon, StarIcon } from './IconComponents';

// 配置 Worker
pdfjs.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs`;

interface PDFViewerProps {
  fileUrl: string;
  pageNumber: number;
  onPageChange: (page: number) => void;
  onPageRendered: (pageCanvas: HTMLCanvasElement, pageNum: number) => void;
  highlightText?: string | null;
  triggerCapture?: number;
  onTextSelected?: (text: string, action: 'explain' | 'save') => void;
  onTextHover?: (text: string | null) => void;
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

  useEffect(() => {
    setTextLayerReady(false);
    setHighlights([]);
    setSelectionMenu(null);
  }, [pageNumber, scale]);


  // --- 🌟 核心修复：全段落高亮逻辑 🌟 ---
  useEffect(() => {
    if (!highlightText || highlightText.length < 2 || !textLayerReady || !pageContainerRef.current) {
      setHighlights([]);
      return;
    }

    const calculateHighlights = () => {
      const textLayer = pageContainerRef.current?.querySelector('.react-pdf__Page__textContent');
      if (!textLayer) return;

      const textNodes: Text[] = [];
      const walker = document.createTreeWalker(textLayer, NodeFilter.SHOW_TEXT);
      let node;
      while (node = walker.nextNode()) {
        textNodes.push(node as Text);
      }
      
      if (textNodes.length === 0) return;

      // 1. 建立精准映射 (Normalized Index -> DOM Node)
      let normalizedPdfText = "";
      const mapping: { node: Text; index: number }[] = [];

      for (const txtNode of textNodes) {
        const str = txtNode.textContent || "";
        for (let i = 0; i < str.length; i++) {
           const char = str[i];
           // 只保留有效字符参与索引，确保跨行/跨空格匹配
           if (/[a-zA-Z0-9\u4e00-\u9fa5]/.test(char)) {
             normalizedPdfText += char.toLowerCase();
             mapping.push({ node: txtNode, index: i });
           }
        }
      }

      // 2. 准备搜索词
      // 全文 clean (用于计算总长度)
      const fullCleanQuery = highlightText.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '').toLowerCase();
      // 锚点 clean (只取前 30 个字符用于定位开始位置，防止 OCR 长句误差)
      const searchAnchor = fullCleanQuery.slice(0, 30);

      if (searchAnchor.length < 2) return;

      // 3. 定位开始位置
      let startIndex = normalizedPdfText.indexOf(searchAnchor);
      
      // 容错：如果找不到，尝试跳过前 5 个字符再找
      if (startIndex === -1 && searchAnchor.length > 10) {
         startIndex = normalizedPdfText.indexOf(searchAnchor.slice(5)); 
      }

      if (startIndex === -1) {
        setHighlights([]);
        return;
      }

      // 4. ✅ 修复点：使用 fullCleanQuery 的长度来确定结束位置
      // 这样即使只用前30个字定位，也能高亮整个段落
      const lengthToHighlight = fullCleanQuery.length;
      const endIndex = Math.min(startIndex + lengthToHighlight - 1, mapping.length - 1);

      // 如果映射数组不够长（比如 PDF 文本层截断），则只高亮到最后
      if (!mapping[startIndex] || !mapping[endIndex]) return;

      const startData = mapping[startIndex];
      const endData = mapping[endIndex];

      // 5. 创建 Range 并获取矩形
      const range = document.createRange();
      try {
        range.setStart(startData.node, startData.index);
        // endOffset 需要 +1 才能包住最后一个字符
        range.setEnd(endData.node, endData.index + 1);
        
        const rects = range.getClientRects();
        const pageElement = pageContainerRef.current?.querySelector('.react-pdf__Page');
        const pageRect = pageElement?.getBoundingClientRect();
        
        if (!pageRect) return;

        const newHighlights: HighlightRect[] = [];
        for (let i = 0; i < rects.length; i++) {
          const r = rects[i];
          // 过滤掉极小的噪点矩形
          if (r.width < 2 || r.height < 2) continue;
          
          newHighlights.push({
            left: r.left - pageRect.left,
            top: r.top - pageRect.top,
            width: r.width,
            height: r.height
          });
        }
        setHighlights(newHighlights);

        // 自动滚动到高亮区域中心
        if (newHighlights.length > 0) {
           const firstRect = newHighlights[0];
           if (pageContainerRef.current) {
              const containerH = pageContainerRef.current.clientHeight;
              const targetTop = firstRect.top - (containerH / 2) + 50;
              pageContainerRef.current.scrollTo({
                  top: targetTop,
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


  // --- 鼠标交互 (保持不变) ---
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

  useEffect(() => {
    if (!onTextHover || !textLayerReady) return;
    const container = pageContainerRef.current;
    if (!container) return;

    let hoverTimeout: NodeJS.Timeout;
    const handleMouseOver = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target.tagName === 'SPAN' && target.textContent && target.textContent.trim().length > 3) {
            clearTimeout(hoverTimeout);
            onTextHover(target.textContent);
        }
    };
    const handleMouseOut = () => {
        hoverTimeout = setTimeout(() => onTextHover(null), 100);
    };

    container.addEventListener('mouseover', handleMouseOver);
    container.addEventListener('mouseout', handleMouseOut);
    return () => {
        container.removeEventListener('mouseover', handleMouseOver);
        container.removeEventListener('mouseout', handleMouseOut);
        clearTimeout(hoverTimeout);
    };
  }, [textLayerReady, onTextHover]);


  return (
    <div className="flex flex-col h-full bg-[#5c4033] relative">
      <style>{`
        .react-pdf__Page__textContent ::selection {
          background: rgba(218, 165, 32, 0.3);
        }
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
               renderAnnotationLayer={true} 
               className="bg-white shadow-lg relative"
               onRenderSuccess={() => setTimeout(captureCanvas, 300)}
               onGetTextSuccess={() => setTextLayerReady(true)}
             />
             
             {/* Highlight Overlay Layer */}
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

        {/* Context Menu */}
        {selectionMenu && (
          <div className="fixed z-50 transform -translate-x-1/2 -translate-y-full mb-2" style={{ left: selectionMenu.x, top: selectionMenu.y }}>
             <div className="bg-[#2c1810] border-2 border-[#DAA520] p-1.5 rounded shadow-xl flex gap-2 animate-in fade-in zoom-in-95 duration-200">
                <button onClick={() => { onTextSelected?.(selectionMenu.text, 'explain'); setSelectionMenu(null); }} className="px-3 py-1.5 bg-[#8B4513] hover:bg-[#DAA520] text-[#e8e4d9] hover:text-[#2c1810] text-xs font-bold rounded flex gap-1 pixel-font transition-colors items-center">
                  <InfoIcon className="w-3 h-3" /> 解释
                </button>
                <button onClick={() => { onTextSelected?.(selectionMenu.text, 'save'); setSelectionMenu(null); }} className="px-3 py-1.5 bg-[#8B4513] hover:bg-[#DAA520] text-[#e8e4d9] hover:text-[#2c1810] text-xs font-bold rounded flex gap-1 pixel-font transition-colors items-center">
                  <StarIcon className="w-3 h-3" /> 收藏
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
