// Run with: node --test src/modules/conversations/dmPolicy.test.js
// Logic tests for the direct-message safety rules. The one database lookup (a
// player's parents) is stubbed, so nothing here touches the network.
const test = require("node:test");
const assert = require("node:assert");

const User = require("../users/model");
const { evaluateDirectMessage } = require("./dmPolicy");

const original = User.find;
let parents = [];
User.find = () => ({ select: () => ({ lean: async () => parents }) });
test.after(() => {
  User.find = original;
});

const coach = { _id: "c1", role: "coach" };
const admin = { _id: "a1", role: "admin" };
const parentA = { _id: "p1", role: "parent" };
const parentB = { _id: "p2", role: "parent" };
const playerX = { _id: "u1", role: "player", playerId: "pl1" };
const playerY = { _id: "u2", role: "player", playerId: "pl2" };

test("adults can message each other", async () => {
  assert.strictEqual((await evaluateDirectMessage(parentA, coach)).ok, true);
  assert.strictEqual((await evaluateDirectMessage(coach, admin)).ok, true);
  assert.strictEqual((await evaluateDirectMessage(parentA, parentB)).ok, true);
});

test("you can't message yourself", async () => {
  assert.strictEqual((await evaluateDirectMessage(coach, coach)).ok, false);
});

test("a coach or admin messaging a player brings the player's parents in", async () => {
  parents = [{ _id: "p1" }, { _id: "p9" }];
  for (const [from, to] of [
    [coach, playerX],
    [playerX, coach],
    [admin, playerX],
  ]) {
    const result = await evaluateDirectMessage(from, to);
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.guardians.map((g) => g._id), ["p1", "p9"]);
  }
});

test("a player with no parent account linked can't be messaged privately", async () => {
  parents = [];
  const result = await evaluateDirectMessage(coach, playerX);
  assert.strictEqual(result.ok, false);
  assert.match(result.reason, /parent/i);
});

test("player to player, and parent to someone else's child, are not allowed", async () => {
  parents = [{ _id: "p1" }];
  assert.strictEqual((await evaluateDirectMessage(playerX, playerY)).ok, false);
  assert.strictEqual((await evaluateDirectMessage(parentB, playerX)).ok, false);
  assert.strictEqual((await evaluateDirectMessage(playerX, parentB)).ok, false);
});
