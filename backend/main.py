from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fpdf import FPDF
from PIL import Image
import json
import random
import qrcode
import pandas as pd
import os
import time
import traceback
import re
 
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
TEMP_DIR = os.path.join(BASE_DIR, "temp")
 
os.makedirs(QR_DIR, exist_ok=True)
os.makedirs(PREVIEW_DIR, exist_ok=True)
os.makedirs(EXCEL_DIR, exist_ok=True)
os.makedirs(TEMP_DIR, exist_ok=True)
 
app.mount("/qrcodes", StaticFiles(directory=QR_DIR), name="qrcodes")
app.mount("/preview", StaticFiles(directory=PREVIEW_DIR), name="preview")
app.mount("/excel", StaticFiles(directory=EXCEL_DIR), name="excel")
 
# Lot QR size code
# ถ้าอยากให้ STD ออกเป็น STD ให้เปลี่ยน "STD": "S" เป็น "STD": "STD"
SIZE_CODE_MAP = {
    "STD": "S",
    "M": "M",
    "S": "S",
    "SS": "SS",
}
 
# Layout:
# label_w / label_h = ขนาดช่องสติ๊กเกอร์ (mm)
# gap_x / gap_y = ระยะห่างระหว่างคอลัมน์ / แถว (mm)
LAYOUT_CONFIG = {
    "STD": {
        "orientation": "L",   # A4 landscape
        "label_w": 25,
        "label_h": 30,
        "cols": 8,
        "qr_w": 23,
        "gap_x": 5,           # 0.5 cm
        "gap_y": 5,           # 0.5 cm
    },
    "M": {
        "orientation": "L",   # A4 landscape
        "label_w": 45,
        "label_h": 20,
        "cols": 5,
        "qr_w": 15,
        "gap_x": 3,           # 0.3 cm
        "gap_y": 5,           # 0.5 cm
    },
    "S": {
        "orientation": "L",   # A4 landscape
        "label_w": 40,
        "label_h": 15,
        "cols": 6,
        "qr_w": 12,
        "gap_x": 5,           # 0.5 cm
        "gap_y": 3,           # 0.3 cm
    },
    "SS": {
        "orientation": "P",   # A4 portrait
        "label_w": 30,
        "label_h": 10,
        "cols": 5,
        "qr_w": 8.5,
        "gap_x": 5,           # 0.5 cm
        "gap_y": 3,           # 0.3 cm
    },
}
 
 
def clean_separator(separator: str) -> str:
    if not separator:
        return ""
    if separator.strip().lower() == "none":
        return ""
    return separator.strip()
 
 
def sanitize_company_code(value: str) -> str:
    value = (value or "").strip().upper()
    value = re.sub(r"[^A-Z0-9]", "", value)
    return value[:10] if value else "VER"
 
 
def get_mode_code(mode: str) -> str:
    return "C" if str(mode).strip().lower() != "auto generate" else "S"
 
 
def get_qr_size_code(size_type: str) -> str:
    size_type = str(size_type or "STD").strip().upper()
    return SIZE_CODE_MAP.get(size_type, "S")
 
 
def generate_codes(config: dict):
    mode = config.get("mode", "Auto Generate")
    qty = int(config.get("quantity") or 10)
    qty = max(1, qty)
 
    codes = set()
 
    if mode == "Auto Generate":
        while len(codes) < qty:
            raw_num = "".join(str(random.randint(0, 9)) for _ in range(11))
            formatted = f"{raw_num[:3]}-{raw_num[3:7]}-{raw_num[7:]}"
            codes.add(formatted)
    else:
        prefix = str(config.get("prefix", "")).strip()
        sep = clean_separator(str(config.get("separator", "")))
        digit = int(config.get("digit", 8))
        digit = max(1, digit)
 
        while len(codes) < qty:
            num = "".join(str(random.randint(0, 9)) for _ in range(digit))
            code = f"{prefix}{sep}{num}" if prefix else num
            codes.add(code)
 
    return list(codes)
 
 
