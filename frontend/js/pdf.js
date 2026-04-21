pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

let pdfDoc = null;
let scale = 1;
let baseScale = 1;

const viewer = document.getElementById("viewer");

document.addEventListener("DOMContentLoaded", () => {
    if (viewer) viewer.innerHTML = "";

    let storedUrl = localStorage.getItem("pdf_url");

    if (!storedUrl) {
        console.error("ไม่พบ PDF URL ใน localStorage");
        console.log("Current localStorage:", Object.keys(localStorage));
        return;
    }

    console.log("กำลังโหลด PDF จาก:", storedUrl);

    loadPDF(storedUrl);
});

function loadPDF(pdfUrl) {
    pdfjsLib.getDocument(pdfUrl).promise.then(pdf => {
        pdfDoc = pdf;
        document.getElementById("page-count").textContent = pdf.numPages;

        calculateBaseScale().then(() => {
            renderPagesLazy(); // <-- ต้องเรียกชื่อนี้ให้ตรงกับด้านล่างครับ
        });
    }).catch(err => {
        console.error("โหลด PDF ไม่ได้:", err);
    });
}

async function calculateBaseScale() {
    const viewer = document.getElementById("viewer");
    if (!viewer || !pdfDoc) return;

    const page = await pdfDoc.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    const containerWidth = viewer.clientWidth || 800;

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

function updateCurrentPageOnScroll() {
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