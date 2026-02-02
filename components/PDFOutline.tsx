import React, { useEffect, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';

interface OutlineNode {
  title: string;
  dest: string | any[];
  items: OutlineNode[];
}

interface PDFOutlineProps {
  pdfDocument: any; // pdfjs document object
  onJumpToDest: (dest: any, pageIndex?: number) => void;
  currentPage: number;
  totalPage: number;
}

export const PDFOutline: React.FC<PDFOutlineProps> = ({ pdfDocument, onJumpToDest, currentPage, totalPage }) => {
  const [outline, setOutline] = useState<OutlineNode[]>([]);
  const [mode, setMode] = useState<'TOC' | 'THUMB'>('TOC');

  useEffect(() => {
    if (!pdfDocument) return;
    pdfDocument.getOutline().then((outlineData: any[]) => {
      setOutline(outlineData || []);
    });
  }, [pdfDocument]);

  // 递归渲染目录树
  const renderItem = (item: OutlineNode, level = 0) => (
    <div key={item.title + level} className="my-1">
      <button 
        onClick={async () => {
          // 处理 Destination
          if (typeof item.dest === 'string') {
             // 命名目的地，需要查找
             const destArray = await pdfDocument.getDestination(item.dest);
             const pageRef = destArray[0];
             const pageIndex = await pdfDocument.getPageIndex(pageRef);
             onJumpToDest(null, pageIndex + 1);
          } else if (Array.isArray(item.dest)) {
             // 显式引用 [Ref, {name: "XYZ"}, ...]
             const pageRef = item.dest[0];
             const pageIndex = await pdfDocument.getPageIndex(pageRef);
             onJumpToDest(null, pageIndex + 1);
          }
        }}
        className="text-left w-full hover:text-[#DAA520] truncate text-xs transition-colors py-1 block"
        style={{ paddingLeft: `${level * 12}px`, fontWeight: level === 0 ? 'bold' : 'normal', opacity: level === 0 ? 1 : 0.8 }}
        title={item.title}
      >
        {item.title}
      </button>
      {item.items && item.items.length > 0 && (
        <div className="border-l border-[#8B4513]/30 ml-1">
          {item.items.map(sub => renderItem(sub, level + 1))}
        </div>
      )}
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-[#2c1810] text-[#e8e4d9] border-r-2 border-[#8B4513]">
      {/* 顶部切换 Tab */}
      <div className="flex border-b-2 border-[#8B4513]">
        <button 
          onClick={() => setMode('TOC')}
          className={`flex-1 py-2 text-[10px] font-bold pixel-font ${mode === 'TOC' ? 'bg-[#DAA520] text-[#2c1810]' : 'hover:bg-[#3e2723]'}`}
        >
          目录 (TOC)
        </button>
        <button 
          onClick={() => setMode('THUMB')}
          className={`flex-1 py-2 text-[10px] font-bold pixel-font ${mode === 'THUMB' ? 'bg-[#DAA520] text-[#2c1810]' : 'hover:bg-[#3e2723]'}`}
        >
          缩略图 (View)
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
        {mode === 'TOC' ? (
          outline.length > 0 ? (
            outline.map(item => renderItem(item))
          ) : (
            <div className="text-center mt-10 opacity-50 text-xs serif">
              <p>此卷轴没有目录索引...</p>
              <p>(No Outline Found)</p>
            </div>
          )
        ) : (
          <div className="space-y-4">
            {/* 缩略图列表 - 简单实现：只渲染附近的页面或使用懒加载 */}
            {Array.from({ length: totalPage }, (_, i) => i + 1).map(pageNum => (
              <div 
                key={pageNum} 
                onClick={() => onJumpToDest(null, pageNum)}
                className={`cursor-pointer border-2 transition-all rounded p-1 ${currentPage === pageNum ? 'border-[#DAA520] bg-[#DAA520]/20' : 'border-transparent hover:border-[#8B4513]'}`}
              >
                {/* 仅在视口附近渲染 Page 缩略图以提升性能 */}
                {Math.abs(currentPage - pageNum) < 5 ? (
                   <Page 
                     pageNumber={pageNum} 
                     width={120} 
                     renderTextLayer={false} 
                     renderAnnotationLayer={false} 
                     loading={<div className="h-32 w-full bg-black/20 animate-pulse"/>}
                   />
                ) : (
                   <div className="h-32 w-[120px] bg-black/20 flex items-center justify-center text-xs text-[#8B4513] font-bold">
                     P {pageNum}
                   </div>
                )}
                <p className="text-center text-[10px] mt-1">{pageNum}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
