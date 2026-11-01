
import "dotenv/config";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const LANGFLOW_URL = (
  process.env.LANGFLOW_URL || "http://localhost:7860"
).replace(/\/$/, "");

const API_KEY: string = process.env.LANGFLOW_API_KEY ?? "";

if (!API_KEY) {
  throw new Error("LANGFLOW_API_KEY is not configured");
}

async function langflowGet(path: string): Promise<any> {
  const response = await fetch(`${LANGFLOW_URL}${path}`, {
    headers: {
      "x-api-key": API_KEY,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Langflow API HTTP ${response.status}: ${await response.text()}`
    );
  }

  return response.json();
}

const server = new McpServer({
  name: "langflow-mcp",
  version: "1.1.0",
});

// Mask sensitive fields before returning flow definitions.
function redactSecrets(value: any, parentKey = ""): any {
  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item, parentKey));
  }

  if (value && typeof value === "object") {
    const result: Record<string, any> = {};

    for (const [key, child] of Object.entries(value)) {
      const sensitiveKey =
        /api[_-]?key|secret|token|password|credential/i.test(key);

      const sensitiveField =
        child &&
        typeof child === "object" &&
        (
          (child as any).password === true ||
          (child as any).load_from_db === true
        );

      if (sensitiveKey || sensitiveField) {
        result[key] = "[REDACTED]";
      } else {
        result[key] = redactSecrets(child, key);
      }
    }

    return result;
  }

  return value;
}

// Tool 1: Search Langflow components
server.registerTool(
  "list_langflow_components",
  {
    description: "Search available components in Langflow 1.9.0.",
    inputSchema: {
      query: z.string().optional(),
    },
  },
  async ({ query }) => {
    const catalogue = await langflowGet("/api/v1/all") as Record<
      string,
      Record<string, unknown>
    >;

    const results: Array<{
      category: string;
      component: string;
    }> = [];

    const search = query?.toLowerCase();

    for (const [category, components] of Object.entries(catalogue)) {
      if (!components || typeof components !== "object") continue;

      for (const component of Object.keys(components)) {
        if (
          !search ||
          category.toLowerCase().includes(search) ||
          component.toLowerCase().includes(search)
        ) {
          results.push({ category, component });
        }
      }
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          totalMatches: results.length,
          components: results.slice(0, 100),
          truncated: results.length > 100,
        }, null, 2),
      }],
    };
  }
);

// Tool 2: List existing flows
server.registerTool(
  "list_langflow_flows",
  {
    description: "List existing Langflow flows without modifying them.",
    inputSchema: {
      query: z.string().optional(),
    },
  },
  async ({ query }) => {
    const flows = await langflowGet(
      "/api/v1/flows/?get_all=true&page=1&size=100"
    ) as Array<Record<string, unknown>>;

    const search = query?.toLowerCase();

    const results = flows
      .filter((flow) => {
        return !search ||
          String(flow.name || "").toLowerCase().includes(search);
      })
      .map((flow) => ({
        id: flow.id,
        name: flow.name,
        description: flow.description,
        updated_at: flow.updated_at,
      }));

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          total: results.length,
          flows: results,
        }, null, 2),
      }],
    };
  }
);

// Tool 3: Retrieve a specific saved flow
server.registerTool(
  "get_langflow_flow",
  {
    description: "Retrieve a saved Langflow flow definition.",
    inputSchema: {
      flow_id: z.string(),
    },
  },
  async ({ flow_id }) => {
    const flow = await langflowGet(
      `/api/v1/flows/${encodeURIComponent(flow_id)}`
    );

    return {
      content: [{
        type: "text",
        text: JSON.stringify(redactSecrets(flow), null, 2),
      }],
    };
  }
);

// Tool 4: Retrieve a Basic Examples template by name or ID.
// This is read-only and does not import or duplicate the template.
server.registerTool(
  "get_langflow_basic_example",
  {
    description:
      "Retrieve a Langflow Basic Examples template by exact name or ID, including its graph, with sensitive values redacted. Read-only; does not import the template.",
    inputSchema: {
      name_or_id: z.string().min(1),
    },
  },
  async ({ name_or_id }) => {
    const templates = await langflowGet(
      "/api/v1/flows/basic_examples/"
    ) as Array<Record<string, any>>;

    const search = name_or_id.trim().toLowerCase();

    const matches = templates.filter((template) =>
      String(template.id || "").toLowerCase() === search ||
      String(template.name || "").toLowerCase() === search
    );

    if (matches.length === 0) {
      return {
        content: [{
          type: "text",
          text: `No Basic Examples template matched: ${name_or_id}`,
        }],
        isError: true,
      };
    }

    if (matches.length > 1) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify(
            matches.map(({ id, name }) => ({ id, name })),
            null,
            2
          ),
        }],
        isError: true,
      };
    }

    const template = redactSecrets(matches[0]);

    return {
      content: [{
        type: "text",
        text: JSON.stringify(template, null, 2),
      }],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
