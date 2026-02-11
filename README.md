# Obsidian MCP Server

**Give your AI Agents a seat at the table.**

This plugin runs a local **Model Context Protocol (MCP)** server inside Obsidian. It allows external AI tools (like Claude Desktop, Cursor, or CLI agents) to connect to Obsidian, read your active context, and perform actions directly within the app.

> ⚠️ **Status:** Experimental / Alpha. Use with caution.

## Features

*   **Context Awareness:** `get_active_file` lets the agent see exactly what you are working on (content + frontmatter).
*   **Vault Access:** `read_note` allows retrieving specific notes by path.
*   **Quick Capture:** `append_daily_note` lets the agent log tasks or thoughts to your daily note instantly.
*   **Live Control:** Unlike external scripts, this runs *inside* Obsidian, enabling future features like "Open Tab" or "Run Command".

## Architecture

*   **Transport:** SSE (Server-Sent Events).
*   **Endpoint:** `http://localhost:27123/sse`
*   **Security:** Binds to `localhost` only. (Auth token coming soon).

## Installation

### Manual Installation
1.  Download the latest `main.js`, `manifest.json`, and `styles.css` from the Releases page.
2.  Create a folder: `.obsidian/plugins/obsidian-mcp-server/`.
3.  Place the files inside.
4.  Reload Obsidian and enable the plugin in Community Plugins.

### Development
1.  Clone this repo.
2.  `npm install`
3.  `npm run build` -> Creates `main.js`.

## Usage with Claude Desktop

Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "obsidian": {
      "url": "http://localhost:27123/sse",
      "transport": "sse"
    }
  }
}
```

Restart Claude Desktop. You should now be able to ask:
> "What is in the note I'm currently looking at?"
