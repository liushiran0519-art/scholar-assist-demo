import { PaperSummary, PageTranslation, CitationInfo, ChatMessage } from "../types";

// ================= 配置区域 =================

// 1. 读取环境变量 (适配 Vercel 反代)
// 确保 .env 中有 VITE_PROXY_API_KEY
const API_KEY = import.meta.env.VITE_PROXY_API_KEY;

// 2. 指定模型名称
const MODEL_NAME = 'gemini-3-flash-preview-真流-[星星公益站-CLI渠道]'; 

// ================= 工具函数 =================

function cleanAndParseJson(text: string): any {
  if (!text) return null;

  try {
    // 1. 尝试直接解析
    return JSON.parse(text);
  } catch (e1) {
    // 2. 失败了，尝试清洗 Markdown
    let clean = text.replace(/```json/g, '').replace(/```/g, '');
    
    // 3. 寻找最外层的 {}
    const firstOpen = clean.indexOf('{');
    const lastClose = clean.lastIndexOf('}');
    
    if (firstOpen !== -1 && lastClose !== -1) {
      clean = clean.substring(firstOpen, lastClose + 1);
      try {
        return JSON.parse(clean);
      } catch (e2) {
        console.warn("二次 JSON 解析失败，尝试暴力修复...");
      }
    }
  }

  // 4. 如果所有解析都失败了（比如 AI 返回了纯文本），不要抛出错误让 App 崩溃
  // 而是伪造一个合法的 JSON 返回，把错误文本放进去显示给用户
  console.warn("AI 返回了非 JSON 格式:", text);
  return {
    raw_error: true, // 标记这是个错误数据
    blocks: [
      { 
        type: "paragraph", 
        en: text.slice(0, 500), // 截取一部分原文
        cn: "【AI 格式错误】AI 返回了非结构化数据，以上是其原始回复。" 
      }
    ],
    glossary: []
  };
}
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

export const generatePaperSummary = async (fullText: string): Promise<PaperSummary> => {
  // 🔽 修复 2：限制输入长度为 20k 字符，防止 API 报错或超时
  const truncatedText = fullText.slice(0, 20000);

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
    // 返回带有 ERROR tag 的对象，以便 UI 显示重试按钮
    return {
      title: "解读中断",
      tags: ["ERROR"], 
      tldr: { painPoint: "连接不稳定或文本过长", solution: "请点击下方重试", effect: "暂无数据" },
      methodology: [],
      takeaways: []
    };
  }
};

export const translatePageContent = async (pageText: string): Promise<PageTranslation> => {
  if (!pageText || pageText.trim().length < 10) {
     return {
       pageNumber: 0,
       blocks: [{ type: 'paragraph', en: '', cn: '此页面似乎为空白或只有图片。' }],
       glossary: []
     };
  }

  // 🔽 修复 4：Prompt 增加类型识别
  const prompt = `
    Task: Translate this academic paper page into Chinese.
    
    CRITICAL INSTRUCTION: 
    Break down the text into logical semantic blocks.
    Assign a "type" to each block from this list:
    - "title": Paper title (usually at the top of page 1).
    - "authors": List of author names/affiliations.
    - "abstract": The abstract section.
    - "heading": Section headers (e.g., "1. Introduction").
    - "equation": Math formulas (keep 'en' as original Latex/text, 'cn' as explanation).
    - "reference": Bibliography items.
    - "figure": Figure captions.
    - "paragraph": Normal body text.

    For each block provide:
    1. "en": The EXACT first 15-20 alphanumeric characters of the text (for search).
    2. "cn": High-quality academic Chinese translation.
    3. "type": One of the types above.

    Input Text:
    """
    ${pageText.slice(0, 8000)} 
    """

    Return strict JSON:
    {
      "blocks": [
        { "type": "paragraph", "en": "start...", "cn": "..." }
      ],
      "glossary": [
        { "term": "Term", "definition": "Definition" }
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
      blocks: [{ type: "paragraph", en: "Error", cn: "翻译失败，请重试。" }],
      glossary: []
    };
  }
};

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
