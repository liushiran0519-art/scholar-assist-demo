import React, { useState, useEffect, useRef, forwardRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
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
      const timer = setTimeout(() => {
        captureCanvas();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [triggerCapture, pageNumber]);

  useEffect(() => {
    setTextLayerReady(false);
    setHighlights([]);
  }, [pageNumber, scale]);


  // --- 🌟 核心高亮逻辑重写 (Normalized Mapping) 🌟 ---
  // --- 🌟 核心高亮逻辑 (移植自 Translator.tsx 的优化版本) 🌟 ---
  // 监听 highlightText 变化，计算坐标并滚动
  useEffect(() => {
    // 1. 基础校验：如果没有高亮词、文本层未准备好或容器不存在，则清空高亮
    if (!highlightText || highlightText.length < 2 || !textLayerReady || !pageContainerRef.current) {
      setHighlights([]);
      return;
    }

    const calculateHighlights = () => {
      const textLayer = pageContainerRef.current?.querySelector('.react-pdf__Page__textContent');
      if (!textLayer) return;

      // 2. 获取所有文本节点 (Text Nodes)
      const textNodes: Text[] = [];
      const walker = document.createTreeWalker(textLayer, NodeFilter.SHOW_TEXT);
      let node;
      while (node = walker.nextNode()) {
        textNodes.push(node as Text);
      }
      
      if (textNodes.length === 0) return;

      // 3. 建立映射表：归一化字符串索引 -> DOM 节点 & 偏移量
      // 我们只提取字母、数字和中文进行匹配，忽略 PDF 中常见的乱码空格、换行
      let normalizedPdfText = "";
      const mapping: { node: Text; index: number }[] = [];

      for (const txtNode of textNodes) {
        const str = txtNode.textContent || "";
        for (let i = 0; i < str.length; i++) {
           const char = str[i];
           // 宽泛匹配正则：保留中文、英文、数字
           if (/[a-zA-Z0-9\u4e00-\u9fa5]/.test(char)) {
             normalizedPdfText += char.toLowerCase();
             mapping.push({ node: txtNode, index: i });
           }
        }
      }

      // 4. 处理查询词：同样进行归一化
      // 注意：highlightText 来自 AI，可能很长，我们只取前 40-50 个有效字符进行“模糊搜索”
      // 这样即使 AI 翻译的后半段稍有出入，也能定位到段落开头
      const cleanQuery = highlightText.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '').toLowerCase();
      const searchKey = cleanQuery.slice(0, 50); // 搜索前50个字符作为锚点

      if (searchKey.length < 2) return;

      // 5. 在归一化字符串中搜索
      let startIndex = normalizedPdfText.indexOf(searchKey);
      
      // 容错机制：如果找不到，尝试截断前 5 个字符再找（防止首字母OCR识别错误）
      if (startIndex === -1 && searchKey.length > 10) {
         startIndex = normalizedPdfText.indexOf(searchKey.slice(5)); 
      }

      if (startIndex === -1) {
        setHighlights([]);
        return;
      }

      // 6. 确定高亮范围
      // 我们至少高亮匹配到的部分，视觉上给用户一个反馈
      const endIndex = Math.min(startIndex + searchKey.length - 1, mapping.length - 1);
      
      const startData = mapping[startIndex];
      const endData = mapping[endIndex];

      // 7. 创建 Range 并获取矩形坐标
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
          // 过滤掉不可见或极小的杂乱矩形
          if (r.width < 1 || r.height < 1) continue;
          
          newHighlights.push({
            left: r.left - pageRect.left,
            top: r.top - pageRect.top,
            width: r.width,
            height: r.height
          });
        }
        setHighlights(newHighlights);

        // 8. [关键优化] 自动滚动到高亮处
        if (newHighlights.length > 0) {
           const firstRect = newHighlights[0];
           if (pageContainerRef.current) {
              const containerH = pageContainerRef.current.clientHeight;
              // 计算滚动位置：将高亮元素置于视口中间偏上位置
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

    // 防抖执行，避免鼠标快速划过时频繁计算
    const timer = setTimeout(calculateHighlights, 50);
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
      <style>{`
        .react-pdf__Page { position: relative; display: block; }
        .react-pdf__Page__textContent {
          position: absolute !important; top: 0 !important; left: 0 !important; width: 100% !important; height: 100% !important;
          color: transparent !important; background: transparent !important; opacity: 1 !important;
          pointer-events: all; line-height: 1; user-select: text; z-index: 10;
        }
        .react-pdf__Page__textContent ::selection { background: rgba(218, 165, 32, 0.2); color: transparent; }
        .react-pdf__Page__textContent span { color: transparent !important; cursor: text; }
      `}</style>

      {/* Control Bar (Same as before) */}
      <div className="h-12 bg-[#2c1810] text-[#DAA520] flex items-center justify-between px-4 border-b border-[#8B4513] shadow-md z-10 shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center bg-[#2c1810] border-2 border-[#8B4513] p-1">
            <button onClick={() => onPageChange(pageNumber - 1)} disabled={pageNumber <= 1} className="p-1 hover:bg-[#8B4513] disabled:opacity-30"><ChevronLeftIcon className="w-4 h-4" /></button>
            <span className="mx-3 min-w-[60px] text-center font-bold text-xs pixel-font">{numPages ? `${pageNumber}/${numPages}` : '--'}</span>
            <button onClick={() => onPageChange(pageNumber + 1)} disabled={pageNumber >= (numPages || 0)} className="p-1 hover:bg-[#8B4513] disabled:opacity-30"><ChevronRightIcon className="w-4 h-4" /></button>
          </div>
        </div>
        <div className="flex items-center bg-[#2c1810] border-2 border-[#8B4513] p-1">
           <button onClick={() => changeScale(-0.1)} className="p-1 hover:bg-[#8B4513]"><ZoomOutIcon className="w-4 h-4" /></button>
            <span className="mx-2 min-w-[40px] text-center font-bold text-xs pixel-font">{Math.round(scale * 100)}%</span>
            <button onClick={() => changeScale(0.1)} className="p-1 hover:bg-[#8B4513]"><ZoomInIcon className="w-4 h-4" /></button>
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
              error={<div className="text-red-500 p-4">Error loading Scroll</div>}
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
              
              {/* Highlight Overlay Layer */}
        <div className="absolute inset-0 pointer-events-none z-20">
          {highlights.map((h, i) => (
            <div
              key={i}
              // 这里的颜色使用了类似第二个代码的金色/黄色，并且加了阴影
              className="highlight-overlay absolute bg-[#DAA520] mix-blend-multiply opacity-40 border-b-2 border-[#8B4513] shadow-[0_0_8px_rgba(218,165,32,0.8)]"
              style={{ left: h.left, top: h.top, width: h.width, height: h.height }}
            />
          ))}
        </div>

        {/* Context Menu */}
        {selectionMenu && (
          <div className="fixed z-50 transform -translate-x-1/2 -translate-y-full mb-2 flex gap-1" style={{ left: selectionMenu.x, top: selectionMenu.y }}>
             <div className="bg-[#2c1810] border-2 border-[#DAA520] p-1 rounded-lg shadow-xl flex gap-2">
                <button onClick={() => onTextSelected?.(selectionMenu.text, 'explain')} className="px-3 py-1.5 bg-[#8B4513] hover:bg-[#DAA520] text-[#e8e4d9] text-xs font-bold rounded flex gap-1 pixel-font">
                  <InfoIcon className="w-3 h-3" /> 解释
                </button>
                <button onClick={() => onTextSelected?.(selectionMenu.text, 'save')} className="px-3 py-1.5 bg-[#8B4513] hover:bg-[#DAA520] text-[#e8e4d9] text-xs font-bold rounded flex gap-1 pixel-font">
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
