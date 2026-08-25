const express = require("express");
const cors = require("cors");
const multer = require("multer");
const app = express();
const path = require("path");
const { buildGasReservationEmail } = require("./gas-email-template");

// Tell dotenv to look for the .env file in the parent directory
require("dotenv").config({
  path: path.join(__dirname, "..", ".env"),
});

const { Client } = require("@googlemaps/google-maps-services-js");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const nodemailer = require("nodemailer");
const port = process.env.PORT || 3000;
const CONTACT_ADDRESS = "5 Dunn Street, Biloela QLD 4715, Australia";
const FALLBACK_MAP_URL =
  "https://maps.google.com/maps?q=5%20Dunn%20Street,%20Biloela%20QLD,%20Australia&t=&z=15&ie=UTF8&iwloc=&output=embed";
const MAP_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const MAP_HEALTH_ENABLED = process.env.ENABLE_MAP_HEALTH === "true";
const MAP_HEALTH_TOKEN = process.env.MAP_HEALTH_TOKEN || "";
const MAX_DELIVERY_DISTANCE_KM = 40;
const DELIVERY_OUT_OF_AREA_MESSAGE = "Sorry, we cannot deliver to your address";
const WEEKEND_DELIVERY_UNAVAILABLE_MESSAGE =
  "Please select a weekday, alternatively if urgent please call (07) 4992 6782. Thank you.\n\nFor emergencies after 12pm please call 0429 931 915. Thank you.";
let cachedMapLocation = null;
let mapDiagnostics = {
  lastAttemptAt: null,
  lastSuccessAt: null,
  lastFailureAt: null,
  lastSource: "startup",
  lastError: null,
  lastHttpStatus: null,
};

// Security precautions
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        frameSrc: [
          "'self'",
          "https://www.google.com",
          "https://maps.google.com",
        ],
      },
    },
  }),
);

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again after 15 minutes",
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/", apiLimiter);

// SMTP configuration
const SMTP_FROM_EMAIL =
  process.env.SMTP_USER ||
  process.env.SMTP_EMAIL ||
  process.env.EMAIL_USER ||
  "";
const SMTP_PASSWORD = process.env.SMTP_PASS || process.env.EMAIL_PASS || "";
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: process.env.SMTP_PORT || 587,
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: SMTP_FROM_EMAIL,
    pass: SMTP_PASSWORD,
  },
});

// When enabled, every outbound notification email is redirected here instead of the real recipients.
const TEST_EMAIL_MODE = process.env.TEST_EMAIL_MODE === "true";
const TEST_EMAIL_RECIPIENT = "stores@biloelaplumbingworks.com";

function resolveEmailRecipient(realRecipient) {
  return TEST_EMAIL_MODE ? TEST_EMAIL_RECIPIENT : realRecipient;
}

const PAYMENT_NOTIFICATION_EMAIL =
  process.env.PAYMENT_NOTIFICATION_EMAIL || "workshop@biloelaplumbingworks.com";
const GAS_REQUEST_NOTIFICATION_EMAILS =
  process.env.GAS_REQUEST_NOTIFICATION_EMAILS ||
  "admin@biloelaplumbingworks.com,workshop@biloelaplumbingworks.com,service@biloelaplumbingworks.com";

function pickFirstValue(payload, keys) {
  for (const key of keys) {
    const value = payload?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value);
    }
  }
  return "";
}

function normalizePaymentStatus(rawStatus) {
  const status = String(rawStatus || "unknown").toLowerCase();

  if (
    status === "00" ||
    status === "0" ||
    status.includes("success") ||
    status.includes("approved") ||
    status.includes("paid") ||
    status === "true"
  ) {
    return "paid";
  }

  if (
    status.includes("cancel") ||
    status.includes("declin") ||
    status.includes("fail") ||
    status.includes("error") ||
    status === "false"
  ) {
    return "failed";
  }

  return "pending";
}

