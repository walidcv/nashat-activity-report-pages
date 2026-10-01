(() => {
  const form = document.getElementById("report-form");
  const button = document.getElementById("download-button");
  const status = document.getElementById("status-message");
  const error = document.getElementById("error-message");
  const report = document.getElementById("pdf-report");
  const logoUrl = new URL("./moe-logo.svg", window.location.href).href;
  const maxImageBytes = 5 * 1024 * 1024;
  const maxRequestBytes = 16 * 1024 * 1024;
  let currentPdfBlob = null;

  const fields = [
    ["school_name", "اسم المدرسة"],
    ["date", "اليوم والتاريخ"],
    ["participants", "عدد المشاركين"],
    ["executor", "المنفذ"],
    ["supervisor", "مشرف التنفيذ"],
  ];

  function escapeHtml(value) {
    return value.replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[character]);
  }

  function setError(message) {
    error.textContent = message;
    error.hidden = false;
  }

  function compressImage(file) {
    return new Promise((resolve, reject) => {
      const source = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        const scale = Math.min(1, 1400 / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext("2d");
        if (!context) {
          URL.revokeObjectURL(source);
          reject(new Error("تعذر تجهيز الصورة على هذا الجهاز."));
          return;
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(source);
        resolve(canvas.toDataURL("image/jpeg", 0.86));
      };
      image.onerror = () => {
        URL.revokeObjectURL(source);
        reject(new Error("تعذر قراءة إحدى الصور المرفقة."));
      };
      image.src = source;
    });
  }

  function getValues() {
    return Object.fromEntries(new FormData(form).entries());
  }

  async function buildReport(values, images) {
    const title = escapeHtml(String(values.title).trim());
    const info = fields
      .filter(([key]) => String(values[key] || "").trim())
      .map(([key, label]) => `<div><b>${label}</b>${escapeHtml(String(values[key]).trim())}</div>`)
      .join("");
    const photos = images
      .map((src, index) => `<div class="pdf-photo"><img src="${src}" alt=""><span>شاهد ${index + 1}</span></div>`)
      .join("");
    const section = (heading, content) => {
      const text = String(content || "").trim();
      if (!text) return "";
      return `<section class="pdf-section"><h3>${heading}</h3><p>${escapeHtml(text)}</p></section>`;
    };

    report.innerHTML = `
      <header class="pdf-header">
        <img class="pdf-logo" src="${logoUrl}" crossorigin="anonymous" alt="شعار وزارة التعليم">
        <strong>وزارة التعليم</strong>
        <small>تقرير برنامج / نشاط مدرسي</small>
      </header>
      <h1 class="pdf-title">${title}</h1>
      <div class="pdf-info">${info}</div>
      ${section("أهداف البرنامج", values.goals)}
      ${section("وصف البرنامج", values.description)}
      ${photos ? `<section class="pdf-section"><h3>شواهد البرنامج</h3><div class="pdf-photos">${photos}</div></section>` : ""}
      <div class="pdf-signatures">
        <div>مدير المدرسة<br>أ/ لافي بن سعد الحربي</div>
        <div>مشرف النشاط<br>أ/ عبدالحكيم المحسن</div>
      </div>
      <div class="pdf-footer">حقوق البرنامج محفوظة لدى أ/ وليد بن عبدالعزيز البليهد</div>
    `;

    const logo = report.querySelector(".pdf-logo");
    await Promise.race([
      new Promise((resolve) => {
        if (logo.complete && logo.naturalWidth > 0) resolve();
        else {
          logo.onload = resolve;
          logo.onerror = resolve;
        }
      }),
      new Promise((resolve) => setTimeout(resolve, 8000)),
    ]);

    if (typeof html2canvas !== "function" || !window.jspdf || typeof window.jspdf.jsPDF !== "function") {
      throw new Error("تعذر تحميل مكتبة إنشاء PDF. تحقق من اتصال الإنترنت ثم أعد المحاولة.");
    }

    const captureReport = report.cloneNode(true);
    captureReport.id = "pdf-report-capture";
    captureReport.style.position = "static";
    captureReport.style.top = "auto";
    captureReport.style.left = "auto";
    captureReport.style.width = "200mm";
    captureReport.style.height = "287mm";
    captureReport.style.display = "flex";
    captureReport.style.flexDirection = "column";
    captureReport.style.justifyContent = "space-between";
    captureReport.style.gap = "2mm";
    captureReport.style.margin = "0";
    captureReport.style.opacity = "0";
    report.after(captureReport);
    let pdfBlob;
    try {
      const canvas = await html2canvas(captureReport, {
                scale: 3.2,
        useCORS: true,
        allowTaint: false,
        backgroundColor: "#ffffff",
        onclone: (clonedDocument) => {
          clonedDocument.querySelectorAll("#pdf-report-capture").forEach((reportClone) => {
            reportClone.style.opacity = "1";
          });
        },
      });
      const pdf = new window.jspdf.jsPDF({
        unit: "mm",
        format: "a4",
        orientation: "portrait",
      });
      const pageWidth = 200;
      const pageHeight = 287;
      const scale = Math.min(pageWidth / canvas.width, pageHeight / canvas.height);
      const imageWidth = canvas.width * scale;
      const imageHeight = canvas.height * scale;
      const imageX = 5 + (pageWidth - imageWidth) / 2;
      const imageY = 5 + (pageHeight - imageHeight) / 2;
      pdf.addImage(
                canvas.toDataURL("image/png"),
                "PNG",
        imageX,
        imageY,
        imageWidth,
        imageHeight,
      );
      pdfBlob = pdf.output("blob");
    } finally {
      captureReport.remove();
    }

    if (!(pdfBlob instanceof Blob) || pdfBlob.size === 0 || pdfBlob.type !== "application/pdf") {
      throw new Error("تعذر إنشاء ملف PDF صالح. أعد المحاولة.");
    }

    return pdfBlob;
  }

  function showInlinePreview() {
    const preview = document.getElementById("inline-preview");
    preview.hidden = false;
    document.querySelector(".page-shell").hidden = true;
    document.getElementById("preview-status").textContent = "جارٍ عرض ملف PDF...";
    document.getElementById("pdf-pages").replaceChildren();
    renderPdfPreview(currentPdfBlob);
    window.scrollTo(0, 0);
  }

  async function renderPdfPreview(pdfBlob) {
    const status = document.getElementById("preview-status");
    const pagesContainer = document.getElementById("pdf-pages");
    try {
      if (!window.pdfjsLib) {
        throw new Error("تعذر تحميل عارض PDF. تحقق من اتصال الإنترنت وأعد فتح الصفحة.");
      }
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      const pdf = await window.pdfjsLib.getDocument({ data: await pdfBlob.arrayBuffer() }).promise;
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const baseViewport = page.getViewport({ scale: 1 });
        const availableWidth = Math.max(280, pagesContainer.clientWidth - 16);
        const scale = Math.min(1.4, availableWidth / baseViewport.width);
        const viewport = page.getViewport({ scale });
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        const pageElement = document.createElement("div");
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (!context) {
          throw new Error("تعذر عرض صفحات PDF على هذا الجهاز.");
        }
        pageElement.className = "pdf-page";
        canvas.width = Math.ceil(viewport.width * pixelRatio);
        canvas.height = Math.ceil(viewport.height * pixelRatio);
        canvas.style.aspectRatio = `${viewport.width} / ${viewport.height}`;
        pageElement.append(canvas);
        pagesContainer.append(pageElement);
        await page.render({
          canvasContext: context,
          viewport,
          transform: pixelRatio === 1 ? null : [pixelRatio, 0, 0, pixelRatio, 0, 0],
        }).promise;
      }
      status.textContent = `معاينة PDF · ${pdf.numPages} صفحة`;
    } catch (exception) {
      status.textContent =
        exception instanceof Error ? exception.message : "تعذر عرض ملف PDF.";
    }
  }

  document.getElementById("share-pdf").addEventListener("click", async () => {
    const status = document.getElementById("preview-status");
    try {
      if (!currentPdfBlob || typeof navigator.share !== "function") {
        throw new Error("مشاركة ملفات PDF غير مدعومة في هذا المتصفح. افتح الصفحة في Safari أو Chrome.");
      }
      const file = new File([currentPdfBlob], "activity-report.pdf", {
        type: "application/pdf",
      });
      if (typeof navigator.canShare === "function" && !navigator.canShare({ files: [file] })) {
        throw new Error("مشاركة ملفات PDF غير مدعومة على هذا الجهاز.");
      }
      await navigator.share({ files: [file], title: "تقرير النشاط المدرسي" });
    } catch (exception) {
      if (exception instanceof Error && exception.name === "AbortError") return;
      status.textContent =
        exception instanceof Error ? exception.message : "تعذرت مشاركة ملف PDF.";
    }
  });

  document.getElementById("report-date").value = new Intl.DateTimeFormat("ar-SA", {
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    currentPdfBlob = null;
    error.hidden = true;
    status.hidden = false;
    status.textContent = "";
    button.disabled = true;
    button.textContent = "جارٍ إنشاء التقرير...";
    try {
      const values = getValues();
      if (!String(values.school_name || "").trim() || !String(values.title || "").trim()) {
        throw new Error("يرجى تعبئة اسم المدرسة وعنوان التقرير.");
      }
      const uploads = [1, 2, 3]
        .map((index) => form.elements.namedItem(`image_${index}`).files[0])
        .filter(Boolean);
      const totalBytes = uploads.reduce((total, file) => total + file.size, 0);
      if (uploads.some((file) => file.size > maxImageBytes)) {
        throw new Error("حجم الصورة الواحدة يجب ألا يتجاوز 5 ميغابايت.");
      }
      if (totalBytes > maxRequestBytes) {
        throw new Error("حجم الصور الإجمالي أكبر من 16 ميغابايت.");
      }
      if (uploads.some((file) => !file.type.startsWith("image/"))) {
        throw new Error("أحد الملفات المرفقة ليس صورة صالحة.");
      }

      status.textContent = "جارٍ إنشاء ملف PDF على جهازك؛ لا تغلق الصفحة.";
      const images = await Promise.all(uploads.map(compressImage));
      const pdfBlob = await buildReport(values, images);
      currentPdfBlob = pdfBlob;
      showInlinePreview();
      status.textContent = "هذه معاينة ملف PDF. استخدم أدوات عارض PDF لمشاركته أو حفظه.";
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : String(exception));
      status.hidden = true;
    } finally {
      button.disabled = false;
      button.textContent = "معاينة التقرير PDF";
    }
  });

})();
