import * as pdfjsLib from 'pdfjs-dist';

// 配置 Worker
if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs`;
}

// PDF 操作符常量
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

// --- 核心数据结构 ---
interface TextBlock {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  hasEOL: boolean;
}

/**
 * 步骤1: 预合并 (Pre-merge)
 * PDF.js 经常把 "Table" 拆成 "T", "a", "b", "l", "e"。
 * 我们需要把水平相邻极近的字符合并成一个单词或短语块。
 */
function mergeTextItems(items: TextBlock[]): TextBlock[] {
  if (items.length === 0) return [];

  // 先按 Y 排序，再按 X 排序
  items.sort((a, b) => {
    if (Math.abs(a.y - b.y) < 2) return a.x - b.x;
    return a.y - b.y;
  });

  const merged: TextBlock[] = [];
  let current = items[0];

  for (let i = 1; i < items.length; i++) {
    const next = items[i];
    // 判断是否在同一行 (Y轴差距小) 且 水平相邻 (X轴差距小)
    const isSameLine = Math.abs(current.y - next.y) < (current.height / 2);
    // 间距阈值：假设字体大小的 0.3 倍以内算同一个词
    const isAdjacent = (next.x - (current.x + current.width)) < (current.height * 0.5);

    if (isSameLine && isAdjacent) {
      current.str += next.str;
      current.width += next.width + (next.x - (current.x + current.width));
    } else {
      merged.push(current);
      current = next;
    }
  }
  merged.push(current);
  return merged;
}

/**
 * 步骤2: 智能分栏 (Column Splitter)
 * 大部分论文是双栏的。如果不分栏，读取顺序会变成：左栏第一行 -> 右栏第一行 -> 左栏第二行...
 * 这是造成乱码的最大原因。
 */
function splitIntoColumns(items: TextBlock[], pageWidth: number): TextBlock[][] {
  // 1. 计算所有块的 X 中心点
  const xCenters = items.map(item => item.x + item.width / 2);
  
  // 2. 简单的直方图统计，看文字是否集中在左右两边
  const leftCount = xCenters.filter(x => x < pageWidth * 0.45).length;
  const rightCount = xCenters.filter(x => x > pageWidth * 0.55).length;
  const centerCount = xCenters.length - leftCount - rightCount;

  // 阈值：如果左右两边的文字都很多，且中间很少，判定为双栏
  const isTwoColumn = (leftCount > items.length * 0.3) && (rightCount > items.length * 0.3);

  if (isTwoColumn) {
    const leftCol = items.filter(item => (item.x + item.width/2) < pageWidth * 0.5);
    const rightCol = items.filter(item => (item.x + item.width/2) >= pageWidth * 0.5);
    return [leftCol, rightCol];
  }

  return [items]; // 单栏
}

/**
 * 步骤3: 视觉检测 (Visual Detection)
 */
async function getVisualSignals(page: any) {
  try {
    const ops = await page.getOperatorList();
    const fns = ops.fnArray;
    return {
      hasImage: fns.includes(OPS.paintImageXObject) || fns.includes(OPS.paintInlineImageXObject),
      hasGraphics: fns.includes(OPS.constructPath) // 表格线框通常在这里
    };
  } catch (e) {
    return { hasImage: false, hasGraphics: false };
  }
}

/**
 * 核心：处理单页文本
 */
async function processPageText(page: any): Promise<string> {
  const textContent = await page.getTextContent();
  const viewport = page.getViewport({ scale: 1.0 });
  const pageWidth = viewport.width;
  const pageHeight = viewport.height;

  // 1. 数据清洗 & 坐标转换 (PDF坐标 -> Web坐标)
  let rawItems: TextBlock[] = textContent.items
    .filter((item: any) => item.str.trim().length > 0)
    .map((item: any) => ({
      str: item.str,
      // PDF y是从底部开始，转为从顶部开始
      x: item.transform[4],
      y: pageHeight - item.transform[5], 
      width: item.width,
      height: item.height || 10,
      hasEOL: item.hasEOL
    }));

  // 2. 过滤页眉页脚 (上下 5%)
  const headerLimit = pageHeight * 0.05;
  const footerLimit = pageHeight * 0.95;
  rawItems = rawItems.filter(i => i.y > headerLimit && i.y < footerLimit);

  // 3. 预合并字符 (解决 PDF.js 字符破碎)
  const mergedItems = mergeTextItems(rawItems);

  // 4. 分栏处理 (解决论文阅读顺序)
  const columns = splitIntoColumns(mergedItems, pageWidth);
  
  // 5. 视觉信号检测
  const visuals = await getVisualSignals(page);

  let fullPageText = "";

  // 依次处理每一栏
  for (const colItems of columns) {
    // 栏内排序：Y 轴为主
    colItems.sort((a, b) => {
      if (Math.abs(a.y - b.y) < 3) return a.x - b.x; // 同一行按X排
      return a.y - b.y;
    });

    let lastY = colItems[0]?.y || 0;
    let lastBottom = lastY + (colItems[0]?.height || 0);
    let currentLine: TextBlock[] = [];
    let colText = "";

    for (const item of colItems) {
      // 判定换行：Y 轴变化超过行高的一半
      const isNewLine = Math.abs(item.y - lastY) > (item.height * 0.5);

      if (isNewLine) {
        // --- 结算上一行 ---
        if (currentLine.length > 0) {
          // A. 表格检测逻辑
          // 如果一行内有多个块，且块之间间距较大，视为表格行
          let lineStr = "";
          let isTableCandidate = false;
          
          if (currentLine.length > 2) {
             // 检查平均间距
             let maxGap = 0;
             for(let k=0; k<currentLine.length-1; k++) {
                const gap = currentLine[k+1].x - (currentLine[k].x + currentLine[k].width);
                if (gap > 20) maxGap = gap;
             }
             if (maxGap > 20) isTableCandidate = true; // 存在大间隙
          }

          if (isTableCandidate) {
            // 强制转为 Markdown 表格行： | A | B | C |
            lineStr = "| " + currentLine.map(i => i.str).join(" | ") + " |";
          } else {
            // 普通文本，直接拼接
            lineStr = currentLine.map(i => i.str).join(" ");
          }
          
          colText += lineStr + "\n";
        }

        // --- 视觉间隙检测 ---
        // 如果垂直间距巨大，插入占位符
        const gapY = item.y - lastBottom;
        if (gapY > (item.height * 4) && (visuals.hasImage || visuals.hasGraphics)) {
           colText += "\n\n> [!VISUAL_CONTENT] Figure/Table/Formula Region Detected\n\n";
        } else if (gapY > item.height * 1.5) {
           colText += "\n"; // 普通段落空行
        }

        currentLine = [];
        lastY = item.y;
      }

      currentLine.push(item);
      lastBottom = Math.max(lastBottom, item.y + item.height);
    }
    
    // 结算栏内最后一行
    if (currentLine.length > 0) {
       colText += currentLine.map(i => i.str).join(" ") + "\n";
    }

    fullPageText += colText + "\n\n"; // 栏与栏之间换行
  }

  // 6. 后处理：修复单词断行 (Hyphenation)
  // e.g. "con- \n nection" -> "connection"
  fullPageText = fullPageText.replace(/(\w+)-\s*\n\s*(\w+)/g, '$1$2');

  return fullPageText;
}

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
      fullText += `\n\n--- Page ${i} ---\n\n${pageText}`;
    }

    return fullText;
  } catch (error) {
    console.error("PDF Extraction Error:", error);
    throw new Error("PDF Parsing Failed");
  }
};

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
    return "";
  }
};
