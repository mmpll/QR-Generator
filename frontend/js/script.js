/* ============================================================
   1. CONFIG & STATE
   ============================================================ */
window.state = {
    isNavigating: false,
    digit: 8 // ค่าเริ่มต้นสำหรับโหมด Custom
};

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
        date: new Date().toLocaleString('th-TH'),
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
   2. HELPER FUNCTIONS (ใส่ไว้ด้านบนเพื่อให้เรียกใช้ง่าย)
   ============================================================ */

// ฟังก์ชันเก็บค่าจากหน้าจอ
function collectConfig() {
    const activeModeBtn = document.querySelector(".btn-mode.active");
    const modeName = activeModeBtn ? activeModeBtn.querySelector(".mode-name").innerText : "Auto Generate";
    
    const activeSizeBtn = document.querySelector(".btn-size.active");
    const sizeLabel = activeSizeBtn ? activeSizeBtn.querySelector(".size-label").innerText : "STD";

    return {
        mode: modeName,
        size: sizeLabel.trim().split("\n")[0],
        quantity: parseInt(document.querySelector(".qty-input")?.value) || 1,
        digit: window.state.digit,
        prefix: document.querySelector(".input-prefix")?.value || "",
        separator: document.querySelector(".sep-btn.active")?.innerText || ""
    };
}

// ฟังก์ชันอัปเดตสรุปผลด้านล่างแบบ Real-time
function updateSummary() {
    const config = collectConfig();
    const perPage = LAYOUT_MAP[config.size] || 40;
    const totalPages = Math.ceil(config.quantity / perPage) || 0;

    // อัปเดตตัวเลขสถิติ (อ้างอิงลำดับ Stat Item ใน HTML ของคุณ)
    const statValues = document.querySelectorAll(".stat-item span");
    if (statValues.length >= 4) {
        statValues[0].innerText = config.quantity.toLocaleString(); // จำนวนดวง
        statValues[1].innerText = config.size;  // ขนาด
        statValues[2].innerText = perPage; // ดวง/หน้า
        statValues[3].innerText = totalPages; // ทั้งหมดกี่หน้า
    }

    // อัปเดตช่วงรหัส (Preview เบื้องต้น)
    const rangeDisplay = document.querySelector(".range-highlight");
    if (rangeDisplay) {
        if (config.mode === "Auto Generate") {
            rangeDisplay.innerText = "Unique Random 11 Digits (xxx-xxxx-xxxx)";
        } else {
            const displayPrefix = config.prefix || "HOD";
            rangeDisplay.innerText = `${displayPrefix}${config.separator}XXXX → ${displayPrefix}${config.separator}XXXX`;
        }
    }
}

