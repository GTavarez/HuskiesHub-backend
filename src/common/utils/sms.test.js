const test = require("node:test");
const assert = require("node:assert/strict");
const { toE164, isSmsConfigured, sendSms } = require("./sms");

test("formats US numbers for Twilio", () => {
  assert.equal(toE164("(555) 123-4567"), "+15551234567");
  assert.equal(toE164("555.123.4567"), "+15551234567");
  assert.equal(toE164("1-555-123-4567"), "+15551234567");
});

test("rejects numbers that are not 10 digits", () => {
  assert.equal(toE164("12345"), null);
  assert.equal(toE164(""), null);
  assert.equal(toE164(undefined), null);
});

test("sending is a quiet no-op until Twilio is configured", async () => {
  delete process.env.TWILIO_ACCOUNT_SID;
  assert.equal(isSmsConfigured(), false);
  assert.equal(await sendSms("5551234567", "hi"), false);
});
