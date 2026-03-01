---
name: openclaw-skill
description: Read, search, create, and edit notes in your Obsidian vault via the Obsidian MCP Server plugin.
metadata:
  openclaw:
    requires:
      env:
        - OBSIDIAN_MCP_TOKEN
      bins:
        - curl
        - jq
    primaryEnv: OBSIDIAN_MCP_TOKEN
---

# Obsidian MCP Skill

You have access to the user's **Obsidian vault** via the Obsidian MCP Server plugin. Use the helper script to read, search, create, and edit notes.

## Setup

**Environment variables:**

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OBSIDIAN_MCP_TOKEN` | Yes | — | Bearer token from Obsidian Settings > Obsidian MCP Server |
| `OBSIDIAN_MCP_PORT` | No | `27123` | Server port |
| `OBSIDIAN_MCP_HOST` | No | `127.0.0.1` | Server host |

The helper script is at: `./scripts/obsidian-mcp.sh`

## How to Use

### Initialize a session

```bash
./scripts/obsidian-mcp.sh init
```

### Call a tool

```bash
# No arguments
./scripts/obsidian-mcp.sh call describe_vault

# With arguments (pass a JSON object)
./scripts/obsidian-mcp.sh call read_note '{"path": "Notes/Meeting.md"}'
```

The script auto-initializes a session if none exists and re-initializes on session expiry. You generally don't need to call `init` manually.

### List available tools

```bash
./scripts/obsidian-mcp.sh tools
```

---

## Tool Reference

### Read-Only Tools

These tools are safe — they never modify the vault.

#### `get_active_file`
Get the content and metadata of the currently active (focused) note in Obsidian.

```bash
./scripts/obsidian-mcp.sh call get_active_file
```

No parameters.

#### `read_note`
Read a note by its vault-relative path.

```bash
./scripts/obsidian-mcp.sh call read_note '{"path": "Notes/Meeting.md"}'
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | Yes | Vault-relative path (e.g. `Notes/Meeting.md`) |

#### `get_note_metadata`
Get frontmatter, tags, headings, and links of a note without its full content.

```bash
./scripts/obsidian-mcp.sh call get_note_metadata '{"path": "Notes/Meeting.md"}'
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | Yes | Vault-relative path |

#### `get_backlinks`
Get incoming links (backlinks) to a note — which other notes link to it.

```bash
./scripts/obsidian-mcp.sh call get_backlinks '{"path": "Concepts/UART.md"}'
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | Yes | Vault-relative path |

Returns up to 50 backlinks with surrounding context (max 200 chars each).

#### `read_attachment`
Read a binary attachment. Images are returned as base64 image content (AI can see them). Non-image files return metadata only.

```bash
./scripts/obsidian-mcp.sh call read_attachment '{"path": "Attachments/diagram.png"}'
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | Yes | Vault-relative path to attachment |

#### `describe_vault`
Get a vault overview: name, file/folder counts, total size, file type breakdown, and tag count.

```bash
./scripts/obsidian-mcp.sh call describe_vault
```

No parameters.

#### `list_folder`
List files and folders inside a directory.

```bash
./scripts/obsidian-mcp.sh call list_folder '{"path": "Projects/", "recursive": true, "depth": 2}'
```

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `path` | string | No | `/` | Directory path |
| `sort_by` | string | No | — | `name`, `modified`, `created`, or `size` |
| `sort_order` | string | No | `asc` | `asc` or `desc` |
| `file_types` | string[] | No | — | Filter by extension (e.g. `[".md"]`). Folders always included. |
| `recursive` | boolean | No | `false` | List subdirectories recursively |
| `depth` | integer | No | unlimited | Max recursion depth (only with `recursive: true`) |

#### `list_all_tags`
List all hashtags in the vault with usage counts.

```bash
./scripts/obsidian-mcp.sh call list_all_tags
```

No parameters.

#### `list_recent_notes`
List the most recently modified markdown notes (newest first).

```bash
./scripts/obsidian-mcp.sh call list_recent_notes '{"count": 20}'
```

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `count` | integer | No | `10` | Number of notes (1–50) |

#### `search_notes`
Filter notes by date range, tags, and/or frontmatter fields.

```bash
./scripts/obsidian-mcp.sh call search_notes '{"tags": ["#work"], "frontmatter": {"status": "draft"}}'
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `start_date` | string | No | ISO date (YYYY-MM-DD). Notes modified after this date. |
| `end_date` | string | No | ISO date. Notes modified before this date. |
| `tags` | string[] | No | Filter by tags (e.g. `["#work"]`) |
| `frontmatter` | object | No | Filter by frontmatter fields (AND logic) |

Returns up to 100 results.

#### `search_content`
Full-text or regex search across all notes with line-number snippets.

