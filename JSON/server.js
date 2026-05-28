const express = require("express");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 3000;
const path = require("path");

app.use(cors());
app.use(express.json());
// Serve static frontend files from the project root
app.use(express.static(path.join(__dirname)));

const zones = [
  { id: 1, name: "Biloela", postcodes: ["4715"], deliveryFee: 12.0 },
  { id: 2, name: "Moura", postcodes: ["4718"], deliveryFee: 15.0 },
  { id: 3, name: "Other", postcodes: [], deliveryFee: 20.0 },
];

const products = [
  {
    id: 1,
    name: "Gas Bottle",
    size: "9kg",
    basePrice: 60.0,
    sizeType: "small",
  },
  {
    id: 2,
    name: "Gas Bottle",
    size: "14kg",
    basePrice: 75.0,
    sizeType: "large",
  },
];

const inventory = [
  { productId: 1, zoneId: 1, qty: 10 },
  { productId: 1, zoneId: 2, qty: 5 },
  { productId: 1, zoneId: 3, qty: 3 },
  { productId: 2, zoneId: 1, qty: 6 },
  { productId: 2, zoneId: 2, qty: 4 },
  { productId: 2, zoneId: 3, qty: 2 },
];

const zonePrices = [
  { productId: 1, zoneId: 1, overridePrice: 62.0 },
  { productId: 2, zoneId: 1, overridePrice: 80.0 },
];

function findZone(postcode) {
  if (!postcode) return zones.find((z) => z.name === "Other");
  const normalized = postcode.trim();
  const zone = zones.find((z) => z.postcodes.includes(normalized));
  return zone || zones.find((z) => z.name === "Other");
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

function computePrice(product, zone, collection = "delivery") {
  const zonePrice = zonePrices.find(
    (r) => r.productId === product.id && r.zoneId === zone.id,
  );
  const base =
    zonePrice && typeof zonePrice.overridePrice === "number"
      ? zonePrice.overridePrice
      : product.basePrice;
  const fee = collection === "delivery" ? zone.deliveryFee : 0;
  return Number((base + fee).toFixed(2));
}

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

app.get("/api/price", (req, res) => {
  const { size, postcode, collection } = req.query;
  if (!size) {
    return res.status(400).json({ error: "Missing size query parameter" });
  }

  const product = getProduct(size);
  if (!product) {
    return res.status(404).json({ error: "Product size not found" });
  }

  const zone = findZone(postcode);
  const collectionType = collection === "store" ? "store" : "delivery";
  const price = computePrice(product, zone, collectionType);
  const available = getInventory(product.id, zone.id);
  const zonePrice = zonePrices.find(
    (r) => r.productId === product.id && r.zoneId === zone.id,
  );
  const basePrice =
    zonePrice && typeof zonePrice.overridePrice === "number"
      ? zonePrice.overridePrice
      : product.basePrice;

  res.json({
    product,
    zone: { id: zone.id, name: zone.name, deliveryFee: zone.deliveryFee },
    collection: collectionType,
    basePrice,
    deliveryFee: zone.deliveryFee,
    price,
    available,
  });
});

app.post("/api/reserve", (req, res) => {
  const { size, postcode, quantity } = req.body;
  if (!size || !postcode || !quantity) {
    return res
      .status(400)
      .json({ error: "size, postcode and quantity are required" });
  }

  const product = getProduct(size);
  if (!product)
    return res.status(404).json({ error: "Product size not found" });

  const zone = findZone(postcode);
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

  res.json({
    success: true,
    reserved: quantity,
    remaining: getInventory(product.id, zone.id),
  });
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
