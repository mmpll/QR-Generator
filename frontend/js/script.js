/* ============================================================
   1. CONFIG & STATE
   ============================================================ */
window.state = {
    isNavigating: false,
    digit: 8
};

const API_BASE = "http://127.0.0.1:8000";

function goHome() {
    window.location.href = "config.html";
}

function goHistory() {
    window.location.href = "history.html";
}

const LAYOUT_MAP = {
    "STD": 40,
    "M": 40,
    "S": 60,
    "SS": 100
};

function saveToHistory(pdfUrl, excelUrl, config) {
    let history = JSON.parse(localStorage.getItem("qr_history") || "[]");

    const newEntry = {
        id: Date.now(),
        date: new Date().toLocaleString("th-TH"),
        pdf: pdfUrl,
        excel: excelUrl,
        size: config.size,
        qty: config.quantity
    };

    history.unshift(newEntry);
    localStorage.setItem("qr_history", JSON.stringify(history));
    console.log("บันทึกประวัติเรียบร้อย:", newEntry);
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

    return {
        mode: modeName,
        size: sizeLabel,
        quantity: parseInt(document.querySelector(".qty-input")?.value, 10) || 1,
        digit: window.state.digit,
        prefix: document.querySelector(".input-prefix")?.value?.trim() || "",
        separator: separatorText
    };
}

