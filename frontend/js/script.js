function collectConfig() {
  return {
    quantity: parseInt(document.querySelector(".qty-input")?.value) || 0,
    size: document.querySelector(".btn-size.active")?.innerText || "",
    mode: document.querySelector(".btn-mode.active")?.innerText || "",
    digit: window.state?.digit || 8,
    prefix: document.querySelector(".input-prefix")?.value || "",
    separator: document.querySelector(".sep-btn.active")?.innerText || "-"
  };
}

/* =========================
   GENERATE + NAVIGATE
========================= */
async function generatePreviewAndGo() {
  const config = collectConfig();

  try {
    const res = await fetch("http://127.0.0.1:8000/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        prefix: config.prefix,
        start: 1,
        quantity: config.quantity || 10,
        digit: config.digit,
        separator: config.separator === "None" ? "" : config.separator
      })
    });

    const data = await res.json();

    console.log("API RESULT:", data);

    localStorage.setItem("qrData", JSON.stringify(data.items));

    window.location.href = "preview.html";

  } catch (err) {
    console.error("ERROR:", err);
    alert("พรีวิวไม่สำเร็จ 😢");
  }
}

/* =========================
   RENDER QR (SAFE)
========================= */
function renderQRPreview() {
  const viewer = document.getElementById("viewer");

  if (!viewer) return;

  let qrData = null;

  try {
    qrData = JSON.parse(localStorage.getItem("qrData"));
  } catch (e) {
    console.warn("qrData parse error", e);
    return;
  }

  if (!qrData || qrData.length === 0) {
    viewer.innerHTML = "<p style='color:white'>ไม่พบข้อมูล QR 😢</p>";
    return;
  }

  viewer.innerHTML = "";

  qrData.forEach(item => {
    const card = document.createElement("div");
    card.className = "qr-card";
    card.innerHTML = `<img src="${item.img_url}"><p>${item.code}</p>`;
    viewer.appendChild(card);
  });

  const pageCount = document.getElementById("page-count");
  if (pageCount) pageCount.innerText = qrData.length;
}

/* =========================
   MAIN
========================= */
document.addEventListener("DOMContentLoaded", () => {

  window.state = {
    isNavigating: false,
    digit: 8
  };

  const el = {
    logoInput: document.getElementById("logoInput"),
    logoPreview: document.getElementById("logoPreview"),
    logoBox: document.getElementById("logoBox"),
    uploadText: document.getElementById("uploadLabelText"),
    uploadHint: document.getElementById("uploadHint"),

    btnAuto: document.getElementById("btn-auto-gen"),
    btnCustom: document.getElementById("btn-custom-format"),
    customSection: document.getElementById("customFormatSection"),

    digitValue: document.getElementById("digitValue"),
    plusBtn: document.querySelector(".digit-btn.plus"),
    minusBtn: document.querySelector(".digit-btn.minus"),

    historyList: document.getElementById("historyList")
  };

  /* =========================
     NAV BUTTON
  ========================= */
  document.querySelectorAll(".fireBtn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();

      if (state.isNavigating) return;
      state.isNavigating = true;

      const target = btn.dataset.link;

      if (target === "preview.html") {
        generatePreviewAndGo();
      } else {
        window.location.href = target;
      }
    });
  });

  /* =========================
     SINGLE SELECT
  ========================= */
  function singleSelect(selector) {
    document.querySelectorAll(selector).forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(selector).forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
      });
    });
  }

  singleSelect(".mode-grid .btn-mode");
  singleSelect(".size-wrap .btn-size");
  singleSelect(".format-paper .btn-format");

  /* =========================
     QUANTITY
  ========================= */
  document.querySelectorAll(".btn-qty").forEach(btn => {
    btn.addEventListener("click", () => {
      const input = document.querySelector(".qty-input");
      if (!input) return;

      const add = parseInt(btn.innerText.replace('+', '')) || 0;
      input.value = (parseInt(input.value) || 0) + add;
    });
  });

  /* =========================
     LOGO
  ========================= */
  if (el.logoInput) {
    el.logoInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        el.logoPreview && (el.logoPreview.src = event.target.result);
        el.logoBox?.classList.add("has-image");
      };
      reader.readAsDataURL(file);
    });
  }

  /* =========================
     DIGIT
  ========================= */
  el.plusBtn?.addEventListener("click", () => {
    state.digit++;
    el.digitValue && (el.digitValue.innerText = state.digit);
  });

  el.minusBtn?.addEventListener("click", () => {
    if (state.digit > 1) state.digit--;
    el.digitValue && (el.digitValue.innerText = state.digit);
  });

  renderQRPreview();

});

/* =========================
   NAVIGATION
========================= */
function goHistory() {
  window.location.href = "history.html";
}

function goHome() {
  window.location.href = "home.html";
}