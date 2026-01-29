import * as pdfjsLib from 'pdfjs-dist';

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

// 获取整个 PDF 文本（用于摘要）
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
    // 限制前 15 页用于摘要，避免 Token 爆炸
    const maxPages = Math.min(pdf.numPages, 15); 

    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ');
      fullText += `--- Page ${i} ---\n${pageText}\n\n`;
    }

    return fullText;
  } catch (error) {
    console.error("PDF Text Extraction Error:", error);
    throw new Error("Failed to extract text from PDF");
  }
};

// [新增] 获取指定单页的文本（用于页面翻译）
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
    const textContent = await page.getTextContent();
    
    // 简单的文本拼接，后续可以做更复杂的布局分析优化
    return textContent.items.map((item: any) => item.str).join(' ');
  } catch (error) {
    console.error(`Page ${pageNumber} Text Extraction Error:`, error);
    return "";
  }
};
