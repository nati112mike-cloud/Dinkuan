import { prisma } from "@dinkuan/db";
import { beforeEach, describe, expect, it } from "vitest";
import { createRequest, getVendorPage, saveVendorProfile } from "../src";
import { inDays, member, resetDb, vendor } from "./helpers";

beforeEach(resetDb);

const booking = (vendorId: string, eventType: string) => ({ vendorId, eventDate: inDays(40), startTime: "18:00", venue: "Hilton Addis", eventType, guests: 300 });

describe("launch audit: contact masking (CLAUDE.md rule 16)", () => {
  it("S14: contact details in a vendor's public text are masked, and flagged text is refused", async () => {
    const u = await member("Kaleb");
    const v = await saveVendorProfile(u.id, {
      types: ["dj"],
      headline: "DJ Kaleb call 0911223344",
      about: "Bookings on telegram @djkaleb_bookings",
      services: ["Weddings", "WhatsApp +251 911 22 33 44"],
    });
    expect(v.headline).not.toMatch(/0911223344/);
    expect(v.about).not.toMatch(/@djkaleb_bookings/);
    expect(v.services.join(" ")).not.toMatch(/911 22 33 44/);
    await expect(saveVendorProfile(u.id, { types: ["dj"], headline: "DJ Kaleb", about: "I will kill you at the show" })).rejects.toMatchObject({
      code: "CONTENT_FLAGGED",
    });
  });

  it("S14: outside links show only to the vendor and to clients with unlocked contacts", async () => {
    const dj = await vendor("Kaleb", { socialLinks: ["https://instagram.com/djkaleb"] });
    const client = await member("Client");
    const profile = await prisma.profile.findUniqueOrThrow({ where: { userId: dj.id } });
    expect((await getVendorPage(profile.username, null))!.vendor.socialLinks).toEqual([]);
    expect((await getVendorPage(profile.username, client.id))!.vendor.socialLinks).toEqual([]);
    expect((await getVendorPage(profile.username, dj.id))!.vendor.socialLinks).toEqual(["https://instagram.com/djkaleb"]);
    const { conversationId } = await createRequest(client.id, booking(dj.id, "Wedding"));
    await prisma.conversation.update({ where: { id: conversationId }, data: { contactUnlocked: true } });
    expect((await getVendorPage(profile.username, client.id))!.vendor.socialLinks).toEqual(["https://instagram.com/djkaleb"]);
  });

  it("S14: the event type on a booking request is masked like the notes", async () => {
    const dj = await vendor("Kaleb");
    const client = await member("Client");
    const { request } = await createRequest(client.id, booking(dj.id, "Call 0911223344"));
    expect(request.eventType).not.toMatch(/0911223344/);
  });
});
