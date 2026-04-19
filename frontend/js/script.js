/* ============================================================
   1. CONFIG & STATE
   ============================================================ */
window.state = {
    isNavigating: false,
    digit: 8 // ค่าเริ่มต้นสำหรับโหมด Custom
};

const LAYOUT_MAP = {
    "STD": 40,
    "M": 40,
    "S": 60,
    "SS": 100
};

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
// async function generatePreviewAndGo() {
//     const config = collectConfig();
    
//     console.log("SEND TO API:", config);
    
//     const loading = document.getElementById("loadingScreen");
//     if (loading) loading.style.display = "flex";

//     try {
//         const res = await fetch("http://127.0.0.1:8000/generate", {
//             method: "POST",
//             headers: { "Content-Type": "application/json" },
//             body: JSON.stringify(config)
//         });

//         const text = await res.text();
//         console.log("RAW RESPONSE:", text);

//         let data;
//         try {
//             data = JSON.parse(text);
//         } catch (e) {
//             console.error("JSON parse error:", e);
//             alert("Server response ไม่ใช่ JSON");
//             return;
//         }

//         if (data.pdf_url) {
//             // เก็บ URL ไว้ใช้ในหน้า preview.html
//             localStorage.setItem("pdf_url", data.pdf_url);
//             window.location.href = "preview.html";
//         } else {
//             alert("ไม่สามารถสร้างพรีวิวได้ กรุณาลองใหม่");
//         }
//     } catch (err) {
//         console.error("API Error:", err);
//         alert("การเชื่อมต่อเซิร์ฟเวอร์ล้มเหลว");
//     } finally {
//         if (loading) loading.style.display = "none";
//     }
// }

async function generatePreviewAndGo() {
    const config = collectConfig();

    console.log("SEND TO API:", config);

    try {
        const res = await fetch("http://127.0.0.1:8000/generate", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(config)
        });

        console.log("STATUS:", res.status);

        const text = await res.text();
        console.log("RAW RESPONSE:", text);

        if (!res.ok) {
            alert("Server error: " + text);
            return;
        }

        const data = JSON.parse(text);

        if (data.pdf_url) {
            localStorage.setItem("pdf_url", data.pdf_url);
            window.location.href = "preview.html";
        } else {
            alert("ไม่มี pdf_url");
        }

    } catch (err) {
        console.error("🔥 FETCH ERROR:", err);
        alert("เชื่อมต่อ server ไม่ได้จริง ๆ");
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