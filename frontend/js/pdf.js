const PDFJS_WORKER_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
} else {
    console.error("PDF.js did not load. Check your internet connection or CDN access.");
}

let pdfDocument = null;
let scale = 1;
let baseScale = 1;

document.addEventListener("DOMContentLoaded", () => {
    if (!window.location.pathname.includes("preview.html")) {
        return;
    }

    const backButton = document.querySelector(".back-btn");
    const continueButton = document.querySelector(".cta-btn");

    backButton?.addEventListener("click", async () => {
        try {
            if (typeof discardDraftIfNeeded === "function") {
                await discardDraftIfNeeded();
            } else if (typeof clearStoredJobState === "function") {
                clearStoredJobState();
            }
        } finally {
            if (typeof navigateToUrl === "function") {
                navigateToUrl(buildPageUrl("config.html"));
            } else {
                window.location.assign(buildPageUrl("config.html"));
            }
        }
    });

    continueButton?.addEventListener("click", async () => {
        try {
            if (typeof confirmDraftIfNeeded === "function") {
                await confirmDraftIfNeeded();
            }
            if (typeof navigateToUrl === "function") {
                navigateToUrl(buildPageUrl("success.html"));
            } else {
                window.location.assign(buildPageUrl("success.html"));
            }
        } catch (err) {
            console.error("Confirm draft failed:", err);
            alert(`Could not save this preview: ${err?.message || "Unknown error"}`);
        }
    });

    void initPreviewPage();
});

async function initPreviewPage() {
    const viewer = document.getElementById("viewer");
    if (!viewer) {
        console.error("Missing preview viewer");
        return;
    }

    setPreviewBusy(true, "Preparing QR files and PDF preview...");
    renderLoadingState(viewer, "Preparing QR files and PDF preview...");

    try {
        if (!window.pdfjsLib) {
            throw new Error("PDF viewer library did not load. Please check your internet connection and refresh.");
        }

        const previewState = await ensurePreviewState();
        if (!previewState.pdf_url) {
            renderMissingState(viewer, "No preview is available yet.");
            return;
        }

        await ensurePdfReady(previewState.pdf_url, previewState.draft_id);
        await loadPdf(previewState.pdf_url);
        setPreviewBusy(false);
    } catch (err) {
        console.error("Failed to initialize preview:", err);
        if (typeof clearStoredJobState === "function") {
            clearStoredJobState();
        }
        setPreviewBusy(false);
        renderMissingState(viewer, err?.message || "The preview could not be loaded.");
    }
}

async function ensurePreviewState() {
    const currentState =
        typeof getJobState === "function"
            ? getJobState()
            : {};

    if (currentState.draft_id && typeof pollDraftUntilReady === "function") {
        return pollDraftUntilReady(currentState.draft_id);
    }

    if (currentState.pdf_url) {
        return currentState;
    }

    throw new Error("No preview is selected yet.");
}

function renderMissingState(viewer, message) {
    viewer.innerHTML = `
        <div style="padding:24px; text-align:center; color:#c00;">
            ${message}
            <br><br>
            <button onclick="goHome()" style="padding:10px 16px; cursor:pointer;">
                Back to configuration
            </button>
        </div>
    `;
}

function renderLoadingState(viewer, message) {
    viewer.innerHTML = `
        <div class="preview-loading-state" role="status" aria-live="polite">
            <div class="spinner"></div>
            <h2>Preparing preview</h2>
            <p>${message}</p>
        </div>
    `;
}

function setPreviewBusy(isBusy, message = "") {
    const continueButton = document.querySelector(".cta-btn");
    const viewer = document.getElementById("viewer");

    if (continueButton) {
        continueButton.disabled = isBusy;
        continueButton.classList.toggle("is-disabled", isBusy);
    }

    if (isBusy && viewer && message) {
        renderLoadingState(viewer, message);
    }
}

async function checkPdfExists(pdfUrl) {
    const response = await fetch(pdfUrl, { method: "HEAD" });
    if (!response.ok) {
        throw new Error(`PDF not found: ${response.status}`);
    }
}

