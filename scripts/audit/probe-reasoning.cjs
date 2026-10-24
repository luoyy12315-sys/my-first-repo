const Database = require('better-sqlite3');
const db = new Database('data/lumina.db', { readonly: true });
const row = db.prepare("select value from settings where key='ai_config'").get();
const cfg = JSON.parse(row.value);
const body = {
  model: cfg.model,
  messages: [
    { role: 'system', content: '你是导师。' },
    { role: 'user', content: '画一张 5 天的 K 线图示例，展示开盘、最高、最低、收盘。' },
  ],
  max_tokens: 4000,
  temperature: 0.6,
  stream: true,
  stream_options: { include_usage: true },
};
(async () => {
  const res = await fetch(cfg.baseUrl.replace(/\/+$/, '') + '/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + cfg.apiKey },
    body: JSON.stringify(body),
  });
  if (!res.ok) { console.log('HTTP', res.status, (await res.text()).slice(0, 300)); process.exit(0); }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '', contentLen = 0, reasoningLen = 0, finish = null, usage = null;
  const deltaKeys = new Set();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const d = line.slice(5).trim();
      if (d === '[DONE]') continue;
      let j; try { j = JSON.parse(d); } catch { continue; }
      if (j.usage) usage = j.usage;
      const ch = j.choices?.[0];
      if (!ch) continue;
      if (ch.finish_reason) finish = ch.finish_reason;
      const delta = ch.delta;
      if (!delta) continue;
      Object.keys(delta).forEach(k => deltaKeys.add(k));
      if (typeof delta.content === 'string') contentLen += delta.content.length;
      if (typeof delta.reasoning_content === 'string') reasoningLen += delta.reasoning_content.length;
    }
  }
  console.log(JSON.stringify({ deltaKeys: [...deltaKeys], contentLen, reasoningLen, finish, usage }, null, 2));
})();
