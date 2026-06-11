# PowerPlatform Core Package Guide

## Overview

The `@mcp-consultant-tools/powerplatform-core` package contains shared services used by all PowerPlatform packages.

**This is an internal package - not for direct installation.**

## Purpose

Provides modular services that are consumed by:
- `@mcp-consultant-tools/powerplatform` (read-only)
- `@mcp-consultant-tools/powerplatform-customization` (write)
- `@mcp-consultant-tools/powerplatform-data` (CRUD)

## Services

Located in `src/services/`:

| Service | Purpose | Lines |
|---------|---------|-------|
| `AppService` | Model-driven app operations | ~300 |
| `AttributeService` | Attribute/column operations | ~400 |
| `BusinessRuleService` | Business rule inspection | ~200 |
| `DataService` | CRUD operations | ~300 |
| `DependencyService` | Component dependencies | ~200 |
| `EntityService` | Entity/table operations | ~400 |
| `FlowService` | Power Automate flow operations | ~500 |
| `FormService` | Form operations | ~300 |
| `MetadataService` | Metadata queries | ~300 |
| `OptionSetService` | Option set operations | ~300 |
| `PluginService` | Plugin inspection | ~400 |
| `PluginDeploymentService` | Plugin deployment | ~500 |
| `PublishingService` | Publish customizations | ~200 |
| `RelationshipService` | Relationship operations | ~300 |
| `SolutionService` | Solution management | ~400 |
| `ValidationService` | Best practices validation | ~600 |
| `ViewService` | View operations | ~300 |
| `WebResourceService` | Web resource operations | ~300 |
| `WorkflowService` | Classic workflow operations | ~400 |

## Architecture

Each service:
- Is focused on a single domain (~200-600 lines)
- Uses shared authentication from core client
- Follows consistent error handling patterns
- Logs operations via audit logger

## File Size Management

This package was created to address file size limits:
- Original: PowerPlatformService.ts at ~12k lines
- Refactored: 18 services averaging ~350 lines each
- Target: No service exceeds 800 lines
