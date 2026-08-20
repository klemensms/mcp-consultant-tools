# Design: edit and delete an already-sent Teams message

**Date:** 2026-08-19
**Package:** `packages/teams`
**Status:** approved, implementing

## Problem

The Teams MCP server can send, reply, react and read. It can never touch a message again once it has gone. Every send is final, which is a poor property for a surface an agent drives on someone's behalf: the failure modes that survive review are exactly the ones that only appear in the rendered client rather than in the composed string, and the recovery available today is to post a second message correcting the first, which is worse than the original mistake.

## What Microsoft Graph actually permits

Probed live against a real tenant on 2026-08-19, on the delegated scopes this app registration holds today.

| Operation | Endpoint | Least-privileged delegated permission | Consented | Verdict |
|---|---|---|---|---|
| Edit chat message | `PATCH /chats/{chat}/messages/{message}` | `Chat.ReadWrite` | yes | build now |
| Delete chat message | `POST /users/{me}/chats/{chat}/messages/{message}/softDelete` | `Chat.ReadWrite` | yes | build now |
| Undo chat delete | `POST /users/{me}/chats/{chat}/messages/{message}/undoSoftDelete` | `Chat.ReadWrite` | yes | build now |
| Edit channel message | `PATCH /teams/{team}/channels/{channel}/messages/{message}` | `ChannelMessage.ReadWrite` | **no** | blocked |
| Delete channel message | `POST /teams/{team}/channels/{channel}/messages/{message}/softDelete` | `ChannelMessage.ReadWrite` | **no** | blocked |

Both channel operations return 403 with an unusually explicit body:

```
Missing scope permissions on the request.
API requires one of 'ChannelMessage.ReadWrite, Group.ReadWrite.All'.
```

`ChannelMessage.ReadWrite` is admin-consent gated, so it cannot be self-consented and fails at sign-in rather than at the call. Adding it is an administrator action outside this repo.

Three findings that are not in the Graph reference and cost time to establish:

1. **`ChannelMessage.Edit` grants nothing.** It is a real permission, needs no admin consent, and is described as allowing an app to edit channel messages on the signed-in user's behalf. Entra returns it in the `scp` claim whether or not `DEVICE_CODE_SCOPES` asks for it, because Entra hands back the whole consented set. Graph rejects it on both `PATCH` and `softDelete` regardless. Do not add it, and do not treat its presence in a token as a capability.
2. **Chat soft delete only exists under the `/users/{id}` segment.** `POST /chats/{chat}/messages/{message}/softDelete` returns **405 Method Not Allowed**. The documented `/users/{me}/chats/...` form is the only one, so the call needs the signed-in user's own id in the path.
3. **Graph rejects an out-of-range message id with a permissions error.** A message id older than Graph's accepted window returns `403 Forbidden`, code `InsufficientPrivileges`, with an inner message of `MessageIdNotInAllowedRange`. It is an id-range rejection wearing a permission failure, and it will send the next reader hunting a consent problem that does not exist.

## Scope

**In:** three chat tools, their three CLI equivalents, three service methods, error mapping, unit tests, docs.

**Out:** the two channel tools. A tool that always returns 403 is worse than no tool, because an agent will call it, fail, and improvise. They arrive when the consent does, on the same service pattern.

## Tools

| Tool | Parameters | Notes |
|---|---|---|
| `update-chat-message` | `chatId`, `messageId`, `message`, `format?` | Replaces the body. Same `format` and `@[Name]` mention handling as `send-chat-message`. |
| `delete-chat-message` | `chatId`, `messageId` | Soft delete. `destructiveHint: true`. |
| `undo-delete-chat-message` | `chatId`, `messageId` | Restores a soft-deleted message. |

**Three tools, not the two requested.** Soft delete is reversible at the API and the undo costs about ten lines on plumbing the delete already needs. An agent-driven delete that cannot be taken back is a sharper edge than the problem being solved, so the undo ships alongside rather than later.

## Design decisions

**Edit reuses `buildOutboundMessage`.** The same helper that backs `send-chat-message` and `reply-to-message`, so markdown conversion, HTML sanitisation and `@[Name]` mention resolution behave identically on an edit and on a send. Anything else would mean a message that mentions someone loses the mention the moment it is corrected.

**An edit replaces the whole body.** Graph offers no partial update, and the caller supplies the replacement content in full. A mention present in the original and absent from the replacement is therefore dropped, which is correct but worth documenting, because the caller who is fixing a typo may not expect to have to re-state the mention.

**`getMe()` is called on the delete path only.** `TeamsService.getMe()` already exists and backs `mark-chat-read`, which needs the same identity. Edit does not need it, so it is not paid for there.

**Ownership is left to Graph.** Only the sender can edit their own message. Pre-checking would cost a read on every call to prevent an error Graph already returns, so the error is mapped rather than pre-empted.

**Error mapping is the deliverable, not a nicety.** `wrapGraphError` gains one branch: a 403 whose body carries `MessageIdNotInAllowedRange` is reported as an id-range problem with the actual remedy, ahead of the existing generic scope advice. A second branch names the missing scope and the fact that it needs an administrator when Graph asks for `ChannelMessage.ReadWrite`, so the day someone tries the channel path they get the real answer rather than the re-authenticate advice, which would not help.

## Layering

Unchanged from the rest of the package. `MessageService` gains three methods; `tools/chats.ts` gains three thin registrations; `cli/commands/read-commands.ts` gains three thin commands. No new files, because three methods on an existing service that already owns every chat operation is not a new concern.

## Testing

Unit tests against the existing recording Graph stub, extended with a `patch` verb it does not yet have. Each test asserts the exact request that would go on the wire, which is where this class of change actually fails:

- edit issues `PATCH /chats/{chat}/messages/{message}` with an html body
- edit with `format: "text"` sends a text body rather than converted html
- delete issues `POST /users/{me}/chats/{chat}/messages/{message}/softDelete` and includes the signed-in user id, not the chat id, in the users segment
- undo issues the `undoSoftDelete` path
- a 403 carrying `MessageIdNotInAllowedRange` produces the id-range message and not the re-authenticate advice

Then a live run against a real chat, since the permission behaviour is the part no stub can prove.