```bash
./scripts/obsidian-mcp.sh call search_content '{"query": "TODO", "folder": "Projects/"}'
```

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `query` | string | Yes | — | Search text (case-insensitive) or regex pattern |
| `regex` | boolean | No | `false` | Treat query as regex |
| `folder` | string | No | — | Restrict to this folder |
| `include_metadata` | boolean | No | `false` | Include frontmatter and tags in results |

Returns up to 50 matching files with line snippets.

#### `list_sessions`
List active MCP sessions with client info and per-session tool usage stats.

```bash
./scripts/obsidian-mcp.sh call list_sessions
```

No parameters.

---

### Write Tools

These tools modify the vault. Use with care.

#### `create_note`
Create a new note. Fails if a file already exists at that path. Auto-creates parent folders.

```bash
./scripts/obsidian-mcp.sh call create_note '{"path": "Notes/NewNote.md", "content": "# New Note\n\nContent here."}'
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | Yes | Vault-relative path for the new note |
| `content` | string | Yes | Note content (max 100,000 chars) |

#### `edit_note`
Replace the entire content of an existing note.

```bash
./scripts/obsidian-mcp.sh call edit_note '{"path": "Notes/Meeting.md", "content": "# Updated content"}'
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | Yes | Vault-relative path |
| `content` | string | Yes | New content (max 100,000 chars) |

#### `append_note`
Append (or prepend) text to an existing note.

```bash
./scripts/obsidian-mcp.sh call append_note '{"path": "Notes/Log.md", "content": "\n## New Entry\nDetails here."}'
```

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `path` | string | Yes | — | Vault-relative path |
| `content` | string | Yes | — | Text to add (max 50,000 chars) |
| `mode` | string | No | `append` | `append` or `prepend` |

#### `patch_note`
Find-and-replace edit. Replaces the **first** occurrence of `old_string` with `new_string`.

```bash
./scripts/obsidian-mcp.sh call patch_note '{"path": "Notes/project.md", "old_string": "Status: draft", "new_string": "Status: active"}'
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | Yes | Vault-relative path |
| `old_string` | string | Yes | Exact text to find (min 1 char) |
| `new_string` | string | Yes | Replacement text (max 100,000 chars) |

Errors if zero or multiple matches are found.

#### `rename_note`
Rename or move a note. Obsidian auto-updates wikilinks.

```bash
./scripts/obsidian-mcp.sh call rename_note '{"path": "Inbox/raw-idea.md", "new_path": "Projects/idea-validated.md"}'
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | Yes | Current vault-relative path |
| `new_path` | string | Yes | New vault-relative path |

#### `create_folder`
Create a folder (with intermediate parents, like `mkdir -p`).

```bash
./scripts/obsidian-mcp.sh call create_folder '{"path": "Projects/NewProject/Research"}'
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | Yes | Vault-relative folder path |

#### `add_attachment`
Save a base64-encoded binary file to the vault.

```bash
./scripts/obsidian-mcp.sh call add_attachment '{"filename": "diagram.png", "data": "<base64>", "folder": "Attachments"}'
```

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `filename` | string | Yes | — | Filename with extension |
| `data` | string | Yes | — | Base64-encoded content (max 10 MB) |
| `folder` | string | No | Obsidian default | Target folder |

#### `append_daily_note`
Append text to today's daily note. Creates the note if it doesn't exist.

```bash
./scripts/obsidian-mcp.sh call append_daily_note '{"text": "- Met with team about Q2 roadmap"}'
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `text` | string | Yes | Text to append (max 50,000 chars) |

---

### Destructive Tool

#### `delete_note`
**Permanently delete** a note. This cannot be undone via the MCP server.

```bash
./scripts/obsidian-mcp.sh call delete_note '{"path": "Notes/OldNote.md"}'
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | Yes | Vault-relative path |

---

## Error Handling

| Error | Meaning | Action |
|-------|---------|--------|
| HTTP 401 | Invalid or missing token | Check `OBSIDIAN_MCP_TOKEN` |
| HTTP 404 | Session expired or server restarted | Script auto-retries with a new session |
| Connection refused | Obsidian not running or plugin disabled | Start Obsidian and enable the plugin |
| Tool error in response | Invalid parameters or access denied | Check parameters and access control rules |

## Tips

- **Start with `describe_vault`** to understand the vault structure before diving into specific notes.
- **Use `list_folder` with `recursive: true`** to explore the folder hierarchy.
- **Use `search_content`** for full-text search and **`search_notes`** for metadata-based filtering.
- **Read before writing:** Always `read_note` before `edit_note` or `patch_note` to avoid overwriting content.
- **Access control:** Some paths or tagged notes may be blocked by the user's blacklist rules. If a tool returns "access denied", respect it.
