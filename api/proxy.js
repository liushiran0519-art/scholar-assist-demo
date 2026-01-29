// api/proxy.js
export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  // 1. 打印请求方法
  console.log(`[Proxy] Received ${req.method} request`);

  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  try {
    const body = await req.json();
    
    // 2. 确定上游地址
    let baseUrl = process.env.VITE_PROXY_BASE_URL;
    if (!baseUrl) {
      throw new Error("❌ VITE_PROXY_BASE_URL 环境变量未设置！");
    }
    // 去除末尾斜杠
    if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
    
    // 拼接完整 URL
    const targetUrl = `${baseUrl}/chat/completions`;

    // 3. 打印关键调试信息 (在 Vercel 后台 Logs 或本地终端可见)
    console.log(`[Proxy] 🎯 Target URL: ${targetUrl}`);
    console.log(`[Proxy] 🤖 Model: ${body.model}`);

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': req.headers.get('Authorization'), // 透传 Key
      },
      body: JSON.stringify(body),
    });

    // 4. 如果上游报错，打印出来
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Proxy] ❌ Upstream Error ${response.status}:`, errorText);
      return new Response(errorText, {
        status: response.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const data = await response.json();
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*' 
      },
    });

  } catch (error) {
    console.error("[Proxy] 🔥 Internal Error:", error);
    return new Response(JSON.stringify({ error: { message: error.message } }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
