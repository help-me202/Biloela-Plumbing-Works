document.addEventListener("DOMContentLoaded", () => {
  const FEATURE_FLAGS = {
    enableOnlinePayment: false,
  };

  const apiBase = ""; // Empty string allows relative paths for both localhost and live domain
  const sizeEl = document.getElementById("size");
  const dateEl = document.getElementById("date");
  const addressEl = document.getElementById("address");
  const quantityEl = document.getElementById("quantity");
  const collectionEl = document.getElementById("fulfillment");
  const priceInfo = document.getElementById("price-info");
  const priceSummary = document.getElementById("price-summary");
  const deliveryFeeEl = document.getElementById("delivery-fee");
  const gstAmountEl = document.getElementById("gst-amount");
  const stockSummary = document.getElementById("stock-summary");
  const deliveryPayment = document.getElementById("delivery-payment");
  const deliveryPaymentPhone = document.getElementById(
    "delivery-payment-phone",
  );
  const deliveryPaymentOnline = document.getElementById(
    "delivery-payment-online",
  );
  const calculatedPrice = document.getElementById("calculatedPrice");
  const submitBtn = document.getElementById("submit-btn");
  const form = document.querySelector("form.form");

  if (dateEl) {
    const today = new Date().toISOString().split("T")[0];
    dateEl.setAttribute("min", today);

    // Allow opening only from the calendar icon area; block text-field selection clicks.
    dateEl.addEventListener("mousedown", function (e) {
      const rect = this.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickedCalendarArea = clickX >= 8 && clickX <= 44;

      e.preventDefault();

      if (!clickedCalendarArea) {
        this.blur();
        return;
      }

      if (typeof this.showPicker === "function") {
        try {
          this.showPicker();
        } catch (e) {
          // Fallback for browsers that require focus before opening picker.
          this.focus();
          try {
            this.showPicker();
          } catch (_) {}
        }
      }
    });

    // Remove focus (highlight) from the input after a date is selected
    dateEl.addEventListener("change", function () {
      setTimeout(() => {
        this.blur();
      }, 50); // Slight delay ensures it overrides the browser's default refocus
    });
  }

  let availableStock = null;
  let latestDeliveryTotal = null;

  const orderResult = document.getElementById("order-result");

  function updateOrderResult(message, type = "info") {
    orderResult.textContent = message;
    orderResult.className = `order-result ${type}`;
  }

  // Keep legacy payment callback support in place but disabled via feature flag.
  if (FEATURE_FLAGS.enableOnlinePayment) {
    const urlParams = new URLSearchParams(window.location.search);
    const paidParam = urlParams.get("paid");
    const paymentReference = urlParams.get("reference");

    if (paidParam === "true") {
      updateOrderResult(
        `Paid request has been sent${paymentReference ? ` (Ref: ${paymentReference})` : ""}`,
        "success",
      );
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (paidParam === "false") {
      updateOrderResult(
        `Payment was not successful${paymentReference ? ` (Ref: ${paymentReference})` : ""}. Please try again.`,
        "error",
      );
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }

  function setResult(message, isError = false) {
    priceSummary.textContent = message;
    priceSummary.style.color = isError ? "#b91c1c" : "#111";
  }

  function updateDeliveryMessage() {
    const isDelivery = collectionEl.value === "delivery";
    deliveryPayment.style.display = isDelivery ? "block" : "none";

    if (deliveryPaymentPhone) {
      const totalText =
        latestDeliveryTotal !== null
          ? ` AUD ${latestDeliveryTotal.toFixed(2)} (inc. GST).`
          : " calculated after your address is mapped.";
      deliveryPaymentPhone.textContent = `For deliveries, please pay over the phone on (07) 4992 6782. The price will be:${totalText}`;
    }

    if (deliveryPaymentPhone && deliveryPaymentOnline) {
      deliveryPaymentPhone.style.display = FEATURE_FLAGS.enableOnlinePayment
        ? "none"
        : "inline";
      deliveryPaymentOnline.style.display = FEATURE_FLAGS.enableOnlinePayment
        ? "inline"
        : "none";
    }
  }

  function getSelectedSize() {
    let size = sizeEl.value;
    const typeContainer = document.getElementById("type-container");
    // If the gas type dropdown is visible and the base size is 18kg
    if (
      typeContainer &&
      typeContainer.style.display === "block" &&
      size === "18kg"
    ) {
      const gasTypeEl = document.getElementById("gas-type");
      if (gasTypeEl && gasTypeEl.value) {
        const typeStr =
          gasTypeEl.value.charAt(0).toUpperCase() + gasTypeEl.value.slice(1);
        size = `${size} ${typeStr}`; // e.g. converts "18kg" to "18kg Exchange"
      }
    }
    return size;
  }

  function updatePriceInfo() {
    updateOrderResult("", "info");

    function checkFulfillmentLogic() {
      const sizeSelect = document.getElementById("size");
      const fulfillmentSelect = document.getElementById("fulfillment");
      const deliveryOption = document.getElementById("deliveryOption");
      const typeContainer = document.getElementById("type-container");

      if (!sizeSelect.value) {
        if (typeContainer) typeContainer.style.display = "none";
        return;
      }

      const selectedSizeOption = sizeSelect.options[sizeSelect.selectedIndex];
      const weightAttr = selectedSizeOption.getAttribute("data-weight");
      const weight = weightAttr ? parseFloat(weightAttr) : 0;

      if (typeContainer) {
        if (weight === 15 || weight === 18) {
          typeContainer.style.display = "block";
        } else {
          typeContainer.style.display = "none";
        }
      }

      const addressContainer = document.getElementById("address-container");
      const addressInput = document.getElementById("address");

      if (weight > 0 && weight < 18) {
        if (fulfillmentSelect.value === "delivery") {
          alert(
            "Gas bottles under 18kg are in store pick up only, please select in store.",
          );
          fulfillmentSelect.value = "pickup";
          updateDeliveryMessage();
        }
        deliveryOption.disabled = true;
        deliveryOption.style.display = "none";
        if (addressContainer) addressContainer.style.display = "none";
        if (addressInput) addressInput.required = false;
        updateOrderResult("", "info");
      } else {
        deliveryOption.disabled = false;
        deliveryOption.style.display = "block";
        if (addressContainer) addressContainer.style.display = "block";
        if (addressInput) addressInput.required = true;
      }
    }

    checkFulfillmentLogic();

    const size = getSelectedSize();
    const sizeWeight = parseFloat(size);
    const isUnder18Kg = Number.isFinite(sizeWeight) && sizeWeight < 18;
    const inStorePickupMessage =
      "This bottle size is available for in-store pickup. Please pay and collect in store.";
    let date = dateEl.value;

    // Prevent weekend selection
    if (date) {
      const day = new Date(date).getUTCDay(); // 0 is Sunday, 6 is Saturday
      if (day === 0 || day === 6) {
        updateOrderResult(
          "We are closed on weekends. Please select a weekday.",
          "error",
        );
        dateEl.value = ""; // Clear the invalid date
        date = ""; // Treat as empty to halt further processing
      }
    }

    const quantity = Number(quantityEl.value) || 0;
    const collection = collectionEl.value;
    const address = addressEl ? addressEl.value.trim() : "";

    if (!size || !date || !collection) {
      priceInfo.style.display = "none";
      calculatedPrice.value = "";
      latestDeliveryTotal = null;
      updateDeliveryMessage();
      availableStock = null;
      return;
    }

    // Only update price if collection is 'delivery' and address is empty, we still send the request,
    // but the backend might return an error if it can't calculate distance without an address.
    const backendCollection = collection === "pickup" ? "store" : collection;
    // Prevent sending an address for distance calculation unless delivery is actually selected
    const addressToSend = collection === "delivery" ? address : "";
    const params = new URLSearchParams({
      size,
      date,
      collection: backendCollection,
      address: addressToSend,
    });
    fetch(`${apiBase}/api/price?${params}`)
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(
            body.error ||
              (isUnder18Kg ? inStorePickupMessage : "Unable to fetch pricing"),
          );
        }
        return response.json();
      })
      .then((data) => {
        priceInfo.style.display = "block";
        availableStock = data.available;

        const itemFee = collection === "delivery" ? data.deliveryFee : 0;
        const subtotal = data.basePrice * quantity + itemFee;
        const gst = subtotal * 0.1;
        const totalPrice = subtotal + gst;
        calculatedPrice.value = totalPrice.toFixed(2);
        latestDeliveryTotal = collection === "delivery" ? totalPrice : null;

        const distanceText =
          data.distance > 0
            ? `(${data.distance} km from 5 Dunn St)`
            : `(zone: ${data.zone.name})`;

        priceSummary.innerHTML = `Selected: <strong>${data.product.name} ${data.product.size}</strong> x ${quantity} — Subtotal ${collection === "delivery" ? "delivery" : "store"} price <strong>AUD ${subtotal.toFixed(2)}</strong>.`;
        deliveryFeeEl.textContent =
          collection === "delivery"
            ? `Delivery fee: AUD ${data.deliveryFee.toFixed(2)} ${distanceText}`
            : `Store pickup price applies. Delivery fee is not included.`;
        if (gstAmountEl) {
          gstAmountEl.innerHTML = `GST (10%): AUD ${gst.toFixed(2)} <br> <strong>Total (inc. GST): AUD ${totalPrice.toFixed(2)}</strong>`;
        }
        stockSummary.textContent = `Stock available in ${data.zone.name}: ${data.available} unit${data.available === 1 ? "" : "s"}.`;

        if (quantity > data.available) {
          stockSummary.textContent +=
            " Please reduce quantity or choose another option.";
          stockSummary.style.color = "#b91c1c";
          submitBtn.disabled = true;
          submitBtn.style.display = "none";
        } else {
          stockSummary.style.color = "#111";
          submitBtn.disabled = false;
          submitBtn.style.display = "block";
        }

        if (FEATURE_FLAGS.enableOnlinePayment) {
          const payLink = deliveryPayment.querySelector("a");
          if (payLink) {
            payLink.href = `payment.html?provider=commbank&source=gas-request&amount=${encodeURIComponent(totalPrice.toFixed(2))}`;
          }
        }

        updateDeliveryMessage();
      })
      .catch((error) => {
        console.error("Pricing API Error:", error);
        priceInfo.style.display = "none";
        setResult("", false);
        deliveryFeeEl.textContent = "";
        if (gstAmountEl) {
          gstAmountEl.textContent = "";
        }
        stockSummary.textContent = "";
        calculatedPrice.value = "";
        latestDeliveryTotal = null;
        availableStock = null;
        submitBtn.disabled = false;
        submitBtn.style.display = "block";

        // Show an error message if the address is missing for delivery
        if (collection === "delivery" && !address) {
          updateOrderResult(
            "Please enter an address for delivery pricing.",
            "error",
          );
        } else if (
          error.message === "Product size not found" ||
          error.message === "Product not found"
        ) {
          updateOrderResult("", "info");
        } else if (error.message === inStorePickupMessage) {
          updateOrderResult(error.message, "notice");
        } else {
          updateOrderResult(error.message, "error");
        }
      });
  }

  sizeEl.addEventListener("change", updatePriceInfo);
  dateEl.addEventListener("input", updatePriceInfo);
  quantityEl.addEventListener("input", updatePriceInfo);
  if (addressEl) {
    addressEl.addEventListener("change", updatePriceInfo);
    addressEl.addEventListener("blur", updatePriceInfo);
  }
  const gasTypeEl = document.getElementById("gas-type");
  if (gasTypeEl) {
    gasTypeEl.addEventListener("change", updatePriceInfo);
  }

  collectionEl.addEventListener("change", () => {
    updateDeliveryMessage();
    updatePriceInfo();
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    orderResult.textContent = "";

    const nameEl = document.getElementById("name");
    const nameValue = nameEl ? nameEl.value.trim() : "";
    if (!nameValue.includes(" ") || nameValue.split(/\s+/).length < 2) {
      updateOrderResult("Please enter both your first and last name.", "error");
      return;
    }

    const emailEl = document.getElementById("email");
    const emailValue = emailEl ? emailEl.value.trim() : "";
    const contactEl = document.getElementById("contact");
    const contactValue = contactEl ? contactEl.value.trim() : "";

    const quantity = Number(quantityEl.value) || 0;
    if (availableStock !== null && quantity > availableStock) {
      updateOrderResult(
        "There is not enough stock for that quantity. Please reduce your order or contact us.",
        "error",
      );
      return;
    }

    const size = getSelectedSize();
    const date = dateEl.value;
    const collection = collectionEl.value;
    const address = addressEl ? addressEl.value.trim() : "";

    if (FEATURE_FLAGS.enableOnlinePayment && collection === "delivery") {
      updateOrderResult(
        "For delivery orders, please pay using the link provided below first.",
        "error",
      );
      return;
    }

    if (!size || !date || quantity < 1) {
      updateOrderResult(
        "Please fill in size, date and quantity before submitting.",
        "error",
      );
      return;
    }

    submitBtn.disabled = true;
    updateOrderResult("Sending order reservation...", "info");

    fetch(`${apiBase}/api/reserve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: nameValue,
        email: emailValue,
        contact: contactValue,
        size,
        date,
        quantity,
        collection,
        address,
      }),
    })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.error || "Reservation failed");
        }
        return data;
      })
      .then((data) => {
        let successMsg = `Order reserved successfully. Reserved ${data.reserved} unit${data.reserved === 1 ? "" : "s"}. Remaining stock: ${data.remaining}.`;
        if (FEATURE_FLAGS.enableOnlinePayment && collection === "delivery") {
          successMsg += " Delivery payment confirmation is required.";
        } else if (collection === "delivery") {
          const totalForPhone = Number(calculatedPrice.value || 0);
          const formattedTotal =
            Number.isFinite(totalForPhone) && totalForPhone > 0
              ? ` AUD ${totalForPhone.toFixed(2)} (inc. GST).`
              : " calculated after your address is mapped.";
          successMsg += ` For deliveries, please pay over the phone on (07) 4992 6782. The price will be:${formattedTotal}`;
        } else if (collection !== "delivery") {
          successMsg += " Please pay upon collection.";
        }
        updateOrderResult(successMsg, "success");
        updatePriceInfo();
      })
      .catch((error) => {
        console.error("Reservation API Error:", error);
        if (
          error.message === "Product size not found" ||
          error.message === "Product not found"
        ) {
          updateOrderResult(
            "Order request submitted. Please pay upon collection.",
            "success",
          );
        } else {
          updateOrderResult(error.message, "error");
        }
      })
      .finally(() => {
        submitBtn.disabled = false;
      });
  });

  updateDeliveryMessage();
  updatePriceInfo();
});
