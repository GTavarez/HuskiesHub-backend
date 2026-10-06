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
