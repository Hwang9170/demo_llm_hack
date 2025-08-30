import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const TARGET_API_BASE = process.env.TARGET_API_BASE || 'http://223.130.131.237:8080';

app.use(cors());
app.use(express.json({ limit: '2mb' }));


// ⬇⬇ server.js 맨 위쪽 미들웨어들(cosrs/json) 뒤, 프록시(app.all('/api/:path*')) 보다 ‘위’에 추가 ⬇⬇

// 실제 동화 생성 라우트
app.post('/api/story/make', async (req, res) => {
  const { title = '', outline = '', age = '6-8세', style = '따뜻한', length = 5, moral = true } = req.body || {};

  // 프롬프트
  const prompt = [
    `다음 정보를 바탕으로 6~8세 어린이를 위한 한국어 동화를 써줘.`,
    `- 제목: ${title}`,
    `- 개요: ${outline}`,
    `- 톤/스타일: ${style}`,
    `- 분량: 약 ${length}개 단락`,
    `- 교훈(도덕성): ${moral ? '포함' : '선택'}`,
    ``,
    `요구사항:`,
    `1) 너무 어렵지 않은 어휘`,
    `2) 문단 사이에 빈 줄`,
    `3) 마지막에 잔잔한 교훈 한 줄`,
  ].join('\n');

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000); // 15초 타임아웃

    const provider = (process.env.STORY_PROVIDER || 'gemini').toLowerCase();
    let story = '';

    if (provider === 'openai') {
      // --- OpenAI ---
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
          temperature: 0.8,
          messages: [
            { role: 'system', content: 'You are a kind children’s story writer who writes in Korean for ages 6–8.' },
            { role: 'user', content: prompt }
          ],
          max_tokens: 1200,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(`openai_failed ${r.status} ${JSON.stringify(j).slice(0,200)}`);
      story = j.choices?.[0]?.message?.content?.trim() || '';

    } else if (provider === 'gemini') {
      // --- Google Gemini ---
      const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
      const key = process.env.GEMINI_API_KEY;
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }]}],
          generationConfig: { temperature: 0.8, maxOutputTokens: 1200 }
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(`gemini_failed ${r.status} ${JSON.stringify(j).slice(0,200)}`);
      story = j.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

    } else if (provider === 'clova') {
      // --- NAVER HyperCLOVA X (엔드포인트 정확히 환경변수로 전달하세요) ---
      const endpoint = process.env.CLOVA_ENDPOINT; // 예: https://clovastudio.apigw.ntruss.com/v1/chat-completions/HCX-005
      const headers = {
        'Content-Type': 'application/json',
        // 계정/플랜에 따라 요구되는 헤더 키가 다릅니다. 본인 콘솔의 문서대로 맞춰주세요.
        // 둘 다 있는 경우 모두 넣어도 무방.
        'X-NCP-APIGW-API-KEY-ID': process.env.CLOVA_APIGW_KEY_ID || undefined,
        'X-NCP-APIGW-API-KEY': process.env.CLOVA_APIGW_KEY || undefined,
        'X-NCP-CLOVASTUDIO-API-KEY': process.env.CLOVA_API_KEY || undefined,
        'X-NCP-CLOVASTUDIO-REQUEST-ID': crypto.randomUUID?.() || String(Date.now())
      };
      const r = await fetch(endpoint, {
        method: 'POST',
        signal: controller.signal,
        headers,
        body: JSON.stringify({
          // 실제 스펙에 맞게 필드명/모델명을 조정하세요.
          messages: [
            { role: 'system', content: '6–8세 한국어 아동용 동화 작가' },
            { role: 'user', content: prompt }
          ],
          topP: 0.8, temperature: 0.8, maxTokens: 1200,
        }),
      });
      const text = await r.text(); // 일부 응답이 text일 수 있어 우선 text로 받음
      if (!r.ok) throw new Error(`clova_failed ${r.status} ${text.slice(0,200)}`);
      try {
        const j = JSON.parse(text);
        // 응답 구조는 계정/엔드포인트에 따라 다릅니다. 아래는 예시 분기:
        story = j.choices?.[0]?.message?.content?.trim()
             || j.output_text?.trim()
             || j.result?.message?.content?.trim()
             || text.trim();
      } catch {
        story = text.trim();
      }
    } else {
      throw new Error(`unknown_provider ${provider}`);
    }

    clearTimeout(timeout);
    if (!story) throw new Error('empty_story');

    return res.json({ story });
  } catch (err) {
    console.error('[story_make_failed]', err);
    const isAbort = String(err?.name || '').includes('Abort');
    return res.status(isAbort ? 504 : 502).json({ error: 'story_make_failed', detail: String(err?.message || err) });
  }
});


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
