document.addEventListener("DOMContentLoaded", () => {
  const apiBase = "http://localhost:3000";
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

      if (weight < 18) {
        if (fulfillmentSelect.value === "delivery") {
          alert(
            "Gas bottles under 18kg are in store pick up only, please select in store.",
          );
          fulfillmentSelect.value = "pickup";
          updateDeliveryMessage();
        }
        deliveryOption.disabled = true;
        deliveryOption.style.display = "none";
      } else {
        deliveryOption.disabled = false;
        deliveryOption.style.display = "block";
      }
    }

    checkFulfillmentLogic();

    const size = sizeEl.value;
    const date = dateEl.value;
    const quantity = Number(quantityEl.value) || 0;
    const collection = collectionEl.value;
    const address = addressEl ? addressEl.value.trim() : "";

    if (!size || !date) {
      priceInfo.style.display = "none";
      calculatedPrice.value = "";
      availableStock = null;
      return;
    }

    // Only update price if collection is 'delivery' and address is empty, we still send the request, 
    // but the backend might return an error if it can't calculate distance without an address.
    const params = new URLSearchParams({
      size,
      date,
      collection,
      address,
    });
    fetch(`${apiBase}/api/price?${params}`)
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error || "Unable to fetch pricing");
        }
        return response.json();
      })
      .then((data) => {
        priceInfo.style.display = data.product.size === "45kg" ? "none" : "block";
        availableStock = data.available;

        const itemFee = collection === "delivery" ? data.deliveryFee : 0;
        const subtotal = data.basePrice * quantity + itemFee;
        const gst = subtotal * 0.1;
        const totalPrice = subtotal + gst;
        calculatedPrice.value = totalPrice.toFixed(2);
        
        const distanceText = data.distance > 0 ? `(${data.distance} km from 5 Dunn St)` : `(zone: ${data.zone.name})`;

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
        priceInfo.style.display = "none";
        setResult("", false);
        deliveryFeeEl.textContent = "";
        if (gstAmountEl) {
          gstAmountEl.textContent = "";
        }
        stockSummary.textContent = "";
        calculatedPrice.value = "";
        availableStock = null;
        submitBtn.disabled = collection === "delivery";
        
        // Show an error message if the address is missing for delivery
        if (collection === "delivery" && !address) {
          updateOrderResult("Please enter an address for delivery pricing.", "error");
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
    const date = dateEl.value;
    const collection = collectionEl.value;
    const address = addressEl ? addressEl.value.trim() : "";

    if (collection === "delivery") {
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
      body: JSON.stringify({ size, date, quantity, collection, address }),
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
