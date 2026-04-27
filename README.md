# QR Generator

QR Generator is a FastAPI + HTML/CSS/JavaScript web app for creating QR code batches, previewing them as PDFs, exporting code lists, and embedding a logo inside each QR image.

## Features

- Generate QR codes in multiple label sizes
- Support auto-generated and custom code formats
- Upload a logo and embed it into the QR image
- Preview the generated PDF before saving it
- Export generated codes as Excel, with CSV fallback if Excel support is unavailable
- Browse and delete generation history

## Requirements

- Python 3.10 or newer
- `pip`
- MySQL if you want database-backed history
- A virtual environment is strongly recommended

## Install dependencies

From the project root:

```bash
pip install -r requirements.txt
```

## Database setup

The app uses MySQL for saved history when it is available.

Default local connection:

```text
mysql+pymysql://root:root@127.0.0.1:8889/qr_generator
```

This matches MAMP's common MySQL settings. Start MySQL first, then run the backend. The app will create the `qr_generator` database and `qr_history` table automatically.

To use another MySQL install:

```bash
export QR_DATABASE_URL="mysql+pymysql://USER:PASSWORD@127.0.0.1:3306/qr_generator"
python -m uvicorn backend.main:app --reload
```

## macOS setup

1. Create a virtual environment:

```bash
python3 -m venv venv
```

2. Activate it:

```bash
source venv/bin/activate
```

3. Install dependencies:

```bash
pip install -r requirements.txt
```

4. Start the app from the project root:

```bash
python -m uvicorn backend.main:app --reload
```

5. Open the UI:

```text
http://127.0.0.1:8000/page/config.html
```

## Windows setup

1. Create a virtual environment:

```powershell
python -m venv venv
```

2. Activate it:

```powershell
venv\Scripts\Activate.ps1
```

If PowerShell blocks activation, run:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
```

Then activate again.

3. Install dependencies:

```powershell
pip install -r requirements.txt
```

4. Start the app from the project root:

```powershell
python -m uvicorn backend.main:app --reload
```

5. Open the UI:

```text
http://127.0.0.1:8000/page/config.html
```

## Run notes

- The backend auto-creates `backend/preview`, `backend/excel`, and `backend/temp` if they do not exist.
- Static frontend files are served directly by FastAPI.
- CORS is enabled for local development so the frontend can work from either the FastAPI server or a local file/static server.
- For the most reliable local flow, open the UI from FastAPI at `http://127.0.0.1:8000/page/config.html`.
- The default database URL is `mysql+pymysql://root:root@127.0.0.1:8889/qr_generator`, which matches a common MAMP MySQL setup.
- You can override the database with `QR_DATABASE_URL`, for example `export QR_DATABASE_URL="mysql+pymysql://root:password@127.0.0.1:3306/qr_generator"`.
- When MySQL is reachable, the backend auto-creates the `qr_generator` database and `qr_history` table. If MySQL is off, the app still falls back to file-based history.
- Generated previews, exports, temporary uploads, Python caches, virtual environments, and local logs are ignored by Git.

## How to test QR preview and logo upload

1. Open `http://127.0.0.1:8000/page/config.html`.
2. Choose a mode and size.
3. Enter a quantity.
4. Optionally upload a PNG, JPG, JPEG, or WEBP logo.
5. Click the preview button.
6. Confirm that the app opens `preview.html` and renders the PDF.
7. Check that the QR codes include the logo in the center.
8. Click continue to save the preview and open the success page.
9. Download the PDF and Excel export from the success page.
10. Open History and verify the file appears there.

## API overview

- `POST /generate`
- `GET /draft/{draft_id}/status`
- `GET /draft/preview/{draft_id}/{filename}`
- `GET /draft/export/{draft_id}/{filename}`
- `POST /draft/confirm/{draft_id}`
- `DELETE /draft/{draft_id}`
- `GET /history`
- `DELETE /history/{filename}`

## Troubleshooting

- If preview does not open, do a hard refresh to clear old cached JavaScript.
- If Excel export is not available, install dependencies again to ensure `openpyxl` is present.
- If logo upload fails, confirm the file is a valid image and smaller than 5 MB.
- If the PDF viewer is blank, check that the backend is running and that `http://127.0.0.1:8000` is reachable.
- If Git still shows old generated files, they were probably tracked before `.gitignore` was added. Remove them from Git tracking with `git rm -r --cached backend/temp backend/preview backend/excel backend/__pycache__`, then commit that cleanup.
