from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

import qrcode
import os

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
QR_DIR = os.path.join(BASE_DIR, "qrcodes")
os.makedirs(QR_DIR, exist_ok=True)


app.mount("/qrcodes", StaticFiles(directory=QR_DIR), name="qrcodes")


def generate_codes(config):
    codes = []

    prefix = config.get("prefix", "")
    start = int(config.get("start", 1))
    qty = int(config.get("quantity", 1))
    digit = int(config.get("digit", 3))
    sep = config.get("separator", "")

    for i in range(start, start + qty):
        num = str(i).zfill(digit)
        code = f"{prefix}{sep}{num}" if prefix else num
        codes.append(code)

    return codes


def generate_qr(code):
    img = qrcode.make(code)

    file_path = os.path.join(QR_DIR, f"{code}.png")
    img.save(file_path)

    return file_path


# =========================
# API: generate + preview
# =========================
@app.post("/generate")
def generate(config: dict):
    codes = generate_codes(config)

    result = []

    for code in codes:
        generate_qr(code)

        result.append({
            "code": code,
            "img_url": f"http://127.0.0.1:8000/qrcodes/{code}.png"
        })

    return {
        "total": len(result),
        "items": result
    }


# =========================
# test endpoint
# =========================
@app.get("/")
def root():
    return {"message": "QR Generator API is running 🚀"}