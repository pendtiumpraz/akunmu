import { AtSign, Laptop, ListChecks, LogOut, MapPinned, Plus, Trophy, type LucideIcon } from "lucide-react";
import type { MentionKind } from "@/modules/ai/agent-types";

/**
 * Slash commands of the composer. Each one fills in a ready question (in the person's language); `tool` hides the
 * command from roles that cannot use that tool, and `mention` opens the device or account picker right after.
 * The typed trigger, label and question come from ai.commands.<id>.* messages.
 */
export type AssistantCommand = { id: string; tool: string; icon: LucideIcon; mention: MentionKind | null };

export const ASSISTANT_COMMANDS: AssistantCommand[] = [
  { id: "where", tool: "find_account", icon: MapPinned, mention: "account" },
  { id: "device", tool: "get_device", icon: Laptop, mention: "device" },
  { id: "check", tool: "get_overview", icon: ListChecks, mention: null },
  { id: "record", tool: "record_sign_ins", icon: Plus, mention: null },
  { id: "signOut", tool: "sign_out", icon: LogOut, mention: null },
  { id: "addDevice", tool: "add_device", icon: Laptop, mention: null },
  { id: "accounts", tool: "list_accounts", icon: AtSign, mention: null },
  { id: "busiest", tool: "get_overview", icon: Trophy, mention: null },
];

/** Starter questions on an empty chat, shown when the role has the tool. */
export const ASSISTANT_STARTERS: { id: string; tool: string; icon: LucideIcon }[] = [
  { id: "check", tool: "get_overview", icon: ListChecks },
  { id: "where", tool: "find_account", icon: MapPinned },
  { id: "record", tool: "record_sign_ins", icon: Plus },
  { id: "devices", tool: "list_devices", icon: Laptop },
];
