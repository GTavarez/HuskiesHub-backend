const mongoose = require("mongoose");
const Product = require("./model");

const listProducts = async (req, res) => {
  const { type, includeInactive } = req.query;

  const filter = {};
  if (type) filter.type = type;
  if (!includeInactive) filter.active = true;

  try {
    const products = await Product.find(filter).sort({ createdAt: -1 });
    return res.json(products);
  } catch (err) {
    console.error("List products error:", err);
    return res.status(500).json({ message: "Failed to fetch products" });
  }
};

const getProduct = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid product id" });
  }

  try {
    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ message: "Product not found" });
    return res.json(product);
  } catch (err) {
    console.error("Get product error:", err);
    return res.status(500).json({ message: "Failed to fetch product" });
  }
};

const createProduct = async (req, res) => {
  const { type, name, description, priceCents, currency, teamId } = req.body;

  if (!type || !name || priceCents === undefined) {
    return res.status(400).json({ message: "type, name, and priceCents are required" });
  }

  try {
    const product = await Product.create({
      type,
      name,
      description,
      priceCents,
      currency,
      teamId: teamId || null,
      createdBy: req.user._id,
    });
    return res.status(201).json(product);
  } catch (err) {
    console.error("Create product error:", err);
    return res.status(400).json({ message: err.message });
  }
};

const updateProduct = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid product id" });
  }

  const { name, description, priceCents, currency, active, teamId } = req.body;

  try {
    const product = await Product.findByIdAndUpdate(
      id,
      { name, description, priceCents, currency, active, teamId },
      { new: true, runValidators: true }
    );
    if (!product) return res.status(404).json({ message: "Product not found" });
    return res.json(product);
  } catch (err) {
    console.error("Update product error:", err);
    return res.status(400).json({ message: err.message });
  }
};

// Soft delete only — a Payment may already reference this product.
const deactivateProduct = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid product id" });
  }

  try {
    const product = await Product.findByIdAndUpdate(id, { active: false }, { new: true });
    if (!product) return res.status(404).json({ message: "Product not found" });
    return res.json(product);
  } catch (err) {
    console.error("Deactivate product error:", err);
    return res.status(500).json({ message: "Failed to deactivate product" });
  }
};

module.exports = {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deactivateProduct,
};
