// services/ragService.ts

interface DocumentChunk {
  id: string;
  text: string;
  page: number;
}

export class MiniRAG {
  private chunks: DocumentChunk[] = [];
  
  // 简单的分词器 (支持中英文)
  private tokenize(text: string): string[] {
    return text.toLowerCase()
      .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "")
      .split(/\s+/)
      .filter(w => w.length > 2); // 过滤太短的词
  }

  // 1. 构建索引：将全文切分为块
  public ingest(fullText: string) {
    this.chunks = [];
    // 按页分割 (假设 extractTextFromPdf 返回格式包含 "--- Page X ---")
    const rawPages = fullText.split(/--- Page (\d+) ---/);
    
    // rawPages[0] 是空或前言，之后是 pageNum, content, pageNum, content...
    for (let i = 1; i < rawPages.length; i += 2) {
      const pageNum = parseInt(rawPages[i]);
      const content = rawPages[i+1];
      
      if (!content) continue;

      // 进一步按段落切分，每段大约 500 字符，保留重叠以保持上下文
      const paragraphs = content.split('\n\n').filter(p => p.trim().length > 50);
      
      paragraphs.forEach((para, idx) => {
        this.chunks.push({
          id: `p${pageNum}_${idx}`,
          text: para.trim(),
          page: pageNum
        });
      });
    }
    console.log(`[RAG] Ingested ${this.chunks.length} chunks.`);
  }

  // 2. 检索：找到与 Query 最相关的块
  public retrieve(query: string, topK: number = 3): string {
    if (this.chunks.length === 0) return "";

    const queryTokens = this.tokenize(query);
    if (queryTokens.length === 0) return "";

    const scores = this.chunks.map(chunk => {
      const chunkTokens = this.tokenize(chunk.text);
      let score = 0;
      
      // 简单的关键词重叠评分 (类似 BM25 的简化版)
      queryTokens.forEach(qToken => {
        if (chunkTokens.includes(qToken)) {
          // 词频加权：这里简化为出现即得分
          score += 1;
        }
      });
      
      return { chunk, score };
    });

    // 排序并取 TopK
    const topChunks = scores
      .sort((a, b) => b.score - a.score)
      .filter(item => item.score > 0)
      .slice(0, topK)
      .map(item => `[Page ${item.chunk.page}]: ${item.chunk.text}`);

    return topChunks.join("\n\n...\n\n");
  }
}

export const ragSystem = new MiniRAG();
