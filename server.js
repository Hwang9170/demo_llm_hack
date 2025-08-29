import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const TARGET_API_BASE = process.env.TARGET_API_BASE || 'http://223.130.131.237:8080';

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// /api/* 프록시
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
      body: ['GET','HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body ?? {}),
    });

    const ct = resp.headers.get('content-type') || '';
    res.status(resp.status);
    if (ct.includes('application/json')) return res.json(await resp.json().catch(()=>({})));
    res.set('Content-Type', ct);
    return res.send(Buffer.from(await resp.arrayBuffer()));
  } catch (e) {
    console.error('[proxy_failed]', e);
    return res.status(502).json({ error: 'proxy_failed', detail: String(e) });
  }
});

// ✅ Vercel 서버리스에선 export만! (포트 열지 않음)
export default app;

// ✅ 로컬 개발용으로만 포트 오픈
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 8080;
  app.listen(PORT, () => {
    console.log(`Dev server http://localhost:${PORT}`);
    console.log(`Proxy target: ${TARGET_API_BASE}`);
  });
}
