const webpush = require("web-push");
const PushConfig = require("./pushConfig.model");
const PushSubscription = require("./pushSubscription.model");

// Web push: a notification that reaches a phone or laptop even when HuskiesHub
// is closed. The browser hands us a subscription; we sign each push with this
// server's VAPID key, which is generated once and stored in the database.

let configured = null;

async function ensureConfigured() {
  if (configured) return configured;

  let config = await PushConfig.findOne({ key: "vapid" }).lean();
  if (!config) {
    const keys = webpush.generateVAPIDKeys();
    // setOnInsert + the unique key means two instances starting together end
    // up agreeing on one pair instead of overwriting each other.
    await PushConfig.updateOne(
      { key: "vapid" },
      { $setOnInsert: { publicKey: keys.publicKey, privateKey: keys.privateKey } },
      { upsert: true }
    );
    config = await PushConfig.findOne({ key: "vapid" }).lean();
  }

  const subject = process.env.FRONTEND_URL || "https://eshuskiesyoffee.com";
  webpush.setVapidDetails(subject, config.publicKey, config.privateKey);
  configured = { publicKey: config.publicKey };
  return configured;
}

const getPublicKey = async () => (await ensureConfigured()).publicKey;

const MAX_FAILURES = 8;

async function sendToSubscription(subscription, payload, options) {
  try {
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: subscription.keys },
      JSON.stringify(payload),
      options
    );
    await PushSubscription.updateOne(
      { _id: subscription._id },
      { $set: { failureCount: 0, lastSuccessAt: new Date() } }
    );
    return true;
  } catch (err) {
    // 404/410 mean the browser revoked or lost the subscription for good.
    if (err.statusCode === 404 || err.statusCode === 410) {
      await PushSubscription.deleteOne({ _id: subscription._id });
    } else {
      const updated = await PushSubscription.findOneAndUpdate(
        { _id: subscription._id },
        { $inc: { failureCount: 1 } },
        { new: true }
      );
      if (updated && updated.failureCount >= MAX_FAILURES) {
        await PushSubscription.deleteOne({ _id: subscription._id });
      }
    }
    return false;
  }
}

// payload: { title, body, url, tag, urgent }
async function pushToUsers(userIds, payload) {
  if (!userIds || userIds.length === 0) return { sent: 0, devices: 0 };
  try {
    await ensureConfigured();
    const subscriptions = await PushSubscription.find({ userId: { $in: userIds } }).lean();
    const options = {
      TTL: payload.urgent ? 60 * 60 * 24 : 60 * 60 * 4,
      urgency: payload.urgent ? "high" : "normal",
    };
    const results = await Promise.all(
      subscriptions.map((subscription) => sendToSubscription(subscription, payload, options))
    );
    return { sent: results.filter(Boolean).length, devices: subscriptions.length };
  } catch (err) {
    console.warn("Push send skipped:", err.message);
    return { sent: 0, devices: 0 };
  }
}

module.exports = { getPublicKey, pushToUsers };
