const Waiver = require("./model");

const getActiveWaiver = async (req, res) => {
  try {
    const waiver = await Waiver.findOne({ active: true }).sort({ version: -1 });
    if (!waiver) return res.status(404).json({ message: "No active waiver configured" });
    return res.json(waiver);
  } catch (err) {
    console.error("Get active waiver error:", err);
    return res.status(500).json({ message: "Failed to fetch waiver" });
  }
};

const listWaivers = async (req, res) => {
  try {
    const waivers = await Waiver.find().sort({ version: -1 });
    return res.json(waivers);
  } catch (err) {
    console.error("List waivers error:", err);
    return res.status(500).json({ message: "Failed to fetch waivers" });
  }
};

const createWaiverVersion = async (req, res) => {
  const { title, bodyText, effectiveDate } = req.body;

  if (!title || !bodyText || !effectiveDate) {
    return res.status(400).json({ message: "title, bodyText, and effectiveDate are required" });
  }

  try {
    const latest = await Waiver.findOne().sort({ version: -1 });
    const nextVersion = latest ? latest.version + 1 : 1;

    await Waiver.updateMany({ active: true }, { active: false });

    const waiver = await Waiver.create({
      title,
      bodyText,
      effectiveDate,
      version: nextVersion,
      active: true,
    });

    return res.status(201).json(waiver);
  } catch (err) {
    console.error("Create waiver version error:", err);
    return res.status(400).json({ message: err.message });
  }
};

module.exports = { getActiveWaiver, listWaivers, createWaiverVersion };
