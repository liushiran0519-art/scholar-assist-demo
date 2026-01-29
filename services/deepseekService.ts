const API_KEY = import.meta.env.VITE_DEEPSEEK_API_KEY;
const API_URL = "https://api.deepseek.com/chat/completions";

export async function chatWithDeepSeek(message: string) {
  if (!API_KEY) {
    throw new Error("DeepSeek API Key is missing");
  }

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: "deepseek-chat", // 或者 "deepseek-reasoner" (R1版)
        messages: [
          { role: "system", content: "You are a helpful scholar assistant." },
          { role: "user", content: message }
        ],
        stream: false // 如果你想做打字机效果，这里要改 true，处理会复杂一点
      })
    });

    const data = await response.json();
    
    // 返回 AI 的回复内容
    return data.choices[0].message.content;

  } catch (error) {
    console.error("DeepSeek API Error:", error);
    return "Sorry, something went wrong with DeepSeek.";
  }
}