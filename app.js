(() => {
  const form = document.getElementById("report-form");
  const button = document.getElementById("download-button");
  const status = document.getElementById("status-message");
  const error = document.getElementById("error-message");
  const report = document.getElementById("pdf-report");
  const logoUrl = "./moe-logo.svg";
  const maxImageBytes = 5 * 1024 * 1024;
  const maxRequestBytes = 16 * 1024 * 1024;

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

    if (typeof html2pdf !== "function") {
      throw new Error("تعذر تحميل مكتبة إنشاء PDF. تحقق من اتصال الإنترنت ثم أعد المحاولة.");
    }

    await html2pdf()
      .set({
        margin: [8, 10, 12, 10],
        filename: `activity_report_${new Date().toISOString().slice(0, 10).replaceAll("-", "")}.pdf`,
        image: { type: "jpeg", quality: 0.94 },
        html2canvas: { scale: 2, useCORS: true, allowTaint: false, backgroundColor: "#ffffff" },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["css", "legacy"], avoid: [".pdf-header", ".pdf-title", ".pdf-info div", ".pdf-section", ".pdf-photo", ".pdf-signatures"] },
      })
      .from(report)
      .save();
  }

  document.getElementById("report-date").value = new Intl.DateTimeFormat("ar-SA", {
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    error.hidden = true;
    status.hidden = false;
    status.textContent = "";
    button.disabled = true;
    button.textContent = "جارٍ تجهيز التقرير...";

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
      await buildReport(values, images);
      status.textContent = "تم تجهيز التقرير. إذا لم يبدأ التنزيل تلقائياً، تحقق من قائمة التنزيلات في المتصفح.";
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "تعذر إنشاء التقرير على هذا الجهاز.");
      status.hidden = true;
    } finally {
      button.disabled = false;
      button.innerHTML = '<span aria-hidden="true">↓</span> تنزيل التقرير PDF';
    }
  });
})();
