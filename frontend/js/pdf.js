pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

let pdfDoc = null;
let scale = 1;
let baseScale = 1;

document.addEventListener("DOMContentLoaded", async () => {
    const viewer = document.getElementById("viewer");
    if (!viewer) {
        console.error("ไม่พบ #viewer");
        return;
    }

    viewer.innerHTML = "";

    const storedUrl = localStorage.getItem("pdf_url");
    console.log("pdf_url from localStorage:", storedUrl);

    if (!storedUrl) {
        viewer.innerHTML = `
            <div style="padding:24px; text-align:center; color:#666;">
                ไม่พบ PDF URL<br>
                กรุณากลับไปสร้าง Preview ใหม่
            </div>
        `;
        return;
    }

    try {
        await checkPdfExists(storedUrl);
        await loadPDF(storedUrl);
    } catch (err) {
        console.error("โหลด PDF ไม่สำเร็จ:", err);

        viewer.innerHTML = `
            <div style="padding:24px; text-align:center; color:#c00;">
                โหลด PDF ไม่สำเร็จ<br>
                ไม่พบไฟล์ PDF ตาม URL ที่บันทึกไว้
                <br><br>
                <button onclick="goHome()" style="padding:10px 16px; cursor:pointer;">
                    กลับไปสร้างใหม่
                </button>
            </div>
        `;
    }
});

async function checkPdfExists(pdfUrl) {
    const res = await fetch(pdfUrl, { method: "HEAD" });

    if (!res.ok) {
        throw new Error(`PDF not found: ${res.status}`);
    }
}

async function loadPDF(pdfUrl) {
    const viewer = document.getElementById("viewer");
    if (!viewer) return;

    console.log("กำลังโหลด PDF จาก:", pdfUrl);

    const loadingTask = pdfjsLib.getDocument(pdfUrl);
    pdfDoc = await loadingTask.promise;

    const pageCountEl = document.getElementById("page-count");
    if (pageCountEl) {
        pageCountEl.textContent = pdfDoc.numPages;
    }

    await calculateBaseScale();
    await renderAllPages();
    attachScrollListener();
}

async function calculateBaseScale() {
    const viewer = document.getElementById("viewer");
    if (!viewer || !pdfDoc) return;

    const page = await pdfDoc.getPage(1);
    const viewport = page.getViewport({ scale: 1 });

    const containerWidth = viewer.clientWidth || 900;
    baseScale = Math.min(containerWidth / viewport.width, 1.2);
    scale = baseScale;

    const zoomLevelEl = document.getElementById("zoom-level");
    if (zoomLevelEl) {
        zoomLevelEl.textContent = Math.round(scale * 100) + "%";
    }
}

async function renderAllPages() {
    const viewer = document.getElementById("viewer");
    if (!viewer || !pdfDoc) return;

    viewer.innerHTML = "";

    for (let i = 1; i <= pdfDoc.numPages; i++) {
        const wrapper = document.createElement("div");
        wrapper.className = "page-wrapper";
        wrapper.dataset.page = i;
        wrapper.style.display = "flex";
        wrapper.style.justifyContent = "center";
        wrapper.style.width = "100%";

        const canvas = document.createElement("canvas");
        canvas.className = "pdf-page";

        wrapper.appendChild(canvas);
        viewer.appendChild(wrapper);

        await renderPage(i, canvas);
    }
}

async function renderPage(pageNum, canvas) {
    if (!pdfDoc || !canvas) return;

    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale });

    const context = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;

    canvas.width = viewport.width * dpr;
    canvas.height = viewport.height * dpr;
    canvas.style.width = viewport.width + "px";
    canvas.style.height = viewport.height + "px";

    context.setTransform(dpr, 0, 0, dpr, 0, 0);

    await page.render({
        canvasContext: context,
        viewport: viewport
    }).promise;
}

function zoomIn() {
    scale += 0.2;
    applyZoom();
}

function zoomOut() {
    scale = Math.max(0.5, scale - 0.2);
    applyZoom();
}

async function applyZoom() {
    const zoomLevelEl = document.getElementById("zoom-level");
    if (zoomLevelEl) {
        zoomLevelEl.textContent = Math.round(scale * 100) + "%";
    }

    await renderAllPages();
}

function attachScrollListener() {
    const viewer = document.getElementById("viewer");
    if (!viewer) return;

    viewer.addEventListener("scroll", () => {
        const pages = document.querySelectorAll(".page-wrapper");
        let closest = null;
        let minOffset = Infinity;

        pages.forEach((p) => {
            const rect = p.getBoundingClientRect();
            const offset = Math.abs(rect.top - 120);

            if (offset < minOffset) {
                minOffset = offset;
                closest = p;
            }
        });

        if (closest) {
            const pageNumEl = document.getElementById("page-num");
            if (pageNumEl) {
                pageNumEl.textContent = closest.dataset.page;
            }
        }
    });
}

document.querySelector(".back-btn")?.addEventListener("click", () => {
    window.location.href = "config.html";
});

document.querySelector(".cta-btn")?.addEventListener("click", () => {
    window.location.href = "success.html";
});
