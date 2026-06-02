document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("payment-form");
  const msg = document.getElementById("message");

  // Pre-fill the amount from URL parameters and fix it so it cannot be altered
  const urlParams = new URLSearchParams(window.location.search);
  const amountParam = urlParams.get("amount");
  if (amountParam && form.amount) {
    form.amount.value = amountParam;
    form.amount.disabled = true;
  }

  function setMessage(text, isError) {
    msg.textContent = text;
    msg.style.color = isError ? "#b91c1c" : "#0b6623";
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    msg.textContent = "";

    const name = form.name.value.trim();
    const email = form.email.value.trim();
    const amount = parseFloat(form.amount.value);

    if (!name) return setMessage("Please enter your full name.", true);
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
      return setMessage("Please enter a valid email.", true);
    if (!amount || amount <= 0)
      return setMessage("Please enter a valid amount.", true);

    // simulate processing
    const payBtn = document.getElementById("pay-btn");
    payBtn.disabled = true;
    setMessage("Redirecting to secure payment gateway...", false);

    fetch("/api/create-checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, amount }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        window.location.href = data.url; // Redirect to Stripe
      })
      .catch((err) => {
        console.error("Payment init error:", err);
        setMessage("Failed to initialize payment. Please try again.", true);
        payBtn.disabled = false;
      });
  });
});
