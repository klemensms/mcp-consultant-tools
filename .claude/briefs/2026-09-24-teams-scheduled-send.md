# Brief: scheduled and working-hours-only sending for the Teams MCP server

**Requested by:** the maintainer, relayed on 2026-09-24 by session `tsg-ai-vault-17`. Send your findings back to that session by name with `SendMessage` as well as to the maintainer. **Not monitored:** you put questions and options to the maintainer yourself, in your own tab.

**Your tab label:** `teams-schedule · <doing>` while working; `⏳ KS - teams schedule` while a question to the maintainer is waiting.

## What the maintainer wants

Messages the Teams server (`packages/teams/`) sends should never arrive outside working hours. He often works very early, and colleagues receive messages at night.

1. Send a chat message, direct message or channel post at a chosen time (a send-at parameter on the send tools, or a separate schedule tool).
2. A protective default: a send requested outside working hours is held until the next working-hours start, unless the caller explicitly says send now. Starting default, which he can change: Monday to Friday, 08:00 to 18:00, Europe/London. Per-recipient hours are a later idea, not now.
3. Scheduled messages can be listed and cancelled before they go.

## Establish first, then report (before building anything that needs a new hosted resource)

- Does Microsoft Graph support scheduled or deferred sending of Teams chat or channel messages, in v1.0 or beta? The working assumption (unverified) is no: Teams' own "schedule send" is a client feature Graph does not expose. Check the Microsoft Learn Graph reference and say plainly.
- An MCP stdio server only runs while a Claude session is open, so a queue inside it will not fire overnight. Name the realistic holder with trade-offs: a launchd job on this Mac (the laptop runs 24/7), an Azure Function in the AI Lab tenant, a Power Automate flow, or something else. Anything hosted falls under the maintainer's deploy-by-pipeline rule (root `~/.claude/CLAUDE.md` § deployment); a local launchd job does not.
- It must keep working with the outbound-send guard hook at `~/.claude/hooks/global/outbound-send-guard.py`, which gates sends on the maintainer's explicit approval of the text. Approval happens at scheduling time; the delayed send must not need a second approval, and must not let a message go out whose text differs from what was approved. Read the hook before proposing a design.
- Outlook email supports deferred delivery natively in Exchange (the deferred-send-time extended property, `PidTagDeferredSendTime`). Say whether the same rule is cheap for the new `packages/outlook/` server (see its `CLAUDE.md`). Do not build it unless the maintainer asks.

## How to work

Use `superpowers:brainstorming` and the `asking-the-user` rules: research first, then put the options to the maintainer in chat, one decision at a time, with a recommendation and what each option costs him later. Decide purely technical choices yourself and name them in one line. If he approves a design, write the spec and plan under `docs/superpowers/`, then build test-first, staging explicit paths only (other sessions commit in this working tree), and never `--no-verify` on an internal-identifier hit. This repo is public: no internal names, tenants or people in tracked files. No npm publish without his say-so.

Print a short session banner after reading this brief (what this tab is for, what he is being asked, and that `tsg-ai-vault-17` asked for it), and `/log` before you stop.
