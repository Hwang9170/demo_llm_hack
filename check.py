from google import genai
import os
from dotenv import load_dotenv

# .env 파일 경로를 절대 경로로 지정
dotenv_path = "/Users/hwang/Desktop/demo_llm_hack/.env"
load_dotenv(dotenv_path)

api_key = os.getenv("GENAI_API_KEY")
print("GENAI_API_KEY:", api_key)  # 디버깅용 출력

if not api_key:
    raise RuntimeError("❌ GENAI_API_KEY를 불러오지 못했습니다. .env 파일 경로/내용 확인 필요!")

client = genai.Client(api_key=api_key)

# 모델 목록 출력
for model in client.models.list():
    print(model.name, "→", model.display_name)
