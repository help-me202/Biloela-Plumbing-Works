const path = require("path");
const nodemailer = require("nodemailer");
const { buildGasReservationEmail } = require("../JSON/gas-email-template");

require("dotenv").config({
  path: path.join(__dirname, "..", ".env"),
});

const smtpUser =
  process.env.SMTP_USER || process.env.SMTP_EMAIL || process.env.EMAIL_USER;
const smtpPassword = process.env.SMTP_PASS || process.env.EMAIL_PASS;
const missingSettings = [
  !process.env.SMTP_HOST && "SMTP_HOST",
  !smtpUser && "EMAIL_USER or SMTP_USER",
  !smtpPassword && "EMAIL_PASS or SMTP_PASS",
].filter(Boolean);

if (missingSettings.length > 0) {
  console.error(
    `Cannot send the gas email test. Missing: ${missingSettings.join(", ")}.`,
  );
  process.exit(1);
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: smtpUser,
    pass: smtpPassword,
  },
});

async function sendTestEmail() {
  const testRequest = {
    name: "Test Customer",
    email: "admin@biloelaplumbingworks.com",
    contact: "0400 000 000",
    size: "45kg",
    quantity: 1,
    date: "2026-08-17",
    collection: "pickup",
    address: "N/A - test request",
  };

  const info = await transporter.sendMail({
    from: `"${testRequest.name}"<${smtpUser}>`,
    replyTo: testRequest.email,
    to: "stores@biloelaplumbingworks.com",
    subject: "Test: New Gas Reservation",
    ...buildGasReservationEmail(testRequest, { isTest: true }),
  });

  console.log(`Test email accepted by SMTP. Message ID: ${info.messageId}`);
}

sendTestEmail().catch((error) => {
  console.error(`Gas email test failed: ${error.message}`);
  process.exit(1);
});
