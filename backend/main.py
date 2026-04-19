from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fpdf import FPDF

import random
import qrcode
import pandas as pd
import os
import time
import traceback

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
PREVIEW_DIR = os.path.join(BASE_DIR, "preview")
EXCEL_DIR = os.path.join(BASE_DIR, "excel")

os.makedirs(QR_DIR, exist_ok=True)
os.makedirs(PREVIEW_DIR, exist_ok=True)
os.makedirs(EXCEL_DIR, exist_ok=True)

app.mount("/qrcodes", StaticFiles(directory=QR_DIR), name="qrcodes")
app.mount("/preview", StaticFiles(directory=PREVIEW_DIR), name="preview")
app.mount("/excel", StaticFiles(directory=EXCEL_DIR), name="excel")

LAYOUT_CONFIG = {
    "STD": {"width": 30, "height": 25, "cols": 8, "rows": 5, "qr_w": 23},    # 40 ดวง 
    "M":   {"width": 45, "height": 20, "cols": 5, "rows": 8, "qr_w": 15},   # 40 ดวง 
    "S":   {"width": 40, "height": 15, "cols": 6, "rows": 10, "qr_w": 12},   # 60 ดวง 
    "SS":  {"width": 30, "height": 10, "cols": 5, "rows": 20, "qr_w": 8.5}   # 100 ดวง 
}


def generate_codes(config):
    mode = config.get("mode", "Auto Generate")
    qty = int(config.get("quantity") or 10)
    codes = set()
    
    if mode == "Auto Generate":
        # สุ่ม unique random 11 หลัก รูปแบบ xxx-xxxx-xxxx
        while len(codes) < qty:
            raw_num = "".join([str(random.randint(0, 9)) for _ in range(11)])
            formatted = f"{raw_num[:3]}-{raw_num[3:7]}-{raw_num[7:]}"
            codes.add(formatted)
    else:
        # กรณี Custom Format (Prefix + Separator + Digit)
        prefix = config.get("prefix", "")
        sep = config.get("separator", "")
        digit = int(config.get("digit", 8))
        while len(codes) < qty:
            num = "".join([str(random.randint(0, 9)) for _ in range(digit)])
            code = f"{prefix}{sep}{num}" if prefix else num
            codes.add(code)
            
    return list(codes)

def generate_qr(code):
    img = qrcode.make(code)

    safe_name = code.replace("-", "").replace("/", "").replace("_", "")
    file_path = os.path.join(QR_DIR, f"{safe_name}.png")
    img.save(file_path)
    return file_path, safe_name


