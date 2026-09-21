// Logic tests for the Stripe payout endpoint, run against a fake Stripe and
// stubbed database calls. Nothing here touches the network or moves money.
// Run with: node --test src/modules/payroll/connect.test.js
const test = require("node:test");
const assert = require("node:assert");
const mongoose = require("mongoose");

const stripeClientPath = require.resolve("../payments/stripeClient");
let fakeStripe;
require.cache[stripeClientPath] = {
  id: stripeClientPath,
  filename: stripeClientPath,
  loaded: true,
  exports: { getStripeClient: () => fakeStripe },
};

const CoachPayment = require("./model");
const User = require("../users/model");
const { payWithStripe } = require("./connectController");

const originals = {
  cpFindById: CoachPayment.findById,
  cpFindOneAndUpdate: CoachPayment.findOneAndUpdate,
  cpUpdateOne: CoachPayment.updateOne,
  cpFindByIdAndUpdate: CoachPayment.findByIdAndUpdate,
  userFindById: User.findById,
};

let db;
let transfers;

function setup({ payment = {}, coach = {}, stripe = {} } = {}) {
  const id = new mongoose.Types.ObjectId().toString();
  db = {
    id,
    payment: {
      _id: id,
      status: "unpaid",
      stripeTransferId: null,
      amountCents: 25000,
      coachUserId: new mongoose.Types.ObjectId(),
      payPeriodStart: new Date("2031-01-01"),
      payPeriodEnd: new Date("2031-01-14"),
      ...payment,
    },
    coach: { name: "Test Coach", role: "coach", stripeConnectAccountId: "acct_test", ...coach },
  };
  transfers = [];
  fakeStripe = {
    accounts: { retrieve: async () => ({ capabilities: { transfers: "active" } }) },
    balance: { retrieve: async () => ({ available: [{ currency: "usd", amount: 100000 }] }) },
    transfers: {
      create: async (params, opts) => {
        transfers.push({ params, opts });
        return { id: "tr_123" };
      },
    },
    ...stripe,
  };

  CoachPayment.findById = async () => db.payment;
  // Mirrors the real atomic claim: only one caller can move it off "unpaid + no transfer".
  CoachPayment.findOneAndUpdate = async () => {
    if (db.payment.status === "unpaid" && db.payment.stripeTransferId == null) {
      db.payment.stripeTransferId = "sending";
      return db.payment;
    }
    return null;
  };
  CoachPayment.updateOne = async (_filter, update) => Object.assign(db.payment, update.$set);
  CoachPayment.findByIdAndUpdate = async (_id, update) => Object.assign(db.payment, update);
  User.findById = () => ({ select: () => ({ lean: async () => db.coach }) });
}

function run() {
  const res = {
    code: 200,
    status(code) {
      this.code = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  return payWithStripe({ params: { id: db.id }, user: { _id: new mongoose.Types.ObjectId() } }, res).then(() => res);
}

test.afterEach(() => {
  CoachPayment.findById = originals.cpFindById;
  CoachPayment.findOneAndUpdate = originals.cpFindOneAndUpdate;
  CoachPayment.updateOne = originals.cpUpdateOne;
  CoachPayment.findByIdAndUpdate = originals.cpFindByIdAndUpdate;
  User.findById = originals.userFindById;
});

test("sends the recorded amount once to the coach's account and marks it paid", async () => {
  setup();
  const res = await run();
  assert.strictEqual(res.code, 200);
  assert.strictEqual(transfers.length, 1);
  assert.strictEqual(transfers[0].params.amount, 25000);
  assert.strictEqual(transfers[0].params.currency, "usd");
  assert.strictEqual(transfers[0].params.destination, "acct_test");
  assert.strictEqual(transfers[0].opts.idempotencyKey, `coach-pay-${db.id}`);
  assert.strictEqual(res.body.status, "paid");
  assert.strictEqual(res.body.method, "stripe");
  assert.strictEqual(res.body.reference, "tr_123");
});

test("two simultaneous clicks send it only once", async () => {
  setup();
  const [a, b] = await Promise.all([run(), run()]);
  assert.strictEqual(transfers.length, 1);
  assert.deepStrictEqual([a.code, b.code].sort(), [200, 409]);
});

test("an already-paid record is refused", async () => {
  setup({ payment: { status: "paid" } });
  const res = await run();
  assert.strictEqual(res.code, 409);
  assert.strictEqual(transfers.length, 0);
});

test("refuses when Stripe has less available than the amount", async () => {
  setup({ stripe: { balance: { retrieve: async () => ({ available: [{ currency: "usd", amount: 5000 }] }) } } });
  const res = await run();
  assert.strictEqual(res.code, 400);
  assert.match(res.body.message, /Not enough available/);
  assert.strictEqual(transfers.length, 0);
});

test("refuses a coach who has not started Stripe setup", async () => {
  setup({ coach: { stripeConnectAccountId: null } });
  const res = await run();
  assert.strictEqual(res.code, 400);
  assert.strictEqual(transfers.length, 0);
});

test("refuses a coach whose Stripe setup is unfinished", async () => {
  setup({ stripe: { accounts: { retrieve: async () => ({ capabilities: { transfers: "inactive" } }) } } });
  const res = await run();
  assert.strictEqual(res.code, 400);
  assert.match(res.body.message, /hasn't finished/);
  assert.strictEqual(transfers.length, 0);
});

test("a Stripe failure leaves the record unpaid and retryable", async () => {
  setup({
    stripe: {
      transfers: {
        create: async () => {
          throw new Error("Stripe is unavailable");
        },
      },
    },
  });
  const res = await run();
  assert.strictEqual(res.code, 502);
  assert.strictEqual(db.payment.status, "unpaid");
  assert.strictEqual(db.payment.stripeTransferId, null);
});

test("refuses when the account is not a coach", async () => {
  setup({ coach: { role: "parent" } });
  const res = await run();
  assert.strictEqual(res.code, 400);
  assert.strictEqual(transfers.length, 0);
});
