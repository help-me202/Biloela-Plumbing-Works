document.addEventListener("DOMContentLoaded", () => {
  const fallbackMapUrl =
    "https://maps.google.com/maps?q=5%20Dunn%20Street,%20Biloela%20QLD,%20Australia&t=&z=15&ie=UTF8&iwloc=&output=embed";

  function renderMap(mapUrl) {
    const mapContainer = document.getElementById("map-container");
    if (!mapContainer) return;

    mapContainer.innerHTML = `
      <iframe
        src="${mapUrl}"
        allowfullscreen=""
        loading="lazy"
        referrerpolicy="no-referrer-when-downgrade"
      ></iframe>
    `;
  }

  async function loadMapData() {
    renderMap(fallbackMapUrl);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch("/api/maps/location", {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to load map data from server.");
      }

      if (data.success && data.mapUrl) {
        renderMap(data.mapUrl || fallbackMapUrl);
      } else {
        throw new Error("Invalid map data received.");
      }
    } catch (error) {
      console.error("Map loading error:", error);
    }
  }

  const contactForm = document.getElementById("contact-form");
  if (contactForm) {
    const submitBtn = document.getElementById("enq-submit");
    const requiredFields = [
      document.getElementById("enq-name"),
      document.getElementById("enq-phone"),
      document.getElementById("enq-email"),
      document.getElementById("enq-subject"),
      document.getElementById("enq-message"),
    ].filter(Boolean);

    function updateSubmitState() {
      if (!submitBtn) return;
      const allFilled = requiredFields.every(
        (field) => field.value.trim() !== "",
      );
      submitBtn.disabled = !allFilled;
    }

    requiredFields.forEach((field) => {
      field.addEventListener("input", updateSubmitState);
      field.addEventListener("change", updateSubmitState);
    });
    updateSubmitState();

    contactForm.addEventListener("submit", function (e) {
      e.preventDefault();
      const btn = submitBtn;
      const msg = document.getElementById("enquiry-message");

      if (!btn || !msg) return;

      btn.disabled = true;
      msg.textContent = "Sending...";
      msg.style.color = "#333";

      fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: document.getElementById("enq-name")?.value || "",
          phone: document.getElementById("enq-phone")?.value || "",
          email: document.getElementById("enq-email")?.value || "",
          subject: document.getElementById("enq-subject")?.value || "",
          message: document.getElementById("enq-message")?.value || "",
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.error) throw new Error(data.error);
          msg.textContent = "Thank you! Your enquiry has been sent.";
          msg.style.color = "#0b6623";
          this.reset();
        })
        .catch((err) => {
          msg.textContent =
            err.message || "An error occurred. Please try again.";
          msg.style.color = "#b91c1c";
        })
        .finally(() => {
          updateSubmitState();
        });
    });
  }

  const employmentForm = document.getElementById("employment-form");
  if (employmentForm) {
    employmentForm.addEventListener("submit", function (e) {
      e.preventDefault();
      const btn = this.querySelector("button");
      const msg = document.getElementById("employment-message");
      if (!btn || !msg) return;

      const formData = new FormData();
      formData.append("name", document.getElementById("emp-name")?.value || "");
      formData.append(
        "phone",
        document.getElementById("emp-phone")?.value || "",
      );
      formData.append(
        "email",
        document.getElementById("emp-email")?.value || "",
      );

      const resumeInput = document.getElementById("emp-resume");
      if (
        !(resumeInput instanceof HTMLInputElement) ||
        !resumeInput.files ||
        !resumeInput.files.length
      ) {
        msg.textContent = "Please attach your resume.";
        msg.style.color = "#b91c1c";
        return;
      }
      formData.append("resume", resumeInput.files[0]);

      const coverLetterInput = document.getElementById("emp-cover-letter");
      if (
        coverLetterInput instanceof HTMLInputElement &&
        coverLetterInput.files &&
        coverLetterInput.files.length > 0
      ) {
        formData.append("coverLetter", coverLetterInput.files[0]);
      }

      btn.disabled = true;
      msg.textContent = "Sending...";
      msg.style.color = "#333";

      fetch("/api/employment", {
        method: "POST",
        body: formData,
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.error) throw new Error(data.error);
          msg.textContent = "Thank you! Your application has been submitted.";
          msg.style.color = "#0b6623";
          const empName = document.getElementById("emp-name");
          const empPhone = document.getElementById("emp-phone");
          const empEmail = document.getElementById("emp-email");
          if (empName instanceof HTMLInputElement) empName.value = "";
          if (empPhone instanceof HTMLInputElement) empPhone.value = "";
          if (empEmail instanceof HTMLInputElement) empEmail.value = "";
          resumeInput.value = "";
          if (coverLetterInput instanceof HTMLInputElement) {
            coverLetterInput.value = "";
          }
        })
        .catch((err) => {
          msg.textContent =
            err.message || "An error occurred. Please try again.";
          msg.style.color = "#b91c1c";
        })
        .finally(() => {
          btn.disabled = false;
        });
    });
  }

  loadMapData();
});
