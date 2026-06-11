---
name: markdown-docs
description: Use when creating markdown documentation, wiki pages, or technical docs - enforces consistent structure and formatting standards
---

version: "1.0"
author: Klemens Stelk

# Other Relevant Skills

If you are writing an ADO wiki entry, then also use this skill (if you have access to it): ado-wiki

# Markdown Documentation Standards

Follow these rules when creating markdown documentation.

## Document Structure

### 1. Start with Table of Contents

Always begin with:
```markdown
[[_TOC_]]
```

Followed by version (linking to version history section) and author (the human who instructed you, not the AI).

### 2. What & Why Section

Start with a brief statement about **what** this document is about / helps the reader do.

Where applicable, follow with a **why** section explaining the business need. Keep both short - this section is for leadership (CTO/CEO level).

### 3. Quick Start Checklist (Wiki docs only)

For wiki documentation, include a "Quick Start Checklist" section listing:
- All actions to be taken
- Who is responsible for each
- Links to detailed sections elsewhere in the document

This is the most important section - it cuts through the detail to show what needs to happen.

### 4. Detail Sections

Subsequent sections contain the details and background info for each action in the checklist. Write for someone who has never done this task before.

### 5. Version History (Final Section)

End with a version history table: when, who, and a brief what.

## Table Formatting

**Tables must have aligned columns for readability in raw markdown.**

Pad columns so they align when viewing the raw `.md` file:

**CORRECT - Columns aligned with padding:**
```markdown
| Option                     | Monthly Cost          | Uptime            |
|----------------------------|-----------------------|-------------------|
| **A. Client-Hosted VM**    | $0 (existing infra)   | 24/7              |
| **B. Container Apps**      | ~$1-5                 | On-demand         |
```

**WRONG - Columns not aligned:**
```markdown
| Option | Monthly Cost | Uptime |
|--------|-------------|--------|
| **A. Client-Hosted VM** | $0 (existing infra) | 24/7 |
```

**Why aligned tables matter:**
- Documentation is read in raw form (GitHub, editors, diffs)
- Aligned tables are scannable without rendering
- Professional appearance signals quality

**Tips:**
- Use consistent padding within each column
- Header separator (`|---|`) should match column width
- Longest cell content determines column width
