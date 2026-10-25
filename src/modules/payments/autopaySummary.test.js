const test = require("node:test");
const assert = require("node:assert/strict");
const { formatAutopaySummary, periodLabel } = require("./autopaySummary");

test("turns a billing period into a month name", () => {
  assert.equal(periodLabel("2026-10"), "October 2026");
  assert.equal(periodLabel("2027-01"), "January 2027");
});

test("a run with declines lists who needs a reminder and who is fine", () => {
  const { subject, text, pushBody } = formatAutopaySummary({
    billingPeriod: "2026-10",
    paid: [
      { player: "Olivia Trigona", team: "12U", amountCents: 36250 },
      { player: "Lauren Smith", team: "Premier", amountCents: 36250 },
    ],
    failed: [
      {
        player: "Mackenzie Wallace",
        team: "14U",
        amountCents: 29375,
        contactName: "Jerry Wallace",
        contactEmail: "jerry@example.com",
        reason: "Your card has insufficient funds.",
      },
    ],
  });
  assert.match(subject, /2 paid, 1 DECLINED/);
  assert.match(subject, /\$725\.00 collected/);
  assert.match(text, /NEEDS A REMINDER/);
  assert.match(text, /Mackenzie Wallace \(14U\): \$293\.75/);
  assert.match(text, /Jerry Wallace <jerry@example\.com>/);
  assert.match(text, /insufficient funds/);
  assert.match(text, /PAID, NOTHING TO DO/);
  assert.match(text, /Olivia Trigona \(12U\), Lauren Smith \(Premier\)/);
  assert.match(pushBody, /2 paid, 1 declined: Mackenzie Wallace/);
});

test("a clean run says so and has no reminder section", () => {
  const { subject, text } = formatAutopaySummary({
    billingPeriod: "2026-11",
    paid: [{ player: "A B", team: "12U", amountCents: 10000 }],
    failed: [],
  });
  assert.match(subject, /all 1 paid/);
  assert.doesNotMatch(text, /NEEDS A REMINDER/);
});