function isWeekendDate(date) {
  if (!date) return false;

  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

function getCommbankPaymentDetails(payload) {
  const reference = pickFirstValue(payload, [
    "reference",
    "merchantReference",
    "orderId",
    "transactionId",
    "txnRef",
  ]);
  const amount = pickFirstValue(payload, ["amount", "totalAmount"]);
  const customerName = pickFirstValue(payload, ["customerName", "name"]);
  const customerEmail = pickFirstValue(payload, ["customerEmail", "email"]);
  const statusRaw = pickFirstValue(payload, [
    "status",
    "result",
    "paymentStatus",
    "responseCode",
    "txnResponseCode",
    "approved",
  ]);
  const status = normalizePaymentStatus(statusRaw);

  return {
    reference,
    amount,
    customerName,
    customerEmail,
    status,
    statusRaw,
  };
}

async function sendPaymentNotificationEmail(eventType, details, payload) {
  if (!SMTP_FROM_EMAIL) return;

  const amountText = details.amount
    ? `AUD ${details.amount}`
    : "Not supplied by gateway";

  await transporter.sendMail({
    from: `"Biloela Plumbing Works"<${SMTP_FROM_EMAIL}>`,
    replyTo: details.customerEmail || SMTP_FROM_EMAIL,
    to: resolveEmailRecipient(PAYMENT_NOTIFICATION_EMAIL),
    subject: `CommBank Payment ${eventType}: ${details.status.toUpperCase()}`,
    text:
      `Event: ${eventType}\n` +
      `Status: ${details.status}\n` +
      `Gateway status/raw code: ${details.statusRaw || "N/A"}\n` +
      `Reference: ${details.reference || "N/A"}\n` +
      `Amount: ${amountText}\n` +
      `Customer name: ${details.customerName || "N/A"}\n` +
      `Customer email: ${details.customerEmail || "N/A"}\n\n` +
      `Gateway payload:\n${JSON.stringify(payload || {}, null, 2)}\n`,
  });
}

app.use(cors());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

const googleMapsClient = new Client({});

app.use(
  express.json({
    limit: "1mb",
  }),
);
app.use(express.static(path.join(__dirname, "..", "HTML")));
app.use(express.static(path.join(__dirname, "..")));

const zones = [
  {
    id: 1,
    name: "Biloela",
    postcodes: ["4715"],
    deliveryFee: 12.0,
  },
  {
    id: 2,
    name: "Moura",
    postcodes: ["4718"],
    deliveryFee: 15.0,
  },
  {
    id: 3,
    name: "Other",
    postcodes: [],
    deliveryFee: 20.0,
  },
];

const products = [
  {
    id: 1,
    name: "Gas Bottle",
    size: "3.7kg",
    basePrice: 0.0, // TODO: Update with correct price
    sizeType: "small",
  },
  {
    id: 2,
    name: "Gas Bottle",
    size: "8.5kg",
    basePrice: 0.0, // TODO: Update with correct price
    sizeType: "small",
  },
  {
    id: 4,
    name: "Gas Bottle",
    size: "13kg",
    basePrice: 0.0, // TODO: Update with correct price
    sizeType: "large",
  },
  {
    id: 6,
    name: "Gas Bottle",
    size: "15kg",
    basePrice: 0.0, // TODO: Update with correct price
    sizeType: "large",
  },
  {
    id: 7,
    name: "Gas Bottle",
    size: "18kg",
    basePrice: 87.21, // Base price ex. GST ($95.93 inc. GST)
    sizeType: "large",
  },
  {
    id: 8,
    name: "Gas Bottle",
    size: "45kg",
    basePrice: 160.0, // Base price ex. GST ($176.00 inc. GST)
    sizeType: "xlarge",
  },
  {
    id: 9,
    name: "Gas Bottle",
    size: "18kg Forklift",
    basePrice: 87.21, // TODO: Update with correct price if different
    sizeType: "large",
  },
  {
    id: 10,
    name: "Gas Bottle",
    size: "18kg Exchange",
    basePrice: 87.21, // TODO: Update with correct price if different
    sizeType: "large",
  },
];

const inventory = [
  {
    productId: 1,
    zoneId: 1,
    qty: 3,
  },
  // 3.7kg
  {
    productId: 2,
    zoneId: 1,
    qty: 8,
  },
  // 8.5kg
  {
    productId: 4,
    zoneId: 1,
    qty: 8,
  },
  // 13kg
  {
    productId: 6,
    zoneId: 1,
    qty: 8,
  },
  // 15kg
  {
    productId: 7,
    zoneId: 1,
    qty: 8,
  },
  // 18kg
  {
    productId: 8,
    zoneId: 1,
    qty: 10,
  },
  // 45kg
  {
    productId: 9,
    zoneId: 1,
    qty: 7,
  },
  // 18kg Forklift
  {
    productId: 10,
    zoneId: 1,
    qty: 1,
  },
  // 18kg Exchange
];

const zonePrices = [];

function findZone() {
  // Since postcode is removed, default to Biloela for pricing and inventory
  return zones.find((z) => z.name === "Biloela") || zones[0];
}

function extractPostcode(address = "") {
  const match = String(address).match(/\b(\d{4})\b/);
  return match ? match[1] : "";
}

function findZoneByAddress(address = "") {
  const normalized = String(address).toLowerCase();
  const postcode = extractPostcode(address);

  if (postcode) {
    const byPostcode = zones.find((z) => z.postcodes.includes(postcode));
    if (byPostcode) return byPostcode;
  }

  // Simple suburb keyword fallback when postcode is not provided.
  if (normalized.includes("moura")) {
    return zones.find((z) => z.name === "Moura") || findZone();
  }
  if (normalized.includes("biloela")) {
    return zones.find((z) => z.name === "Biloela") || findZone();
  }

  return zones.find((z) => z.name === "Other") || zones[zones.length - 1];
}

function getProduct(size) {
  return products.find((p) => p.size.toLowerCase() === size.toLowerCase());
}

function getInventory(productId, zoneId) {
  const item = inventory.find(
    (record) => record.productId === productId && record.zoneId === zoneId,
  );
  return item ? item.qty : 0;
}

// Delivery cost calculation variables (adjustable)
const BASE_DELIVERY_FEE = 15.0; // Flat rate applied before per km charge
const COST_PER_KM = 2.0; // Dollar amount per kilometre

app.get("/api/products", (req, res) => {
  res.json(products);
});

app.get("/api/zones", (req, res) => {
  res.json(
    zones.map((zone) => ({
      id: zone.id,
      name: zone.name,
      deliveryFee: zone.deliveryFee,
    })),
  );
});

async function getDistance(address) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey)
    throw new Error("Google Maps API key is not configured on the server.");
  if (!address) throw new Error("Address is required to calculate distance.");

  // Append state and country to help Google accurately find local addresses
  const searchAddress = address.toLowerCase().includes("australia")
    ? address
    : `${address}

  ,
  QLD,
  Australia`;

  let response;

  try {
    response = await googleMapsClient.distancematrix({
      params: {
        origins: ["5 Dunn St, Biloela QLD 4715, Australia"],
        destinations: [searchAddress],
        key: apiKey,
        region: "au", // Biases the search to Australian addresses
      },

      timeout: 5000, // Increased timeout to prevent premature drops
    });
  } catch (error) {
    console.error(
      "Google Maps Client Exception:",
      error.response?.data || error.message,
    );
    throw new Error("Failed to reach Google Maps API.");
  }

  // Safely handle top-level Google API errors (like REQUEST_DENIED for invalid keys)
  if (response.data.status !== "OK") {
    console.error(`Google API Top-Level Error: ${response.data.status}

      | Details: ${response.data.error_message || "None"}

      `);

    throw new Error(`Google Maps API Error: ${response.data.status}

      `);
  }

  const result = response.data.rows[0].elements[0];

  if (result.status === "OK") {
    const distanceInMeters = result.distance.value;
    return parseFloat((distanceInMeters / 1000).toFixed(1));
  } else {
    console.error(`Google Maps Distance Matrix failed. Status: ${result.status}

      for address: ${searchAddress}

      `);

    throw new Error(`Could not calculate distance. Status: ${result.status}

      `);
  }
}

