import {
  createTranscriptMessage,
  textBlock,
  type TranscriptMessage,
} from "../../lib/transcript.js";
import { escapeXml as escapeXmlAttr, toCData as wrapCdata } from "../../lib/xml.js";

type SystemReminderType =
  | "mode_changed"
  | "tool_denied"
  | "info";

interface SystemReminder {
  type: SystemReminderType;
  body: string;
}

const queues = new Map<string, SystemReminder[]>();

export function enqueueSystemReminder(sessionId: string, reminder: SystemReminder): void {
  if (!sessionId) return;
  const list = queues.get(sessionId) ?? [];
  list.push(reminder);
  queues.set(sessionId, list);
}

export function drainSystemReminders(sessionId: string): SystemReminder[] {
  const list = queues.get(sessionId);
  if (!list || list.length === 0) return [];
  queues.delete(sessionId);
  return list;
}

export function clearSystemReminders(sessionId: string): void {
  queues.delete(sessionId);
}

export function buildSystemReminderMessages(
  reminders: SystemReminder[],
): TranscriptMessage[] {
  return reminders.map((reminder) =>
    createTranscriptMessage({
      role: "user",
      isMeta: true,
      content: [
        textBlock(
          [
            `<system-reminder type="${escapeXmlAttr(reminder.type)}">`,
            `  ${wrapCdata(reminder.body.trim())}`,
            "</system-reminder>",
          ].join("\n"),
        ),
      ],
    }),
  );
}
