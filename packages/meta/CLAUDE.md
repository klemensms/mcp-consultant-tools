# Meta Package Guide

## Overview

The `@mcp-consultant-tools/meta` package combines all integrations into a single package for convenience.

## When to Use

- **Quick setup:** Install everything with one package
- **Full access:** Need all integrations
- **Backward compatibility:** Migrating from pre-v15 monolithic package

## When NOT to Use

- **Production:** Use individual packages for least-privilege security
- **Specific needs:** Only need 1-2 integrations
- **Size concerns:** Meta package is larger

## Installation

```bash
npm install @mcp-consultant-tools/meta
```

## Included Packages

- `@mcp-consultant-tools/core`
- `@mcp-consultant-tools/powerplatform`
- `@mcp-consultant-tools/powerplatform-customization`
- `@mcp-consultant-tools/powerplatform-data`
- `@mcp-consultant-tools/azure-devops`
- `@mcp-consultant-tools/figma`
- `@mcp-consultant-tools/application-insights`
- `@mcp-consultant-tools/log-analytics`
- `@mcp-consultant-tools/azure-sql`
- `@mcp-consultant-tools/service-bus`
- `@mcp-consultant-tools/sharepoint`
- `@mcp-consultant-tools/github-enterprise`
- `@mcp-consultant-tools/azure-b2c`
- `@mcp-consultant-tools/azure-data-factory`
- `@mcp-consultant-tools/azure-defender`
- `@mcp-consultant-tools/fabric`
- `@mcp-consultant-tools/rest-api`

## Configuration

Configure all integrations via environment variables. See individual package CLAUDE.md files for configuration details.
