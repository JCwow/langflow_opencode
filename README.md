# langflow-opencode

A small, read-only [MCP](https://modelcontextprotocol.io) server that lets [opencode](https://opencode.ai) inspect a running [Langflow](https://www.langflow.org) instance. It is built and tested against Langflow 1.9.0. It can search components, list and fetch saved flows, and fetch Basic Examples templates. It never creates, edits or imports anything, and it masks API keys, tokens, passwords and other secrets before returning flow data.

## Tools

| Tool | Input | What it does |
|---|---|---|
| `list_langflow_components` | `query` (optional) | Searches the component catalogue (`/api/v1/all`) by category or component name. Returns at most 100 matches. |
| `list_langflow_flows` | `query` (optional) | Lists saved flows (id, name, description, updated_at), optionally filtered by name. |
| `get_langflow_flow` | `flow_id` | Returns the full definition of one saved flow, with secrets redacted. |
| `get_langflow_basic_example` | `name_or_id` | Returns one Basic Examples template, matched by exact name or ID, with secrets redacted. Does not import the template. |

## Requirements

- Node.js 18 or later (the server uses the built-in `fetch`)
- A running Langflow instance and a Langflow API key
- opencode, to use the server from an agent

## Setup

```bash
npm install
```

Create a `.env` file in the project root (it is gitignored):

```env
LANGFLOW_URL=http://localhost:7860
LANGFLOW_API_KEY=your-langflow-api-key
```

`LANGFLOW_URL` is optional and defaults to `http://localhost:7860`. The server stops at startup if `LANGFLOW_API_KEY` is missing.

## Running

```bash
npm run dev     # run src/index.ts directly with tsx
npm run build   # compile to dist/ with tsc
```

The server talks over stdio, so it is normally started by an MCP client rather than run by hand.

## Using it with opencode

[opencode.json](opencode.json) registers two local MCP servers:

- **langflow**: this server, started with `npx tsx src/index.ts`
- **playwright**: `@playwright/mcp` with Chromium, so the agent can also open the Langflow web UI in a browser

Start opencode from this folder and both servers become available to the agent. [opencode.json.backup](opencode.json.backup) is an earlier version of the config that registers only the Langflow server, with an explicit `cwd` and a 60-second timeout.

## Project layout

```
src/index.ts                  MCP server and its four tools
opencode.json                 opencode MCP configuration
opencode.json.backup          earlier config (Langflow server only)
tsconfig.json                 TypeScript settings (ES2022, NodeNext, output to dist/)
.playwright-mcp/              page snapshots and console logs saved by the Playwright MCP server
embedding-results.txt         notes: embedding components available in Langflow 1.9.0 and their settings
build_embedding_results.txt   notes: inputs and outputs of the Ollama Embeddings component
result.txt                    notes: summary of the "PDF Knowledge Base - Ollama + Qdrant" flow
issues.txt                    notes: why that flow fails to render (malformed edge handles)
```

The `.txt` files are output saved from agent sessions that used these tools. The server does not need them.