function updateSummary() {
    const config = collectConfig();
    const perPage = LAYOUT_MAP[config.size] || 40;
    const totalPages = Math.ceil(config.quantity / perPage) || 0;

    const statValues = document.querySelectorAll(".stat-item span");
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

/* ============================================================
   3. API INTERACTION
   ============================================================ */
async function generatePreviewAndGo() {
    const config = collectConfig();
    showLoading(true);

    try {
        // const res = await fetch("http://127.0.0.1:8000/generate", {
        const res = await fetch("http://127.0.0.1:8000/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(config)
        });

        const data = await res.json();
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

        localStorage.removeItem("pdf_url");
        localStorage.removeItem("latest_codes");

        localStorage.setItem("pdf_url", data.pdf_url);

        if (data.codes && Array.isArray(data.codes)) {
            localStorage.setItem("latest_codes", JSON.stringify(data.codes));
        }

        saveToHistory(data.pdf_url, data.excel_url || "", config);

        console.log("กำลังพาไปหน้า Preview...");
        window.location.href = "preview.html";
    } catch (err) {
        console.error("🔥 FETCH ERROR:", err);
        alert(`สร้าง Preview ไม่สำเร็จ: ${err.message}`);
    } finally {
        showLoading(false);
    }
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

    /* ---------- default active states ---------- */
    if (el.btnAuto && !document.querySelector(".btn-mode.active")) {
        el.btnAuto.classList.add("active");
    }

    const firstSizeBtn = document.querySelector(".btn-size");
    if (firstSizeBtn && !document.querySelector(".btn-size.active")) {
        firstSizeBtn.classList.add("active");
    }

    const firstSepBtn = document.querySelector(".sep-btn");
    if (firstSepBtn && !document.querySelector(".sep-btn.active")) {
        firstSepBtn.classList.add("active");
    }

    if (el.digitValue) {
        el.digitValue.innerText = window.state.digit;
    }

    /* ---------- mode toggle ---------- */
    el.btnAuto?.addEventListener("click", () => {
        document.querySelectorAll(".btn-mode").forEach(b => b.classList.remove("active"));
        el.btnAuto.classList.add("active");
        el.customSection?.classList.add("hidden");
        updateSummary();
    });

    el.btnCustom?.addEventListener("click", () => {
        document.querySelectorAll(".btn-mode").forEach(b => b.classList.remove("active"));
        el.btnCustom.classList.add("active");
        el.customSection?.classList.remove("hidden");
        updateSummary();
    });

    /* ---------- size selection ---------- */
    document.querySelectorAll(".btn-size").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".btn-size").forEach(b => b.classList.remove("active"));
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

    document.querySelectorAll(".btn-qty").forEach(btn => {
        btn.addEventListener("click", () => {
            const add = parseInt(btn.innerText.replace("+", ""), 10) || 0;
            const current = parseInt(el.qtyInput?.value || "0", 10) || 0;
            if (el.qtyInput) {
                el.qtyInput.value = current + add;
            }
            updateSummary();
        });
    });

    /* ---------- digit control ---------- */
    el.plusBtn?.addEventListener("click", () => {
        window.state.digit++;
        if (el.digitValue) el.digitValue.innerText = window.state.digit;
        updateSummary();
    });

    el.minusBtn?.addEventListener("click", () => {
        if (window.state.digit > 1) {
            window.state.digit--;
            if (el.digitValue) el.digitValue.innerText = window.state.digit;
            updateSummary();
        }
    });

    /* ---------- separator ---------- */
    document.querySelectorAll(".sep-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".sep-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            updateSummary();
        });
    });

    /* ---------- prefix input ---------- */
    document.querySelector(".input-prefix")?.addEventListener("input", updateSummary);

    /* ---------- CTA buttons ---------- */
    document.querySelectorAll(".fireBtn").forEach(btn => {
        btn.addEventListener("click", async (e) => {
            e.preventDefault();

            const target = btn.dataset.link;

            if (target === "preview.html") {
                await generatePreviewAndGo();
            } else if (target) {
                window.location.href = target;
            }
        });
    });

    /* ---------- logo preview ---------- */
    el.logoInput?.addEventListener("change", (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

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
        link.download = pdfUrl.split("/").pop();
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
        const res = await fetch(`${API_BASE}/export-excel`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ codes: JSON.parse(rawCodes) })
        });

        const data = await res.json();
        console.log("Excel response:", data);

        if (!res.ok || data.error) {
            throw new Error(data.error || "สร้าง Excel ไม่สำเร็จ");
        }

        if (data.excel_url) {
            window.location.href = data.excel_url;
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
   6. HISTORY PAGE LOGIC
   ============================================================ */
if (window.location.pathname.includes("history.html")) {
    document.addEventListener("DOMContentLoaded", () => {
        const historyList = document.getElementById("historyList");
        const emptyState = document.getElementById("emptyState");

        let history = JSON.parse(localStorage.getItem("qr_history") || "[]");

        if (history.length === 0) {
            if (emptyState) emptyState.style.display = "block";
            if (historyList) historyList.innerHTML = "";
            return;
        }

        if (emptyState) emptyState.style.display = "none";

        if (historyList) {
            historyList.innerHTML = "";

            history.forEach(item => {
                const row = document.createElement("div");
                row.className = "history-item";

                row.innerHTML = `
                    <div class="his-info" style="display:flex; flex-direction:column;">
                        <strong>วันที่สร้าง: ${item.date}</strong>
                        <small>ขนาด ${item.size} | จำนวน ${item.qty} ดวง</small>
                    </div>
                    <div class="his-actions">
                        <img src="../assets/img/pdf.png" class="btn-dl-pdf" data-url="${item.pdf || ""}" style="width:30px; cursor:pointer; margin-right:10px;">
                        <img src="../assets/img/xls.png" class="btn-dl-excel" data-url="${item.excel || ""}" style="width:30px; cursor:pointer;">
                    </div>
                `;
                historyList.appendChild(row);
            });
        }

        const triggerDownload = (url) => {
            if (!url) {
                alert("ไม่พบไฟล์");
                return;
            }

            const link = document.createElement("a");
            link.href = url;
            link.download = url.split("/").pop();
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        };

        document.body.addEventListener("click", (e) => {
            if (e.target.classList.contains("btn-dl-pdf") || e.target.classList.contains("btn-dl-excel")) {
                const url = e.target.getAttribute("data-url");
                triggerDownload(url);
            }
        });
    });
}