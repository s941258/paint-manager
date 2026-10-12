exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { prompt, inventory } = JSON.parse(event.body);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        system: '你是模型漆料上色規劃專家，用戶使用九五二漆(9527)、Vallejo Mecha Color 和 MODO 水性漆，主要做鋼彈模型。根據用戶提供的庫存和模型名稱，幫他規劃完整的上色方案。請用繁體中文回答，以 JSON 格式輸出，格式如下：{"steps":[{"step":1,"title":"步驟名稱","method":"噴塗或筆塗","paints":[{"part":"部位","name":"漆料名稱","code":"色號","role":"用途","note":"備注"}]}]}。只使用庫存中有的漆料（qty > 0），若庫存不足請在 note 標註「建議補購」。',
        messages: [{
          role: 'user',
          content: `模型：${prompt}\n\n現有庫存（qty > 0 才有庫存）：\n${inventory}`
        }]
      })
    });

    const data = await response.json();
    const text = data.content?.[0]?.text || '{}';

    // 嘗試解析 JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const result = jsonMatch ? JSON.parse(jsonMatch[0]) : { steps: [] };

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(result)
    };
  } catch(e) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: e.message })
    };
  }
};
