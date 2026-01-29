// api/proxy.js
export default async function handler(req, res) {
  // 1. CORS 配置 (保持不变)
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*'); 
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const TARGET_URL = "https://ag.beijixingxing.com/v1/chat/completions";

  // 2. 检查 Authorization 是否存在，防止报错
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: { message: "Missing Authorization header" } });
  }

  try {
    // 3. 发起请求
    const response = await fetch(TARGET_URL, {
      method: 'POST',
      headers: {
        "Content-Type": "application/json",
        "Authorization": authHeader,
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      },
      // 确保 req.body 存在，防止传空导致报错
      body: JSON.stringify(req.body || {})
    });

    // 4. 安全地处理返回结果 (防止非 JSON 响应导致崩溃)
    const text = await response.text(); 
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      console.error("Upstream returned non-JSON:", text);
      return res.status(502).json({ error: { message: "Upstream API returned invalid JSON", raw: text } });
    }

    if (!response.ok) {
      console.error("Upstream Error:", data);
      return res.status(response.status).json(data);
    }

    // ✅ 关键修复：这里必须要把数据返回给前端！
    return res.status(200).json(data);

  } catch (error) {
    console.error("Proxy Internal Error:", error);
    // 捕获所有代码层面的崩溃（如 fetch 失败）
    return res.status(500).json({ error: { message: "Proxy Internal Error", details: error.message } });
  }
}
