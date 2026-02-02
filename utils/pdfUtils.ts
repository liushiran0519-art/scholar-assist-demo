// utils/pdfUtils.ts
import * as pdfjsLib from 'pdfjs-dist';

// 配置 Worker (指向您项目依赖中的 worker)
if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs`;
}

// ✅ 本地定义 PDF 操作符常量 (完全独立，不依赖外部文件)
// 这些是 PDF 规范 (ISO 32000-1) 定义的整数值，永远不会变
const OPS = {
  constructPath: 13,
  rectangle: 24,
  stroke: 73,
  paintImageXObject: 85,
  paintInlineImageXObject: 86,
};

export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = error => reject(error);
  });
};

export const base64ToBlobUrl = (base64: string, mimeType: string): string => {
  try {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: mimeType });
    return URL.createObjectURL(blob);
  } catch (e) {
    console.error("Base64 to Blob conversion failed", e);
    return "";
  }
};

/**
 * 辅助函数：检测页面是否包含非文本元素（图片、表格线框）
 * 原理：分析 PDF 底层绘制指令流
 */
async function getNonTextContent(page: any) {
  try {
    const operatorList = await page.getOperatorList();
    const fns = operatorList.fnArray;

    // 检查是否存在图片绘制指令
    const hasImages = fns.includes(OPS.paintImageXObject) || fns.includes(OPS.paintInlineImageXObject);
    // 检查是否存在矢量绘图指令（通常用于表格线框）
    const hasPaths = fns.includes(OPS.constructPath) || fns.includes(OPS.stroke);

    return { hasImages, hasPaths };
  } catch (e) {
    console.warn("OperatorList extraction failed", e);
    return { hasImages: false, hasPaths: false };
  }
}

/**
 * 核心处理逻辑：智能文本重组 + 视觉元素占位
 * 这是一个纯前端实现的简化版 Layout Analysis 算法
 */
async function processPageText(page: any): Promise<string> {
  const textContent = await page.getTextContent();
  const viewport = page.getViewport({ scale: 1.0 });
  
  // 1. 获取所有文本项并标准化坐标 (转换 PDF 坐标系为 Web 坐标系)
  let items = textContent.items
    .filter((item: any) => item.str.trim().length > 0)
    .map((item: any) => {
      // PDF 坐标原点在左下角，转换为 Web 的左上角
      const y = viewport.height - item.transform[5]; 
      const x = item.transform[4];
      return {
        str: item.str,
        x: x,
        y: y,
        width: item.width,
        height: item.height || 10,
      };
    });

  if (items.length === 0) return "";

  // 2. 过滤页眉页脚 (基于位置的启发式过滤)
  const headerThreshold = viewport.height * 0.05;
  const footerThreshold = viewport.height * 0.93; 
  items = items.filter((item: any) => 
    item.y > headerThreshold && item.y < footerThreshold
  );

  // 3. 排序算法 (XY-Cut 模拟)
  // 先按 Y 轴排序（行），如果 Y 轴接近则按 X 轴排序（列）
  items.sort((a: any, b: any) => {
    const lineDiff = Math.abs(a.y - b.y);
    if (lineDiff < 5) { // 5px 容差视为同一行
      return a.x - b.x;
    }
    return a.y - b.y;
  });

  // 4. 分析布局，插入[视觉占位符] 和 [表格分隔符]
  const processedLines: string[] = [];
  let lastY = items[0].y;
  let lastHeight = items[0].height;
  let currentLine: string[] = [];
  let lastLineXEnd = 0;

  // 获取页面视觉信息
  const visualAssets = await getNonTextContent(page);

  // 阈值：如果行间距超过字体高度的 4 倍，且页面有图，则认为中间有图表
  const GAP_THRESHOLD_FOR_IMAGE = 4.0; 

  for (const item of items) {
    // 判断是否换行
    const isNewLine = Math.abs(item.y - lastY) > 5; 

    if (isNewLine) {
      // 结算上一行
      if (currentLine.length > 0) {
        processedLines.push(currentLine.join(' '));
        currentLine = [];
      }

      // --- 逻辑 A：检测大段空白插入占位符 ---
      const gap = item.y - lastY;
      const relativeGap = gap / (lastHeight || 10);

      // 只有当页面确实有图片指令时，才插入“视觉内容”标记
      if (relativeGap > GAP_THRESHOLD_FOR_IMAGE && (visualAssets.hasImages || visualAssets.hasPaths)) {
         processedLines.push(`\n\n[--- Visual Content Detected (Figure/Table/Formula) ---]\n\n`);
      } else if (relativeGap > 1.5) {
         // 普通段落间隔
         processedLines.push(""); 
      }

      // 更新坐标状态
      lastY = item.y;
      lastHeight = item.height;
      lastLineXEnd = 0;
    }

    // --- 逻辑 B：检测表格列间距 ---
    // 如果同一行内，两个词之间隔得特别远，插入 Markdown 表格分隔符 "|"
    if (lastLineXEnd > 0 && (item.x - lastLineXEnd) > 20) {
        currentLine.push(" | "); 
    }

    currentLine.push(item.str);
    lastLineXEnd = item.x + item.width;
  }
  
  // 结算最后一行
  if (currentLine.length > 0) {
    processedLines.push(currentLine.join(' '));
  }

  // 5. 文本清洗
  let fullText = processedLines.join('\n');

  // 修复连字符换行 (例如 "algo- \n rithm" -> "algorithm")
  fullText = fullText.replace(/(\w+)-\s*\n\s*(\w+)/g, '$1$2');

  return fullText;
}

// 获取整个 PDF 文本
export const extractTextFromPdf = async (base64Data: string): Promise<string> => {
  try {
    const binaryString = window.atob(base64Data);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const loadingTask = pdfjsLib.getDocument({ data: bytes });
    const pdf = await loadingTask.promise;
    
    let fullText = '';
    const maxPages = Math.min(pdf.numPages, 30); 

    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const pageText = await processPageText(page);
      fullText += `--- Page ${i} ---\n${pageText}\n\n`;
    }

    return fullText;
  } catch (error) {
    console.error("PDF Text Extraction Error:", error);
    throw new Error("Failed to extract text from PDF");
  }
};

// 获取指定单页的文本
export const extractPageText = async (base64Data: string, pageNumber: number): Promise<string> => {
  try {
    const binaryString = window.atob(base64Data);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const loadingTask = pdfjsLib.getDocument({ data: bytes });
    const pdf = await loadingTask.promise;
    
    if (pageNumber > pdf.numPages || pageNumber < 1) return "";

    const page = await pdf.getPage(pageNumber);
    return await processPageText(page);
  } catch (error) {
    console.error(`Page ${pageNumber} Text Extraction Error:`, error);
    return "";
  }
};
