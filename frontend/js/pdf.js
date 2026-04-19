let pdfDoc = null;
let scale = 1;
const viewer = document.getElementById("viewer");

document.addEventListener("DOMContentLoaded", () => {
    if (viewer) viewer.innerHTML = "";
    
    // ดึง URL
    let storedUrl = localStorage.getItem("pdf_url");

    if (!storedUrl) {
        console.error("ไม่พบ PDF URL");
        return;
    }
    if (!storedUrl.startsWith('http')) {
            storedUrl = `http://127.0.0.1:8000${storedUrl.startsWith('/') ? '' : '/'}${storedUrl}`;
        }

        console.log("กำลังโหลด PDF จาก:", storedUrl); 
        loadPDF(storedUrl);
  });

function loadPDF(pdfUrl) {
    pdfjsLib.getDocument(pdfUrl).promise.then(pdf => {
        pdfDoc = pdf;

        document.getElementById("page-count").textContent = pdf.numPages;

        calculateBaseScale().then(() => {
            renderPagesLazy();
        });

    }).catch(err => {
        console.error("โหลด PDF ไม่ได้:", err);
    });
}

async function calculateBaseScale() {
    const page = await pdfDoc.getPage(1);
    const viewport = page.getViewport({ scale: 1 });

    const containerWidth = viewer.clientWidth;

    baseScale = containerWidth / viewport.width;
    scale = baseScale;
}

function renderPagesLazy() {
    if (!viewer || !pdfDoc) return;
    viewer.innerHTML = "";

    for (let i = 1; i <= pdfDoc.numPages; i++) {
        const wrapper = document.createElement("div");
        wrapper.className = "page-wrapper";
        wrapper.dataset.page = i;

        const canvas = document.createElement("canvas");
        canvas.className = "pdf-page";

        wrapper.appendChild(canvas);
        viewer.appendChild(wrapper);

        observePage(wrapper, canvas, i);
    }
}

function observePage(wrapper, canvas, pageNum) {
    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting && !canvas.rendered) {
                renderPage(pageNum, canvas);
                canvas.rendered = true;
            }
        });
    }, { threshold: 0.2 });

    observer.observe(wrapper);
}

function renderPage(num, canvas) {
    pdfDoc.getPage(num).then(page => {

        const viewport = page.getViewport({ scale: scale });

        const context = canvas.getContext("2d");

        const dpr = window.devicePixelRatio || 1;

        canvas.width = viewport.width * dpr;
        canvas.height = viewport.height * dpr;

        canvas.style.width = viewport.width + "px";
        canvas.style.height = viewport.height + "px";

        context.setTransform(dpr, 0, 0, dpr, 0, 0);

        page.render({
            canvasContext: context,
            viewport: viewport
        });
    });
}

function zoomIn() {
    scale += 0.2;
    applyZoom();
}

function zoomOut() {
    scale = Math.max(0.5, scale - 0.2);
    applyZoom();
}

function applyZoom() {
    const zoomLevelEl = document.getElementById("zoom-level");
    if (zoomLevelEl) zoomLevelEl.textContent = Math.round(scale * 100) + "%";

    document.querySelectorAll(".pdf-page").forEach((canvas, index) => {
        canvas.rendered = false;
        renderPage(index + 1, canvas);
        canvas.rendered = true;
    });
}

viewer.addEventListener("scroll", () => {
    const pages = document.querySelectorAll(".page-wrapper");

    let closest = null;
    let minOffset = Infinity;

    pages.forEach(p => {
        const rect = p.getBoundingClientRect();
        const offset = Math.abs(rect.top - 100);

        if (offset < minOffset) {
            minOffset = offset;
            closest = p;
        }
    });

    if (closest) {
        document.getElementById("page-num").textContent = closest.dataset.page;
    }
});


// Buttons
document.querySelector(".back-btn")?.addEventListener("click", () => {
    window.location.href = "config.html";
});

document.querySelector(".cta-btn")?.addEventListener("click", () => {
    window.location.href = "success.html";
});