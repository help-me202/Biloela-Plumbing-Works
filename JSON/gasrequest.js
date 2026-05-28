document.addEventListener("DOMContentLoaded", () => {
  const apiBase = "http://localhost:3000";
  const sizeEl = document.getElementById("size");
  const postcodeEl = document.getElementById("postcode");
  const quantityEl = document.getElementById("quantity");
  const collectionEl = document.getElementById("fulfillment");
  const priceInfo = document.getElementById("price-info");
  const priceSummary = document.getElementById("price-summary");
  const deliveryFeeEl = document.getElementById("delivery-fee");
  const gstAmountEl = document.getElementById("gst-amount");
  const stockSummary = document.getElementById("stock-summary");
  const deliveryPayment = document.getElementById("delivery-payment");
  const calculatedPrice = document.getElementById("calculatedPrice");
  const submitBtn = document.getElementById("submit-btn");
  const form = document.querySelector("form.form");

  let availableStock = null;

  const orderResult = document.getElementById("order-result");

  function updateOrderResult(message, type = "info") {
    orderResult.textContent = message;
    orderResult.className = `order-result ${type}`;
  }

  function setResult(message, isError = false) {
    priceSummary.textContent = message;
    priceSummary.style.color = isError ? "#b91c1c" : "#111";
  }

  function updateDeliveryMessage() {
    deliveryPayment.style.display =
      collectionEl.value === "delivery" ? "block" : "none";
  }

  function updatePriceInfo() {
    updateOrderResult("", "info");

    function checkFulfillmentLogic() {
      const sizeSelect = document.getElementById("size");
      const fulfillmentSelect = document.getElementById("fulfillment");
      const deliveryOption = document.getElementById("deliveryOption");
      const typeContainer = document.getElementById("type-container");

      // Exit early if no size is chosen yet
      if (!sizeSelect.value) {
        if (typeContainer) typeContainer.style.display = "none";
        return;
      }

      // Get numerical weight from the chosen size option
      const selectedSizeOption = sizeSelect.options[sizeSelect.selectedIndex];
      const weightAttr = selectedSizeOption.getAttribute("data-weight");
      const weight = weightAttr ? parseFloat(weightAttr) : 0;

      // Logic for secondary type (Exchange or Forklift)
      if (typeContainer) {
        if (weight === 15 || weight === 18) {
          typeContainer.style.display = "block";
        } else {
          typeContainer.style.display = "none";
        }
      }

      // Logic for items under 18kg
      if (weight < 18) {
        // If user already chose delivery, alert them and revert it
        if (fulfillmentSelect.value === "delivery") {
          alert(
            "Gas bottles under 18kg are in store pick up only, please select in store.",
          );
          fulfillmentSelect.value = "pickup";
          updateDeliveryMessage();
        }

        // Hide and disable the delivery option
        deliveryOption.disabled = true;
        deliveryOption.style.display = "none";
      } else {
        // Re-enable and show delivery for 18kg and above
        deliveryOption.disabled = false;
        deliveryOption.style.display = "block";
      }
    }

    checkFulfillmentLogic();

    const size = sizeEl.value;
    const postcode = postcodeEl.value.trim();
    const quantity = Number(quantityEl.value) || 0;
    const collection = collectionEl.value;

    if (!size || !postcode) {
      priceInfo.style.display = "none";
      calculatedPrice.value = "";
      availableStock = null;
      return;
    }

    const params = new URLSearchParams({ size, postcode, collection });
    fetch(`${apiBase}/api/price?${params}`)
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error || "Unable to fetch pricing");
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

        priceSummary.innerHTML = `Selected: <strong>${data.product.name} ${data.product.size}</strong> x ${quantity} — Subtotal ${collection === "delivery" ? "delivery" : "store"} price <strong>AUD ${subtotal.toFixed(2)}</strong>.`;
        deliveryFeeEl.textContent =
          collection === "delivery"
            ? `Delivery fee: AUD ${data.deliveryFee.toFixed(2)} (zone: ${data.zone.name})`
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
        } else {
          stockSummary.style.color = "#111";
          submitBtn.disabled = collection === "delivery";
        }

        const payLink = deliveryPayment.querySelector("a");
        if (payLink) {
          payLink.href = `payment.html?amount=${totalPrice.toFixed(2)}`;
        }
      })
      .catch((error) => {
        console.error("Pricing API Error:", error);
        priceInfo.style.display = "block";
        setResult(error.message, true);
        deliveryFeeEl.textContent = "";
        if (gstAmountEl) {
          gstAmountEl.textContent = "";
        }
        stockSummary.textContent = "";
        calculatedPrice.value = "";
        availableStock = null;
        submitBtn.disabled = true;
      });
  }

  sizeEl.addEventListener("change", updatePriceInfo);
  postcodeEl.addEventListener("input", updatePriceInfo);
  quantityEl.addEventListener("input", updatePriceInfo);
  collectionEl.addEventListener("change", () => {
    updateDeliveryMessage();
    updatePriceInfo();
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    orderResult.textContent = "";

    const quantity = Number(quantityEl.value) || 0;
    if (availableStock !== null && quantity > availableStock) {
      updateOrderResult(
        "There is not enough stock for that quantity. Please reduce your order or contact us.",
        "error",
      );
      return;
    }

    const size = sizeEl.value;
    const postcode = postcodeEl.value.trim();
    const collection = collectionEl.value;

    if (!size || !postcode || quantity < 1) {
      updateOrderResult(
        "Please fill in size, postcode and quantity before submitting.",
        "error",
      );
      return;
    }

    submitBtn.disabled = true;
    updateOrderResult("Sending order reservation...", "info");

    fetch(`${apiBase}/api/reserve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ size, postcode, quantity, collection }),
    })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.error || "Reservation failed");
        }
        return data;
      })
      .then((data) => {
        updateOrderResult(
          `Order reserved successfully. Reserved ${data.reserved} unit${data.reserved === 1 ? "" : "s"}. Remaining stock: ${data.remaining}.`,
          "success",
        );
        updatePriceInfo();
      })
      .catch((error) => {
        console.error("Reservation API Error:", error);
        updateOrderResult(error.message, "error");
      })
      .finally(() => {
        submitBtn.disabled = collection === "delivery";
      });
  });

  updateDeliveryMessage();
  updatePriceInfo();
});