/* ============================================================
   3. API INTERACTION 
   ============================================================ */
  async function generatePreviewAndGo() {
    const config = collectConfig();
    const loading = document.getElementById("loadingScreen");
    if (loading) loading.style.display = "flex";

    try {
        // const res = await fetch("http://127.0.0.1:8000/generate", {
        const res = await fetch("http://localhost:8000/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(config)
        });

        if (!res.ok) throw new Error("หลังบ้านพ่น Error ออกมา");

        const data = await res.json();
        console.log("ได้ข้อมูลใหม่จากหลังบ้านแล้ว!", data);

        localStorage.removeItem("pdf_url");
        localStorage.removeItem("latest_codes");

        if (data.pdf_url) {
            localStorage.setItem("pdf_url", data.pdf_url);
            if (data.codes) {
                localStorage.setItem("latest_codes", JSON.stringify(data.codes));
            }

            if (typeof saveToHistory === "function") {
                saveToHistory(data.pdf_url, data.excel_url || "", config);
            }

            console.log("กำลังพาไปหน้า Preview...");
            setTimeout(() => {
                window.location.href = "preview.html";
            }, 300); 
        }

    } catch (err) {
        console.error("🔥 FETCH ERROR:", err);
        alert("การเชื่อมต่อเซิร์ฟเวอร์ล้มเหลว!");
    } finally {
        if (loading) loading.style.display = "none";
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
        logoPreview: document.getElementById("logoPreview")
    };

    // --- จัดการสลับโหมด Auto / Custom ---
    el.btnAuto?.addEventListener("click", () => {
        document.querySelectorAll(".btn-mode").forEach(b => b.classList.remove("active"));
        el.btnAuto.classList.add("active");
        el.customSection?.classList.add("hidden"); // ซ่อน Prefix
        updateSummary();
    });

    el.btnCustom?.addEventListener("click", () => {
        document.querySelectorAll(".btn-mode").forEach(b => b.classList.remove("active"));
        el.btnCustom.classList.add("active");
        el.customSection?.classList.remove("hidden"); // โชว์ Prefix
        updateSummary();
    });

    // --- จัดการเลือก Size ---
    document.querySelectorAll(".btn-size").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".btn-size").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            updateSummary();
        });
    });

    // --- จัดการจำนวน (Input & Quick Buttons) ---
    el.qtyInput?.addEventListener("input", updateSummary);
    document.querySelectorAll(".btn-qty").forEach(btn => {
        btn.addEventListener("click", () => {
            const add = parseInt(btn.innerText.replace('+', '')) || 0;
            el.qtyInput.value = (parseInt(el.qtyInput.value) || 0) + add;
            updateSummary();
        });
    });

    // --- จัดการ Digit (ปุ่มบวก/ลบ) ---
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

    // --- จัดการ Separator ---
    document.querySelectorAll(".sep-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".sep-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            updateSummary();
        });
    });

    // --- จัดการ Prefix Input ---
    document.querySelector(".input-prefix")?.addEventListener("input", updateSummary);

    // --- ปุ่มสร้างพรีวิว (Fire Button) ---
    document.querySelectorAll(".fireBtn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            const target = btn.dataset.link;
            if (target === "preview.html") {
                generatePreviewAndGo();
            } else {
                window.location.href = target;
            }
        });
    });

    // --- Logo Preview (Optional) ---
    el.logoInput?.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                if (el.logoPreview) el.logoPreview.src = ev.target.result;
            };
            reader.readAsDataURL(file);
        }
    });

    updateSummary();
});

/* ============================================================
   5. SUCCESS PAGE LOGIC
   ============================================================ */
// ฟังก์ชันโหลด PDF
function downloadPDF() {
    const pdfUrl = localStorage.getItem("pdf_url");
    if (pdfUrl) {
        const link = document.createElement('a');
        link.href = pdfUrl;
        link.download = pdfUrl.split('/').pop();
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } else {
        alert("อุ๊ย! หาไฟล์ PDF ไม่เจอ ลองเจนใหม่อีกรอบนะ");
    }
}

// ฟังก์ชันโหลด Excel
async function downloadExcel() {
    const rawCodes = localStorage.getItem("latest_codes");
    if (!rawCodes) {
        alert("หาข้อมูลรหัสไม่เจอ");
        return;
    }

    try {
        const res = await fetch("http://127.0.0.1:8000/export-excel", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ codes: JSON.parse(rawCodes) })
        });

        const data = await res.json();
        if (data.excel_url) {
            window.location.href = data.excel_url;
        } else {
            alert("เจน Excel ไม่สำเร็จ");
        }
    } catch (err) {
        console.error("Excel Error:", err);
        alert("การเชื่อมต่อล้มเหลว ลองเช็คหลังบ้านดูนะ");
    }
}

if (window.location.pathname.includes("success.html")) {
    document.addEventListener("DOMContentLoaded", () => {
        if (typeof confetti === "function") {
            confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
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
                        <img src="../assets/img/pdf.png" class="btn-dl-pdf" data-url="${item.pdf}" style="width:30px; cursor:pointer; margin-right:10px;">
                        <img src="../assets/img/xls.png" class="btn-dl-excel" data-url="${item.excel}" style="width:30px; cursor:pointer;">
                    </div>
                `;
                historyList.appendChild(row);
            });
        }

        const triggerDownload = (url) => {
            if (!url) return alert("ไม่พบไฟล์");
            const link = document.createElement('a');
            link.href = url;
            link.download = url.split('/').pop();
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