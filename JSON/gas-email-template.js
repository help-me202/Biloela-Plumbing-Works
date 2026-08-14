function escapeHtml(value) {
  return String(value || "N/A").replace(/[&<>'"]/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    };
    return entities[character];
  });
}

function buildGasReservationEmail(request, { isTest = false } = {}) {
  const fields = [
    ["Name", request.name],
    ["Email", request.email],
    ["Contact", request.contact],
    ["Size", request.size],
    ["Quantity", request.quantity],
    ["Request date", request.date],
    ["Collection type", request.collection],
    ["Address", request.address],
  ];
  const testNotice = isTest
    ? "This is a test email. No customer request or inventory update was created."
    : "A new Gas Request has been submitted.";
  const text = [
    "Biloela Plumbing Works",
    "Gas Request",
    "",
    testNotice,
    "",
    ...fields.map(([label, value]) => `${label}: ${value || "N/A"}`),
  ].join("\n");
  const rows = fields
    .map(
      ([label, value]) => `<tr>
        <td style="padding: 10px 12px; border-bottom: 1px solid #f2d6e9; color: #5c1746; font-weight: 700; width: 34%;">${escapeHtml(label)}</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #f2d6e9; color: #272027;">${escapeHtml(value)}</td>
      </tr>`,
    )
    .join("");
  const html = `<!doctype html>
<html lang="en">
  <head>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@400;500;700&display=swap">
  </head>
  <body style="margin: 0; padding: 24px; background-color: #fff6fb; font-family: 'Frank Ruhl Libre', Georgia, serif; color: #272027;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 640px; margin: 0 auto; background-color: #ffffff; border: 1px solid #f0b8dc; border-collapse: collapse;">
      <tr>
        <td style="padding: 24px; background-color: #dd22a8; color: #ffffff;">
          <div style="font-size: 22px; font-weight: 700;">Biloela Plumbing Works</div>
          <div style="margin-top: 4px; font-size: 16px;">Gas Request</div>
        </td>
      </tr>
      <tr>
        <td style="padding: 24px;">
          <p style="margin: 0 0 20px; color: #5c1746; font-size: 16px; line-height: 1.5;">${escapeHtml(testNotice)}</p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border: 1px solid #f2d6e9; border-collapse: collapse; font-size: 15px;">${rows}</table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { text, html };
}

module.exports = { buildGasReservationEmail };
