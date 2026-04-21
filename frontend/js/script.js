/* ============================================================
   1. CONFIG & STATE
   ============================================================ */
window.state = {
    isNavigating: false,
    digit: 8
};

// Use current origin when possible.
// If frontend and backend are on same host/port, this works better than hardcoding.
const API_BASE =
    window.location.protocol === "file:"
        ? "http://127.0.0.1:8000"
        : `${window.location.protocol}//${window.location.hostname}:8000`;

function goHome() {
    window.location.href = "config.html";
}

function goHistory() {
    window.location.href = "history.html";
}

const LAYOUT_MAP = {
    STD: 40,
    M: 40,
    S: 60,
    SS: 100
};

function saveToHistory(pdfUrl, excelUrl, config) {
    try {
        let history = JSON.parse(localStorage.getItem("qr_history") || "[]");

        const newEntry = {
            id: Date.now(),
            date: new Date().toLocaleString("th-TH"),
            pdf: pdfUrl || "",
            excel: excelUrl || "",
            size: config.size,
            qty: config.quantity
        };

        history.unshift(newEntry);
        localStorage.setItem("qr_history", JSON.stringify(history));
        console.log("บันทึกประวัติเรียบร้อย:", newEntry);
    } catch (err) {
        console.error("บันทึกประวัติไม่สำเร็จ:", err);
    }
}

/* ============================================================
   2. HELPER FUNCTIONS
   ============================================================ */
function collectConfig() {
    const activeModeBtn = document.querySelector(".btn-mode.active");
    const modeName = activeModeBtn
        ? activeModeBtn.querySelector(".mode-name")?.innerText?.trim()
        : "Auto Generate";

    const activeSizeBtn = document.querySelector(".btn-size.active");
    const sizeLabel = activeSizeBtn
        ? activeSizeBtn.querySelector(".size-label")?.innerText?.trim()
        : "STD";

    let separatorText =
        document.querySelector(".sep-btn.active")?.innerText?.trim() || "";

    if (separatorText.toLowerCase() === "none") {
        separatorText = "";
    }

    const qtyRaw = parseInt(document.querySelector(".qty-input")?.value, 10);

    return {
        mode: modeName,
        size: sizeLabel,
        quantity: Number.isFinite(qtyRaw) && qtyRaw > 0 ? qtyRaw : 0,
        digit: window.state.digit,
        prefix: document.querySelector(".input-prefix")?.value?.trim() || "",
        separator: separatorText
    };
}

function updateSummary() {
    const config = collectConfig();
    const perPage = LAYOUT_MAP[config.size] || 0;
    const totalPages = Math.ceil(config.quantity / perPage) || 0;

    const statValues = document.querySelectorAll(".stat-item .fw-bold");
    if (statValues.length >= 4) {
        statValues[0].innerText = config.quantity.toLocaleString();
        statValues[1].innerText = config.size;
        statValues[2].innerText = perPage;
        statValues[3].innerText = totalPages;
    }

    const rangeDisplay = document.querySelector(".range-highlight");
    if (rangeDisplay) {
        if (config.mode === "Auto Generate") {
            rangeDisplay.innerText = "Unique Random 11 Digits (xxx-xxxx-xxxx)";
        } else {
            const displayPrefix = config.prefix || "HOD";
            const sep = config.separator || "";
            const previewDigits = "X".repeat(Math.max(1, config.digit));
            rangeDisplay.innerText = `${displayPrefix}${sep}${previewDigits} → ${displayPrefix}${sep}${previewDigits}`;
        }
    }
}

function showLoading(show = true) {
    const loading = document.getElementById("loadingScreen");
    if (loading) {
        loading.style.display = show ? "flex" : "none";
    }
}

function getLogoFile() {
    const logoInput = document.getElementById("logoInput");
    return logoInput?.files?.[0] || null;
}

function normalizePdfUrl(pdfUrl) {
    if (!pdfUrl || typeof pdfUrl !== "string") return "";

    // If backend already returns full URL, keep it.
    if (pdfUrl.startsWith("http://") || pdfUrl.startsWith("https://")) {
        return pdfUrl;
    }

    // If backend returns relative URL, convert to full URL.
    if (pdfUrl.startsWith("/")) {
        return `${API_BASE}${pdfUrl}`;
    }

    return `${API_BASE}/${pdfUrl}`;
}

async function parseJsonSafe(response) {
    const text = await response.text();

    try {
        return text ? JSON.parse(text) : {};
    } catch (err) {
        console.error("JSON parse error:", err);
        console.error("Raw response:", text);
        throw new Error("รูปแบบข้อมูลจาก server ไม่ถูกต้อง");
    }
}

/* ============================================================
   3. API INTERACTION
   ============================================================ */
