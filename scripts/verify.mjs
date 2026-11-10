#!/usr/bin/env node
/**
 * Verifies that a running OmniBuy AI instance is reachable and that the
 * MCP endpoint exposes the expected tools.
 *
 * Usage:
 *   node scripts/verify.mjs [base-url]
 *
 * Exits non-zero when a check fails.
 */

const baseUrl = (process.argv[2] || process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");

const expectedTools = [
  "search_products",
  "get_product",
  "create_cart",
  "get_cart_status",
  "complete_checkout",
];

function fail(message) {
  console.error(`✗ ${message}`);
  process.exitCode = 1;
}

async function mcp(method, params, id) {
  const response = await fetch(`${baseUrl}/api/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(process.env.MCP_BEARER_TOKEN
        ? { Authorization: `Bearer ${process.env.MCP_BEARER_TOKEN}` }
        : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`);
  }

  const dataLine = text
    .split("\n")
    .find((line) => line.startsWith("data: "));

  return JSON.parse(dataLine ? dataLine.slice(6) : text);
}

async function main() {
  console.log(`OmniBuy AI verification → ${baseUrl}`);

  try {
    const response = await fetch(`${baseUrl}/api/health`);
    const health = await response.json();
    console.log(
      `· /api/health HTTP ${response.status} · ${JSON.stringify(health.checks)}`,
    );
    if (!health.checks?.database) {
      fail(`database check failed: ${health.databaseError ?? "unknown"}`);
    }
  } catch (error) {
    fail(`health request failed: ${error.message}`);
  }

  try {
    const init = await mcp(
      "initialize",
      {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "omnibuy-ai-verify", version: "1.0.0" },
      },
      1,
    );
    console.log(
      `· MCP initialize · ${init.result?.serverInfo?.name ?? "unknown"} ${init.result?.serverInfo?.version ?? ""}`,
    );
  } catch (error) {
    fail(`MCP initialize failed: ${error.message}`);
  }

  try {
    const list = await mcp("tools/list", {}, 2);
    const names = (list.result?.tools ?? []).map((tool) => tool.name);
    console.log(`· MCP tools · ${names.join(", ")}`);

    for (const name of expectedTools) {
      if (!names.includes(name)) {
        fail(`missing MCP tool: ${name}`);
      }
    }

  } catch (error) {
    fail(`MCP tools/list failed: ${error.message}`);
  }

  if (process.exitCode) {
    console.error("Verification failed.");
  } else {
    console.log("Verification passed.");
  }
}

main().catch((error) => {
  fail(error.message);
  process.exit(1);
});
