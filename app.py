from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse, FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import requests, os, uuid, re
from google import genai  # google-genai SDK
from urllib.parse import urlencode

# .env 파일 로드
load_dotenv()

app = FastAPI()

# CORS (개발용: * 허용)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 정적 파일 제공
os.makedirs("static/tts", exist_ok=True)
os.makedirs("static/images", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
async def root():
    return FileResponse("static/index.html")

# ===== CLOVA Studio (동화 생성) =====
CLOVA_API_KEY    = os.getenv("CLOVA_API_KEY")
CLOVA_REQUEST_ID = os.getenv("CLOVA_REQUEST_ID")
CLOVA_MODEL      = os.getenv("CLOVA_MODEL", "HCX-005")
CLOVA_ENDPOINT   = f"https://clovastudio.stream.ntruss.com/testapp/v3/chat-completions/{CLOVA_MODEL}"

# ===== NAVER TTS =====
TTS_API_URL       = os.getenv("TTS_API_URL", "https://naveropenapi.apigw.ntruss.com/tts-premium/v1/tts")
TTS_CLIENT_ID     = os.getenv("TTS_CLIENT_ID")
TTS_CLIENT_SECRET = os.getenv("TTS_CLIENT_SECRET")

# ===== Google GenAI (Imagen) =====
IMAGEN_MODEL = "imagen-3.0-generate-002"
genai_client = genai.Client(api_key=os.getenv("GENAI_API_KEY"))

NAVER_CLIENT_ID = os.getenv("NAVER_CLIENT_ID")
NAVER_CLIENT_SECRET = os.getenv("NAVER_CLIENT_SECRET")
NAVER_REDIRECT_URI = "http://127.0.0.1:5500/api/login/naver/callback"  # 포트 수정

# ------------------------------
# API: 동화 + 이미지 + TTS 생성
# ------------------------------
@app.post("/api/story/make")
async def make_story(req: Request):
    try:
        data = await req.json()
        title = (data.get("title") or "").strip()
        outline = (data.get("outline") or "").strip()
        age = data.get("age", "6-8세")
        style = data.get("style", "따뜻한")
        length = data.get("length", "보통")
        moral = data.get("moral", True)

        asks = [f"대상 연령: {age}", f"문체/분위기: {style}", f"분량: {length}"]
        if moral:
            asks.append("마지막에 간단한 교훈 한 줄을 덧붙여줘.")
        guide = " · ".join(asks)

        user_prompt = f"""[제목]
{title}

[줄거리/아이디어]
{outline}

[작성 가이드]
{guide}

[형식]
- 5~9개 문단으로 장면을 나눠 써줘.
- 어린이가 이해하기 쉬운 어휘로 자연스럽게 전개해줘.
- 각 문단 앞에 소제목은 붙이지 말고, 이야기 흐름만 이어줘.
"""

        # ---- Clova Studio 호출 ----
        headers = {
            "Authorization": f"Bearer {CLOVA_API_KEY}",
            "X-NCP-CLOVASTUDIO-REQUEST-ID": CLOVA_REQUEST_ID,
            "Content-Type": "application/json; charset=utf-8",
            "Accept": "application/json",
        }
        payload = {
            "messages": [
                {"role": "system", "content": "너는 아이들을 위한 창의적인 동화 작가야."},
                {"role": "user", "content": user_prompt},
            ],
            "maxTokens": 1200,
            "temperature": 0.9,
            "topP": 0.9,
            "repetitionPenalty": 1.05,
        }
        r = requests.post(CLOVA_ENDPOINT, headers=headers, json=payload, timeout=60)
        print("[DEBUG] Clova 응답 상태:", r.status_code)
        print("[DEBUG] Clova 응답 원문:", r.text)
        r.raise_for_status()

        data = r.json()
        story = (
            data.get("result", {})
                .get("message", {})
                .get("content", "")
        ).strip() or "응답이 비어있습니다."
        print("[DEBUG] 생성된 story:", story)

        # ---- TTS 생성 ----
        safe_title = re.sub(r'[^\w\s-]', '', title).strip().replace(' ', '_')
        tts_filename = f"tts_{safe_title}.mp3"
        tts_filepath = os.path.join("static/tts", tts_filename)

        if not os.path.exists(tts_filepath):
            tts_headers = {
                "X-NCP-APIGW-API-KEY-ID": TTS_CLIENT_ID,
                "X-NCP-APIGW-API-KEY": TTS_CLIENT_SECRET,
            }
            tts_data = {
                "speaker": "nara",
                "speed": "0",
                "text": story[:3000] if len(story) > 3000 else story,
            }
            tts_response = requests.post(TTS_API_URL, headers=tts_headers, data=tts_data, timeout=30)
            print("[DEBUG] TTS 응답 상태:", tts_response.status_code)
            print("[DEBUG] TTS 응답 원문:", tts_response.text if tts_response.status_code != 200 else "OK")
            tts_response.raise_for_status()

            with open(tts_filepath, "wb") as f:
                f.write(tts_response.content)

        # ---- 이미지 생성 ----
        paragraphs = [p for p in story.split("\n\n") if p.strip()]
        images_out = []
        for idx, para in enumerate(paragraphs, start=1):
            prompt = (
                f"Children's storybook illustration, cartoon style, soft pastel, "
                f"cute characters, whimsical drawing. "
                f"Scene: {para}. "
                f"Story title: {title}. "
                "Do not generate a photo, only an illustration."
            )
            try:
                img_resp = genai_client.models.generate_images(
                    model=IMAGEN_MODEL,
                    prompt=prompt,
                )
                if not img_resp.generated_images:
                    raise ValueError("이미지 응답이 비어있음")

                img_bytes = img_resp.generated_images[0].image.image_bytes
                img_path = f"static/images/{safe_title}_{idx}.png"
                with open(img_path, "wb") as f:
                    f.write(img_bytes)

                print(f"[DEBUG] 이미지 {idx} 생성 성공: {img_path} ({len(img_bytes)} bytes)")
                images_out.append({"idx": idx, "file_path": img_path, "prompt": prompt})
            except Exception as e:
                print(f"[ERROR] 이미지 생성 실패: {e}")
                images_out.append({"idx": idx, "file_path": "", "prompt": f"이미지 생성 실패: {e}"})

        return JSONResponse({
            "title": title,
            "story": story,
            "images": images_out,
            "ttsAudioPath": f"/static/tts/{tts_filename}"
        })

    except Exception as e:
        return JSONResponse({"error": f"API 호출 실패: {e}"}, status_code=500)


# ------------------------------
# API: TTS 전용 호출
# ------------------------------
@app.post("/tts")
async def tts(req: Request):
    body = await req.json()
    text = (body.get("text") or "").strip()
    speaker = body.get("speaker", "nara")
    speed = str(body.get("speed", "0"))

    if not text:
        return JSONResponse({"error": "text is empty"}, status_code=400)

    headers = {
        "X-NCP-APIGW-API-KEY-ID": TTS_CLIENT_ID,
        "X-NCP-APIGW-API-KEY": TTS_CLIENT_SECRET,
    }
    data = {
        "speaker": speaker,
        "speed": speed,
        "text": text[:3000] if len(text) > 3000 else text,
    }

    try:
        r = requests.post(TTS_API_URL, headers=headers, data=data, timeout=30)
        print("[DEBUG] TTS 응답 상태:", r.status_code)
        print("[DEBUG] TTS 응답 원문:", r.text if r.status_code != 200 else "OK")
        r.raise_for_status()

        tts_filename = f"tts_{uuid.uuid4().hex}.mp3"
        tts_filepath = os.path.join("static/tts", tts_filename)
        with open(tts_filepath, "wb") as f:
            f.write(r.content)

        return JSONResponse({"ttsAudioPath": f"/static/tts/{tts_filename}"})
    except Exception as e:
        return JSONResponse(
            {"error": f"TTS 호출 실패: {e}", "raw": getattr(r, "text", "")},
            status_code=500
        )


# ------------------------------
# API: 네이버 로그인
# ------------------------------
@app.get("/api/login/naver")
async def naver_login():
    params = {
        "response_type": "code",
        "client_id": NAVER_CLIENT_ID,
        "redirect_uri": NAVER_REDIRECT_URI,
        "state": uuid.uuid4().hex,
    }
    naver_auth_url = f"https://nid.naver.com/oauth2.0/authorize?{urlencode(params)}"
    return RedirectResponse(naver_auth_url)

@app.get("/api/login/naver/callback")
async def naver_callback(code: str, state: str):
    try:
        # 네이버 토큰 요청
        token_url = "https://nid.naver.com/oauth2.0/token"
        token_params = {
            "grant_type": "authorization_code",
            "client_id": NAVER_CLIENT_ID,
            "client_secret": NAVER_CLIENT_SECRET,
            "code": code,
            "state": state,
        }
        token_response = requests.post(token_url, params=token_params)
        token_response.raise_for_status()
        token_data = token_response.json()
        access_token = token_data.get("access_token")

        if not access_token:
            raise HTTPException(status_code=400, detail="네이버 로그인 실패: 액세스 토큰 없음")

        # 네이버 프로필 요청
        profile_url = "https://openapi.naver.com/v1/nid/me"
        profile_headers = {"Authorization": f"Bearer {access_token}"}
        profile_response = requests.get(profile_url, headers=profile_headers)
        profile_response.raise_for_status()
        profile_data = profile_response.json()

        # 사용자 정보 반환
        return JSONResponse({
            "message": "네이버 로그인 성공",
            "profile": profile_data,
        })

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"네이버 로그인 실패: {e}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5500, reload=True)  # 포트를 5500으로 설정
