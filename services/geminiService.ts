import { PaperSummary, PageTranslation, CitationInfo, ChatMessage } from "../types";

// ================= 配置区域 =================
// ⚠️ 按照要求保留了特定的模型名称
const SUMMARY_MODEL = '[贩子死妈]gemini-3-flash-preview'; 
const TRANSLATION_MODEL = '[尝尝我的大香蕉]gemini-3-pro-image-preview'; 
const CHAT_MODEL = '[贩子死妈]gemini-3-flash-preview'; 

const API_KEY = import.meta.env.VITE_PROXY_API_KEY;

// ================= 工具函数 =================

/**
 * 通用 Fetch 请求封装 (OpenAI 兼容格式)
 */
async function callProxyApi(messages: any[], model: string, jsonMode = false) {
  if (!API_KEY) {
    console.error("❌ 反代配置缺失！请在 .env 中设置 VITE_PROXY_API_KEY");
    throw new Error("API Key missing");
  }

  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${API_KEY}`
  };

  const body: any = {
    model: model,
    messages: messages,
    stream: false,
    temperature: 0.7
  };

  // 如果需要强制 JSON 输出
  if (jsonMode) {
    body.response_format = { type: "json_object" };
  }

  try {
    // 强制指向我们配置好的 Vercel 反代函数
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

/**
 * 清洗 JSON 字符串 (去除 Markdown 代码块，防止 JSON.parse 报错)
 */
function cleanJson(text: string): string {
  if (!text) return "{}";
  return text.replace(/```json/g, '').replace(/```/g, '').trim();
}

// ================= 核心业务函数 =================

export const generatePaperSummary = async (text: string): Promise<PaperSummary> => {
  // Optimization: Truncate text
  const truncatedText = text.slice(0, 30000); 

  const prompt = `
    Analyze this academic paper text and generate a structured summary.
    
    Text (First ~30k chars): ${truncatedText}
    
    Return a JSON object in CHINESE (简体中文) with the following structure:
    {
      "title": "Translated title",
      "tags": ["tag1", "tag2", "tag3"],
      "tldr": { 
        "painPoint": "what problem", 
        "solution": "what method", 
        "effect": "result" 
      },
      "methodology": ["step 1", "step 2"],
      "takeaways": ["insight 1", "insight 2"]
    }
    
    IMPORTANT: Output strictly valid JSON only. No markdown formatting.
  `;

  const messages = [{ role: "user", content: prompt }];

  try {
    const responseText = await callProxyApi(messages, SUMMARY_MODEL, true);
    return JSON.parse(cleanJson(responseText)) as PaperSummary;
  } catch (error) {
    console.error("Summary generation failed:", error);
    throw new Error("Summary generation failed");
  }
};

export const translatePageContent = async (imageBase64: string): Promise<PageTranslation> => {
  const prompt = `
    Analyze this page of an academic paper.
    1. Identify main content blocks (paragraphs, headings).
    2. Translate them into academic Chinese.
    3. Identify 2-3 key technical terms for a glossary.

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

  // 构造 OpenAI 风格的多模态请求
  const messages = [
    {
      role: "user",
      content: [
        { type: "text", text: prompt },
        {
          type: "image_url",
          image_url: {
            url: `data:image/jpeg;base64,${imageBase64}`
          }
        }
      ]
    }
  ];

  try {
    const responseText = await callProxyApi(messages, TRANSLATION_MODEL, true);
    const data = JSON.parse(cleanJson(responseText));
    
    return {
      pageNumber: 0,
      blocks: data.blocks || [],
      glossary: data.glossary || []
    };
  } catch (error) {
    console.error("Translation failed:", error);
    throw new Error("Translation failed");
  }
};

export const chatWithPaper = async (
  history: { role: 'user' | 'model'; text: string }[], 
  newMessage: string, 
  fileBase64: string, 
  mimeType: string
): Promise<string> => {
  
  const systemPrompt = "You are an expert academic assistant. Answer questions based on the provided paper. Keep answers concise and helpful. Use Chinese.";

  // 构造消息历史
  // 注意：将 PDF 上下文作为第一条用户消息发送
  const messages = [
    { role: "system", content: systemPrompt },
    {
       role: "user",
       content: [
         { type: "text", text: "This is the paper we are discussing. Please read it carefully." },
         // 这里的 fileBase64 应该是 PDF 的文本内容或者第一页截图，
         // 如果传的是纯文本，应该用 text 字段；如果是图片，用 image_url。
         // 假设为了兼容性，这里我们尽量传文本内容 (在调用前已提取)
         // 或者如果是反代支持 GPT-4V 格式，可以传 image_url
         { 
            type: "text", 
            text: fileBase64.startsWith('data:') ? "[Image attached]" : `Paper Content: ${fileBase64.slice(0, 50000)}...` 
         }
       ]
    },
    ...history.map(h => ({
      role: h.role === 'model' ? 'assistant' : 'user', // OpenAI use 'assistant'
      content: h.text
    })),
    { role: "user", content: newMessage }
  ];

  try {
    return await callProxyApi(messages, CHAT_MODEL, false);
  } catch (error) {
    return "Thinking... (Connection unstable)";
  }
};

export const analyzeCitation = async (citationId: string, fileBase64: string, mimeType: string): Promise<CitationInfo> => {
    const prompt = `
        Find the citation/reference labelled "${citationId}" in this paper. 
        Extract its Title, Year, and infer an Abstract or Context. 
        Decide if it is "MUST_READ" (critical to methodology) or "SKIMMABLE".
        
        Return JSON:
        {
            "id": "${citationId}",
            "title": "...",
            "year": "...",
            "abstract": "...",
            "status": "MUST_READ"
        }
    `;

    const messages = [
        {
            role: "user",
            content: [
                { type: "text", text: prompt },
                // 假设 fileBase64 是当前页面的截图或者相关文本
                { type: "text", text: `Context: ${fileBase64.slice(0, 10000)}` } 
            ]
        }
    ];

    try {
        const text = await callProxyApi(messages, CHAT_MODEL, true);
        return JSON.parse(cleanJson(text));
    } catch (error) {
        throw new Error("Citation analysis failed");
    }
};

export const explainEquation = async (equationImageOrText: string): Promise<string> => {
    const messages = [
        { 
            role: "user", 
            content: `Explain this equation/formula in simple terms for a grad student: ${equationImageOrText}` 
        }
    ];
    
    try {
        const text = await callProxyApi(messages, CHAT_MODEL, false);
        return text || "Could not explain.";
    } catch (error) {
        return "Could not explain.";
    }
};
