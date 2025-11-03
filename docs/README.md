# Documentation

This folder contains detailed documentation for various features, fixes, and implementation details.

## Documentation Index

### Setup & Getting Started
- **[CLAUDE_CODE_SETUP.md](CLAUDE_CODE_SETUP.md)** - Setting up Claude Code integration
- **[../README.md](../README.md)** - Main project README (at root)
- **[../CLAUDE.md](../CLAUDE.md)** - Project instructions for Claude Code (at root)
- **[PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md)** - Project directory structure and organization guide
- **[CLEANUP_SUMMARY.md](CLEANUP_SUMMARY.md)** - Previous cleanup history (Oct 2025)

### Feature Documentation
- **[PRD-PLUGIN-REGISTRATION.md](PRD-PLUGIN-REGISTRATION.md)** - Plugin registration feature specification
- **[WORKFLOW_FLOW_EXTENSION.md](WORKFLOW_FLOW_EXTENSION.md)** - Workflow and flow extension documentation
- **[feature_ideas.md](feature_ideas.md)** - Future feature ideas and enhancements

### Bug Fixes & Issue Resolution
- **[CLAUDE_DESKTOP_FIX_README.md](CLAUDE_DESKTOP_FIX_README.md)** - Complete guide to the wiki path conversion fix
- **[WIKI_PATH_ISSUE.md](WIKI_PATH_ISSUE.md)** - Detailed analysis of the wiki path conversion issue
- **[WIKI_PATH_FIX_SUMMARY.md](WIKI_PATH_FIX_SUMMARY.md)** - Implementation summary of the path fix

### Test Results
- **[TEST_RESULTS.md](TEST_RESULTS.md)** - Comprehensive test results and validation

## Quick Navigation

### Need to understand the wiki path issue?
1. Start with [CLAUDE_DESKTOP_FIX_README.md](CLAUDE_DESKTOP_FIX_README.md) for the overview
2. Read [WIKI_PATH_ISSUE.md](WIKI_PATH_ISSUE.md) for detailed analysis
3. Check [WIKI_PATH_FIX_SUMMARY.md](WIKI_PATH_FIX_SUMMARY.md) for implementation details

### Need to work with plugins?
- See [PRD-PLUGIN-REGISTRATION.md](PRD-PLUGIN-REGISTRATION.md) for complete plugin registration documentation

### Need to work with workflows/flows?
- See [WORKFLOW_FLOW_EXTENSION.md](WORKFLOW_FLOW_EXTENSION.md) for workflow and Power Automate flow documentation

### Setting up development environment?
- See [CLAUDE_CODE_SETUP.md](CLAUDE_CODE_SETUP.md) for Claude Code integration
- See [../config/README.md](../config/README.md) for configuration details

## Documentation Structure

This documentation follows these conventions:

### File Naming
- `*_SETUP.md` - Setup and configuration guides
- `*_FIX_*.md` - Bug fixes and issue resolutions
- `*_ISSUE.md` - Problem analysis and investigation
- `PRD-*.md` - Product requirement documents
- `*_EXTENSION.md` - Feature extensions and enhancements
- `TEST_*.md` - Test results and validation
- `feature_*.md` - Feature ideas and roadmap

### Content Structure
Each document typically includes:
1. **Overview/Problem Statement** - What and why
2. **Solution/Implementation** - How it's solved
3. **Examples** - Usage examples
4. **Testing** - Validation and verification
5. **References** - Links to related files/docs

## Contributing Documentation

When adding new documentation:

1. **Choose the right location:**
   - Implementation details → `/docs`
   - API reference → Comments in source code
   - User guides → Main `/README.md`
   - Project instructions for AI → `/CLAUDE.md`

2. **Follow naming conventions:**
   - Use descriptive names
   - Use uppercase for major docs
   - Use markdown format

3. **Link related documents:**
   - Cross-reference related docs
   - Update this README index
   - Update main README if needed

4. **Keep it current:**
   - Update docs when implementation changes
   - Mark outdated sections
   - Archive obsolete docs

## Related Resources

- **Source Code:** [../src/](../src/)
- **Tests:** [../tests/](../tests/)
- **Examples:** [../examples/](../examples/)
- **Configuration:** [../config/](../config/)
