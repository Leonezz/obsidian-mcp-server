import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const OBSIDIAN_BASES_GUIDE = `# Obsidian Bases (.base) Format Reference

Bases are Obsidian's database-like views for querying and displaying notes as tables, cards, or other layouts.

## File Structure
A .base file is a JSON object:
\`\`\`json
{
  "filter": { ... },
  "formulas": { ... },
  "views": [ ... ]
}
\`\`\`

## Filters
Filters define which notes appear in the base.

### Filter Types
\`\`\`json
{
  "filter": {
    "conjunction": "and",
    "conditions": [
      {
        "field": "folder",
        "operator": "is",
        "value": "Projects"
      },
      {
        "field": "tags",
        "operator": "contains",
        "value": "#active"
      }
    ]
  }
}
\`\`\`

### Available Fields
- \`folder\` — Note's parent folder
- \`name\` — Note's file name
- \`ext\` — File extension
- \`tags\` — Note's tags
- \`frontmatter.KEY\` — Any frontmatter property
- \`created\` — Creation date
- \`modified\` — Modification date

### Operators
- \`is\`, \`is-not\` — Exact match
- \`contains\`, \`does-not-contain\` — Substring/member match
- \`starts-with\`, \`ends-with\` — String prefix/suffix
- \`is-empty\`, \`is-not-empty\` — Null/empty check
- \`gt\`, \`lt\`, \`gte\`, \`lte\` — Numeric/date comparisons

## Formulas
Define computed columns:
\`\`\`json
{
  "formulas": {
    "days_since_modified": "dateBetween(now(), prop('modified'), 'days')",
    "full_title": "prop('status') + ': ' + prop('name')"
  }
}
\`\`\`

### Formula Functions
- \`prop('name')\` — Get a property value
- \`now()\` — Current date/time
- \`dateBetween(date1, date2, unit)\` — Date difference
- \`contains(value, search)\` — Check if value contains search
- \`length(value)\` — Length of text or array
- \`if(condition, then, else)\` — Conditional
- Math operators: +, -, *, /

## Views
\`\`\`json
{
  "views": [
    {
      "id": "view-1",
      "name": "Table View",
      "type": "table",
      "config": {
        "columns": [
          { "field": "name", "width": 200, "visible": true },
          { "field": "frontmatter.status", "width": 100, "visible": true },
          { "field": "tags", "width": 150, "visible": true },
          { "field": "modified", "width": 120, "visible": true }
        ],
        "sort": [
          { "field": "modified", "direction": "desc" }
        ]
      }
    }
  ]
}
\`\`\`

### View Types
- \`table\` — Spreadsheet-like rows and columns
- \`card\` — Card/kanban layout
- \`list\` — Simple list

### Column Configuration
- \`field\` — Property name to display
- \`width\` — Column width in pixels
- \`visible\` — Whether column is shown
- \`wrap\` — Whether text wraps

## Summaries
Add summary rows to table views:
\`\`\`json
{
  "summaries": {
    "frontmatter.hours": "sum",
    "name": "count"
  }
}
\`\`\`

### Summary Functions
- \`sum\` — Sum numeric values
- \`count\` — Count non-empty values
- \`count-unique\` — Count unique values
- \`avg\` — Average numeric values
- \`min\`, \`max\` — Min/max values
`;

export function registerBasesGuide(mcp: McpServer): void {
    mcp.registerPrompt('obsidian-bases-guide', {
        title: 'Obsidian Bases Format',
        description: 'Reference guide for Obsidian Bases (.base) file format including filters, formulas, views, and summaries.',
    }, async () => ({
        messages: [{
            role: 'user',
            content: { type: 'text', text: OBSIDIAN_BASES_GUIDE },
        }],
    }));
}
