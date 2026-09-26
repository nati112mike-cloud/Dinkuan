import type { getConversation } from "@dinkuan/marketplace";

type Convo = Awaited<ReturnType<typeof getConversation>>;

export type ChatMessageDTO = { id: string; body: string; masked: boolean; mine: boolean; createdAt: string };
export type ChatDTO = {
  id: string;
  asVendor: boolean;
  contactUnlocked: boolean;
  other: { username: string; displayName: string; avatarUrl: string | null } | null;
  request: {
    id: string;
    status: string;
    eventDate: string;
    startTime: string;
    venue: string;
    eventType: string;
    guests: number;
    budgetSantim: number | null;
    packageName: string | null;
    packageTier: string | null;
  };
  messages: ChatMessageDTO[];
};

export function toChatDTO(c: Convo): ChatDTO {
  return {
    id: c.id,
    asVendor: c.asVendor,
    contactUnlocked: c.contactUnlocked,
    other: c.other ? { username: c.other.username, displayName: c.other.displayName || c.other.username, avatarUrl: c.other.avatarUrl } : null,
    request: {
      id: c.request.id,
      status: c.request.status,
      eventDate: c.request.eventDate.toISOString().slice(0, 10),
      startTime: c.request.startTime,
      venue: c.request.venue,
      eventType: c.request.eventType,
      guests: c.request.guests,
      budgetSantim: c.request.budgetSantim,
      packageName: c.request.package?.name ?? null,
      packageTier: c.request.package?.tier ?? null,
    },
    messages: c.messages.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() })),
  };
}
