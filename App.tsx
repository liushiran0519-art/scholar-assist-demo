import { PaperSummary, PageTranslation, CitationInfo, ChatMessage } from "../types";

// ================= 配置区域 =================

// 1. 读取环境变量 (适配 Vercel 反代)
const API_KEY = import.meta.env.VITE_PROXY_API_KEY;

// 2. 指定模型名称
const MODEL_NAME = '[贩子死妈]gemini-3-flash-preview'; 

// ================= 工具函数 =================

/**
 * 🧹 强力清洗函数：专门对付话痨 AI
 * 无论 AI 在 JSON 前面加了多少废话，这个函数都能把 JSON 抠出来
 */
function cleanAndParseJson(text: string): any {
  if (!text) throw new Error("Empty response");

  // 1. 先把 Markdown 代码块标记去掉
  let clean = text.replace(/```json/g, '').replace(/```/g, '');
  
  // 2. 寻找最外层的 {} (最关键的一步)
  const firstOpen = clean.indexOf('{');
  const lastClose = clean.lastIndexOf('}');
  
  // 如果找不到括号，说明生成的根本不是 JSON
  if (firstOpen === -1 || lastClose === -1) {
      throw new Error("AI 未返回有效的 JSON 格式");
  }

  // 3. 只截取 { ... } 中间的部分
  const jsonStr = clean.substring(firstOpen, lastClose + 1);

  try {
    return JSON.parse(jsonStr);
  } catch (error) {
    console.error("JSON 解析失败，原始文本:", text);
    throw new Error("JSON 格式错误");
  }
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
    model: MODEL_NAME,
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
      throw new Error(`API Error ${response.status}: ${errData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    
    // 兼容性检查
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new Error("服务返回了空数据");
    }

    return data.choices[0].message.content;

  } catch (error) {
    console.error("Proxy Request Failed:", error);
    throw error;
  }
}

// ================= 核心业务函数 =================

/**
 * 1. 生成论文摘要
 */
export const generatePaperSummary = async (fullText: string): Promise<PaperSummary> => {
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
    // ✅ 使用强力解析
    return cleanAndParseJson(responseText) as PaperSummary;
  } catch (error) {
    console.error("Summary generation failed:", error);
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
 * 2. 翻译页面内容 (这里是刚才报错的地方！)
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
    // ✅ 关键修复：这里原来是 JSON.parse，现在换成 cleanAndParseJson
    const data = cleanAndParseJson(responseText);
    
    return {
      pageNumber: 0,
      blocks: data.blocks || [],
      glossary: data.glossary || []
    };
  } catch (error) {
    console.error("Translation failed:", error);
    // 返回一个优雅的错误提示块，而不是崩坏页面
    return {
      pageNumber: 0,
      blocks: [{ type: "paragraph", en: "Translation Error", cn: "喵呜！这页纸太难懂了，翻译魔法失效了... (解析错误)" }],
      glossary: []
    };
  }
};

/**
 * 3. 对话功能
 */
export const chatWithPaper = async (
  history: { role: 'user' | 'model'; text: string }[], 
  newMessage: string, 
  contextText: string
): Promise<string> => {
  
  const systemPrompt = `
    你是“Scholar Cat (学术猫)”。
    任务：基于提供的论文片段回答问题。
    风格：活泼可爱，句尾带 [=^..^=]。
  `;

  const messages = [
    { role: "system", content: systemPrompt },
    {
       role: "user",
       content: `Context (Paper content):\n${contextText.slice(0, 10000)}\n\nUser Question: ${newMessage}`
    },
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
 * 4. 引用分析
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
        // ✅ 使用强力解析
        return cleanAndParseJson(text);
    } catch (error) {
        return { id: citationId, title: "未知文献", year: "?", abstract: "无法提取", status: "SKIMMABLE" };
    }
};

/**
 * 5. 解释公式
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
