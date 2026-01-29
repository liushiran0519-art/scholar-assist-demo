import React, { useState, useEffect, useRef, forwardRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
// ✅ 1. 引入必要的样式，解决“文本显示在下方”的问题
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';

import { ChevronLeftIcon, ChevronRightIcon, ZoomInIcon, ZoomOutIcon, LoaderIcon } from './IconComponents';

// 设置 Worker (保持你原有的配置)
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;

interface PDFViewerProps {
  fileUrl: string;
  pageNumber: number;
  onPageChange: (page: number) => void;
  onPageRendered: (canvas: HTMLCanvasElement, pageNum: number) => void;
  highlightText?: string | null; // 传入的高亮文本
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

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
  }

  const changeScale = (delta: number) => {
    setScale(prevScale => Math.min(Math.max(0.6, prevScale + delta), 2.5));
  };

  // ✅ 2. 实现高亮计算逻辑 (BBox Match)
  useEffect(() => {
    if (!highlightText || !textLayerReady || !pageContainerRef.current) {
      setHighlights([]);
      return;
    }

    // 简单的文本匹配逻辑：查找 TextLayer 中的 span
    // 注意：这是一个简化的实现。完美的实现需要根据 pdf.js 的 textContent 数据进行几何计算
    const textSpans = pageContainerRef.current.querySelectorAll('.react-pdf__Page__textContent span');
    const newHighlights: HighlightRect[] = [];
    const pageRect = pageContainerRef.current.querySelector('.react-pdf__Page')?.getBoundingClientRect();

    if (!pageRect) return;

    // 清洗搜索词
    const search = highlightText.trim().replace(/\s+/g, ' ');

    textSpans.forEach((span) => {
      const text = span.textContent || '';
      // 如果 span 包含我们高亮文本的一部分 (模糊匹配)
      // 在实际生产中，这里通常需要更复杂的算法（如最长公共子串）来处理跨 span 的高亮
      if (text.includes(search) || search.includes(text) && text.length > 5) {
        const rect = span.getBoundingClientRect();
        newHighlights.push({
          left: rect.left - pageRect.left,
          top: rect.top - pageRect.top,
          width: rect.width,
          height: rect.height
        });
      }
    });

    setHighlights(newHighlights);
  }, [highlightText, textLayerReady, scale, pageNumber]);

  // 处理截图捕获
  useEffect(() => {
    if ((triggerCapture || 0) > 0 && pageContainerRef.current) {
      const canvas = pageContainerRef.current.querySelector('canvas');
      if (canvas) onPageRendered(canvas, pageNumber);
    }
  }, [triggerCapture, pageNumber, onPageRendered]);

  return (
    <div className="flex flex-col h-full bg-[#5c4033] relative">
      {/* 工具栏 */}
      <div className="h-12 bg-[#2c1810] text-[#DAA520] flex items-center justify-between px-4 border-b border-[#8B4513] shadow-md z-10 shrink-0">
        <div className="flex items-center bg-[#2c1810] border-2 border-[#8B4513] p-1">
          <button onClick={() => onPageChange(pageNumber - 1)} disabled={pageNumber <= 1} className="p-1 hover:bg-[#8B4513] disabled:opacity-30">
            <ChevronLeftIcon className="w-4 h-4" />
          </button>
          <span className="mx-3 min-w-[60px] text-center font-bold text-xs pixel-font">
            {numPages ? `${pageNumber}/${numPages}` : '--'}
          </span>
          <button onClick={() => onPageChange(pageNumber + 1)} disabled={pageNumber >= (numPages || 0)} className="p-1 hover:bg-[#8B4513] disabled:opacity-30">
            <ChevronRightIcon className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center bg-[#2c1810] border-2 border-[#8B4513] p-1">
           <button onClick={() => changeScale(-0.1)} className="p-1 hover:bg-[#8B4513]"><ZoomOutIcon className="w-4 h-4" /></button>
           <span className="mx-2 font-bold text-xs">{Math.round(scale * 100)}%</span>
           <button onClick={() => changeScale(0.1)} className="p-1 hover:bg-[#8B4513]"><ZoomInIcon className="w-4 h-4" /></button>
        </div>
      </div>

      {/* PDF 渲染区域 */}
      <div 
        className="flex-1 overflow-auto flex justify-center p-4 relative bg-[#5c4033]" 
        ref={(node) => {
            pageContainerRef.current = node;
            if (typeof ref === 'function') ref(node);
            else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
        }}
      >
        <div className="relative shadow-2xl border-4 border-[#2c1810] bg-white">
           <Document
             file={fileUrl}
             onLoadSuccess={onDocumentLoadSuccess}
             loading={<div className="p-10 text-[#DAA520]"><LoaderIcon className="w-8 h-8 animate-spin"/></div>}
           >
             <Page 
               pageNumber={pageNumber} 
               scale={scale}
               renderTextLayer={true} // ✅ 必须为 true，否则无法高亮
               renderAnnotationLayer={true}
               onGetTextSuccess={() => setTextLayerReady(true)} // 标记文本层已加载
               className="bg-white"
             />
             
             {/* ✅ 3. 高亮叠加层 */}
             {highlights.map((rect, i) => (
               <div
                 key={i}
                 className="absolute bg-yellow-400 mix-blend-multiply opacity-50 transition-all duration-300 pointer-events-none"
                 style={{
                   left: rect.left,
                   top: rect.top,
                   width: rect.width,
                   height: rect.height,
                   zIndex: 10 // 确保在文字上方
                 }}
               />
             ))}
           </Document>
        </div>
      </div>
    </div>
  );
});

export default PDFViewer;
