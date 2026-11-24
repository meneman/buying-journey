# @journey-path/mcp

Lightweight, zero-dependency Model Context Protocol (MCP) server for [JourneyPath](https://github.com/jakob/buying-journey).

Allows Claude Desktop, Cursor, Zed, Muse, and other MCP clients to create and manage buying journeys, add or update products with structured specs, maintain logs, and write feedback.

## Features

- **0 external dependencies**: Runs with vanilla Node.js 18+. No Puppeteer, no native modules.
- **Client-first research**: Your AI client handles web search and extraction using its own tools and passes structured data directly via MCP CRUD tools.
- **Secure**: Authenticates via API keys (`MCP_AUTH_TOKEN`) — strictly scoped to your user data.

## Installation / Usage

### Claude Desktop / Cursor / Zed Configuration

Add this to your MCP configuration file (e.g. `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "journey-path": {
      "command": "npx",
      "args": ["-y", "@journey-path/mcp"],
      "env": {
        "MCP_BASE_URL": "https://your-journey-path-server.com",
        "MCP_AUTH_TOKEN": "bj_your_api_key_here"
      }
    }
  }
}
```

### Environment Variables

| Variable | Description | Default |
|---|---|---|
| `MCP_BASE_URL` | Base URL of your JourneyPath backend service | `http://localhost:1337` (or `PORT`) |
| `MCP_AUTH_TOKEN` | Your user API key (`bj_...`) created in JourneyPath settings | *(required)* |

## Tools Provided

- `journey.help`: Compact guide to all available tools, workflows, enums, and spec conventions.
- `journey.list`: List all buying journeys for the authenticated user.
- `journey.create`: Create a new buying journey (`slug` required, optional metadata/config).
- `journey.update_config`: Partially update base properties and display settings of a journey.
- `journey.delete`: Delete a journey and all its items, logs, and specs.
- `journey.get`: Read full journey document (items, specs, logs, feedback, notes, config).
- `journey.add_item`: Add or update a product item (case-insensitive upsert).
- `journey.delete_item`: Remove a product item by name.
- `journey.update_meta`: Update phase, budget, target date, and general notes.
- `journey.add_log`: Add a milestone entry to the journey log.
- `journey.delete_log`: Remove a log entry by index or event text.
- `journey.set_spec`: Add or update a journey-wide property (`/eigenschaften`).
- `journey.delete_spec`: Remove a journey-wide property by label.
- `journey.set_feedback`: Save markdown content for `/feedback`.
