// Fire-and-forget reporter to the site's AGENT OPS console (/api/agent-log).
// Failures are swallowed - the console is observability, never a dependency;
// an agent must keep trading even when the frontend is unreachable.
//
// Env:
//   AETHERIA_API_URL   frontend base URL (default http://localhost:3003)
//   AGENT_LOG_SECRET   must match the frontend's AGENT_LOG_SECRET when set
const OPS_API_URL = (process.env.AETHERIA_API_URL ?? "http://localhost:3003").replace(/\/+$/, "");

if (
  process.env.AGENT_LOG_SECRET &&
  /^http:\/\//i.test(OPS_API_URL) &&
  !/^http:\/\/(localhost|127\.0\.0\.1)/i.test(OPS_API_URL)
) {
  console.warn(
    "[ops] AETHERIA_API_URL is plain http - AGENT_LOG_SECRET travels in cleartext. Use https in production."
  );
}

function opsReporter(agent) {
  return async function report(action, detail = "") {
    try {
      await fetch(`${OPS_API_URL}/api/agent-log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent,
          action,
          detail: String(detail).slice(0, 200),
          secret: process.env.AGENT_LOG_SECRET,
        }),
        signal: AbortSignal.timeout(4000),
      });
    } catch {
      // observability only - never let reporting break the agent
    }
  };
}

module.exports = { opsReporter };
