const express = require("express");
const cors = require("cors");
const app = express();
const path = require("path");
// Tell dotenv to look for the .env file in the parent directory
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { Client } = require("@googlemaps/google-maps-services-js");
const nodemailer = require("nodemailer");
const stripe = require("stripe")(process.env.STRIPE_API_KEY);
const port = process.env.PORT || 3000;

app.use(cors());

const googleMapsClient = new Client({});

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT || 587,
  secure: process.env.SMTP_SECURE === "true", // true for port 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Verify email connection on server startup
transporter.verify((error, success) => {
  if (error) {
    console.error(
      "⚠️ SMTP Connection Error: Cannot send emails. Check your .env file credentials.",
      error,
    );
  } else {
    console.log("✉️  SMTP Server is ready to send messages");
  }
});

// Stripe Webhook - MUST be placed before express.json()
app.post(
  "/api/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];

    let event;
    try {
      // Verify that this event actually came from Stripe
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET,
      );
    } catch (err) {
      console.error(`⚠️ Webhook Signature Error: ${err.message}`);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle successful payment
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const email = session.customer_details?.email;
      const name = session.customer_details?.name;
      const amount = session.amount_total / 100;

      try {
        await transporter.sendMail({
          from:
            process.env.EMAIL_USER ||
            '"Biloela Plumbing Works" <noreply@biloelaplumbingworks.com>',
          to: "workshop@biloelaplumbingworks.com, service@biloelaplumbingworks.com, admin@biloelaplumbingworks.com",
          subject: `New Payment Received - ${name || "Customer"}`,
          text: `A payment has been successfully processed via Stripe Checkout.\n\nName: ${name || "N/A"}\nEmail: ${email || "N/A"}\nAmount Paid: AUD ${amount.toFixed(2)}`,
        });
        console.log("✅ Webhook payment email sent!");
      } catch (err) {
        console.error("Failed to send payment notification email:", err);
      }
    }

    res.send(); // Acknowledge receipt of the event
  },
);

app.use(express.json());
app.use(express.static(path.join(__dirname, "..")));
app.get("/", (req, res) => {
  res.redirect("/HTML/index.html");
});

const zones = [
  { id: 1, name: "Biloela", postcodes: ["4715"], deliveryFee: 12.0 },
  { id: 2, name: "Moura", postcodes: ["4718"], deliveryFee: 15.0 },
  { id: 3, name: "Other", postcodes: [], deliveryFee: 20.0 },
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
    id: 3,
    name: "Gas Bottle",
    size: "9kg",
    basePrice: 60.0,
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
    id: 5,
    name: "Gas Bottle",
    size: "14kg",
    basePrice: 75.0,
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
    basePrice: 165.0, // Base price ex. GST ($181.50 inc. GST)
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
  { productId: 1, zoneId: 1, qty: 3 }, // 3.7kg
  { productId: 2, zoneId: 1, qty: 8 }, // 8.5kg
  { productId: 4, zoneId: 1, qty: 8 }, // 13kg
  { productId: 6, zoneId: 1, qty: 8 }, // 15kg
  { productId: 8, zoneId: 1, qty: 10 }, // 45kg
  { productId: 9, zoneId: 1, qty: 7 }, // 18kg Forklift
  { productId: 10, zoneId: 1, qty: 1 }, // 18kg Exchange
];

const zonePrices = [
  { productId: 3, zoneId: 1, overridePrice: 62.0 }, // 9kg
  { productId: 5, zoneId: 1, overridePrice: 80.0 }, // 14kg
];

function findZone() {
  // Since postcode is removed, default to Biloela for pricing and inventory
  return zones.find((z) => z.name === "Biloela") || zones[0];
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

  const response = await googleMapsClient.distancematrix({
    params: {
      origins: ["5 Dunn St, Biloela QLD 4715, Australia"],
      destinations: [address],
      key: apiKey,
    },
    timeout: 2000,
  });

  const result = response.data.rows[0].elements[0];
  if (result.status === "OK") {
    const distanceInMeters = result.distance.value;
    return parseFloat((distanceInMeters / 1000).toFixed(1));
  } else {
    throw new Error(
      `Could not calculate distance for that address. Status: ${result.status}`,
    );
  }
}