app.get("/api/price", async (req, res, next) => {
  try {
    const { size, date, collection, address } = req.query;

    if (!size) {
      return res.status(400).json({
        error: "Missing size query parameter",
      });
    }

    const product = getProduct(size);

    if (!product) {
      return res.status(404).json({
        error: "Product size not found",
      });
    }

    const stockZone = findZone();
    const collectionType = collection === "store" ? "store" : "delivery";
    const zone =
      collectionType === "delivery" ? findZoneByAddress(address) : stockZone;
    const available = getInventory(product.id, stockZone.id);

    if (collectionType === "delivery" && !String(address || "").trim()) {
      return res.status(400).json({
        error: "Address is required for delivery pricing.",
      });
    }

    const zonePrice = zonePrices.find(
      (r) => r.productId === product.id && r.zoneId === zone.id,
    );
    const basePrice =
      zonePrice && typeof zonePrice.overridePrice === "number"
        ? zonePrice.overridePrice
        : product.basePrice;

    // Check if the selected date is a Tuesday (Day 2 of the week)
    const isTuesday = date ? new Date(date).getUTCDay() === 2 : false;

    if (collectionType === "delivery" && isWeekendDate(date)) {
      return res.status(400).json({
        error: WEEKEND_DELIVERY_UNAVAILABLE_MESSAGE,
      });
    }

    let deliveryFee = 0;
    let distanceVal = 0;
    let distanceUnavailable = false;

    if (collectionType === "delivery") {
      if (address) {
        try {
          distanceVal = await getDistance(address);
        } catch (err) {
          console.error("Distance error in /api/price:", err.message);
          distanceUnavailable = true;
          distanceVal = 0;
        }
      }

      // Decline deliveries that exceed the 40 km service limit.
      if (!distanceUnavailable && distanceVal > MAX_DELIVERY_DISTANCE_KM) {
        return res.status(400).json({
          error: DELIVERY_OUT_OF_AREA_MESSAGE,
        });
      }

      if (product.size === "45kg") {
        if (!isTuesday) {
          if (!distanceUnavailable && distanceVal <= 15) {
            deliveryFee = 190.0 - basePrice; // $209.00 inc GST -> $190 ex GST
          } else if (!distanceUnavailable && distanceVal <= 30) {
            deliveryFee = 175.0 - basePrice; // $192.50 inc gst -> $175 ex gst
          } else {
            deliveryFee = 222.73 - basePrice; // $245.00 inc gst -> $222.73 ex gst
          }
        } else {
          if (!distanceUnavailable && distanceVal <= 15) {
            deliveryFee = 170.0 - basePrice; // $187 inc gst -> $170 ex gst
          } else if (!distanceUnavailable && distanceVal <= 30) {
            deliveryFee = 220.0 - basePrice; // $242 inc gst -> $220 ex gst
          } else {
            deliveryFee = 240.0 - basePrice; // $264.00 inc gst -> $240 ex gst
          }
        }

        deliveryFee = Math.max(0, deliveryFee);
      } else if (
        product.size === "18kg" ||
        product.size === "18kg Forklift" ||
        product.size === "18kg Exchange"
      ) {
        deliveryFee = 87.21 - basePrice; // Forces total delivered to $87.21 ex GST ($95.93 inc GST)
        deliveryFee = Math.max(0, deliveryFee);
      } else {
        deliveryFee =
          distanceVal > 0
            ? BASE_DELIVERY_FEE + distanceVal * COST_PER_KM
            : zone.deliveryFee;
      }
    }

    deliveryFee = Number(deliveryFee.toFixed(2));
    const price = Number((basePrice + deliveryFee).toFixed(2));

    res.json({
      product,
      zone: {
        id: zone.id,
        name: zone.name,
        deliveryFee: deliveryFee,
      },

      collection: collectionType,
      isTuesday,
      basePrice,
      deliveryFee: deliveryFee,
      distance: distanceVal,
      distanceUnavailable,
      price,
      available,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/reserve", async (req, res) => {
  const { name, email, contact, size, date, quantity, collection, address } =
    req.body;

  if (!size || !date || !quantity) {
    return res.status(400).json({
      error: "size, date and quantity are required",
    });
  }

  if (collection === "delivery" && isWeekendDate(date)) {
    return res.status(400).json({
      error: WEEKEND_DELIVERY_UNAVAILABLE_MESSAGE,
    });
  }

  const product = getProduct(size);

  if (!product)
    return res.status(404).json({
      error: "Product size not found",
    });

  const zone = findZone();
  const stock = getInventory(product.id, zone.id);

  if (quantity > stock) {
    return res.status(409).json({
      error: "Insufficient stock",
      available: stock,
    });
  }

  const record = inventory.find(
    (item) => item.productId === product.id && item.zoneId === zone.id,
  );
  if (record) record.qty = record.qty - quantity;

  try {
    if (SMTP_FROM_EMAIL) {
      await transporter.sendMail({
        from: `"${name || "Customer"}"<${SMTP_FROM_EMAIL}

            >`,
        replyTo: email,
        to: resolveEmailRecipient(GAS_REQUEST_NOTIFICATION_EMAILS),
        subject: "New Gas Reservation",
        ...buildGasReservationEmail({
          name,
          email,
          contact,
          size,
          quantity,
          date,
          collection,
          address,
        }),
      });
    }
  } catch (err) {
    console.error("Failed to send reservation email:", err);
  }

  console.log(`✅ New Gas Request processed for ${name || "Customer"}

      .`);

  res.json({
    success: true,
    reserved: quantity,
    remaining: getInventory(product.id, zone.id),
  });
});

app.post("/api/notify-payment", async (req, res) => {
  const { name, email, amount } = req.body;

  try {
    await sendPaymentNotificationEmail(
      "Manual Notification",
      {
        reference: "",
        amount: amount ? String(amount) : "",
        customerName: name || "",
        customerEmail: email || "",
        status: "pending",
        statusRaw: "manual-notify",
      },
      req.body,
    );

    console.log(`✅ Payment notification received for ${name || "Customer"}

        . Amount: AUD ${amount}

        `);

    res.json({
      success: true,
    });
  } catch (err) {
    console.error("Failed to process payment notification:", err);

    res.status(500).json({
      error: "Failed to process request",
    });
  }
});

app.post("/api/contact", async (req, res) => {
  const { name, phone, email, subject, message } = req.body;

  if (!name || !phone || !email || !subject || !message) {
    return res.status(400).json({
      error: "Please fill out all fields.",
    });
  }

  try {
    if (SMTP_FROM_EMAIL) {
      await transporter.sendMail({
        from: `"${name}"<${SMTP_FROM_EMAIL}

            >`,
        replyTo: email,
        to: resolveEmailRecipient(process.env.RECEIVER_EMAIL || SMTP_FROM_EMAIL),
        subject: `New Contact Enquiry: ${subject}`,
        text: `Name: ${name}

            \nPhone: ${phone}

            \nEmail: ${email}

            \nEnquiry about: ${subject}

            \nMessage: ${message || "N/A"}

            `,
      });
    }

    console.log(`✅ New Contact Enquiry received from ${name}

        .`);

    res.json({
      success: true,
    });
  } catch (err) {
    console.error("Failed to process contact enquiry:", err);

    res.status(500).json({
      error: "Failed to process request. Please try again.",
    });
  }
});

app.post(
  "/api/employment",
  upload.fields([
    {
      name: "resume",
    },
    {
      name: "coverLetter",
    },
  ]),
  async (req, res) => {
    const { name, phone, email } = req.body;

    if (!name || !phone || !email) {
      return res.status(400).json({
        error: "Please fill out all fields.",
      });
    }

    if (!req.files || !req.files.resume) {
      return res.status(400).json({
        error: "Resume is required.",
      });
    }

    try {
      if (SMTP_FROM_EMAIL) {
        const attachments = [];

        if (req.files.resume && req.files.resume[0]) {
          attachments.push({
            filename: req.files.resume[0].originalname,
            content: req.files.resume[0].buffer,
          });
        }

        if (req.files.coverLetter && req.files.coverLetter[0]) {
          attachments.push({
            filename: req.files.coverLetter[0].originalname,
            content: req.files.coverLetter[0].buffer,
          });
        }

        await transporter.sendMail({
          from: `"${name}"<${SMTP_FROM_EMAIL}

            >`,
          replyTo: email,
          to: resolveEmailRecipient(process.env.RECEIVER_EMAIL || SMTP_FROM_EMAIL),
          subject: "New Employment Application",
          text: `Name: ${name}

            \nPhone: ${phone}

            \nEmail: ${email}

            `,
          attachments,
        });
      }

      console.log(`✅ New Employment Application received from ${name}

        .`);

      res.json({
        success: true,
      });
    } catch (err) {
      console.error("Failed to process employment application:", err);

      res.status(500).json({
        error: "Failed to send your application. Please try again.",
      });
    }
  },
);

app.post("/api/create-commbank-payment", async (req, res) => {
  const { name, email, amount } = req.body;
  const parsedAmount = Number(amount);

  if (!name || !email || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({
      error: "name, email and a valid amount are required",
    });
  }

  const domainURL = req.headers.origin || `http://${req.headers.host}`;
  const formattedAmount = parsedAmount.toFixed(2);
  const returnUrl =
    process.env.COMMBANK_RETURN_URL || `${domainURL}/api/commbank/return`;
  const cancelUrl =
    process.env.COMMBANK_CANCEL_URL ||
    `${domainURL}/api/commbank/cancel?amount=${encodeURIComponent(formattedAmount)}`;

  // If CommBank Hosted Payment URL is configured, redirect users there.
  if (process.env.COMMBANK_PAYMENT_URL) {
    const reference = `GAS-${Date.now()}`;
    const params = new URLSearchParams({
      amount: formattedAmount,
      currency: "AUD",
      reference,
      customerName: name,
      customerEmail: email,
      returnUrl,
      cancelUrl,
    });

    if (process.env.COMMBANK_MERCHANT_ID) {
      params.set("merchantId", process.env.COMMBANK_MERCHANT_ID);
    }

    const details = {
      reference,
      amount: formattedAmount,
      customerName: name,
      customerEmail: email,
      status: "pending",
      statusRaw: "payment-created",
    };

    try {
      await sendPaymentNotificationEmail("Created", details, {
        reference,
        amount: formattedAmount,
        customerName: name,
        customerEmail: email,
      });
    } catch (notifyErr) {
      console.error("Failed to send payment creation notification:", notifyErr);
    }

    const commbankUrl = `${process.env.COMMBANK_PAYMENT_URL}?${params.toString()}`;

    return res.json({
      provider: "commbank",
      url: commbankUrl,
      reference,
    });
  }

  return res.status(500).json({
    error: "CommBank payment gateway is not configured on the server",
  });
});

async function processCommbankCallback(req, res, eventType) {
  const payload = req.method === "GET" ? req.query : req.body;
  const details = getCommbankPaymentDetails(payload);

  try {
    await sendPaymentNotificationEmail(eventType, details, payload);
  } catch (err) {
    console.error(`Failed to send ${eventType} payment notification:`, err);
  }

  if (eventType === "Webhook") {
    return res.json({
      success: true,
      received: true,
      status: details.status,
      reference: details.reference || null,
    });
  }

  const paid = details.status === "paid" ? "true" : "false";
  const redirect =
    `${req.protocol}://${req.get("host")}/HTML/Gas%20request.html` +
    `?paid=${paid}&reference=${encodeURIComponent(details.reference || "")}`;

  return res.redirect(redirect);
}

app.get("/api/commbank/return", async (req, res) => {
  return processCommbankCallback(req, res, "Return Callback");
});

app.post("/api/commbank/webhook", async (req, res) => {
  return processCommbankCallback(req, res, "Webhook");
});

app.get("/api/commbank/cancel", async (req, res) => {
  const payload = req.query;
  const details = getCommbankPaymentDetails(payload);
  details.status = "failed";
  details.statusRaw = details.statusRaw || "cancelled";

  try {
    await sendPaymentNotificationEmail("Cancelled", details, payload);
  } catch (err) {
    console.error("Failed to send cancelled payment notification:", err);
  }

  const amount = encodeURIComponent(details.amount || "");
  const redirect = `${req.protocol}://${req.get("host")}/HTML/payment.html?amount=${amount}`;
  return res.redirect(redirect);
});

app.get("/api/distance", async (req, res, next) => {
  const { address } = req.query;
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    // If no API key, we can't proceed.
    return next(
      new Error("Google Maps API key is not configured on the server."),
    );
  }

  if (!address) {
    return res.status(400).json({
      error: "Address parameter is required.",
    });
  }

  try {
    const searchAddress = address.toLowerCase().includes("australia")
      ? address
      : `${address}

      , QLD, Australia`;

    let response;

    try {
      response = await googleMapsClient.distancematrix({
        params: {
          origins: ["5 Dunn St, Biloela QLD 4715, Australia"],
          destinations: [searchAddress],
          key: apiKey,
          region: "au",
        },

        timeout: 5000,
      });
    } catch (apiErr) {
      console.error(
        "Google API request failed:",
        apiErr.response?.data || apiErr.message,
      );
      throw new Error("Failed to reach Google Maps API.");
    }

    if (response.data.status !== "OK") {
      console.error(`Google API Top-Level Error: ${response.data.status}

          | Details: ${response.data.error_message || "None"}

          `);

      throw new Error(`Google Maps API Error: ${response.data.status}

          `);
    }

    const result = response.data.rows[0].elements[0];

    if (result.status === "OK") {
      const distanceInMeters = result.distance.value;
      const distanceInKm = (distanceInMeters / 1000).toFixed(1);

      res.json({
        distance: parseFloat(distanceInKm),
      });
    } else {
      console.error(`Distance Matrix API failed. Status: ${result.status}

          for address: ${searchAddress}

          `);

      throw new Error(`Could not calculate distance. Status: ${result.status}

          `);
    }
  } catch (error) {
    error.message = `Google Maps API Error: ${error.message}

      `;
    next(error);
  }
});

// Google Maps location endpoint for contact page
app.get("/api/maps/location", async (req, res, next) => {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  mapDiagnostics.lastAttemptAt = new Date().toISOString();

  if (
    cachedMapLocation &&
    Date.now() - cachedMapLocation.cachedAt < MAP_CACHE_TTL_MS
  ) {
    mapDiagnostics.lastSource = "cache";
    mapDiagnostics.lastError = null;
    mapDiagnostics.lastHttpStatus = 200;
    return res.json(cachedMapLocation.payload);
  }

  if (!apiKey) {
    mapDiagnostics.lastSource = "fallback-no-api-key";
    mapDiagnostics.lastFailureAt = new Date().toISOString();
    mapDiagnostics.lastError = "GOOGLE_MAPS_API_KEY is not configured";
    mapDiagnostics.lastHttpStatus = 500;
    return res.json({
      success: true,
      address: CONTACT_ADDRESS,
      coordinates: null,
      formattedAddress: CONTACT_ADDRESS,
      mapUrl: FALLBACK_MAP_URL,
      source: "fallback-no-api-key",
    });
  }

  try {
    const response = await googleMapsClient.geocode({
      params: {
        address: CONTACT_ADDRESS,
        key: apiKey,
        region: "au",
      },
      timeout: 5000,
    });

    if (response.data.status !== "OK") {
      throw new Error(`Geocoding failed: ${response.data.status}`);
    }

    if (response.data.results.length === 0) {
      throw new Error("No location found for the address.");
    }

    const result = response.data.results[0];
    const { lat, lng } = result.geometry.location;

    const payload = {
      success: true,
      address: CONTACT_ADDRESS,
      coordinates: {
        latitude: lat,
        longitude: lng,
      },
      formattedAddress: result.formatted_address,
      mapUrl: FALLBACK_MAP_URL,
      source: "google-geocode",
    };

    cachedMapLocation = {
      cachedAt: Date.now(),
      payload,
    };

    mapDiagnostics.lastSuccessAt = new Date().toISOString();
    mapDiagnostics.lastSource = "google-geocode";
    mapDiagnostics.lastError = null;
    mapDiagnostics.lastHttpStatus = 200;

    res.json(payload);
  } catch (error) {
    console.error(
      "Maps location endpoint error, serving fallback:",
      error.message,
    );
    mapDiagnostics.lastFailureAt = new Date().toISOString();
    mapDiagnostics.lastSource = "fallback-error";
    mapDiagnostics.lastError = error.message;
    mapDiagnostics.lastHttpStatus = error.response?.status || null;
    res.json({
      success: true,
      address: CONTACT_ADDRESS,
      coordinates: null,
      formattedAddress: CONTACT_ADDRESS,
      mapUrl: FALLBACK_MAP_URL,
      source: "fallback-error",
      error: "Map geocoding unavailable; fallback map returned.",
    });
  }
});

// Safe diagnostics endpoint for map troubleshooting (no secrets)
app.get("/api/maps/health", (req, res) => {
  if (!MAP_HEALTH_ENABLED) {
    return res.status(404).json({
      error: "Not found",
    });
  }

  if (MAP_HEALTH_TOKEN) {
    const headerToken = req.get("x-map-health-token") || "";
    const queryToken =
      typeof req.query.token === "string" ? req.query.token : "";

    if (headerToken !== MAP_HEALTH_TOKEN && queryToken !== MAP_HEALTH_TOKEN) {
      return res.status(401).json({
        error: "Unauthorized",
      });
    }
  }

  const hasApiKey = Boolean(process.env.GOOGLE_MAPS_API_KEY);
  const cacheAgeMs = cachedMapLocation
    ? Date.now() - cachedMapLocation.cachedAt
    : null;
  const cacheTtlRemainingMs =
    cacheAgeMs === null ? null : Math.max(0, MAP_CACHE_TTL_MS - cacheAgeMs);

  res.json({
    success: true,
    mapsConfigured: hasApiKey,
    cache: {
      hasCachedLocation: Boolean(cachedMapLocation),
      cacheAgeMs,
      cacheTtlRemainingMs,
    },
    diagnostics: mapDiagnostics,
  });
});

// 404 Handler: Catch requests for pages/APIs that don't exist
app.use((req, res, next) => {
  const err = new Error(
    `The requested path '${req.originalUrl}'was not found.`,
  );
  err.status = 404;
  next(err);
});

// Global Error Handler: Catch all unexpected errors
app.use((err, req, res, next) => {
  const status = err.status || 500;
  const publicMessage = status >= 500 ? "Internal server error" : err.message;

  // Log to the VS Code terminal so you know exactly where the error is
  console.error(`[Server Error] Status: ${status}

      | Message: ${err.message}

      `);
  if (err.stack && status !== 404) console.error(err.stack);

  res.status(status).json({
    error: publicMessage,
    status: status,
  });
});

// When imported by the Vercel serverless function (api/index.js), the app is
// exported instead of listening on a local port.
if (require.main === module) {
  app
    .listen(port, () => {
      console.log(`Server listening on http: //localhost:${port}`);
    })
  .on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(`FATAL ERROR: Port ${port}

          is already in use. Please close other programs or change the port in server.js.`);
    } else {
      console.error(`FATAL ERROR: Server failed to start: ${err.message}

          `);
    }
  });
}

module.exports = app;
