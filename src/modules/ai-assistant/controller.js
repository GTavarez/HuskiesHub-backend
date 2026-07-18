const { getAnthropicClient, getAnthropicModel } = require("../../common/utils/anthropicClient");
const { getToolsForRole } = require("./toolDefinitions");
const toolHandlers = require("./toolHandlers");

const MAX_ITERATIONS = 4;

const SYSTEM_PROMPT =
  "You are the HuskiesHub assistant for a youth softball club. Answer only using tool " +
  "results — never invent balances, schedules, attendance counts, or notes. If a tool " +
  "call fails or a value is missing, say so plainly rather than guessing. Keep answers " +
  "short and specific.";

// Hand-written loop (not the SDK's Tool Runner helper) so every tool call can
// be logged individually for auditability: {userId, role, toolName, resolvedInput}.
const ask = async (req, res) => {
  const { question } = req.body;
  if (!question || typeof question !== "string") {
    return res.status(400).json({ message: "question is required" });
  }

  // The role-filtered tool list is computed once, before any API call, and
  // is the actual security boundary — the allowlist check below on each
  // tool_use block is a second, defense-in-depth layer on top of it.
  const tools = getToolsForRole(req.user.role);
  const allowedToolNames = new Set(tools.map((tool) => tool.name));

  let client;
  try {
    client = getAnthropicClient();
  } catch (err) {
    console.error("AI assistant client error:", err);
    return res.status(500).json({ message: "AI assistant is not configured" });
  }

  const messages = [{ role: "user", content: question }];
  const toolsUsed = [];

  try {
    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
      // eslint-disable-next-line no-await-in-loop
      const response = await client.messages.create({
        model: getAnthropicModel(),
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        tools: tools.length > 0 ? tools : undefined,
        messages,
      });

      if (response.stop_reason !== "tool_use") {
        const answer = response.content
          .filter((block) => block.type === "text")
          .map((block) => block.text)
          .join("\n");
        return res.json({ answer, toolsUsed });
      }

      messages.push({ role: "assistant", content: response.content });

      const toolUseBlocks = response.content.filter((block) => block.type === "tool_use");
      // eslint-disable-next-line no-await-in-loop
      const toolResults = await Promise.all(
        toolUseBlocks.map(async (block) => {
          toolsUsed.push(block.name);
          console.log(
            `[ai-assistant] userId=${req.user._id} role=${req.user.role} tool=${block.name} input=${JSON.stringify(block.input)}`
          );

          if (!allowedToolNames.has(block.name) || typeof toolHandlers[block.name] !== "function") {
            return {
              type: "tool_result",
              tool_use_id: block.id,
              is_error: true,
              content: "Tool not permitted for this role.",
            };
          }

          try {
            const result = await toolHandlers[block.name](req.user, block.input || {});
            return {
              type: "tool_result",
              tool_use_id: block.id,
              content: JSON.stringify(result),
            };
          } catch (err) {
            return {
              type: "tool_result",
              tool_use_id: block.id,
              is_error: true,
              content: err.message || "Tool failed",
            };
          }
        })
      );

      messages.push({ role: "user", content: toolResults });
    }

    return res.status(504).json({ message: "Assistant could not resolve the request in time" });
  } catch (err) {
    console.error("AI assistant error:", err);
    return res.status(500).json({ message: "AI assistant request failed" });
  }
};

module.exports = { ask };
