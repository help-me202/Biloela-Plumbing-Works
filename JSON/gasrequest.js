document.addEventListener("DOMContentLoaded", () => {
  const apiBase = "http://localhost:3000";
  const sizeEl = document.getElementById("size");
  const dateEl = document.getElementById("date");
  const addressEl = document.getElementById("address");
  const quantityEl = document.getElementById("quantity");
  const collectionEl = document.getElementById("fulfillment");
  const distanceEl = document.getElementById("distance");
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

    const distanceContainer = document.getElementById("distance-container");
    if (distanceContainer)
      distanceContainer.style.display =
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
    const date = dateEl.value;
    const quantity = Number(quantityEl.value) || 0;
    const collection = collectionEl.value;
    const distance = distanceEl ? distanceEl.value : 0;

    if (!size || !date) {
      priceInfo.style.display = "none";
      calculatedPrice.value = "";
      availableStock = null;
      return;
    }

    const params = new URLSearchParams({
      size,
      date,
      collection,
      distance,
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
            ? `Delivery fee: AUD ${data.deliveryFee.toFixed(2)} ${distance > 0 ? "(" + distance + " km from 5 Dunn St)" : "(zone: " + data.zone.name + ")"}`
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
      });
  }

  sizeEl.addEventListener("change", updatePriceInfo);
  dateEl.addEventListener("input", updatePriceInfo);
  quantityEl.addEventListener("input", updatePriceInfo);
  collectionEl.addEventListener("change", () => {
    updateDeliveryMessage();
    if (collectionEl.value === "delivery" && addressEl.value.trim() && !distanceEl.value) {
      calculateDistance();
    } else {
      updatePriceInfo();
    }
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
    const distance = distanceEl ? distanceEl.value : 0;

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
      body: JSON.stringify({ size, date, quantity, collection, distance }),
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

  async function calculateDistance() {
    const address = addressEl.value.trim();
    if (!address) {
      distanceEl.value = "";
      updatePriceInfo(); // Recalculate if address is cleared
      return;
    }

    // Give user feedback
    distanceEl.value = "";
    distanceEl.placeholder = "Calculating...";
    updateOrderResult("Calculating distance...", "info");

    try {
      const response = await fetch(
        `${apiBase}/api/distance?address=${encodeURIComponent(address)}`,
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not calculate distance.");
      }

      distanceEl.placeholder = "";
      distanceEl.value = data.distance;
      updateOrderResult("", "info"); // Clear calculating message
    } catch (error) {
      console.error("Distance calculation error:", error);
      distanceEl.placeholder = "Could not calculate";
      updateOrderResult(`Error: ${error.message}`, "error");
    } finally {
      // Always update the price info after attempting to get distance
      updatePriceInfo();
    }
  }

  if (addressEl) {
    addressEl.addEventListener("blur", calculateDistance);
    addressEl.addEventListener("change", calculateDistance);
  }

  updateDeliveryMessage();
  
  // Calculate distance on load if address is pre-filled, else update price directly
  if (addressEl && addressEl.value.trim() && !distanceEl.value) {
    calculateDistance();
  } else {
    updatePriceInfo();
  }
});