def create_pdf_layout(codes, size_type, prefix="VER"):
    try:
        pdf = FPDF(orientation="L", unit="mm", format="A4")
        pdf.set_auto_page_break(False)

        PAGE_W = 297
        PAGE_H = 210

        MARGIN_X = 10
        MARGIN_TOP = 10
        MARGIN_BOTTOM = 20 

        cfg = LAYOUT_CONFIG.get(size_type, LAYOUT_CONFIG["STD"])

        col_max = cfg["cols"]
        row_max = cfg["rows"]
        cell_w = cfg["width"]
        cell_h = cfg["height"]
        qr_size = cfg["qr_w"]

        usable_height = PAGE_H - MARGIN_TOP - MARGIN_BOTTOM
        row_max = int(usable_height // cell_h)

        per_page = col_max * row_max
        total_pages = (len(codes) + per_page - 1) // per_page

        for p in range(total_pages):
            pdf.add_page()
            page_codes = codes[p * per_page:(p + 1) * per_page]

            for i, code_data in enumerate(page_codes):
                col = i % col_max
                row = i // col_max

                x = MARGIN_X + (col * cell_w)
                y = MARGIN_TOP + (row * cell_h)

                img_path = os.path.join(QR_DIR, f"{code_data['safe_name']}.png")
                
                if size_type == "SS":
                    pdf.set_font("Arial", size=5)
                elif size_type == "S":
                    pdf.set_font("Arial", size=6)
                else:
                    pdf.set_font("Arial", size=7)
            
                padding = 2
                text_h = 3  # ความสูง text

                # 🔹 STD → text บน QR
                if size_type == "STD":

                    # วาง text ด้านบน
                    pdf.set_xy(x, y + 1)
                    pdf.cell(cell_w, text_h, code_data["code"], align="C")

                    # QR อยู่ใต้ text และต้องไม่ล้น
                    qr_x = x + (cell_w - qr_size) / 2
                    qr_y = y + text_h + 2

                # 🔹 M / S / SS → text ขวา QR
                else:

                    qr_x = x + padding
                    qr_y = y + (cell_h - qr_size) / 2  

                    text_x = qr_x + qr_size + 1
                    text_y = y + (cell_h / 2) - (text_h / 2)

                    max_w = cell_w - qr_size - (padding * 2)

                    pdf.set_xy(text_x, text_y)
                    pdf.cell(cell_w - qr_size - 4, text_h, code_data["code"], align="L")

                # DRAW QR
                if os.path.exists(img_path):
                    pdf.image(img_path, x=qr_x, y=qr_y, w=qr_size, h=qr_size)

            # =========================
            # FOOTER (มุมขวาล่าง)
            # =========================
            if size_type == "STD":
                company = "VER"
            else:
                company = prefix if prefix else "VER"

            company = company[:3].upper()

            stock_code = f"{company}-0001-S-{size_type}-{str(p+1).zfill(2)}"

            pdf.set_font("Helvetica", "B", 9)

            pdf.set_y(PAGE_H - 12)  
            pdf.set_x(MARGIN_X)

            pdf.cell(PAGE_W - (MARGIN_X * 2), 8, stock_code, align="R")

        filename = f"preview_{int(time.time())}.pdf"
        pdf.output(os.path.join(PREVIEW_DIR, filename))

        return filename

    except Exception:
        traceback.print_exc()
        return None

# =========================
# API: generate + preview
# =========================
@app.post("/generate")
def generate(config: dict):
    try:
        print("CONFIG:", config)

        codes_raw = generate_codes(config)

        size_type = config.get("size", "STD")
        prefix = config.get("prefix", "VER")

        codes = []

        # สร้าง QR + metadata
        for code in codes_raw:
            path, safe_name = generate_qr(code)

            codes.append({
                "code": code,
                "safe_name": safe_name
            })
        
        pdf_filename = create_pdf_layout(codes, size_type, prefix)

        print("📄 PDF:", pdf_filename)

        if pdf_filename:
            return {
                "pdf_url": f"http://127.0.0.1:8000/preview/{pdf_filename}",
                "codes": codes_raw 
        }

    except Exception as e:
        import traceback
        traceback.print_exc()  
        return {"error": str(e)}
    
@app.post("/export-excel")
def export_excel(payload: dict):
    try:
        codes_list = payload.get("codes", [])
        if not codes_list:
            return {"error": "No codes provided"}

        filename = f"stock_report_{int(time.time())}.xlsx"
        file_path = os.path.join(EXCEL_DIR, filename)

        df = pd.DataFrame(codes_list, columns=["Unique_Code"])
        df.to_excel(file_path, index=False)

        return {
            "excel_url": f"http://127.0.0.1:8000/excel/{filename}",
            "filename": filename
        }
    except Exception as e:
        traceback.print_exc()
        return {"error": str(e)}

# =========================
# PDF & EXCEL PREVIEW
# =========================
@app.get("/preview/{filename}")
def preview_pdf(filename: str):
     return FileResponse(os.path.join(PREVIEW_DIR, filename), media_type="application/pdf")

@app.get("/excel/{filename}")
def preview_excel(filename: str):
    return FileResponse(os.path.join(EXCEL_DIR, filename), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")

@app.get("/")
def root():
    return {"message": "QR Generator API is running 🚀"}