async function generatePreviewAndGo() {
    if (window.state.isNavigating) return;
    window.state.isNavigating = true;

    const config = collectConfig();
    const logoFile = getLogoFile();

    showLoading(true);

    try {
        console.log("Sending config:", config);
        console.log("Sending logo:", logoFile ? logoFile.name : "no logo");
        console.log("API_BASE:", API_BASE);

        const formData = new FormData();
        formData.append("config", JSON.stringify(config));

        if (logoFile) {
            formData.append("logo", logoFile);
        }

        const res = await fetch(`${API_BASE}/generate`, {
            method: "POST",
            body: formData
        });

        const data = await parseJsonSafe(res);
        console.log("Generate response:", data);

        if (!res.ok) {
            throw new Error(data?.error || `Server error: ${res.status}`);
        }

        if (data.error) {
            throw new Error(data.error);
        }

        if (!data.pdf_url) {
            throw new Error("Backend did not return pdf_url");
        }

        const finalPdfUrl = normalizePdfUrl(data.pdf_url);

        localStorage.removeItem("pdf_url");
        localStorage.removeItem("latest_codes");

        localStorage.setItem("pdf_url", finalPdfUrl);

        if (Array.isArray(data.codes)) {
            localStorage.setItem("latest_codes", JSON.stringify(data.codes));
        }

        saveToHistory(finalPdfUrl, data.excel_url || "", config);

        console.log("Saving latest pdf_url:", finalPdfUrl);
        console.log("➡️ redirecting to preview.html");

        window.location.href = "preview.html";
    } catch (err) {
        console.error("🔥 FETCH ERROR:", err);
        alert(`สร้าง Preview ไม่สำเร็จ: ${err.message}`);
    } finally {
        showLoading(false);
        window.state.isNavigating = false;
    }
}

