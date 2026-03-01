import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const JSON_CANVAS_GUIDE = `# JSON Canvas (.canvas) Format Reference

JSON Canvas is Obsidian's format for visual canvases — infinite whiteboards with nodes and connections.

## File Structure
A .canvas file is a JSON object with two arrays:
\`\`\`json
{
  "nodes": [...],
  "edges": [...]
}
\`\`\`

## Node Types

### Text Node
\`\`\`json
{
  "id": "unique-id",
  "type": "text",
  "x": 0, "y": 0,
  "width": 400, "height": 300,
  "text": "Markdown content here",
  "color": "1"
}
\`\`\`

### File Node (embed a file)
\`\`\`json
{
  "id": "unique-id",
  "type": "file",
  "x": 500, "y": 0,
  "width": 400, "height": 300,
  "file": "path/to/note.md",
  "subpath": "#heading"
}
\`\`\`

### Link Node (embed a URL)
\`\`\`json
{
  "id": "unique-id",
  "type": "link",
  "x": 1000, "y": 0,
  "width": 400, "height": 300,
  "url": "https://example.com"
}
\`\`\`

### Group Node (visual grouping)
\`\`\`json
{
  "id": "unique-id",
  "type": "group",
  "x": -50, "y": -50,
  "width": 500, "height": 400,
  "label": "Group Name",
  "background": "path/to/image.png",
  "backgroundStyle": "cover"
}
\`\`\`

## Edges (Connections)
\`\`\`json
{
  "id": "unique-id",
  "fromNode": "node-id-1",
  "toNode": "node-id-2",
  "fromSide": "right",
  "toSide": "left",
  "fromEnd": "none",
  "toEnd": "arrow",
  "color": "2",
  "label": "relates to"
}
\`\`\`

### Side Values
"top", "right", "bottom", "left"

### End Values
"none" (default) or "arrow"

## Color Values
- "1" through "6" — preset colors
- "#RRGGBB" — custom hex color
- Omit for default color

## Key Rules
- All positions (x, y) are in pixels from canvas center
- IDs must be unique within the canvas
- Text content in text nodes is Obsidian Markdown
- Group nodes contain other nodes spatially (no explicit parent reference)
- Edges connect nodes by ID
`;

export function registerCanvasGuide(mcp: McpServer): void {
    mcp.registerPrompt('json-canvas-guide', {
        title: 'JSON Canvas Format',
        description: 'Reference guide for Obsidian JSON Canvas (.canvas) file format including node types, edges, and structure.',
    }, () => ({
        messages: [{
            role: 'user',
            content: { type: 'text', text: JSON_CANVAS_GUIDE },
        }],
    }));
}
