const test = require("node:test");
const assert = require("node:assert/strict");
const { formatCeSignup } = require("./ceSignup");

const field = (key, value) => ({ key, text: { value } });

test("a monthly signup lists the program, athlete, parent contact and billing", () => {
  const { subject, text } = formatCeSignup({
    id: "cs_live_123",
    mode: "subscription",
    amount_total: 16000,
    metadata: { kind: "hitting", program: "ce-winter-2026" },
    custom_fields: [field("athletename", "Mia Parker"), field("ageorteam", "14U")],
    customer_details: { name: "Dana Parker", email: "dana@example.com", phone: "+12015550123" },
  });
  assert.match(subject, /Hitting Development/);
  assert.match(subject, /Mia Parker/);
  assert.match(text, /Program: Hitting Development \(\$160\/month\)/);
  assert.match(text, /Athlete: Mia Parker/);
  assert.match(text, /Age or team: 14U/);
  assert.match(text, /Paid today: \$160\.00/);
  assert.match(text, /Billing: monthly/);
  assert.match(text, /Email: dana@example\.com/);
  assert.match(text, /Phone: \+12015550123/);
  assert.match(text, /cs_live_123/);
});

test("a trial signup shows the chosen session and how many athletes were paid for", () => {
  const { text } = formatCeSignup(
    {
      id: "cs_live_456",
      mode: "payment",
      amount_total: 3000,
      metadata: { kind: "trial" },
      custom_fields: [
        field("athletename", "Ava Lopez"),
        field("ageorteam", "12U"),
        { key: "session", dropdown: { value: "wed114" } },
      ],
      customer_details: { email: "lopez@example.com" },
    },
    2
  );
  assert.match(text, /Session: Wed 11\/4, 5:30 to 7:30 PM/);
  assert.match(text, /Athletes on this payment: 2/);
  assert.doesNotMatch(text, /Billing: monthly/);
});

test("a promo code shows how much it took off", () => {
  const { text } = formatCeSignup({
    id: "cs_live_789",
    mode: "subscription",
    amount_total: 13500,
    total_details: { amount_discount: 2500 },
    metadata: { kind: "bundle" },
    customer_details: { email: "x@example.com" },
  });
  assert.match(text, /Paid today: \$135\.00 \(promo code took off \$25\.00\)/);
});

test("missing details are called out instead of crashing", () => {
  const { subject, text } = formatCeSignup({ id: "cs_live_0", metadata: {} });
  assert.match(subject, /Winter Training/);
  assert.match(text, /Athlete: \(not provided\)/);
  assert.match(text, /Email: \(not provided\)/);
});
