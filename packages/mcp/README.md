# @journey-path/mcp

Lightweight, zero-dependency Model Context Protocol (MCP) server for [JourneyPath](https://github.com/jakob/buying-journey).

Allows Claude Desktop, Cursor, Zed, Muse, and other MCP clients to query buying journeys, add products with automatic upserting, crawl product pages, and create entire journeys from product URLs.

## Features

- **0 external dependencies**: Runs with vanilla Node.js 18+. No Puppeteer, no native modules.
- **Remote delegation**: All scraping, LLM classification, and storage is delegated to your JourneyPath server.
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

- `journey.get`: Read full journey document (items, specs, logs, feedback, notes).
- `journey.add_item`: Add or update a product item (case-insensitive upsert).
- `journey.crawl_link`: Crawl a product page via backend and return title + text.
- `journey.create_from_link`: Create a brand new journey and extract initial product via AI.
