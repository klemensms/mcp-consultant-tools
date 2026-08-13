/**
 * People tools - directory lookup and direct messaging
 *
 * - find-user:           resolve a name or email to directory users
 * - send-direct-message: DM a person by name, without knowing a chat ID
 *
 * send-direct-message deliberately does not expose its three steps (resolve user,
 * find or create the one-on-one chat, post) as separate tools. Splitting them
 * would put the burden of not creating duplicate threads on the caller.
 */

import { z } from "zod";
import type { ServiceContext, DirectMessageResult, UserInfo } from "../types.js";
import {
  descWithExamples,
  USER_QUERY_EXAMPLES,
  MESSAGE_FORMAT_EXAMPLES,
  MESSAGE_CONTENT_EXAMPLES,
  MENTION_SYNTAX_HINT,
} from "../tool-examples.js";
import { formatUsers } from "./format-messages.js";

export const findUserSchema = {
  query: z
    .string()
    .describe(
      descWithExamples(
        "Name, email address or user principal name to search the directory for.",
        USER_QUERY_EXAMPLES
      )
    ),
  top: z
    .number()
    .int()
    .min(1)
    .max(25)
    .optional()
    .describe("Number of users to return. Defaults to 10, maximum 25."),
};

export const sendDirectMessageSchema = {
  to: z
    .string()
    .describe(
      descWithExamples(
        "Who to message - a name, email address or user principal name. An exact email address is the only form guaranteed to be unambiguous; an ambiguous name is reported back with the candidates rather than guessed at.",
        USER_QUERY_EXAMPLES
      )
    ),
  message: z
    .string()
    .describe(descWithExamples("Message content (text or markdown)." + MENTION_SYNTAX_HINT, MESSAGE_CONTENT_EXAMPLES)),
  format: z
    .enum(["text", "markdown"])
    .optional()
    .default("markdown")
    .describe(
      descWithExamples(
        "Message format: 'text' for plain text, 'markdown' for rich formatting",
        MESSAGE_FORMAT_EXAMPLES
      )
    ),
};

function errorResult(message: string) {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

export function registerFindUserTool(server: any, ctx: ServiceContext): void {
  server.tool(
    "find-user",
    "Find people in the organisation's directory by name, email address or user principal name. Returns each match's display name, email, job title and AAD user ID. Use this to identify the right person before messaging them, or to get the user ID an @-mention needs.",
    findUserSchema,
    { readOnlyHint: true, openWorldHint: true },
    async (args: { query: string; top?: number }) => {
      try {
        const users: UserInfo[] = await ctx.people.findUsers(args.query, { top: args.top });
        return { content: [{ type: "text", text: formatUsers(users) }] };
      } catch (error: any) {
        return errorResult(`❌ Failed to find users: ${error.message}`);
      }
    }
  );
}

export function registerSendDirectMessageTool(server: any, ctx: ServiceContext): void {
  server.tool(
    "send-direct-message",
    "Send a direct message to a person in Microsoft Teams by name or email address, without needing a chat ID. Resolves the person in the directory, reuses the existing one-on-one chat with them when there is one, and only opens a new chat if there is not. If the name matches more than one person, it reports the candidates instead of guessing.",
    sendDirectMessageSchema,
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async (args: { to: string; message: string; format?: "text" | "markdown" }) => {
      try {
        const result: DirectMessageResult = await ctx.people.sendDirectMessage(
          args.to,
          args.message,
          { format: args.format }
        );

        const who =
          `${result.recipient.displayName}` +
          (result.recipient.mail ? ` <${result.recipient.mail}>` : "");

        const chatLine = result.chatExisted
          ? `Posted into your existing chat with them.`
          : `No existing chat with them, so a new one was opened.`;

        return {
          content: [
            {
              type: "text",
              text:
                `✅ Direct message sent to ${who}\n\n` +
                `${chatLine}\n` +
                `Chat ID: ${result.chatId}\n` +
                `Message ID: ${result.messageId}` +
                (result.webUrl ? `\nView: ${result.webUrl}` : ""),
            },
          ],
        };
      } catch (error: any) {
        return errorResult(`❌ Failed to send direct message: ${error.message}`);
      }
    }
  );
}
