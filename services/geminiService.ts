import { PaperSummary, PageTranslation, CitationInfo, ChatMessage } from "../types";

// ================= 配置区域 =================
const API_KEY = import.meta.env.VITE_PROXY_API_KEY;
const MODEL_NAME = 'gemini-3-flash-high-真流-[星星公益站-CLI渠道]'; // 建议使用最新快模型

// ================= 工具函数 =================

/**
 * 核心修复：定义 cleanJson 函数
 * 作用：去除 AI 返回的 Markdown 代码块标记，提取纯 JSON 字符串
 */
function cleanJson(text: string): string {
  if (!text) return "{}";
  
  // 1. 去除 Markdown 标记
  let clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
  
  // 2. 尝试提取第一个 { 到最后一个 } 之间的内容
  const firstOpen = clean.indexOf('{');
  const lastClose = clean.lastIndexOf('}');
  
  if (firstOpen !== -1 && lastClose !== -1) {
    clean = clean.substring(firstOpen, lastClose + 1);
  }
  
  return clean;
}

async function callProxyApi(messages: any[], jsonMode = false) {
  if (!API_KEY) throw new Error("API Key missing");

  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${API_KEY}`
  };

  const body: any = {
    model: MODEL_NAME,
    messages: messages,
    stream: false,
    temperature: 0.3 // 降低随机性，提高 JSON 稳定性
  };

  if (jsonMode) {
    body.response_format = { type: "json_object" };
  }

  try {
    const response = await fetch('/api/proxy', {
      method: "POST",
      headers: headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
        // 尝试读取错误信息
        const errText = await response.text();
        throw new Error(`API Error ${response.status}: ${errText}`);
    }

    const data = await response.json();
    if (!data.choices?.[0]?.message?.content) {
        throw new Error("Empty response from AI");
    }
    return data.choices[0].message.content;

  } catch (error) {
    console.error("Proxy Request Failed:", error);
    throw error;
  }
}
export const extractGlossary = async (firstPageText: string): Promise<{term: string, definition: string}[]> => {
  const prompt = `
    Analyze the following academic text (first page). 
    Identify 5-10 key technical terms or acronyms specific to this paper.
    Return JSON: { "glossary": [{ "term": "Term", "definition": "Brief Chinese explanation" }] }
    Input:
    ${firstPageText.slice(0, 3000)}
  `;
  try {
    const text = await callProxyApi([{ role: "user", content: prompt }], true);
    const json = JSON.parse(cleanJson(text));
    return json.glossary || [];
  } catch (e) {
    console.error("Glossary extraction failed", e);
    return [];
  }
};

// 新增：流式聊天 (Generator)
export async function* chatWithPaperStream(
  history: { role: 'user' | 'model'; text: string }[], 
  newMessage: string, 
  ragContext: string // 传入 RAG 检索到的上下文
): AsyncGenerator<string, void, unknown> {
  
  const API_KEY = import.meta.env.VITE_PROXY_API_KEY;
  // const MODEL_NAME = 'gemini-1.5-flash'; // 确保使用支持流式的模型
  
  // 构造增强的 Prompt
  const systemPrompt = `You are Scholar Cat. Answer the user's question based strictly on the provided Context.
  If the answer is not in the context, say "文中未提及".
  End your answer with "喵~".`;

  const userContent = `
  Context (Retrieved from paper):
  ${ragContext}

  User Question: ${newMessage}
  `;

  const messages = [
    { role: "system", content: systemPrompt },
    ...history.slice(-4).map(h => ({ role: h.role === 'model' ? 'assistant' : 'user', content: h.text })),
    { role: "user", content: userContent }
  ];

  try {
    const response = await fetch('/api/proxy', {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: "gemini-1.5-flash", // 或 deepseek-chat
        messages: messages,
        stream: true // ✅ 开启流式
      })
    });

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    if (!reader) throw new Error("No reader");

    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value, { stream: true });
      // 处理 SSE 格式 (data: {...})
      // 注意：具体的解析逻辑取决于您的 Proxy/LLM 接口返回格式
      // 这里假设是标准的 OpenAI 格式
      const lines = (buffer + chunk).split('\n');
      buffer = lines.pop() || ""; // 保留未完成的行

      for (const line of lines) {
        if (line.trim() === 'data: [DONE]') return;
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            const content = data.choices[0]?.delta?.content || "";
            if (content) yield content;
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
    }
  } catch (error) {
    console.error("Stream Error:", error);
    yield "网络连接中断 (Stream Error)";
  }
}
// ================= 核心业务函数 =================

export const generatePaperSummary = async (fullText: string): Promise<PaperSummary> => {
  const truncatedText = fullText.slice(0, 25000); // 适度增加长度限制

  const prompt = `
    Role: You are "Scholar Cat". Analyze this paper.
    Input: "${truncatedText}..."
    
    Return JSON (Chinese):
    {
      "title": "Title",
      "tags": ["Tag1", "Tag2"],
      "tldr": { "painPoint": "Problem", "solution": "Method", "effect": "Result" },
      "methodology": [{ "step": "Step 1", "desc": "Detail" }],
      "takeaways": ["Point 1", "Point 2"]
    }
  `;

  try {
    const responseText = await callProxyApi([{ role: "user", content: prompt }], true);
    // ✅ 修复点：调用 cleanJson 清洗后再 parse
    return JSON.parse(cleanJson(responseText)) as PaperSummary;
  } catch (error) {
    console.error("Summary failed:", error);
    return {
      title: "解读失败",
      tags: ["ERROR"], 
      tldr: { painPoint: "连接中断", solution: "请点击重试", effect: "无数据" },
      methodology: [],
      takeaways: []
    };
  }
};

export const translatePageContent = async (pageText: string): Promise<PageTranslation> => {
  if (!pageText || pageText.length < 20) {
     return { pageNumber: 0, blocks: [], glossary: [] };
  }

  // 🔴 修复：修改 Requirement 2，要求返回完整原文，而不是前20个字符
  const prompt = `
    Task: Translate academic paper text to Chinese.
    Output JSON format only.
    
    Requirements:
    1. Break text into logical blocks (paragraph, heading, equation, etc).
    2. 'en': The COMPLETE original English text of the block (do not truncate, needed for full highlighting).
    3. 'cn': Academic Chinese translation.
    
    Input:
    """
    ${pageText.slice(0, 6000)}
    """

    JSON Structure:
    {
      "blocks": [
        { "type": "paragraph", "en": "The complete original English text of the paragraph...", "cn": "翻译内容..." }
      ],
      "glossary": [{ "term": "English Term", "definition": "Chinese Explanation" }]
    }
  `;

  try {
    const responseText = await callProxyApi([{ role: "user", content: prompt }], true);
    // ✅ 修复点：调用 cleanJson
    const data = JSON.parse(cleanJson(responseText));
    
    return {
      pageNumber: 0,
      blocks: data.blocks || [],
      glossary: data.glossary || []
    };
  } catch (error) {
    console.error("Trans failed:", error);
    return {
      pageNumber: 0,
      blocks: [{ type: "paragraph", en: "Error", cn: "AI 解析失败，请点击右上角重新施法。" }],
      glossary: []
    };
  }
};

export const chatWithPaper = async (
  history: { role: 'user' | 'model'; text: string }[], 
  newMessage: string, 
  contextText: string
): Promise<string> => {
  const messages = [
    { role: "system", content: "你是学术猫。基于论文片段回答问题，答案需引用原文依据。结束语带上 '喵~'。" },
    { role: "user", content: `Context:\n${contextText.slice(0, 8000)}\n\nQuestion: ${newMessage}` },
    ...history.slice(-4).map(h => ({ role: h.role === 'model' ? 'assistant' : 'user', content: h.text }))
  ];
  try {
    return await callProxyApi(messages, false);
  } catch (error) {
    return "网络连接不稳定，请稍后再试喵... [Connection Error]";
  }
};

export const analyzeCitation = async (citationId: string, contextText: string): Promise<CitationInfo> => {
    const prompt = `Find citation "${citationId}" in text. Return JSON: { "id", "title", "year", "abstract", "status": "MUST_READ"|"SKIMMABLE" }`;
    try {
        const text = await callProxyApi([{ role: "user", content: prompt + `\n\nText: ${contextText.slice(0,4000)}` }], true);
        // ✅ 修复点
        return JSON.parse(cleanJson(text));
    } catch (e) {
        return { id: citationId, title: "查询失败", year: "-", abstract: "无法提取信息", status: "SKIMMABLE" };
    }
};

export const explainEquation = async (eq: string): Promise<string> => {
    try {
        return await callProxyApi([{ role: "user", content: `Explain equation in Chinese: ${eq}` }], false);
    } catch (e) { return "解析失败"; }
};

export const translateSelection = async (text: string): Promise<string> => {
    try {
        return await callProxyApi([{ role: "user", content: `Translate to Chinese: ${text}` }], false);
    } catch (e) { return "翻译失败"; }
};
