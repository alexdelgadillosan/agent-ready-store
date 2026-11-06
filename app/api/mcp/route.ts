import { createMcpHandler } from "mcp-handler";
import { registerAgentReadyTools } from "@/lib/mcp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const handler = createMcpHandler(registerAgentReadyTools, {
  serverInfo: {
    name: "agent-ready-store",
    version: "1.0.0",
  },
});

function guard(request: Request): Response | null {
  const required = process.env.MCP_BEARER_TOKEN?.trim();
  if (!required) {
    return null;
  }

  const provided = request.headers.get("authorization") ?? "";
  if (provided === `Bearer ${required}`) {
    return null;
  }

  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32001, message: "Unauthorized" },
      id: null,
    }),
    {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "WWW-Authenticate": 'Bearer realm="agent-ready-store"',
      },
    },
  );
}

export async function POST(request: Request): Promise<Response> {
  const denied = guard(request);
  return denied ?? handler(request);
}

export async function GET(request: Request): Promise<Response> {
  const denied = guard(request);
  return denied ?? handler(request);
}

export async function DELETE(request: Request): Promise<Response> {
  const denied = guard(request);
  return denied ?? handler(request);
}

export async function OPTIONS(request: Request): Promise<Response> {
  const denied = guard(request);
  return denied ?? handler(request);
}
