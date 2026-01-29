import * as pdfjsLib from 'pdfjs-dist';

// 设置 worker (如果你用的是 react-pdf，通常不需要这一步，或者指向 public 下的 worker)
// pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

/**
 * 从 PDF Base64 中提取所有页面的纯文本
 */
export const extractTextFromPdf = async (base64Data: string): Promise<string> => {
  try {
    // 1. 去掉 data:application/pdf;base64, 前缀
    const cleanBase64 = base64Data.replace(/^data:application\/pdf;base64,/, "");
    
    // 2. 将 Base64 解码为二进制数据
    const binaryString = window.atob(cleanBase64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // 3. 加载 PDF 文档
    const loadingTask = pdfjsLib.getDocument({ data: bytes });
    const pdf = await loadingTask.promise;

    let fullText = "";

    // 4. 循环遍历每一页提取文字
    // 为了防止太慢，可以限制只读前 20 页 (一般论文也就这么长)
    const maxPages = Math.min(pdf.numPages, 20); 
    
    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(" ");
      fullText += `--- Page ${i} ---\n${pageText}\n\n`;
    }

    return fullText;
  } catch (error) {
    console.error("PDF 文本提取失败:", error);
    throw new Error("无法读取 PDF 内容，请确保文件未加密");
  }
};
