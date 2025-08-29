import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import dotenv from 'dotenv';
// Node 18+/Vercel은 fetch 내장 → node-fetch 불필요

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;
const TARGET_API_BASE = process.env.TARGET_API_BASE || 'http://223.130.131.237:8080';

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// 정적 파일
app.use(express.static(__dirname, { dotfiles: 'ignore' }));

// ✅ '/api/*' → '/api/:path*' 로
app.all('/api/:path*', async (req, res) => {
  try {
    const pathPart = req.params.path ?? '';
    const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    const url = `${TARGET_API_BASE}/${pathPart}${qs}`;

    const resp = await fetch(url, {
      method: req.method,
      headers: {
        'content-type': req.headers['content-type'] || 'application/json',
        authorization: req.headers['authorization'] || undefined,
      },
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body ?? {}),
    });

    const ct = resp.headers.get('content-type') || '';
    res.status(resp.status);
    if (ct.includes('application/json')) {
      return res.json(await resp.json().catch(() => ({})));
    }
    res.set('Content-Type', ct);
    return res.send(Buffer.from(await resp.arrayBuffer()));
  } catch (e) {
    console.error('[proxy_failed]', e);
    return res.status(502).json({ error: 'proxy_failed', detail: String(e) });
  }
});

// ✅ '*' → 정규식으로 (api 제외한 모든 경로)
app.get(/^(?!\/api\/).*/, (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Dev server running at http://localhost:${PORT}`);
  console.log(`Proxy target: ${TARGET_API_BASE}`);
});
