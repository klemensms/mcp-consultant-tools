# Project Structure

This document describes the organization of the PowerPlatform MCP Server codebase.

## Directory Structure

```
powerplatform-mcp/
├── src/                    # Source code (TypeScript)
│   ├── index.ts           # MCP server entry point
│   ├── PowerPlatformService.ts
│   └── AzureDevOpsService.ts
│
├── build/                  # Compiled JavaScript (generated)
│   ├── index.js
│   ├── PowerPlatformService.js
│   └── AzureDevOpsService.js
│
├── tests/                  # Test scripts
│   ├── README.md          # Test documentation
│   ├── test-*.js          # Various test suites
│   ├── debug-*.js         # Debugging scripts
│   └── analyze-*.js       # Analysis tools
│
├── examples/              # Usage examples
│   ├── README.md          # Examples documentation
│   ├── get-release-bugs.js
│   └── list-all-wiki-pages.js
│
├── scripts/               # Utility scripts
│   ├── README.md          # Scripts documentation
│   └── setup-claude-desktop.sh
│
├── config/                # Configuration examples
│   ├── README.md          # Config documentation
│   ├── claude_desktop_config.sample.json
│   └── CLAUDE_DESKTOP_FIX.json
│
├── docs/                  # Documentation
│   ├── README.md          # Docs index
│   ├── WIKI_PATH_*.md     # Wiki path fix docs
│   ├── WORKFLOW_*.md      # Workflow feature docs
│   ├── PRD-*.md           # Product requirements
│   └── *.md               # Other documentation
│
├── .claude/               # Claude Code settings
│
├── README.md              # Main project documentation
├── CLAUDE.md              # AI assistant instructions
├── package.json           # Node.js project config
├── tsconfig.json          # TypeScript config
├── .env.example           # Environment variables template
└── LICENSE                # MIT License

```

## File Categories

### Source Code (`/src`)
TypeScript source files that get compiled to JavaScript in `/build`.

**Main files:**
- `index.ts` - MCP server initialization and tool/prompt registration
- `PowerPlatformService.ts` - PowerPlatform/Dataverse API service
- `AzureDevOpsService.ts` - Azure DevOps API service (wiki, work items)

### Tests (`/tests`)
Test scripts for validating functionality. See [tests/README.md](tests/README.md).

**Categories:**
- PowerPlatform tests (`test-plugin-*.js`, `test-workflows-*.js`)
- Azure DevOps tests (`test-ado-*.js`)
- Path conversion tests (`test-wiki-*.js`, `analyze-*.js`)
- Debug utilities (`debug-*.js`)

**Run tests:**
```bash
node tests/test-connection.js
node tests/test-wiki-fix.js
```

### Examples (`/examples`)
Practical examples showing how to use the service. See [examples/README.md](examples/README.md).

**Available examples:**
- `get-release-bugs.js` - Extract bugs from wiki pages
- `list-all-wiki-pages.js` - List all pages in a wiki

**Run examples:**
```bash
node examples/get-release-bugs.js
```

### Scripts (`/scripts`)
Setup and deployment utilities. See [scripts/README.md](scripts/README.md).

**Available scripts:**
- `setup-claude-desktop.sh` - Automated Claude Desktop configuration

**Run scripts:**
```bash
./scripts/setup-claude-desktop.sh
```

### Configuration (`/config`)
Configuration file templates and examples. See [config/README.md](config/README.md).

**Files:**
- `claude_desktop_config.sample.json` - Claude Desktop MCP config template
- `CLAUDE_DESKTOP_FIX.json` - Wiki path fix configuration

**Usage:**
```bash
# Automated
./scripts/setup-claude-desktop.sh

# Manual
cp config/claude_desktop_config.sample.json ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

### Documentation (`/docs`)
Detailed documentation for features, fixes, and specifications. See [docs/README.md](docs/README.md).

**Categories:**
- Setup guides (`CLAUDE_CODE_SETUP.md`)
- Feature specs (`PRD-PLUGIN-REGISTRATION.md`, `WORKFLOW_FLOW_EXTENSION.md`)
- Bug fix docs (`WIKI_PATH_*.md`, `CLAUDE_DESKTOP_FIX_README.md`)
- Test results (`TEST_RESULTS.md`)
- Ideas (`feature_ideas.md`)

## Build Output

### Generated Directories
- `/build` - Compiled JavaScript (created by `npm run build`)
- `/node_modules` - Dependencies (created by `npm install`)

### Not in Git
The following are excluded from version control (see `.gitignore`):
- `/build` - Generated code
- `/node_modules` - Dependencies
- `.env` - Local environment variables
- `*.log` - Log files

## Root Files

### Core Project Files
- `package.json` - Node.js project configuration, dependencies, scripts
- `tsconfig.json` - TypeScript compiler configuration
- `LICENSE` - MIT License

### Documentation
- `README.md` - Main project documentation (installation, usage, features)
- `CLAUDE.md` - Instructions for AI assistants (Claude Code)
- `PROJECT_STRUCTURE.md` - This file

### Configuration
- `.env.example` - Environment variables template
- `.env` - Local environment variables (not in git, create from .env.example)

## Navigation Guide

### "I want to..."

**Understand the project:**
→ Start with [README.md](README.md)

**Set up development environment:**
→ See [config/README.md](config/README.md) and `.env.example`

**Run tests:**
→ See [tests/README.md](tests/README.md)

**See usage examples:**
→ See [examples/README.md](examples/README.md)

**Understand the wiki path fix:**
→ See [docs/CLAUDE_DESKTOP_FIX_README.md](docs/CLAUDE_DESKTOP_FIX_README.md)

**Work with plugins:**
→ See [docs/PRD-PLUGIN-REGISTRATION.md](docs/PRD-PLUGIN-REGISTRATION.md)

**Configure Claude Desktop:**
→ Run `./scripts/setup-claude-desktop.sh` or see [config/README.md](config/README.md)

**Modify source code:**
→ Edit files in `/src`, then run `npm run build`

**Add a test:**
→ Create `tests/test-your-feature.js`, see [tests/README.md](tests/README.md)

**Add documentation:**
→ Create `docs/YOUR_DOC.md`, update [docs/README.md](docs/README.md)

## Building and Running

### Development Workflow

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

3. **Build:**
   ```bash
   npm run build
   ```

4. **Test:**
   ```bash
   node tests/test-connection.js
   ```

5. **Run:**
   ```bash
   npm start
   # Or
   npx powerplatform-mcp
   ```

### Production Deployment

1. **Build for production:**
   ```bash
   npm run build
   ```

2. **Publish to npm:**
   ```bash
   npm publish
   ```

3. **Use in Claude Desktop:**
   ```bash
   ./scripts/setup-claude-desktop.sh
   ```

## Maintenance

### Adding New Features

1. **Implement:** Add code to `/src`
2. **Test:** Create test in `/tests`
3. **Document:** Add docs to `/docs`
4. **Example:** Optionally add example to `/examples`
5. **Build:** Run `npm run build`

### Updating Documentation

1. **Update relevant docs** in `/docs`
2. **Update README.md** if needed
3. **Update CLAUDE.md** for AI assistant changes
4. **Update folder READMEs** if structure changes

### File Organization Rules

- **Tests** go in `/tests` (prefix with `test-` or `debug-` or `analyze-`)
- **Examples** go in `/examples` (descriptive names, show real usage)
- **Docs** go in `/docs` (markdown files explaining features/fixes)
- **Scripts** go in `/scripts` (executable utilities)
- **Config** goes in `/config` (templates and examples)
- **Source** goes in `/src` (TypeScript only)

Keep the root directory clean - only essential project files belong there.
