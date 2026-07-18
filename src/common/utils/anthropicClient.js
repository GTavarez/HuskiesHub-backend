const Anthropic = require("@anthropic-ai/sdk");

let client = null;

function getAnthropicClient() {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not configured");
    }
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

function getAnthropicModel() {
  return process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
}

module.exports = { getAnthropicClient, getAnthropicModel };
