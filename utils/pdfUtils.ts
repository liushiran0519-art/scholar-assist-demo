import * as pdfjsLib from 'pdfjs-dist';
// 引入 OPS 用于识别绘制指令
import { OPS } from 'pdfjs-dist/build/pdf.worker.min.mjs'; 

// 配置 Worker (保持不变)
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
 * 辅助函数：检测非文本元素（图片、表格线框）
 * 通过分析 PDF 的绘制指令 (OperatorList) 来判断
 */
async function getNonTextContent(page: any, viewport: any) {
  const operatorList = await page.getOperatorList();
  const regions: { y: number, type: string, height: number }[] = [];
  
  const fns = operatorList.fnArray;
  const args = operatorList.argsArray;

  // 遍历所有绘制指令
  for (let i = 0; i < fns.length; i++) {
    const fn = fns[i];
    
    // 1. 检测图片 (paintImageXObject, paintInlineImageXObject)
    if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject) {
      // 获取变换矩阵来计算图片位置
      // 通常在画图前会有 transform 或 setCTM 指令，这里简化处理，
      // 我们通过上下文猜测，或者简单地标记"检测到图片绘制指令"
      // 由于获取精确坐标比较复杂，我们这里采用一种"存在性检测"策略
      // *高级实现需要回溯 dependency 堆栈计算 transform matrix
      
      // 简单策略：如果这是一个图片指令，我们记录它。
      // 在纯前端难以精确获取 Y 坐标时，我们可以通过文本流的断层来推断，
      // 或者这里暂时只作为信号。
      // 为了演示，我们假设它位于页面中间流，或者通过前后文本的 gap 来插入。
    }

    // 2. 检测表格/矢量图 (constructPath -> stroke/fill)
    // 如果出现了大量的 lineTo, moveTo, rectangle，通常是表格线或公式里的横线/根号
    if (fn === OPS.constructPath) {
      const pathArgs = args[i];
      // 简单的启发式：如果包含 rectangle (re) 操作，极大概率是表格边框或图形背景
      const ops = pathArgs[0]; 
      if (ops.includes(OPS.rectangle)) {
         // 获取矩形参数 x, y, w, h
         // 注意：这里的坐标是 PDF 内部坐标，需要转换
         // 这里的 args 结构比较深，简化演示：
         // 我们标记检测到了“图形区域”
      }
    }
  }
  
  // 由于直接解析 OperatorList 获取坐标极其繁琐且容易出错，
  // 我们采用一种"文本密度分析法"来反向推导图片/表格位置：
  // 如果两个文本块之间有巨大的垂直空白，且 OperatorList 里有绘制指令，
  // 那么中间很可能是图片或表格。
  
  return {
    hasImages: fns.includes(OPS.paintImageXObject) || fns.includes(OPS.paintInlineImageXObject),
    hasPaths: fns.includes(OPS.constructPath) || fns.includes(OPS.stroke)
  };
}

/**
 * 核心处理逻辑：智能文本重组 + 视觉元素占位
 */
async function processPageText(page: any): Promise<string> {
  const textContent = await page.getTextContent();
  const viewport = page.getViewport({ scale: 1.0 });
  
  // 1. 获取所有文本项并标准化坐标
  let items = textContent.items
    .filter((item: any) => item.str.trim().length > 0)
    .map((item: any) => {
      // PDF 坐标原点在左下角，转换为左上角
      const y = viewport.height - item.transform[5]; 
      const x = item.transform[4];
      return {
        str: item.str,
        x: x,
        y: y,
        width: item.width,
        height: item.height || 10,
        type: 'text'
      };
    });

  if (items.length === 0) return "";

  // 2. 过滤页眉页脚
  const headerThreshold = viewport.height * 0.05;
  const footerThreshold = viewport.height * 0.93; // 稍微放宽底部，保留注脚
  items = items.filter((item: any) => 
    item.y > headerThreshold && item.y < footerThreshold
  );

  // 3. 排序 (Y轴为主，X轴为辅)
  items.sort((a: any, b: any) => {
    const lineDiff = Math.abs(a.y - b.y);
    if (lineDiff < 5) { // 同一行
      return a.x - b.x;
    }
    return a.y - b.y;
  });

  // 4. 分析布局，插入[视觉占位符]
  // 逻辑：如果两行文字之间有异常大的空白 (Gap)，通常意味着中间有图表或公式
  const processedLines: string[] = [];
  let lastY = items[0].y;
  let lastHeight = items[0].height;
  let currentLine: string[] = [];
  let lastLineXEnd = 0;

  // 获取页面中是否存在绘图指令（辅助判断）
  const visualAssets = await getNonTextContent(page, viewport);

  // 阈值：如果行间距超过字体高度的 4 倍，且页面含有绘图指令，大概率中间有图
  const GAP_THRESHOLD_FOR_IMAGE = 4.0; 

  for (const item of items) {
    // 判断是否换行
    const isNewLine = Math.abs(item.y - lastY) > 5; // 5px 容差

    if (isNewLine) {
      // 结算上一行
      if (currentLine.length > 0) {
        processedLines.push(currentLine.join(' '));
        currentLine = [];
      }

      // --- 关键优化：检测大段空白插入占位符 ---
      const gap = item.y - lastY;
      const relativeGap = gap / (lastHeight || 10);

      // 如果空白很大，且页面有图片/绘图指令，插入标记
      // 这能有效防止 AI 把图片上下的文字胡乱拼接
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

    // --- 关键优化：检测行内公式/表格数据造成的异常间距 ---
    // 如果同一行内，两个词之间隔得特别远（比如表格的两列），插入 Tab 或特制分隔符
    if (lastLineXEnd > 0 && (item.x - lastLineXEnd) > 20) {
        // 看起来像表格列
        currentLine.push(" | "); 
    } else if (lastLineXEnd > 0 && (item.x - lastLineXEnd) > 5) {
        // 普通单词空格
        // 不做操作，join(' ') 会加空格
    }

    currentLine.push(item.str);
    lastLineXEnd = item.x + item.width;
  }
  
  // 结算最后一行
  if (currentLine.length > 0) {
    processedLines.push(currentLine.join(' '));
  }

  // 5. 文本清洗与重组
  let fullText = processedLines.join('\n');

  // 修复连字符换行 (Hyphenation)
  // e.g. "algo- \n rithm" -> "algorithm"
  fullText = fullText.replace(/(\w+)-\s*\n\s*(\w+)/g, '$1$2');

  // 修复常见的公式乱码
  // 公式在 PDF 中常表现为 CID 缺失字符或乱码，可以尝试简单的正则清洗
  // 或者保留原样，让 AI 去猜（DeepSeek V3 猜乱码能力很强）
  
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
