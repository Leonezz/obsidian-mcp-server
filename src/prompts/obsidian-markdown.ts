import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const OBSIDIAN_MARKDOWN_GUIDE = `# Obsidian Flavored Markdown Reference

## Internal Links (Wikilinks)
- Basic link: [[Page Name]]
- Link with display text: [[Page Name|Display Text]]
- Link to heading: [[Page Name#Heading]]
- Link to block: [[Page Name#^block-id]]

## Embeds
- Embed note: ![[Page Name]]
- Embed image: ![[image.png]]
- Embed with size: ![[image.png|300]] or ![[image.png|300x200]]
- Embed heading: ![[Page Name#Heading]]
- Embed block: ![[Page Name#^block-id]]
- Embed PDF: ![[document.pdf#page=3]]

## Tags
- Inline tag: #tag or #nested/tag
- Tags in frontmatter: tags: [tag1, tag2] or tags: tag1, tag2
- Tags are case-insensitive and support nesting with /

## Frontmatter (Properties)
Defined in YAML block at the top of the note:
\`\`\`yaml
---
title: My Note
tags: [project, active]
aliases: [alternate-name]
cssclasses: [custom-class]
date: 2024-01-15
status: draft
---
\`\`\`

### Reserved Properties
- aliases: Alternative names for the note (used in link suggestions)
- tags: Tags for the note
- cssclasses: CSS classes applied to the note

## Callouts
> [!note] Title
> Callout content here.

### Callout Types
note, abstract, summary, info, todo, tip, hint, important,
success, check, done, question, help, faq, warning, caution,
attention, failure, fail, missing, danger, error, bug, example,
quote, cite

### Foldable Callouts
> [!faq]- Collapsed by default
> Content hidden until expanded.

> [!faq]+ Expanded by default
> Content shown initially.

## Headings
# Heading 1 through ###### Heading 6

## Task Lists
- [ ] Unchecked task
- [x] Completed task
- [/] In progress (some themes)
- [-] Cancelled (some themes)

## Footnotes
This has a footnote[^1].
[^1]: This is the footnote content.

## Comments
%%This is a comment and won't render.%%

## Math (LaTeX)
Inline: $e^{i\\pi} + 1 = 0$
Block:
$$
\\sum_{n=1}^{\\infty} \\frac{1}{n^2} = \\frac{\\pi^2}{6}
$$

## Code Blocks
\`\`\`language
code here
\`\`\`

## Tables
| Header 1 | Header 2 |
|----------|----------|
| Cell 1   | Cell 2   |

## Highlights
==highlighted text==

## Strikethrough
~~strikethrough text~~
`;

export function registerMarkdownGuide(mcp: McpServer): void {
    mcp.registerPrompt('obsidian-markdown-guide', {
        title: 'Obsidian Flavored Markdown',
        description: 'Reference guide for Obsidian Markdown syntax including wikilinks, embeds, callouts, frontmatter, tags, and properties.',
    }, () => ({
        messages: [{
            role: 'user',
            content: { type: 'text', text: OBSIDIAN_MARKDOWN_GUIDE },
        }],
    }));
}
