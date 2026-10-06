const test = require("node:test");
const assert = require("node:assert/strict");
const { toRecipient, isSmsConfigured, sendSms } = require("./sms");

test("formats US numbers for Brevo", () => {
  assert.equal(toRecipient("(555) 123-4567"), "15551234567");
  assert.equal(toRecipient("555.123.4567"), "15551234567");
  assert.equal(toRecipient("1-555-123-4567"), "15551234567");
});

test("rejects numbers that are not 10 digits", () => {
  assert.equal(toRecipient("12345"), null);
  assert.equal(toRecipient(""), null);
  assert.equal(toRecipient(undefined), null);
});

test("sending is a quiet no-op until Brevo texting is configured", async () => {
  delete process.env.BREVO_SMS_SENDER;
  assert.equal(isSmsConfigured(), false);
  assert.equal(await sendSms("5551234567", "hi"), false);
});

test("only opted-in parents with a number get a text, once per number, with the HELP and STOP note", async () => {
  process.env.BREVO_API_KEY = "test-key";
  process.env.BREVO_SMS_SENDER = "TestSender";
  const calls = [];
  const realFetch = global.fetch;
  global.fetch = async (url, init) => {
    calls.push(JSON.parse(init.body));
    return { ok: true, text: async () => "" };
  };
  try {
    const { textOptedInParents } = require("./sms");
    const sent = await textOptedInParents(
      [
        { role: "parent", smsOptIn: true, phone: "(555) 123-4567" },
        { role: "parent", smsOptIn: true, phone: "555-123-4567" }, // same number again
        { role: "parent", smsOptIn: false, phone: "5559990000" }, // did not opt in
        { role: "parent", smsOptIn: true, phone: "" }, // no number
        { role: "parent", smsOptIn: true, phone: "5558880000", isTestAccount: true },
        { role: "coach", smsOptIn: true, phone: "5557770000" }, // not a parent
        { role: "parent", smsOptIn: true, phone: "5556660000" },
      ],
      "Huskies: CANCELLED. Practice."
    );
    assert.equal(sent, 2);
    assert.deepEqual(calls.map((c) => c.recipient).sort(), ["15551234567", "15556660000"]);
    assert.ok(calls.every((c) => c.content.endsWith("Reply HELP for help, STOP to cancel.")));
    assert.ok(calls.every((c) => c.content.length <= 160));
  } finally {
    global.fetch = realFetch;
    delete process.env.BREVO_API_KEY;
    delete process.env.BREVO_SMS_SENDER;
  }
});

test("a long message is cut so it still fits one text", async () => {
  process.env.BREVO_API_KEY = "test-key";
  process.env.BREVO_SMS_SENDER = "TestSender";
  let body;
  const realFetch = global.fetch;
  global.fetch = async (url, init) => {
    body = JSON.parse(init.body);
    return { ok: true, text: async () => "" };
  };
  try {
    const { textOptedInParents } = require("./sms");
    await textOptedInParents([{ role: "parent", smsOptIn: true, phone: "5551234567" }], "x".repeat(400));
    assert.equal(body.content.length, 160);
  } finally {
    global.fetch = realFetch;
    delete process.env.BREVO_API_KEY;
    delete process.env.BREVO_SMS_SENDER;
  }
});
