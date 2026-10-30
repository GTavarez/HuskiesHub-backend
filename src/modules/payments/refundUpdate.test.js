const test = require("node:test");
const assert = require("node:assert/strict");
const { refundUpdate } = require("./refundUpdate");

// 2026-10-21T14:00:00Z
const OCT_21 = 1792591200;

test("a refund made in the Stripe dashboard is dated the day Stripe says it happened", () => {
  const update = refundUpdate({ amountRefundedCents: 50000, amountCents: 130000, eventCreated: OCT_21 });
  assert.equal(update.refundedAmountCents, 50000);
  assert.equal(update.refundedAt.toISOString(), "2026-10-21T14:00:00.000Z");
  assert.equal(update.status, "succeeded");
});

test("a partial refund leaves the payment open and a full one closes it", () => {
  assert.equal(refundUpdate({ amountRefundedCents: 50000, amountCents: 130000, eventCreated: OCT_21 }).status, "succeeded");
  assert.equal(refundUpdate({ amountRefundedCents: 130000, amountCents: 130000, eventCreated: OCT_21 }).status, "refunded");
});

test("a refund the app already recorded is left alone, date included", () => {
  const current = { refundedAmountCents: 50000, refundedAt: new Date("2026-10-21T09:00:00Z") };
  assert.equal(refundUpdate({ amountRefundedCents: 50000, amountCents: 130000, eventCreated: OCT_21, current }), null);
});

test("a second refund on the same payment is picked up", () => {
  const current = { refundedAmountCents: 50000, refundedAt: new Date("2026-10-21T09:00:00Z") };
  const update = refundUpdate({ amountRefundedCents: 80000, amountCents: 130000, eventCreated: OCT_21 + 86400, current });
  assert.equal(update.refundedAmountCents, 80000);
  assert.equal(update.refundedAt.toISOString(), "2026-10-22T14:00:00.000Z");
});

test("without an event time it falls back to now", () => {
  const before = Date.now();
  const update = refundUpdate({ amountRefundedCents: 100, amountCents: 1000 });
  assert.ok(update.refundedAt.getTime() >= before);
});