def generate_qr(code: str, logo_path: str | None = None):
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=10,
        border=2,
    )
    qr.add_data(code)
    qr.make(fit=True)
 
    img = qr.make_image(fill_color="black", back_color="white").convert("RGBA")
 
    if logo_path and os.path.exists(logo_path):
        try:
            logo = Image.open(logo_path).convert("RGBA")
 
            qr_w, qr_h = img.size
            logo_size = qr_w // 4
            logo.thumbnail((logo_size, logo_size), Image.LANCZOS)
 
            logo_bg_size = int(max(logo.size) * 1.15)
            logo_bg = Image.new(
                "RGBA", (logo_bg_size, logo_bg_size), (255, 255, 255, 255)
            )
 
            bg_x = (logo_bg_size - logo.width) // 2
            bg_y = (logo_bg_size - logo.height) // 2
            logo_bg.paste(logo, (bg_x, bg_y), logo)
 
            pos = ((qr_w - logo_bg_size) // 2, (qr_h - logo_bg_size) // 2)
            img.paste(logo_bg, pos, logo_bg)
 
        except Exception:
            traceback.print_exc()
 
    safe_name = "".join(ch for ch in code if ch.isalnum())
    if not safe_name:
        safe_name = f"qr_{int(time.time() * 1000)}"
 
    file_path = os.path.join(QR_DIR, f"{safe_name}.png")
    img.save(file_path)
    return file_path, safe_name
 
 
def try_register_mitr_fonts(pdf: FPDF) -> bool:
    regular_path = os.path.join(BASE_DIR, "Mitr-Regular.ttf")
    bold_path = os.path.join(BASE_DIR, "Mitr-SemiBold.ttf")
 
    if os.path.exists(regular_path) and os.path.exists(bold_path):
        pdf.add_font("Mitr", "", regular_path, uni=True)
        pdf.add_font("Mitr", "B", bold_path, uni=True)
        return True
 
    return False
 
 
def extract_lot_number_from_filename(
    filename: str, company_code: str, mode_code: str, qr_size_code: str
) -> int | None:
    """
    Expected preview filename format:
    [CompanyCode]-[LotNo]-[Mode]-[QRSize].pdf
    Example:
    VER-0001-S-S.pdf
    ABC-0007-C-M.pdf
    """
    base = os.path.splitext(filename)[0]
    parts = base.split("-")
 
    if len(parts) != 4:
        return None
 
    file_company, file_lot, file_mode, file_size = parts
 
    if file_company != company_code:
        return None
    if file_mode != mode_code:
        return None
    if file_size != qr_size_code:
        return None
    if not file_lot.isdigit():
        return None
 
    return int(file_lot)
 
 
def get_next_lot_no(company_code: str, mode_code: str, qr_size_code: str) -> str:
    """
    Standard:
      - VER
      - mode S
      - lot แยกตาม size
 
    Custom:
      - prefix จาก user
      - mode C
      - lot แยกตาม company + size
    """
    max_lot = 0
 
    try:
        for filename in os.listdir(PREVIEW_DIR):
            if not filename.lower().endswith(".pdf"):
                continue
 
            lot_num = extract_lot_number_from_filename(
                filename=filename,
                company_code=company_code,
                mode_code=mode_code,
                qr_size_code=qr_size_code,
            )
            if lot_num is not None:
                max_lot = max(max_lot, lot_num)
 
    except Exception:
        traceback.print_exc()
 
    return str(max_lot + 1).zfill(4)
 
 
def create_pdf_layout(codes, size_type, prefix="VER", mode="Auto Generate"):
    try:
        size_type = str(size_type or "STD").strip().upper()
        cfg = LAYOUT_CONFIG.get(size_type, LAYOUT_CONFIG["STD"])
 
        orientation = cfg["orientation"]
        pdf = FPDF(orientation=orientation, unit="mm", format="A4")
        pdf.set_auto_page_break(False)
 
        has_mitr_font = try_register_mitr_fonts(pdf)
 
        if orientation == "L":
            PAGE_W = 297
            PAGE_H = 210
        else:
            PAGE_W = 210
            PAGE_H = 297
 
        MARGIN_X = 10
        MARGIN_TOP = 10
        MARGIN_BOTTOM = 20
 
        label_w = cfg["label_w"]
        label_h = cfg["label_h"]
        qr_size = cfg["qr_w"]
        col_max = cfg["cols"]
        gap_x = cfg["gap_x"]
        gap_y = cfg["gap_y"]
 
        step_x = label_w + gap_x
        step_y = label_h + gap_y
 
        usable_height = PAGE_H - MARGIN_TOP - MARGIN_BOTTOM
        row_max = int((usable_height + gap_y) // step_y)
        row_max = max(1, row_max)
 
        per_page = col_max * row_max
        total_pages = (len(codes) + per_page - 1) // per_page
 
        mode_code = get_mode_code(mode)
        qr_size_code = get_qr_size_code(size_type)
 
        if mode_code == "C":
            company_code = sanitize_company_code(prefix)
        else:
            company_code = "VER"
 
        lot_no = get_next_lot_no(company_code, mode_code, qr_size_code)
 
        # คำนวณขนาด grid จริง เพื่อจัดกลางหน้า
        grid_width = (col_max * label_w) + ((col_max - 1) * gap_x)
        grid_height = (row_max * label_h) + ((row_max - 1) * gap_y)
 
        # center page และไม่ให้เลย margin ขั้นต่ำ
        start_x = max(MARGIN_X, (PAGE_W - grid_width) / 2)
        start_y = max(MARGIN_TOP, (PAGE_H - grid_height) / 2)
 
        for p in range(total_pages):
            pdf.add_page()
            page_codes = codes[p * per_page: (p + 1) * per_page]
 
            for i, code_data in enumerate(page_codes):
                col = i % col_max
                row = i // col_max
 
                x = start_x + (col * step_x)
                y = start_y + (row * step_y)
 
                pdf.set_draw_color(200, 200, 200)
                pdf.rect(x, y, label_w, label_h)
 
                img_path = os.path.join(QR_DIR, f"{code_data['safe_name']}.png")
 
                if has_mitr_font:
                    if size_type == "SS":
                        pdf.set_font("Mitr", size=6)
                    elif size_type == "S":
                        pdf.set_font("Mitr", size=7)
                    else:
                        pdf.set_font("Mitr", size=8)
 
                if size_type == "STD":
                    pdf.set_xy(x, y + 1.5)
                    pdf.cell(label_w, 4, code_data["code"], align="C")
 
                    qr_x = x + (label_w - qr_size) / 2
                    qr_y = y + 6
                else:
                    qr_x = x + 1
                    qr_y = y + (label_h - qr_size) / 2
 
                    text_x = qr_x + qr_size + 1
                    pdf.set_xy(text_x, y)
                    pdf.cell(label_w - qr_size - 2, label_h, code_data["code"], align="L")
 
                if os.path.exists(img_path):
                    pdf.image(img_path, x=qr_x, y=qr_y, w=qr_size, h=qr_size)
 
            stock_code = f"{company_code}-{lot_no}-{mode_code}-{qr_size_code}-{p + 1}"
 
            pdf.set_font("Arial", "B", 18)
            footer_y = PAGE_H - 15
            pdf.set_xy(MARGIN_X, footer_y)
            pdf.cell(PAGE_W - (MARGIN_X * 2), 8, stock_code, align="R")
 
        filename = f"{company_code}-{lot_no}-{mode_code}-{qr_size_code}.pdf"
        output_path = os.path.join(PREVIEW_DIR, filename)
 
        print("Saving PDF to:", output_path)
        pdf.output(output_path)
 
        if not os.path.exists(output_path):
            print("PDF file was not created:", output_path)
            return None
 
        print("PDF created successfully:", output_path)
        return filename
 
    except Exception:
        traceback.print_exc()
        return None
 
 
@app.post("/generate")
async def generate(
    config: str = Form(...),
    logo: UploadFile = File(None),
):
    try:
        config_data = json.loads(config)
        print("CONFIG:", config_data)
 
        logo_path = None
        if logo:
            ext = os.path.splitext(logo.filename or "")[1].lower()
            if ext not in [".png", ".jpg", ".jpeg", ".webp"]:
                ext = ".png"
 
            logo_filename = f"logo_{int(time.time() * 1000)}{ext}"
            logo_path = os.path.join(TEMP_DIR, logo_filename)
 
            with open(logo_path, "wb") as f:
                f.write(await logo.read())
 
        codes_raw = generate_codes(config_data)
 
        size_type = str(config_data.get("size", "STD")).strip().upper()
        prefix = str(config_data.get("prefix", "VER")).strip()
        mode = str(config_data.get("mode", "Auto Generate")).strip()
 
        codes = []
 
        for code in codes_raw:
            _, safe_name = generate_qr(code, logo_path)
            codes.append({"code": code, "safe_name": safe_name})
 
        pdf_filename = create_pdf_layout(codes, size_type, prefix, mode)
        print("PDF filename returned:", pdf_filename)
 
        if logo_path and os.path.exists(logo_path):
            try:
                os.remove(logo_path)
            except Exception:
                traceback.print_exc()
 
        if not pdf_filename:
            return JSONResponse(
                status_code=500,
                content={"error": "Failed to create preview PDF"},
            )
 
        full_pdf_path = os.path.join(PREVIEW_DIR, pdf_filename)
        print("Checking final PDF path:", full_pdf_path)
 
        if not os.path.exists(full_pdf_path):
            return JSONResponse(
                status_code=500,
                content={"error": f"Preview PDF missing after generation: {pdf_filename}"},
            )
 
        return {
            "pdf_url": f"http://127.0.0.1:8000/preview/{pdf_filename}",
            "codes": codes_raw,
            "filename": pdf_filename,
        }
 
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"error": str(e)})
 
 
@app.post("/export-excel")
def export_excel(payload: dict):
    try:
        codes_list = payload.get("codes", [])
        if not codes_list:
            return JSONResponse(status_code=400, content={"error": "No codes provided"})
 
        filename = f"stock_report_{int(time.time() * 1000)}.xlsx"
        file_path = os.path.join(EXCEL_DIR, filename)
 
        df = pd.DataFrame(codes_list, columns=["Unique_Code"])
        df.to_excel(file_path, index=False)
 
        return {
            "excel_url": f"http://127.0.0.1:8000/excel/{filename}",
            "filename": filename,
        }
 
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"error": str(e)})
 
 
@app.get("/preview/{filename}")
def preview_pdf(filename: str):
    file_path = os.path.join(PREVIEW_DIR, filename)
    if not os.path.exists(file_path):
        return JSONResponse(status_code=404, content={"error": "PDF file not found"})
    return FileResponse(file_path, media_type="application/pdf")
 
 
@app.get("/excel/{filename}")
def preview_excel(filename: str):
    file_path = os.path.join(EXCEL_DIR, filename)
    if not os.path.exists(file_path):
        return JSONResponse(status_code=404, content={"error": "Excel file not found"})
    return FileResponse(
        file_path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
 
 
@app.get("/")
def root():
    return {"message": "QR Generator API is running 🚀"}