app.get("/api/price", async (req, res, next) => {
  try {
    const { size, date, collection, address } = req.query;
    if (!size) {
      return res.status(400).json({ error: "Missing size query parameter" });
    }

    const product = getProduct(size);
    if (!product) {
      return res.status(404).json({ error: "Product size not found" });
    }

    const zone = findZone();
    const collectionType = collection === "store" ? "store" : "delivery";
    const available = getInventory(product.id, zone.id);

    const zonePrice = zonePrices.find(
      (r) => r.productId === product.id && r.zoneId === zone.id,
    );
    const basePrice =
      zonePrice && typeof zonePrice.overridePrice === "number"
        ? zonePrice.overridePrice
        : product.basePrice;

    // Check if the selected date is a Tuesday (Day 2 of the week)
    const isTuesday = date ? new Date(date).getUTCDay() === 2 : false;

    let deliveryFee = 0;
    let distanceVal = 0;

    if (collectionType === "delivery") {
      if (address) {
        try {
          distanceVal = await getDistance(address);
        } catch (err) {
          console.error("Distance error in /api/price:", err.message);
          // If we fail to get distance, we might fallback to 0 or throw.
          // Let's fallback to 0 for now so they still get a price, or you can throw.
          // Throwing is safer for correct pricing.
          return res.status(400).json({
            error: "Could not calculate distance for delivery to that address.",
          });
        }
      }

      if (product.size === "45kg") {
        if (!isTuesday) {
          deliveryFee = 190.0 - basePrice; // $209 inc gst -> $190 ex gst
        } else {
          if (distanceVal <= 15) {
            deliveryFee = 170.0 - basePrice; // $187 inc gst -> $170 ex gst
          } else if (distanceVal <= 30) {
            deliveryFee = 220.0 - basePrice; // $242 inc gst -> $220 ex gst
          } else {
            deliveryFee = 240.0 - basePrice; // $264 inc gst -> $240 ex gst
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
      zone: { id: zone.id, name: zone.name, deliveryFee: deliveryFee },
      collection: collectionType,
      basePrice,
      deliveryFee: deliveryFee,
      distance: distanceVal,
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
    return res
      .status(400)
      .json({ error: "size, date and quantity are required" });
  }

  const product = getProduct(size);
  if (!product)
    return res.status(404).json({ error: "Product size not found" });

  const zone = findZone();
  const stock = getInventory(product.id, zone.id);
  if (quantity > stock) {
    return res
      .status(409)
      .json({ error: "Insufficient stock", available: stock });
  }

  const record = inventory.find(
    (item) => item.productId === product.id && item.zoneId === zone.id,
  );
  if (record) record.qty = record.qty - quantity;

  // Send notification email for the reservation
  try {
    await transporter.sendMail({
      from:
        process.env.EMAIL_USER ||
        '"Biloela Plumbing Works" <noreply@biloelaplumbingworks.com>',
      to: "workshop@biloelaplumbingworks.com, service@biloelaplumbingworks.com, admin@biloelaplumbingworks.com",
      subject: `New Gas Request - ${name || "Customer"}`,
      text: `A new gas request has been submitted.\n\nName: ${name || "N/A"}\nEmail: ${email || "N/A"}\nPhone: ${contact || "N/A"}\nSize: ${size}\nQuantity: ${quantity}put \nDate: ${date}\nFulfillment: ${collection || "store"}\nAddress: ${address || "N/A"}`,
    });
  } catch (err) {
    console.error("Failed to send reservation email:", err);
  }

  res.json({
    success: true,
    reserved: quantity,
    remaining: getInventory(product.id, zone.id),
  });
});

app.post("/api/notify-payment", async (req, res) => {
  const { name, email, amount } = req.body;
  try {
    await transporter.sendMail({
      from:
        process.env.EMAIL_USER ||
        '"Biloela Plumbing Works" <noreply@biloelaplumbingworks.com>',
      to: "workshop@biloelaplumbingworks.com, service@biloelaplumbingworks.com, admin@biloelaplumbingworks.com",
      subject: `New Payment Received - ${name || "Customer"}`,
      text: `A payment has been successfully processed.\n\nName: ${name || "N/A"}\nEmail: ${email || "N/A"}\nAmount Paid: AUD ${amount}`,
    });
    res.json({ success: true });
  } catch (err) {
    console.error("Failed to send payment notification email:", err);
    res.status(500).json({ error: "Failed to send email" });
  }
});

app.post("/api/contact", async (req, res) => {
  const { name, phone, email } = req.body;

  if (!name || !phone || !email) {
    return res.status(400).json({ error: "Please fill out all fields." });
  }

  try {
    await transporter.sendMail({
      from:
        process.env.EMAIL_USER ||
        '"Biloela Plumbing Works" <noreply@biloelaplumbingworks.com>',
      to: "jobs@biloelaplumbingworks.com",
      subject: `New Contact Enquiry - ${name}`,
      text: `You have received a new contact enquiry via the website.\n\nName: ${name}\nPhone: ${phone}\nEmail: ${email}`,
    });
    res.json({ success: true });
  } catch (err) {
    console.error("Failed to send contact enquiry email:", err);
    res.status(500).json({ error: "Failed to send email. Please try again." });
  }
});

app.post("/api/create-checkout-session", async (req, res) => {
  const { name, email, amount } = req.body;
  try {
    // Dynamically get the current domain (works for localhost and live)
    const domainURL = req.headers.origin || `http://${req.headers.host}`;
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card", "au_becs_debit"], // Supports cards & Australian bank accounts
      customer_email: email,
      line_items: [
        {
          price_data: {
            currency: "aud",
            product_data: {
              name: "Biloela Plumbing Works - Gas Order",
            },
            unit_amount: Math.round(parseFloat(amount) * 100), // Stripe requires amounts in cents
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${domainURL}/HTML/Gas%20request.html?paid=true`,
      cancel_url: `${domainURL}/HTML/payment.html?amount=${amount}`,
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error("Stripe error:", err);
    res.status(500).json({ error: err.message });
  }
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
    return res.status(400).json({ error: "Address parameter is required." });
  }

  try {
    const response = await googleMapsClient.distancematrix({
      params: {
        origins: ["5 Dunn St, Biloela QLD 4715, Australia"],
        destinations: [address],
        key: apiKey,
      },
      timeout: 2000, // milliseconds
    });

    const result = response.data.rows[0].elements[0];

    if (result.status === "OK") {
      const distanceInMeters = result.distance.value;
      const distanceInKm = (distanceInMeters / 1000).toFixed(1);
      res.json({ distance: parseFloat(distanceInKm) });
    } else {
      throw new Error(
        `Could not calculate distance for that address. Status: ${result.status}`,
      );
    }
  } catch (error) {
    error.message = `Google Maps API Error: ${error.message}`;
    next(error);
  }
});

// 404 Handler: Catch requests for pages/APIs that don't exist
app.use((req, res, next) => {
  const err = new Error(
    `The requested path '${req.originalUrl}' was not found.`,
  );
  err.status = 404;
  next(err);
});

// Global Error Handler: Catch all unexpected errors
app.use((err, req, res, next) => {
  const status = err.status || 500;
  // Log to the VS Code terminal so you know exactly where the error is
  console.error(`[Server Error] Status: ${status} | Message: ${err.message}`);
  if (err.stack) console.error(err.stack);

  res.status(status).json({
    error: err.message,
    status: status,
    stack: err.stack, // Sends the file/line details back to the browser for debugging
  });
});

app
  .listen(port, () => {
    console.log(`Server listening on http://localhost:${port}`);
  })
  .on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(
        `FATAL ERROR: Port ${port} is already in use. Please close other programs or change the port in server.js.`,
      );
    } else {
      console.error(`FATAL ERROR: Server failed to start: ${err.message}`);
    }
  });
