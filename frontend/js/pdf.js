document.addEventListener("DOMContentLoaded", () => {
  const url = localStorage.getItem("pdf_url");

  if (!url) {
    alert("ไม่พบไฟล์ preview");
    return;
  }

  loadPDF(url);
});

const url = "assets/Qr Test.pdf";

let pdfDoc = null;
let scale = 1;
let currentPage = 1;

const viewer = document.getElementById("viewer");

pdfjsLib.getDocument(url).promise.then(pdf => {
  pdfDoc = pdf;
  document.getElementById("page-count").textContent = pdf.numPages;

  renderPagesLazy();
});

function renderPagesLazy() {
  viewer.innerHTML = "";

  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const wrapper = document.createElement("div");
    wrapper.className = "page-wrapper";
    wrapper.dataset.page = i;

    const canvas = document.createElement("canvas");
    canvas.className = "pdf-page";

    wrapper.appendChild(canvas);
    viewer.appendChild(wrapper);

    // render when visible
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
  });

  observer.observe(wrapper);
}

function renderPage(num, canvas) {
  pdfDoc.getPage(num).then(page => {
    const devicePixelRatio = window.devicePixelRatio || 1;

    const viewport = page.getViewport({
      scale: scale * devicePixelRatio   // 🔥 เพิ่มความคม
    });

    const context = canvas.getContext("2d");

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    // ทำให้แสดงผลขนาดปกติ
    canvas.style.width = viewport.width / devicePixelRatio + "px";
    canvas.style.height = viewport.height / devicePixelRatio + "px";

    context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);

    page.render({
      canvasContext: context,
      viewport: viewport
    });
  });
}

function zoomIn() {
  scale += 0.1;
  applyZoom();
}

function zoomOut() {
  scale = Math.max(0.5, scale - 0.1);
  applyZoom();
}

function applyZoom() {
  document.getElementById("zoom-level").textContent =
    Math.round(scale * 100) + "%";

  // render ใหม่ทุกหน้า
  document.querySelectorAll(".pdf-page").forEach((canvas, index) => {
    renderPage(index + 1, canvas);
  });
}

viewer.addEventListener("scroll", () => {
  const pages = document.querySelectorAll(".page-wrapper");

  let closest = null;
  let min = Infinity;

  pages.forEach(p => {
    const rect = p.getBoundingClientRect();
    const diff = Math.abs(rect.top);

    if (diff < min) {
      min = diff;
      closest = p;
    }
  });

  if (closest) {
    document.getElementById("page-num").textContent =
      closest.dataset.page;
  }
});

document.querySelector(".back-btn").addEventListener("click", () => {
  window.location.href = "config.html";
});

document.querySelector(".cta-btn").addEventListener("click", () => {
  window.location.href = "success.html";
});



