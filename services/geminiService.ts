import { PaperSummary, PageTranslation, CitationInfo, ChatMessage } from "../types";

// ================= 配置区域 =================

// 1. 读取环境变量 (适配 Vercel 反代)
const API_KEY = import.meta.env.VITE_PROXY_API_KEY;

// 2. 指定模型名称 (按你要求)
const MODEL_NAME = '[贩子死妈]gemini-3-flash-preview'; 

// ================= 工具函数 =================

/**
 * 清洗 JSON 字符串 (去除 Markdown 代码块，防止 JSON.parse 报错)
 */
function cleanJson(text: string): string {
  if (!text) return "{}";
  return text.replace(/```json/g, '').replace(/```/g, '').trim();
}

/**
 * 通用 Fetch 请求封装 (指向 /api/proxy)
 */
async function callProxyApi(messages: any[], jsonMode = false) {
  if (!API_KEY) {
    console.error("❌ 反代配置缺失！请在 .env 中设置 VITE_PROXY_API_KEY");
    throw new Error("API Key missing");
  }

  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${API_KEY}`
  };

  const body: any = {
    model: MODEL_NAME, // 使用指定模型
    messages: messages,
    stream: false,
    temperature: 0.7
  };

  // 如果需要强制 JSON 输出
  if (jsonMode) {
    body.response_format = { type: "json_object" };
  }

  try {
    // 强制指向 Vercel 本地反代路径
    const response = await fetch('/api/proxy', {
      method: "POST",
      headers: headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      // 抛出错误供前端捕获
      throw new Error(`API Error ${response.status}: ${errData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    
    // 兼容性检查：防止空返回
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new Error("服务返回了空数据");
    }

    return data.choices[0].message.content;

  } catch (error) {
    console.error("Proxy Request Failed:", error);
    throw error;
  }
}

// ================= 核心业务函数 (纯文本省钱版) =================

/**
 * 1. 生成论文摘要 (基于纯文本)
 */
export const generatePaperSummary = async (fullText: string): Promise<PaperSummary> => {
  // 截取前 30k 字符，既省钱又能覆盖大部分论文核心
  const truncatedText = fullText.slice(0, 30000);

  const prompt = `
    Role: You are the pixel library guardian "Scholar Cat" (学术猫).
    Task: Analyze this academic paper text and generate a structured summary.
    
    Text Input (Excerpt): 
    "${truncatedText}"
    
    Return a JSON object in CHINESE (简体中文) with the following structure:
    {
      "title": "Translated title",
      "tags": ["tag1", "tag2", "tag3"],
      "tldr": { 
        "painPoint": "what problem (metaphor)", 
        "solution": "what method", 
        "effect": "result" 
      },
      "methodology": [
        { "step": "Step Name", "desc": "Description" }
      ],
      "takeaways": ["insight 1", "insight 2"]
    }
  `;

  try {
    const responseText = await callProxyApi([{ role: "user", content: prompt }], true);
    return JSON.parse(cleanJson(responseText)) as PaperSummary;
  } catch (error) {
    console.error("Summary generation failed:", error);
    // 返回兜底数据
    return {
      title: "解读中断",
      tags: ["系统维护中"],
      tldr: { painPoint: "连接不稳定", solution: "请重试", effect: "暂无数据" },
      methodology: [],
      takeaways: []
    };
  }
};

/**
 * 2. 翻译页面内容 (基于纯文本)
 */
export const translatePageContent = async (pageText: string): Promise<PageTranslation> => {
  if (!pageText || pageText.trim().length < 10) {
     return {
       pageNumber: 0,
       blocks: [{ type: 'paragraph', en: '', cn: '此页面似乎为空白或只有图片。' }],
       glossary: []
     };
  }

  const prompt = `
    Analyze this page text of an academic paper.
    1. Identify main content blocks.
    2. Translate them into academic Chinese.
    3. Identify key terms for glossary.

    Input Text:
    """
    ${pageText.slice(0, 5000)}
    """

    Return JSON format:
    {
      "blocks": [
        { "type": "paragraph|heading|list", "en": "original text", "cn": "translated text" }
      ],
      "glossary": [
        { "term": "Term", "definition": "Chinese Definition" }
      ]
    }
  `;

  try {
    const responseText = await callProxyApi([{ role: "user", content: prompt }], true);
    const data = JSON.parse(cleanJson(responseText));
    
    return {
      pageNumber: 0,
      blocks: data.blocks || [],
      glossary: data.glossary || []
    };
  } catch (error) {
    console.error("Translation failed:", error);
    return {
      pageNumber: 0,
      blocks: [{ type: "paragraph", en: "Error", cn: "翻译服务暂不可用，请稍后重试。" }],
      glossary: []
    };
  }
};

/**
 * 3. 对话功能 (带历史记录 + 上下文)
 */
export const chatWithPaper = async (
  history: { role: 'user' | 'model'; text: string }[], 
  newMessage: string, 
  contextText: string // 传入纯文本上下文
): Promise<string> => {
  
  const systemPrompt = `
    你是“Scholar Cat (学术猫)”。
    任务：基于提供的论文片段回答问题。
    风格：活泼可爱，句尾带 [=^..^=]。
  `;

  // 构造消息
  const messages = [
    { role: "system", content: systemPrompt },
    {
       role: "user",
       // 将上下文作为背景知识发给 AI
       content: `Context (Paper content):\n${contextText.slice(0, 10000)}\n\nUser Question: ${newMessage}`
    },
    // 历史记录 (只取最近几条以节省 Token，这里由调用方控制或 slice)
    ...history.slice(-4).map(h => ({
      role: h.role === 'model' ? 'assistant' : 'user',
      content: h.text
    }))
  ];

  try {
    return await callProxyApi(messages, false);
  } catch (error) {
    return "喵呜！魔法连接断开了... 请稍后再试 [=T_T=]";
  }
};

/**
 * 4. 引用分析 (纯文本版)
 */
export const analyzeCitation = async (citationId: string, contextText: string): Promise<CitationInfo> => {
    const prompt = `
        Find the citation labelled "${citationId}" in the text below. 
        Extract Title, Year, and infer Context. 
        Decide if it is "MUST_READ" or "SKIMMABLE".
        
        Text:
        ${contextText.slice(0, 5000)}
        
        Return JSON: { "id", "title", "year", "abstract", "status" }
    `;

    try {
        const text = await callProxyApi([{ role: "user", content: prompt }], true);
        return JSON.parse(cleanJson(text));
    } catch (error) {
        return { id: citationId, title: "未知文献", year: "?", abstract: "无法提取", status: "SKIMMABLE" };
    }
};

/**
 * 5. 解释公式 (纯文本版)
 */
export const explainEquation = async (equationText: string): Promise<string> => {
    try {
        const text = await callProxyApi([
            { role: "user", content: `Explain this equation in simple Chinese: ${equationText}` }
        ], false);
        return text;
    } catch (error) {
        return "无法解释此公式。";
    }
};

/**
 * 6. 划词翻译
 */
export const translateSelection = async (text: string): Promise<string> => {
    try {
        return await callProxyApi([
            { role: "system", content: "Translate to Chinese. Concise." },
            { role: "user", content: text }
        ], false);
    } catch (error) {
        return "翻译失败";
    }
};
