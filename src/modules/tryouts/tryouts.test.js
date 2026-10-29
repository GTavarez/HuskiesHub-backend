const test = require("node:test");
const assert = require("node:assert/strict");
const { cleanTryoutSubmission } = require("./validate");
const { formatTryoutNotice, formatTryoutConfirmation } = require("./emails");

const valid = {
  playerName: "  Mia   Parker ",
  ageGroup: "14u",
  position: "Shortstop",
  parentName: "Dana Parker",
  parentEmail: " Dana@Example.com ",
  parentPhone: "201 555 0123",
};

test("a complete registration is cleaned up", () => {
  const { data, error } = cleanTryoutSubmission(valid);
  assert.equal(error, undefined);
  assert.equal(data.playerName, "Mia Parker");
  assert.equal(data.ageGroup, "14U");
  assert.equal(data.parentEmail, "dana@example.com");
  assert.equal(data.parentPhone, "(201) 555-0123");
  assert.equal(data.birthDate, null);
  assert.equal(data.currentTeam, "");
});

test("each required field is checked with a message a parent can act on", () => {
  assert.match(cleanTryoutSubmission({ ...valid, playerName: " " }).error, /player's name/);
  assert.match(cleanTryoutSubmission({ ...valid, ageGroup: "10U" }).error, /age group/);
  assert.match(cleanTryoutSubmission({ ...valid, position: "" }).error, /position/);
  assert.match(cleanTryoutSubmission({ ...valid, parentName: "" }).error, /parent or guardian/);
  assert.match(cleanTryoutSubmission({ ...valid, parentEmail: "dana@" }).error, /email/);
  assert.match(cleanTryoutSubmission({ ...valid, parentPhone: "555-0123" }).error, /10 digit/);
});

test("birth date is optional but must be a real past date", () => {
  assert.equal(cleanTryoutSubmission({ ...valid, birthDate: "2012-05-04" }).data.birthDate.toISOString().slice(0, 10), "2012-05-04");
  assert.match(cleanTryoutSubmission({ ...valid, birthDate: "not a date" }).error, /birth date/);
  assert.match(cleanTryoutSubmission({ ...valid, birthDate: "2999-01-01" }).error, /birth date/);
});

test("long text is cut down and experience keeps its line breaks", () => {
  const { data } = cleanTryoutSubmission({
    ...valid,
    previousClubExperience: "NJ Lightning 12U\n2 years, travel A",
    currentTeam: "x".repeat(500),
  });
  assert.equal(data.previousClubExperience, "NJ Lightning 12U\n2 years, travel A");
  assert.equal(data.currentTeam.length, 100);
});

test("the notice for the coaches has what they need to call back", () => {
  const { data } = cleanTryoutSubmission({ ...valid, previousClubExperience: "Two years travel", currentTeam: "Lightning" });
  const { subject, text } = formatTryoutNotice(data);
  assert.equal(subject, "Tryout registration: Mia Parker (14U)");
  assert.match(text, /Position: Shortstop/);
  assert.match(text, /Current team: Lightning/);
  assert.match(text, /Two years travel/);
  assert.match(text, /Email: dana@example\.com/);
  assert.match(text, /Phone: \(201\) 555-0123/);
});

test("the family's confirmation says how to schedule and that it is free", () => {
  const { data } = cleanTryoutSubmission(valid);
  const { text } = formatTryoutConfirmation(data);
  assert.match(text, /no fee/);
  assert.match(text, /cesportstraining@gmail\.com/);
  assert.match(text, /201-741-8563/);
  assert.doesNotMatch(text, /—/);
});
