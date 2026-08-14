document.addEventListener("DOMContentLoaded", () => {
  const FEATURE_FLAGS = {
    enableOnlinePayment: false,
  };

  function getApiBase() {
    const { protocol, hostname, port } = window.location;
    const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1";

    if (protocol === "file:") {
      return "http://localhost:3000";
    }

    if (isLocalHost && port !== "3000") {
      return "http://localhost:3000";
    }

    return "";
  }

  const apiBase = getApiBase();
  const sizeEl = document.getElementById("size");
  const dateEl = document.getElementById("date");
  const addressEl = document.getElementById("address");
  const quantityEl = document.getElementById("quantity");
  const collectionEl = document.getElementById("fulfillment");
  const priceInfo = document.getElementById("price-info");
  const priceSummary = document.getElementById("price-summary");
  const gasTypeContainer = document.getElementById("type-container");
  const gasTypeEl = document.getElementById("gas-type");
  const deliveryPaymentPhone = document.getElementById(
    "delivery-payment-phone",
  );
  const calculatedPrice = document.getElementById("calculatedPrice");
  const submitBtn = document.getElementById("submit-btn");
  const form = document.querySelector("form.form");

  if (dateEl) {
    const today = new Date().toISOString().split("T")[0];
    dateEl.setAttribute("min", today);

    // Allow opening only from the ca lendar icon area; block text-field selection clicks.
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
  let addressInputTimer = null;
  const OUT_OF_AREA_MESSAGE = "Sorry, we are unable to deliver to your address";
  const PRICING_UNAVAILABLE_MESSAGE =
    "Sorry, we could not calculate pricing right now. Please try again.";
  const LOCAL_SERVER_UNAVAILABLE_MESSAGE =
    "The pricing server is not running. Please start the local server on port 3000 and try again.";

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
    if (deliveryPaymentPhone) {
      deliveryPaymentPhone.style.display = isDelivery ? "block" : "none";
      deliveryPaymentPhone.textContent =
        "For deliveries, please pay over the phone on (07) 4992 6782.";
    }
  }

  function sizeRequiresType(size) {
    return size === "15kg" || size === "18kg";
  }

  function updateTypeSelectorVisibility() {
    if (!gasTypeContainer || !gasTypeEl) {
      return;
    }

    const selectedSize = sizeEl.value;
    const shouldShowType = sizeRequiresType(selectedSize);
    gasTypeContainer.style.display = shouldShowType ? "block" : "none";
    gasTypeEl.required = shouldShowType;

    if (!shouldShowType) {
      gasTypeEl.value = "";
    }
  }

  function getSelectedSize() {
    const selectedSize = sizeEl.value;
    if (selectedSize === "18kg" && gasTypeEl && gasTypeEl.value) {
      const typeText =
        gasTypeEl.value.charAt(0).toUpperCase() + gasTypeEl.value.slice(1);
      return `18kg ${typeText}`;
    }
    return selectedSize;
  }

  function updatePriceInfo() {
    updateOrderResult("", "info");
    updateTypeSelectorVisibility();

    function checkFulfillmentLogic() {
      const sizeSelect = document.getElementById("size");
      const fulfillmentSelect = document.getElementById("fulfillment");
      const deliveryOption = document.getElementById("deliveryOption");

      if (!sizeSelect.value) {
        return;
      }

      const selectedSizeOption = sizeSelect.options[sizeSelect.selectedIndex];
      const weightAttr = selectedSizeOption.getAttribute("data-weight");
      const weight = weightAttr ? parseFloat(weightAttr) : 0;

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
    const baseSize = sizeEl.value;
    const requiresType = sizeRequiresType(baseSize);
    const selectedType = gasTypeEl ? gasTypeEl.value : "";

    if (requiresType && !selectedType) {
      priceInfo.style.display = "none";
      calculatedPrice.value = "";
      latestDeliveryTotal = null;
      availableStock = null;
      updateOrderResult("Please select Exchange or Forklift.", "error");
      return;
    }

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
          "Please select a weekday, alternatively if urgent please call (07) 4992 6782. Thank you.\n\nFor emergencies after 12pm please call 0429 931 915. Thank you.",
          "error",
        );
        dateEl.value = ""; // Clear the invalid date
        date = ""; // Treat as empty to halt further processing
      }
    }

    const quantity = Number(quantityEl.value) || 0;
    const collection = collectionEl.value;
    const address = addressEl ? addressEl.value.trim() : "";

    if (collection === "delivery" && !address) {
      priceInfo.style.display = "none";
      calculatedPrice.value = "";
      latestDeliveryTotal = null;
      availableStock = null;
      updateDeliveryMessage();
      updateOrderResult(
        "Please enter an address for delivery pricing.",
        "error",
      );
      return;
    }

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
              (isUnder18Kg
                ? inStorePickupMessage
                : PRICING_UNAVAILABLE_MESSAGE),
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

        priceSummary.innerHTML = `<strong>Total price (inc. GST): AUD ${totalPrice.toFixed(2)}</strong>`;

        if (quantity > data.available) {
          updateOrderResult(
            "There is not enough stock for that quantity. Please reduce your order or contact us.",
            "error",
          );
          submitBtn.disabled = true;
          submitBtn.style.display = "none";
        } else {
          submitBtn.disabled = false;
          submitBtn.style.display = "block";
        }

        updateDeliveryMessage();
      })
      .catch((error) => {
        console.error("Pricing API Error:", error);
        priceInfo.style.display = "none";
        setResult("", false);
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
        } else if (
          apiBase === "http://localhost:3000" &&
          (error.name === "TypeError" ||
            error.message === "Failed to fetch" ||
            error.message === "NetworkError when attempting to fetch resource.")
        ) {
          updateOrderResult(LOCAL_SERVER_UNAVAILABLE_MESSAGE, "error");
        } else if (
          error.message &&
          (error.message
            .toLowerCase()
            .includes("cannot deliver to your address") ||
            error.message
              .toLowerCase()
              .includes("unable to deliver to your address"))
        ) {
          updateOrderResult(OUT_OF_AREA_MESSAGE, "error");
        } else {
          updateOrderResult(error.message, "error");
        }
      });
  }

  sizeEl.addEventListener("change", updatePriceInfo);
  if (gasTypeEl) {
    gasTypeEl.addEventListener("change", updatePriceInfo);
  }
  dateEl.addEventListener("input", updatePriceInfo);
  quantityEl.addEventListener("input", updatePriceInfo);
  if (addressEl) {
    addressEl.addEventListener("change", updatePriceInfo);
    addressEl.addEventListener("blur", updatePriceInfo);
    addressEl.addEventListener("input", () => {
      if (addressInputTimer) {
        clearTimeout(addressInputTimer);
      }
      addressInputTimer = setTimeout(updatePriceInfo, 500);
    });
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
    const baseSize = sizeEl.value;
    const requiresType = sizeRequiresType(baseSize);
    const selectedType = gasTypeEl ? gasTypeEl.value : "";
    const date = dateEl.value;
    const collection = collectionEl.value;
    const address = addressEl ? addressEl.value.trim() : "";

    if (requiresType && !selectedType) {
      updateOrderResult("Please select Exchange or Forklift.", "error");
      return;
    }

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
        let successMsg =
          "Thank you. Your gas request has been received successfully.";
        if (FEATURE_FLAGS.enableOnlinePayment && collection === "delivery") {
          successMsg += " Delivery payment confirmation is required.";
        } else if (collection === "delivery") {
          successMsg +=
            " For deliveries, please pay over the phone on (07) 4992 6782.";
        } else if (collection !== "delivery") {
          successMsg += " Please pay upon collection.";
        }
        updateOrderResult(successMsg, "success");
      })
      .catch((error) => {
        console.error("Reservation API Error:", error);
        if (
          error.message === "Product size not found" ||
          error.message === "Product not found"
        ) {
          updateOrderResult(
            "Thank you. Your gas request has been received successfully. Please pay upon collection.",
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
  updateTypeSelectorVisibility();
  updatePriceInfo();
});
