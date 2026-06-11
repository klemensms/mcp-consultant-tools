---
name: ado-wiki
description: Create and update Azure DevOps Wiki pages with consistent formatting. Use when asked to create wiki page, write wiki documentation, update wiki article, or work with ADO wiki. Includes page structure templates, formatting syntax, and API versioning requirements.
---

version: "1.0"
author: Klemens Stelk

# ADO Wiki Pages

## Page Structure

Every wiki page follows this structure:

1. **TOC**: `[[_TOC_]]` at the top
2. **Version/Author**: Link to version history + author name (human, not agent)
3. **What**: Brief statement of what the document helps achieve
4. **Why**: Short explanation of why this is needed
5. **Quick Start Checklist**: Actions with responsible parties, each linking to detail sections
6. **Detail Sections**: Background and step-by-step instructions
7. **Version History**: Final section with table (when, who, brief what)

## Header Formatting

```markdown
<!--⭐️Header⭐️-->
# Main Header
```

Add `<!--⭐️Header⭐️-->` above every header for readability.

**TOC control**: Use `#` sparingly—only main actions should appear in TOC. Prefer `**bold text**` over sub-headers to avoid TOC clutter.

## Syntax Reference

**Links** (open in new tab):
```html
<a href="https://example.com" target="_blank">Open in new tab: Link Text</a>
```

**Colored text**:
```html
<span style="color:red">Pending - WIP</span>
```

**Collapsible sections** (for explanations, screenshots, background info):
```html
<details>
  <summary style="color: darkgrey; text-decoration: underline;">Explanation/Reasoning/Screenshots</summary>

<br>

{content here}

<br>

</details>
<br>
```

## API: Updating Wiki Pages

**Critical**: Always include `version` parameter when updating existing pages.

### Workflow

1. **Get current page with version**:
```json
Acme-ADO-beta:get-wiki-page
{
  "pagePath": "/Page%2DName",
  "project": "Acme",
  "wikiId": "00000000-0000-0000-0000-000000000000",
  "includeContent": true
}
```

2. **Extract version from response** (ETag for concurrency control):
```json
{
  "version": "\"990948f603ba55253206f2e0f525b9c8d5fb4fb4\"",
  ...
}
```

3. **Include version in update**:
```json
Acme-ADO-beta:update-wiki-page
{
  "content": "new content",
  "pagePath": "/Page%2DName",
  "project": "Acme",
  "wikiId": "00000000-0000-0000-0000-000000000000",
  "version": "\"990948f603ba55253206f2e0f525b9c8d5fb4fb4\""
}
```

| Operation                            | Version Required? |
|--------------------------------------|-------------------|
| `create-wiki-page` (new)             | No                |
| `update-wiki-page` (existing)        | **YES**           |
| `azuredevops-str-replace-wiki-page`  | No (handled internally) |

**Note**: Missing version causes misleading "page already exists" 500 error.

## Best Practices

- **Shorter is better**: Move lengthy sections to sub-pages with clear links
- **Quick Start is key**: This is the most important section—cut through the fluff
- **Hide complexity**: Use collapsible sections for explanatory content
- **Link both ways**: When creating sub-pages, backlink between them
