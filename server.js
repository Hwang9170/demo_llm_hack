import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;
// 원격 API 베이스 (환경변수로 덮어쓰기 가능)
const TARGET_API_BASE = process.env.TARGET_API_BASE || 'http://223.130.131.237:8080';

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// 정적 파일 서빙 (루트)
app.use(express.static(__dirname));

// 간단 프록시: /api/* → 원격 API
app.all('/api/*', async (req, res) => {
  try {
    const subPath = req.originalUrl.replace(/^\/api\//, '');
    const url = `${TARGET_API_BASE}/${subPath}`;

    const headers = { ...req.headers };
    // 호스트/압축 관련 헤더 제거
    delete headers['host'];
    delete headers['content-length'];
    delete headers['accept-encoding'];

    const init = {
      method: req.method,
      headers,
      // GET/HEAD에는 body를 붙이지 않음
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body || {}),
    };

    const resp = await fetch(url, init);
    const contentType = resp.headers.get('content-type') || '';
    res.status(resp.status);
    if (contentType.includes('application/json')) {
      const data = await resp.json().catch(() => ({}));
      res.json(data);
    } else {
      const buf = await resp.arrayBuffer();
      res.set('Content-Type', contentType);
      res.send(Buffer.from(buf));
    }
  } catch (e) {
    res.status(502).json({ error: 'proxy_failed', detail: String(e) });
  }
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Dev server running at http://localhost:${PORT}`);
  console.log(`Proxy target: ${TARGET_API_BASE}`);
});

