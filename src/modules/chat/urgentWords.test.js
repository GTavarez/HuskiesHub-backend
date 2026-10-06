const test = require("node:test");
const assert = require("node:assert/strict");
const { findUrgentWord } = require("./urgentWords");

test("catches emergencies and injuries, ignoring capitals", () => {
  assert.equal(findUrgentWord("Emma is HURT, calling 911"), "HURT");
  assert.equal(findUrgentWord("we are at the hospital"), "hospital");
  assert.equal(findUrgentWord("She may have a concussion"), "concussion");
  assert.equal(findUrgentWord("I can't breathe well, asthma"), "can't breathe");
});

test("catches safety and conduct concerns, and Spanish", () => {
  assert.equal(findUrgentWord("my daughter is being bullied"), "bullied");
  assert.equal(findUrgentWord("hay una emergencia"), "emergencia");
  assert.equal(findUrgentWord("llamen a la policía"), "policía");
});

test("matches whole words only", () => {
  assert.equal(findUrgentWord("great fireworks after the game"), null);
  assert.equal(findUrgentWord("she hurtled around third"), null);
  assert.equal(findUrgentWord("missing practice, fire up the team, touched base"), null);
});

test("ordinary chatter does not match", () => {
  assert.equal(findUrgentWord("What time is warmup on Saturday?"), null);
  assert.equal(findUrgentWord("we lost the game but had fun"), null);
  assert.equal(findUrgentWord("can anyone help with a ride?"), null);
  assert.equal(findUrgentWord(""), null);
  assert.equal(findUrgentWord(undefined), null);
});
