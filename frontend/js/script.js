(function () {
    const STORAGE_KEY = "qr_generator_job_state";
    const API_BASE_STORAGE_KEY = "qr_api_base";
    const MAX_QUANTITY = 5000;
    const MAX_DIGITS = 32;
    const MAX_LOGO_BYTES = 5 * 1024 * 1024;
    const REQUEST_TIMEOUT_MS = 15000;
    const DRAFT_STATUS_POLL_MS = 2500;
    const ALLOWED_LOGO_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp"]);

    const LAYOUT_MAP = {
        STD: 40,
        M: 40,
        S: 60,
        SS: 100
    };

    const state = {
        isNavigating: false,
        digit: 8
    };

    const API_BASE = (() => {
        const storedBase = safeStorageGet(localStorage, API_BASE_STORAGE_KEY);
        if (storedBase) {
            return storedBase;
        }

        if (window.location.protocol === "file:") {
            return "http://127.0.0.1:8000";
        }

        return `${window.location.protocol}//${window.location.hostname || "127.0.0.1"}:8000`;
    })();

    function safeStorageGet(storage, key) {
        try {
            return storage.getItem(key) || "";
        } catch (err) {
            console.warn(`Storage get failed for ${key}:`, err);
            return "";
        }
    }

    function safeStorageSet(storage, key, value) {
        try {
            storage.setItem(key, value);
        } catch (err) {
            console.warn(`Storage set failed for ${key}:`, err);
        }
    }

    function safeStorageRemove(storage, key) {
        try {
            storage.removeItem(key);
        } catch (err) {
            console.warn(`Storage remove failed for ${key}:`, err);
        }
    }

    function buildPageUrl(pageName) {
        const normalizedPage = String(pageName || "")
            .replace(/^\/+/, "")
            .replace(/^page\//, "");
        return new URL(normalizedPage, window.location.href).href;
    }

    function buildBackendPageUrl(pageName) {
        const normalizedPage = String(pageName || "")
            .replace(/^\/+/, "")
            .replace(/^page\//, "");
        return `${API_BASE}/page/${normalizedPage}`;
    }

    function buildBackendPageStateUrl(pageName, nextState = {}) {
        const targetUrl = new URL(buildBackendPageUrl(pageName));

        Object.entries(nextState).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== "") {
                targetUrl.searchParams.set(key, String(value));
            }
        });

        return targetUrl.href;
    }

    function normalizeApiUrl(url) {
        if (!url || typeof url !== "string") {
            return "";
        }
        if (url.startsWith("http://") || url.startsWith("https://")) {
            return url;
        }
        if (url.startsWith("/")) {
            return `${API_BASE}${url}`;
        }
        return `${API_BASE}/${url}`;
    }

    function sanitizePositiveNumber(value, fallback, max) {
        const parsed = Number.parseInt(value, 10);
        if (!Number.isFinite(parsed) || parsed < 1) {
            return fallback;
        }
        return Math.min(parsed, max);
    }

    function createDraftId() {
        if (window.crypto?.randomUUID) {
            return window.crypto.randomUUID().replace(/-/g, "");
        }
        return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`.slice(0, 32).padEnd(32, "0");
    }

    function getStoredJobState() {
        const raw = safeStorageGet(sessionStorage, STORAGE_KEY) || safeStorageGet(localStorage, STORAGE_KEY);
        if (!raw) {
            return {};
        }

        try {
            return JSON.parse(raw);
        } catch (err) {
            console.warn("Failed to parse stored job state:", err);
            return {};
        }
    }

    function getJobState() {
        const params = new URLSearchParams(window.location.search);
        const stored = getStoredJobState();

        return {
            pdf_url: params.get("pdf_url") || stored.pdf_url || "",
            excel_url: params.get("excel_url") || stored.excel_url || "",
            filename: params.get("filename") || stored.filename || "",
            draft_id: params.get("draft_id") || stored.draft_id || "",
            warning: params.get("warning") || stored.warning || ""
        };
    }

    function persistJobState(nextState) {
        const mergedState = {
            pdf_url: nextState?.pdf_url || "",
            excel_url: nextState?.excel_url || "",
            filename: nextState?.filename || "",
            draft_id: nextState?.draft_id || "",
            warning: nextState?.warning || ""
        };
        const serialized = JSON.stringify(mergedState);
        safeStorageSet(sessionStorage, STORAGE_KEY, serialized);
        safeStorageSet(localStorage, STORAGE_KEY, serialized);
    }

    function clearStoredJobState() {
        safeStorageRemove(sessionStorage, STORAGE_KEY);
        safeStorageRemove(localStorage, STORAGE_KEY);
    }

    function isPreviewTarget(target) {
        return String(target || "").trim().endsWith("preview.html");
    }

    function showLoading(show = true) {
        const loading = document.getElementById("loadingScreen");
        if (loading) {
            loading.style.display = show ? "flex" : "none";
        }
    }

    function setLoadingStatus(message) {
        const loadingText = document.getElementById("loadingText");
        if (loadingText) {
            loadingText.innerText = message;
        }
    }

    async function parseJsonSafe(response) {
        const text = await response.text();
        try {
            return text ? JSON.parse(text) : {};
        } catch (err) {
            console.error("JSON parse error:", err, text);
            throw new Error("Invalid server response");
        }
    }

    async function apiRequest(path, options = {}) {
        const controller = new AbortController();
        const { timeoutMs = REQUEST_TIMEOUT_MS, ...fetchOptions } = options;
        const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

        try {
            const response = await fetch(`${API_BASE}${path}`, {
                ...fetchOptions,
                signal: fetchOptions.signal || controller.signal
            });
            const data = await parseJsonSafe(response);

            if (!response.ok || data.success === false) {
                const error = new Error(data?.error || `Request failed with status ${response.status}`);
                error.status = response.status;
                error.details = data?.details;
                throw error;
            }

            return data;
        } catch (err) {
            if (err?.name === "AbortError") {
                throw new Error("Request timed out");
            }
            throw err;
        } finally {
            window.clearTimeout(timeoutId);
        }
    }

    function parseJsonText(text) {
        try {
            return text ? JSON.parse(text) : {};
        } catch (err) {
            console.error("JSON parse error:", err, text);
            throw new Error("Invalid server response");
        }
    }

    function postGenerateForm(formData) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open("POST", `${API_BASE}/generate`, true);
            xhr.timeout = 120000;

            xhr.onload = () => {
                try {
                    const data = parseJsonText(xhr.responseText);
                    if (xhr.status < 200 || xhr.status >= 300 || data.success === false) {
                        const error = new Error(data?.error || `Generate failed with status ${xhr.status}`);
                        error.status = xhr.status;
                        error.details = data?.details;
                        reject(error);
                        return;
                    }
                    resolve(data);
                } catch (err) {
                    reject(err);
                }
            };

            xhr.onerror = () => {
                reject(new Error(`Could not connect to backend at ${API_BASE}`));
            };

            xhr.ontimeout = () => {
                reject(new Error("Generate request timed out"));
            };

            xhr.send(formData);
        });
    }

    function showManualNavigationLink(targetUrl) {
        const loadingText = document.getElementById("loadingText");
        if (!loadingText) {
            alert(`Preview is ready, but automatic navigation failed.\n\nOpen this page manually:\n${targetUrl}`);
            return;
        }

        const existing = document.getElementById("manualPreviewLink");
        if (existing) {
            existing.href = targetUrl;
            return;
        }

        const wrapper = document.createElement("p");
        wrapper.id = "manualPreviewLinkWrap";
        wrapper.style.marginTop = "12px";

        const link = document.createElement("a");
        link.id = "manualPreviewLink";
        link.href = targetUrl;
        link.innerText = "Open preview manually";
        link.style.color = "#0b57d0";
        link.style.fontWeight = "600";

        wrapper.appendChild(link);
        loadingText.insertAdjacentElement("afterend", wrapper);
    }

    function setNavigationTarget(targetUrl) {
        setLoadingStatus("Opening preview page...");
        showManualNavigationLink(targetUrl);
    }

    function navigateToUrl(targetUrl) {
        const expectedUrl = new URL(targetUrl, window.location.href).href;

        window.setTimeout(() => {
            if (window.location.href !== expectedUrl) {
                showManualNavigationLink(expectedUrl);
            }
        }, 1200);

        try {
            window.location.href = expectedUrl;
            return;
        } catch (err) {
            console.error("location.href navigation failed:", err);
        }

        try {
            window.location.replace(expectedUrl);
            return;
        } catch (err) {
            console.error("location.replace navigation failed:", err);
        }

        try {
            const link = document.createElement("a");
            link.href = expectedUrl;
            link.rel = "noopener";
            link.target = "_self";
            document.body.appendChild(link);
            link.click();
            link.remove();
            return;
        } catch (err) {
            console.error("anchor navigation failed:", err);
        }

        showManualNavigationLink(expectedUrl);
    }

    function redirectToPage(pageName) {
        navigateToUrl(buildBackendPageUrl(pageName));
    }

    function goHome() {
        redirectToPage("config.html");
    }

    function goHistory() {
        redirectToPage("history.html");
    }

    async function discardDraftIfNeeded() {
        const draftId = getJobState().draft_id;
        if (!draftId) {
            clearStoredJobState();
            return;
        }

        try {
            await apiRequest(`/draft/${encodeURIComponent(draftId)}`, {
                method: "DELETE",
                timeoutMs: 5000
            });
        } catch (err) {
            console.warn("Discard draft failed:", err);
        } finally {
            clearStoredJobState();
        }
    }

    async function confirmDraftIfNeeded() {
        const currentState = getJobState();
        if (!currentState.draft_id) {
            return currentState;
        }

        const data = await apiRequest(`/draft/confirm/${encodeURIComponent(currentState.draft_id)}`, {
            method: "POST",
            timeoutMs: REQUEST_TIMEOUT_MS
        });

        const nextState = {
            pdf_url: normalizeApiUrl(data.pdf_url || ""),
            excel_url: normalizeApiUrl(data.excel_url || ""),
            filename: data.filename || "",
            draft_id: "",
            warning: data.warning || ""
        };

        persistJobState(nextState);
        return nextState;
    }

    async function pollDraftUntilReady(draftId, attempts = 120) {
        for (let attempt = 0; attempt < attempts; attempt += 1) {
            try {
                const data = await apiRequest(`/draft/${encodeURIComponent(draftId)}/status`, {
                    timeoutMs: 5000
                });

                if (data.ready && data.pdf_url) {
                    const nextState = {
                        pdf_url: normalizeApiUrl(data.pdf_url || ""),
                        excel_url: normalizeApiUrl(data.excel_url || ""),
                        filename: data.filename || "",
                        draft_id: data.draft_id || draftId,
                        warning: data.warning || ""
                    };
                    persistJobState(nextState);
                    return nextState;
                }
            } catch (err) {
                if (err?.status >= 400) {
                    throw err;
                }
                console.warn("Draft status check failed:", err);
            }

            await new Promise((resolve) => window.setTimeout(resolve, DRAFT_STATUS_POLL_MS));
        }

        throw new Error("Preview is still being prepared. Please try again in a moment.");
    }

    function collectConfig() {
        const activeModeBtn = document.querySelector(".btn-mode.active");
        const activeSizeBtn = document.querySelector(".btn-size.active");
        let separator = document.querySelector(".sep-btn.active")?.innerText?.trim() || "";

        if (separator.toLowerCase() === "none") {
            separator = "";
        }

        return {
            mode: activeModeBtn?.querySelector(".mode-name")?.innerText?.trim() || "",
            size: activeSizeBtn?.querySelector(".size-label")?.innerText?.trim() || "",
            quantity: sanitizePositiveNumber(document.querySelector(".qty-input")?.value, 0, MAX_QUANTITY),
            digit: sanitizePositiveNumber(state.digit, 8, MAX_DIGITS),
            prefix: document.querySelector(".input-prefix")?.value?.trim() || "",
            separator
        };
    }

    function isConfigReady(config) {
        if (!config.mode || !config.size || !config.quantity) {
            return false;
        }

        if (config.mode === "Custom Format" && (!config.digit || config.digit < 1)) {
            return false;
        }

        return true;
    }

    function validateConfig(config) {
        if (!config.mode) {
            throw new Error("Please choose a mode");
        }
        if (!config.size) {
            throw new Error("Please choose a size");
        }
        if (!config.quantity || config.quantity < 1) {
            throw new Error("Quantity must be at least 1");
        }
        if (config.quantity > MAX_QUANTITY) {
            throw new Error(`Quantity must not exceed ${MAX_QUANTITY}`);
        }
        if (config.mode === "Custom Format" && (!config.digit || config.digit < 1)) {
            throw new Error("Digit length must be at least 1");
        }
    }

    function updatePrimaryCtaState() {
        const ctaButton = document.querySelector(".primary-cta.fireBtn");
        if (ctaButton) {
            ctaButton.disabled = !isConfigReady(collectConfig());
        }
    }

    function updateSummary() {
        const config = collectConfig();
        const perPage = LAYOUT_MAP[config.size] || 0;
        const totalPages = Math.ceil(config.quantity / perPage) || 0;
        const ready = isConfigReady(config);

        const statValues = document.querySelectorAll(".stat-item .fw-bold");
        if (statValues.length >= 4) {
            statValues[0].innerText = ready ? config.quantity.toLocaleString() : "0";
            statValues[1].innerText = ready ? config.size : "0";
            statValues[2].innerText = ready ? String(perPage) : "0";
            statValues[3].innerText = ready ? String(totalPages) : "0";
        }

        const rangeDisplay = document.querySelector(".range-highlight");
        if (rangeDisplay) {
            if (!ready) {
                rangeDisplay.innerText = "0 -> 0";
            } else if (config.mode === "Normal Generate") {
                rangeDisplay.innerText = "Unique Random 11 Digits (xxx-xxxx-xxxx)";
            } else {
                const displayPrefix = config.prefix || "HOD";
                const previewDigits = "X".repeat(Math.max(1, config.digit));
                rangeDisplay.innerText = `${displayPrefix}${config.separator || ""}${previewDigits} -> ${displayPrefix}${config.separator || ""}${previewDigits}`;
            }
        }

        updatePrimaryCtaState();
    }

    function validateLogoFile(file) {
        if (!file) {
            return null;
        }

        const extension = String(file.name || "").split(".").pop()?.toLowerCase() || "";
        if (!ALLOWED_LOGO_EXTENSIONS.has(extension)) {
            throw new Error("Logo must be PNG, JPG, JPEG, or WEBP");
        }

        if (file.size > MAX_LOGO_BYTES) {
            throw new Error("Logo file must be 5 MB or smaller");
        }

        return file;
    }

    function getLogoFile() {
        return validateLogoFile(document.getElementById("logoInput")?.files?.[0] || null);
    }

    function clearLogoPreview(elements) {
        if (elements.logoPreview) {
            elements.logoPreview.src = "";
        }
        elements.logoBox?.classList.remove("has-image");
        const labelText = document.getElementById("uploadLabelText");
        if (labelText) {
            labelText.innerText = "Upload Logo";
        }
    }

    async function generatePreviewAndGo() {
        if (state.isNavigating) {
            return;
        }

        state.isNavigating = true;
        showLoading(true);
        setLoadingStatus("Checking your configuration...");

        try {
            const config = collectConfig();
            validateConfig(config);

            await discardDraftIfNeeded();
            const draftId = createDraftId();
            const formData = new FormData();
            formData.append("config", JSON.stringify(config));
            formData.append("draft_id", draftId);

            const logoFile = getLogoFile();
            if (logoFile) {
                formData.append("logo", logoFile);
            }

            setLoadingStatus("Generating preview files...");

            let data;
            try {
                data = await postGenerateForm(formData);
            } catch (err) {
                if (String(err?.message || "").toLowerCase().includes("timed out")) {
                    setLoadingStatus("Still creating QR files. Waiting for preview...");
                    persistJobState({
                        pdf_url: "",
                        excel_url: "",
                        filename: "",
                        draft_id: draftId,
                        warning: ""
                    });
                    data = await pollDraftUntilReady(draftId);
                } else {
                    throw err;
                }
            }

            const activeDraftId = data.draft_id || draftId;
            let previewState;

            if (data.ready === false || !data.filename) {
                setLoadingStatus("Creating QR files and PDF preview...");
                persistJobState({
                    pdf_url: "",
                    excel_url: "",
                    filename: "",
                    draft_id: activeDraftId,
                    warning: data.warning || ""
                });
                previewState = await pollDraftUntilReady(activeDraftId);
            } else {
                previewState = {
                    pdf_url: normalizeApiUrl(data.pdf_url || ""),
                    excel_url: normalizeApiUrl(data.excel_url || ""),
                    filename: data.filename || "",
                    draft_id: activeDraftId,
                    warning: data.warning || ""
                };
            }

            persistJobState(previewState);

            setLoadingStatus("Preview is ready. Opening preview page...");
            const previewUrl = buildBackendPageStateUrl("preview.html", previewState);
            setNavigationTarget(previewUrl);
            navigateToUrl(previewUrl);
        } catch (err) {
            console.error("Generate preview failed:", err);
            alert(`Could not generate preview: ${err?.message || "Unknown error"}`);
            showLoading(false);
            state.isNavigating = false;
        }
    }

    function formatCreatedAt(value) {
        if (!value) {
            return "-";
        }

        const date = new Date(Number(value) * 1000);
        if (Number.isNaN(date.getTime())) {
            return "-";
        }

        return date.toLocaleString("th-TH", {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        });
    }

    function initConfigPage() {
        const elements = {
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

        elements.btnAuto?.addEventListener("click", () => {
            document.querySelectorAll(".btn-mode").forEach((button) => button.classList.remove("active"));
            document.querySelectorAll(".sep-btn").forEach((button) => button.classList.remove("active"));
            elements.btnAuto.classList.add("active");
            elements.customSection?.classList.add("hidden");
            updateSummary();
        });

        elements.btnCustom?.addEventListener("click", () => {
            document.querySelectorAll(".btn-mode").forEach((button) => button.classList.remove("active"));
            elements.btnCustom.classList.add("active");
            elements.customSection?.classList.remove("hidden");
            updateSummary();
        });

        document.querySelectorAll(".btn-size").forEach((button) => {
            button.addEventListener("click", () => {
                document.querySelectorAll(".btn-size").forEach((item) => item.classList.remove("active"));
                button.classList.add("active");
                updateSummary();
            });
        });

        document.querySelectorAll(".sep-btn").forEach((button) => {
            button.addEventListener("click", () => {
                document.querySelectorAll(".sep-btn").forEach((item) => item.classList.remove("active"));
                button.classList.add("active");
                updateSummary();
            });
        });

        elements.qtyInput?.addEventListener("input", () => {
            const cleanValue = elements.qtyInput.value.replace(/[^\d]/g, "");
            const safeValue = sanitizePositiveNumber(cleanValue, 10, MAX_QUANTITY);
            elements.qtyInput.value = cleanValue ? String(safeValue) : "";
            updateSummary();
        });

        document.querySelectorAll(".btn-qty").forEach((button) => {
            button.addEventListener("click", () => {
                const addValue = Number.parseInt(button.innerText.replace("+", ""), 10) || 0;
                const current = Number.parseInt(elements.qtyInput?.value || "0", 10) || 0;
                if (elements.qtyInput) {
                    elements.qtyInput.value = String(Math.min(MAX_QUANTITY, current + addValue));
                }
                updateSummary();
            });
        });

        elements.plusBtn?.addEventListener("click", () => {
            state.digit = Math.min(MAX_DIGITS, state.digit + 1);
            if (elements.digitValue) {
                elements.digitValue.innerText = String(state.digit);
            }
            updateSummary();
        });

        elements.minusBtn?.addEventListener("click", () => {
            state.digit = Math.max(1, state.digit - 1);
            if (elements.digitValue) {
                elements.digitValue.innerText = String(state.digit);
            }
            updateSummary();
        });

        document.querySelector(".input-prefix")?.addEventListener("input", updateSummary);

        document.querySelectorAll(".fireBtn").forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                if (button.disabled || state.isNavigating) {
                    return;
                }

                const target = button.dataset.link?.trim();
                if (!target) {
                    return;
                }

                if (isPreviewTarget(target)) {
                    await generatePreviewAndGo();
                    return;
                }

                navigateToUrl(target.endsWith(".html") ? buildPageUrl(target) : target);
            });
        });

        elements.logoInput?.addEventListener("change", (event) => {
            let file = event.target.files?.[0];
            if (!file) {
                clearLogoPreview(elements);
                return;
            }

            try {
                file = validateLogoFile(file);
            } catch (err) {
                event.target.value = "";
                clearLogoPreview(elements);
                alert(err?.message || "Logo file is not valid");
                return;
            }

            const reader = new FileReader();
            reader.onload = (loadEvent) => {
                if (elements.logoPreview) {
                    elements.logoPreview.src = String(loadEvent.target?.result || "");
                }
                elements.logoBox?.classList.add("has-image");
                const labelText = document.getElementById("uploadLabelText");
                if (labelText) {
                    labelText.innerText = file.name;
                }
            };
            reader.readAsDataURL(file);
        });

        updateSummary();
    }

    function downloadPDF() {
        const pdfUrl = getJobState().pdf_url;
        if (!pdfUrl) {
            alert("PDF file was not found");
            return;
        }
        window.open(pdfUrl, "_blank", "noopener");
    }

    function downloadExcel() {
        const excelUrl = getJobState().excel_url;
        if (!excelUrl) {
            alert("Excel file was not found");
            return;
        }
        window.location.assign(excelUrl);
    }

    function initSuccessPage() {
        const warning = getJobState().warning;
        if (warning) {
            console.warn(warning);
        }

        if (typeof window.confetti === "function") {
            window.confetti({
                particleCount: 150,
                spread: 70,
                origin: { y: 0.6 }
            });
        }

        document.getElementById("btn-download-pdf")?.addEventListener("click", downloadPDF);
        document.getElementById("btn-download-excel")?.addEventListener("click", downloadExcel);
    }

    async function loadHistory() {
        const historyList = document.getElementById("historyList");
        const emptyState = document.getElementById("emptyState");
        const searchInput = document.getElementById("historySearch");
        const countNode = document.getElementById("historyCount");

        if (!historyList || !emptyState) {
            return;
        }

        try {
            const data = await apiRequest("/history", { timeoutMs: 10000 });
            const files = Array.isArray(data.files) ? data.files : [];

            const renderHistory = (query = "") => {
                const normalizedQuery = query.trim().toLowerCase();
                const filteredFiles = files.filter((file) =>
                    String(file.filename || "").toLowerCase().includes(normalizedQuery)
                );

                historyList.innerHTML = "";
                emptyState.style.display = filteredFiles.length ? "none" : "block";

                filteredFiles.forEach((file) => {
                    const row = document.createElement("div");
                    row.className = "history-item";

                    const info = document.createElement("div");
                    info.className = "his-info";

                    const title = document.createElement("strong");
                    title.textContent = file.filename;

                    const parts = String(file.filename || "").replace(".pdf", "").split("-");
                    const meta = document.createElement("small");
                    meta.textContent = `Lot: ${parts[1] || "-"} | Size: ${parts[3] || "-"} | Mode: ${parts[2] || "-"}`;

                    const date = document.createElement("span");
                    date.className = "history-date";
                    date.textContent = `Created: ${formatCreatedAt(file.created_at)}`;

                    info.appendChild(title);
                    info.appendChild(meta);
                    info.appendChild(date);

                    const actions = document.createElement("div");
                    actions.className = "history-actions";

                    const pdfButton = document.createElement("button");
                    pdfButton.type = "button";
                    pdfButton.className = "action-btn pdf";
                    pdfButton.title = "Open PDF";
                    pdfButton.innerHTML = '<img src="../assets/img/pdf.png" alt="PDF">';
                    pdfButton.addEventListener("click", () => {
                        window.open(normalizeApiUrl(file.pdf_url), "_blank", "noopener");
                    });

                    const excelButton = document.createElement("button");
                    excelButton.type = "button";
                    excelButton.className = "action-btn excel";
                    excelButton.title = file.excel_url ? "Download Excel" : "Excel not available";
                    excelButton.disabled = !file.excel_url;
                    excelButton.innerHTML = '<img src="../assets/img/xls.png" alt="Excel">';
                    excelButton.addEventListener("click", () => {
                        if (file.excel_url) {
                            window.open(normalizeApiUrl(file.excel_url), "_blank", "noopener");
                        }
                    });

                    const deleteButton = document.createElement("button");
                    deleteButton.type = "button";
                    deleteButton.className = "action-btn delete";
                    deleteButton.title = "Delete file";
                    deleteButton.innerHTML = '<img src="../assets/img/bin.png" alt="Delete">';
                    deleteButton.addEventListener("click", async () => {
                        if (!window.confirm(`Delete ${file.filename}?`)) {
                            return;
                        }

                        try {
                            await apiRequest(`/history/${encodeURIComponent(file.filename)}`, {
                                method: "DELETE",
                                timeoutMs: 10000
                            });
                            await loadHistory();
                        } catch (err) {
                            console.error("Delete history file failed:", err);
                            alert(err?.message || "Could not delete the file");
                        }
                    });

                    actions.appendChild(pdfButton);
                    actions.appendChild(excelButton);
                    actions.appendChild(deleteButton);

                    row.appendChild(info);
                    row.appendChild(actions);
                    historyList.appendChild(row);
                });

                if (countNode) {
                    countNode.innerText = `ทั้งหมด ${filteredFiles.length} รายการ`;
                }
            };

            if (searchInput) {
                searchInput.disabled = files.length === 0;
                searchInput.addEventListener("input", (event) => {
                    renderHistory(event.target.value);
                });
            }

            renderHistory();
        } catch (err) {
            console.error("Load history failed:", err);
            emptyState.style.display = "block";
        }
    }

    function initPage() {
        const pathname = window.location.pathname;

        if (pathname.includes("config.html")) {
            initConfigPage();
        } else if (pathname.includes("success.html")) {
            initSuccessPage();
        } else if (pathname.includes("history.html")) {
            void loadHistory();
        }
    }

    window.state = state;
    window.goHome = goHome;
    window.goHistory = goHistory;
    window.buildPageUrl = buildPageUrl;
    window.buildBackendPageUrl = buildBackendPageUrl;
    window.buildBackendPageStateUrl = buildBackendPageStateUrl;
    window.normalizeApiUrl = normalizeApiUrl;
    window.getJobState = getJobState;
    window.persistJobState = persistJobState;
    window.clearStoredJobState = clearStoredJobState;
    window.discardDraftIfNeeded = discardDraftIfNeeded;
    window.confirmDraftIfNeeded = confirmDraftIfNeeded;
    window.pollDraftUntilReady = pollDraftUntilReady;
    window.apiRequest = apiRequest;
    window.navigateToUrl = navigateToUrl;
    window.qrApp = {
        apiBase: API_BASE,
        requestTimeoutMs: REQUEST_TIMEOUT_MS
    };

    document.addEventListener("DOMContentLoaded", initPage);
})();
