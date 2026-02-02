import * as pdfjsLib from 'pdfjs-dist';
import { TextItem } from 'pdfjs-dist/types/src/display/api';

// 配置 Worker
if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs`;
}

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
 * 核心优化：智能文本提取
 * 模拟 MinerU 的 Pipeline 逻辑：
 * 1. 获取带有坐标的文本项
 * 2. 过滤页眉页脚
 * 3. 按照 Y 轴桶排序（处理行对齐），再按 X 轴排序（处理阅读顺序）
 * 4. 智能合并换行符
 */
async function processPageText(page: any): Promise<string> {
  const textContent = await page.getTextContent();
  const viewport = page.getViewport({ scale: 1.0 }); // 获取标准视口，用于归一化坐标
  
  // 1. 过滤空字符串并获取坐标信息
  // PDF坐标系原点通常在左下角，Y轴向上为正。我们需要转换成网页习惯（左上角为0，Y向下增加）
  const items = textContent.items
    .filter((item: any) => item.str.trim().length > 0)
    .map((item: any) => {
      // item.transform [scaleX, skewY, skewX, scaleY, x, y]
      // PDF坐标 y 是从底部开始的，转换为从顶部开始
      const y = viewport.height - item.transform[5]; 
      const x = item.transform[4];
      return {
        str: item.str,
        x: x,
        y: y,
        height: item.height || 10, // 字体高度，用于判断行距
        hasEOL: item.hasEOL // 是否有显式换行
      };
    });

  if (items.length === 0) return "";

  // 2. 过滤页眉页脚 (简单的启发式规则：页面上下 5% 的内容视为页眉页脚)
  const headerThreshold = viewport.height * 0.05;
  const footerThreshold = viewport.height * 0.95;
  
  const bodyItems = items.filter((item: any) => 
    item.y > headerThreshold && item.y < footerThreshold
  );

  // 3. 坐标排序 (处理双栏/多栏排版)
  // 容差值，用于判定两段文字是否在“同一行”
  const lineTolerance = 5; 

  // 按 Y 坐标排序（从上到下）
  bodyItems.sort((a: any, b: any) => a.y - b.y);

  const lines: any[][] = [];
  let currentLine: any[] = [];
  let currentY = bodyItems[0]?.y || 0;

  // 分行逻辑
  for (const item of bodyItems) {
    if (Math.abs(item.y - currentY) < lineTolerance) {
      // 在同一行
      currentLine.push(item);
    } else {
      // 新的一行
      // 对上一行内部按 X 坐标排序（从左到右）
      currentLine.sort((a, b) => a.x - b.x);
      lines.push(currentLine);
      
      currentLine = [item];
      currentY = item.y;
    }
  }
  // push最后一行
  if (currentLine.length > 0) {
    currentLine.sort((a, b) => a.x - b.x);
    lines.push(currentLine);
  }

  // 4. 文本重组 (智能拼接)
  let fullText = "";
  let lastY = 0;
  let lastHeight = 0;

  for (const line of lines) {
    // 计算当前行文本
    const lineText = line.map((item: any) => item.str).join(' '); // 单词间补空格
    
    // 获取当前行的平均Y位置
    const currentLineY = line[0].y;
    const currentLineHeight = line[0].height;

    // 判断段落间距
    // 如果行距大于 1.5 倍字体高度，通常意味着新段落
    const gap = currentLineY - lastY;
    const isNewParagraph = lastY > 0 && gap > (lastHeight * 2.0);

    if (isNewParagraph) {
      fullText += "\n\n" + lineText; // 双换行表示新段落
    } else {
      // 检查行尾是否以连字符结束（英文断词处理）
      if (fullText.endsWith('-')) {
        fullText = fullText.slice(0, -1) + lineText; // 去掉连字符直接拼接
      } else {
        // 同一段落内的换行，替换为空格
        fullText += " " + lineText;
      }
    }

    lastY = currentLineY;
    lastHeight = currentLineHeight;
  }

  // 5. 后处理：清理多余空格
  return fullText
    .replace(/\s+/g, ' ') // 合并多余空格
    .replace(/\n \n/g, '\n\n') // 修复换行
    .trim();
}

// 获取整个 PDF 文本 (使用新的处理逻辑)
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
    // 限制解析页数，防止浏览器崩溃，MinerU 通常也会做分块处理
    const maxPages = Math.min(pdf.numPages, 30); 

    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const pageText = await processPageText(page); // 使用优化后的单页处理
      fullText += `--- Page ${i} ---\n${pageText}\n\n`;
    }

    return fullText;
  } catch (error) {
    console.error("PDF Text Extraction Error:", error);
    throw new Error("Failed to extract text from PDF");
  }
};

// 获取指定单页的文本 (使用新的处理逻辑)
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
    return await processPageText(page); // 使用优化后的单页处理
  } catch (error) {
    console.error(`Page ${pageNumber} Text Extraction Error:`, error);
    return "";
  }
};