async function exportExcelFromCodes(codes) {
    const res = await fetch(`${API_BASE}/export-excel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codes })
    });

    const data = await parseJsonSafe(res);
    console.log("Excel response:", data);

    if (!res.ok || data.error) {
        throw new Error(data.error || "สร้าง Excel ไม่สำเร็จ");
    }

    return data;
}

/* ============================================================
   4. MAIN EVENT LISTENERS
   ============================================================ */
document.addEventListener("DOMContentLoaded", () => {
    const el = {
        btnAuto: document.getElementById("btn-auto-gen"),
        btnCustom: document.getElementById("btn-custom-format"),
        customSection: document.getElementById("customFormatSection"),
        qtyInput: document.querySelector(".qty-input"),
        digitValue: document.getElementById("digitValue"),
        plusBtn: document.querySelector(".digit-btn.plus"),
        minusBtn: document.querySelector(".digit-btn.minus"),
        logoInput: document.getElementById("logoInput"),
        logoPreview: document.getElementById("logoPreview"),
        logoBox: document.getElementById("logoBox")
    };



    /* ---------- mode toggle ---------- */
    el.btnAuto?.addEventListener("click", () => {
        document.querySelectorAll(".btn-mode").forEach((b) => b.classList.remove("active"));
        el.btnAuto.classList.add("active");
        el.customSection?.classList.add("hidden");
        updateSummary();
    });

    el.btnCustom?.addEventListener("click", () => {
        document.querySelectorAll(".btn-mode").forEach((b) => b.classList.remove("active"));
        el.btnCustom.classList.add("active");
        el.customSection?.classList.remove("hidden");
        updateSummary();
    });

    /* ---------- size selection ---------- */
    document.querySelectorAll(".btn-size").forEach((btn) => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".btn-size").forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            updateSummary();
        });
    });

    /* ---------- quantity ---------- */
    el.qtyInput?.addEventListener("input", () => {
        const cleanValue = el.qtyInput.value.replace(/[^\d]/g, "");
        el.qtyInput.value = cleanValue;
        updateSummary();
    });

    document.querySelectorAll(".btn-qty").forEach((btn) => {
        btn.addEventListener("click", () => {
            const add = parseInt(btn.innerText.replace("+", ""), 10) || 0;
            const current = parseInt(el.qtyInput?.value || "0", 10) || 0;

            if (el.qtyInput) {
                el.qtyInput.value = String(current + add);
            }

            updateSummary();
        });
    });

    /* ---------- digit control ---------- */
    el.plusBtn?.addEventListener("click", () => {
        window.state.digit += 1;
        if (el.digitValue) el.digitValue.innerText = window.state.digit;
        updateSummary();
    });

    el.minusBtn?.addEventListener("click", () => {
        if (window.state.digit > 1) {
            window.state.digit -= 1;
            if (el.digitValue) el.digitValue.innerText = window.state.digit;
            updateSummary();
        }
    });

    /* ---------- separator ---------- */
    document.querySelectorAll(".sep-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".sep-btn").forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            updateSummary();
        });
    });

    /* ---------- prefix input ---------- */
    document.querySelector(".input-prefix")?.addEventListener("input", updateSummary);

    /* ---------- CTA buttons ---------- */
    document.querySelectorAll(".fireBtn").forEach((btn) => {
        btn.addEventListener("click", async (e) => {
            e.preventDefault();

            if (window.state.isNavigating) return;

            const target = btn.dataset.link?.trim();

            if (!target) return;

            if (target === "preview.html") {
                await generatePreviewAndGo();
            } else {
                window.location.href = target;
            }
        });
    });

    /* ---------- logo preview ---------- */
    el.logoInput?.addEventListener("change", (e) => {
        const file = e.target.files?.[0];

        if (!file) {
            if (el.logoPreview) el.logoPreview.src = "";
            el.logoBox?.classList.remove("has-image");
            return;
        }

        const reader = new FileReader();
        reader.onload = (ev) => {
            if (el.logoPreview) {
                el.logoPreview.src = ev.target?.result || "";
            }
            el.logoBox?.classList.add("has-image");
        };
        reader.readAsDataURL(file);
    });

    updateSummary();
});

/* ============================================================
   5. SUCCESS PAGE LOGIC
   ============================================================ */
function downloadPDF() {
    const pdfUrl = localStorage.getItem("pdf_url");

    if (pdfUrl) {
        const link = document.createElement("a");
        link.href = pdfUrl;
        link.target = "_blank";
        link.rel = "noopener";
        link.download = pdfUrl.split("/").pop() || "preview.pdf";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } else {
        alert("อุ๊ย! หาไฟล์ PDF ไม่เจอ ลองเจนใหม่อีกรอบนะ");
    }
}

async function downloadExcel() {
    const rawCodes = localStorage.getItem("latest_codes");

    if (!rawCodes) {
        alert("หาข้อมูลรหัสไม่เจอ");
        return;
    }

    try {
        const codes = JSON.parse(rawCodes);
        const data = await exportExcelFromCodes(codes);

        if (data.excel_url) {
            window.location.href = normalizePdfUrl(data.excel_url);
        } else {
            alert("เจน Excel ไม่สำเร็จ");
        }
    } catch (err) {
        console.error("Excel Error:", err);
        alert(`การเชื่อมต่อล้มเหลว: ${err.message}`);
    }
}

if (window.location.pathname.includes("success.html")) {
    document.addEventListener("DOMContentLoaded", () => {
        if (typeof confetti === "function") {
            confetti({
                particleCount: 150,
                spread: 70,
                origin: { y: 0.6 }
            });
        }

        document.getElementById("btn-download-pdf")?.addEventListener("click", downloadPDF);
        document.getElementById("btn-download-excel")?.addEventListener("click", downloadExcel);
    });
}

/* ============================================================
   6. HISTORY PAGE LOGIC (NEW VERSION 🔥)
   ============================================================ */
if (window.location.pathname.includes("history.html")) {
    document.addEventListener("DOMContentLoaded", loadHistory);
    async function loadHistory() {
        const historyList = document.getElementById("historyList");
        const emptyState = document.getElementById("emptyState");

        try {
            const res = await fetch(`${API_BASE}/history`);
            const data = await res.json();

            historyList.innerHTML = "";

            if (!data.files || data.files.length === 0) {
                emptyState.style.display = "block";
                return;
            }

            emptyState.style.display = "none";

            data.files.forEach(file => {

                const row = document.createElement("div");
                row.className = "history-item";

                const parts = file.filename.replace(".pdf", "").split("-");
                const company = parts[0];
                const lot = parts[1];
                const mode = parts[2];
                const size = parts[3];

                row.innerHTML = `
                    <div class="his-info">
                        <strong>${file.filename}</strong>
                        <small>Lot: ${lot} | Size: ${size} | Mode: ${mode}</small>
                    </div>

                    <div class="his-actions">
                        <button onclick="openPDF('${file.url}')">📄</button>
                        <button onclick="deleteFile('${file.filename}')">🗑️</button>
                    </div>
                `;

                historyList.appendChild(row);
            });

            document.querySelector(".card-header span").innerText =
                `ทั้งหมด ${data.files.length} รายการ`;

        } catch (err) {
            console.error("โหลด history ไม่ได้:", err);
        }
    }

    function openPDF(url) {
        window.open(url, "_blank");
    }

    async function deleteFile(filename) {
        if (!confirm(`ลบ ${filename} ?`)) return;

        await fetch(`${API_BASE}/history/${filename}`, {
            method: "DELETE"
        });

        loadHistory(); // refresh
    }
}