async function ensurePdfReady(pdfUrl, draftId = "", attempts = 40, delayMs = 500) {
    const viewer = document.getElementById("viewer");

    for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
            await checkPdfExists(pdfUrl);
            return;
        } catch (err) {
            if (viewer) {
                const suffix = draftId ? ` Draft: ${draftId}` : "";
                renderLoadingState(viewer, `Still creating QR files and PDF...${suffix}`);
            }
        }

        await new Promise((resolve) => window.setTimeout(resolve, delayMs));
    }

    throw new Error("The preview PDF is not ready yet.");
}

async function loadPdf(pdfUrl) {
    const viewer = document.getElementById("viewer");
    if (!viewer) {
        return;
    }
    if (!window.pdfjsLib) {
        throw new Error("PDF viewer library did not load");
    }

    const loadingTask = window.pdfjsLib.getDocument(pdfUrl);
    pdfDocument = await loadingTask.promise;

    const pageCountElement = document.getElementById("page-count");
    if (pageCountElement) {
        pageCountElement.textContent = String(pdfDocument.numPages);
    }

    await calculateBaseScale();
    await renderAllPages();
    attachScrollListener();
}

async function calculateBaseScale() {
    const viewer = document.getElementById("viewer");
    if (!viewer || !pdfDocument) {
        return;
    }

    const page = await pdfDocument.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    const containerWidth = viewer.clientWidth || 900;

    baseScale = Math.min(containerWidth / viewport.width, 1.2);
    scale = baseScale;

    const zoomLevelElement = document.getElementById("zoom-level");
    if (zoomLevelElement) {
        zoomLevelElement.textContent = `${Math.round(scale * 100)}%`;
    }
}

async function renderAllPages() {
    const viewer = document.getElementById("viewer");
    if (!viewer || !pdfDocument) {
        return;
    }

    viewer.innerHTML = "";

    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
        const wrapper = document.createElement("div");
        wrapper.className = "page-wrapper";
        wrapper.dataset.page = String(pageNumber);
        wrapper.style.display = "flex";
        wrapper.style.justifyContent = "center";
        wrapper.style.width = "100%";

        const canvas = document.createElement("canvas");
        canvas.className = "pdf-page";
        wrapper.appendChild(canvas);
        viewer.appendChild(wrapper);

        await renderPage(pageNumber, canvas);
    }
}

async function renderPage(pageNumber, canvas) {
    if (!pdfDocument || !canvas) {
        return;
    }

    const page = await pdfDocument.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const context = canvas.getContext("2d");
    if (!context) {
        throw new Error("Browser could not create a PDF canvas context");
    }
    const devicePixelRatio = window.devicePixelRatio || 1;

    canvas.width = viewport.width * devicePixelRatio;
    canvas.height = viewport.height * devicePixelRatio;
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;

    context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);

    await page.render({
        canvasContext: context,
        viewport
    }).promise;
}

function zoomIn() {
    scale += 0.2;
    void applyZoom();
}

function zoomOut() {
    scale = Math.max(0.5, scale - 0.2);
    void applyZoom();
}

async function applyZoom() {
    const zoomLevelElement = document.getElementById("zoom-level");
    if (zoomLevelElement) {
        zoomLevelElement.textContent = `${Math.round(scale * 100)}%`;
    }

    await renderAllPages();
}

function attachScrollListener() {
    const viewer = document.getElementById("viewer");
    if (!viewer) {
        return;
    }

    viewer.addEventListener("scroll", () => {
        const pages = document.querySelectorAll(".page-wrapper");
        let closestPage = null;
        let minOffset = Infinity;

        pages.forEach((page) => {
            const rect = page.getBoundingClientRect();
            const offset = Math.abs(rect.top - 120);
            if (offset < minOffset) {
                minOffset = offset;
                closestPage = page;
            }
        });

        if (closestPage) {
            const pageNumberElement = document.getElementById("page-num");
            if (pageNumberElement) {
                pageNumberElement.textContent = closestPage.dataset.page;
            }
        }
    });
}
