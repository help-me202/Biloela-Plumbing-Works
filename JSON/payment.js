document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("payment-form");
  const msg = document.getElementById("message");

  // Pre-fill the amount from URL parameters and fix it so it cannot be altered
  const urlParams = new URLSearchParams(window.location.search);
  const amountParam = urlParams.get("amount");
  if (amountParam && form.amount) {
    form.amount.value = amountParam;
    form.amount.readOnly = true;
  }

  function setMessage(text, isError) {
    msg.textContent = text;
    msg.style.color = isError ? "#b91c1c" : "#0b6623";
  }

  function cleanCard(val) {
    return val.replace(/\D/g, "");
  }

  function luhnCheck(card) {
    let sum = 0;
    let rev = card.split("").reverse();
    for (let i = 0; i < rev.length; i++) {
      let d = parseInt(rev[i], 10);
      if (i % 2 === 1) {
        d *= 2;
        if (d > 9) d -= 9;
      }
      sum += d;
    }
    return sum % 10 === 0;
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    msg.textContent = "";

    const name = form.name.value.trim();
    const email = form.email.value.trim();
    const amount = parseFloat(form.amount.value);
    const cardRaw = cleanCard(form.card.value);
    const exp = form.exp.value.trim();
    const cvc = form.cvc.value.trim();

    if (!name) return setMessage("Please enter your full name.", true);
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
      return setMessage("Please enter a valid email.", true);
    if (!amount || amount <= 0)
      return setMessage("Please enter a valid amount.", true);
    if (
      cardRaw.length < 13 ||
      cardRaw.length > 19 ||
      !/^\d+$/.test(cardRaw) ||
      !luhnCheck(cardRaw)
    )
      return setMessage("Please enter a valid card number.", true);
    if (!/^(0[1-9]|1[0-2])\/(\d{2})$/.test(exp))
      return setMessage("Please enter a valid expiry date (MM/YY).", true);
    if (!/^\d{3,4}$/.test(cvc))
      return setMessage("Please enter a valid CVC.", true);

    // simulate processing
    const payBtn = document.getElementById("pay-btn");
    payBtn.disabled = true;
    setMessage("Processing payment...", false);

    setTimeout(() => {
      payBtn.disabled = false;
      const masked = "•••• •••• •••• " + cardRaw.slice(-4);
      setMessage(
        `Payment of AUD ${amount.toFixed(2)} succeeded using ${masked}. Thank you, ${name}!`,
        false,
      );
      form.reset();
    }, 1200);
  });
});
