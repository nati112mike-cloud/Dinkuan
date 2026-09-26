import { prisma } from "@dinkuan/db";

export async function resetDb() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
}

let n = 0;
/** A member with a profile (made directly: this package sits below @dinkuan/social). */
export async function member(name = "Member") {
  n += 1;
  const user = await prisma.user.create({
    data: { phone: `+2519${String(50000000 + n).slice(-8)}`, name, roles: { create: { role: "buyer" } } },
  });
  await prisma.profile.create({
    data: { userId: user.id, username: `m${n}_${Date.now() % 100000}`, displayName: name, referralCode: `R${n}X${Date.now() % 100000}` },
  });
  return user;
}

export async function moderator(name = "Moderator") {
  const u = await member(name);
  await prisma.userRole.create({ data: { userId: u.id, role: "admin" } });
  return u;
}

export async function post(authorId: string, caption = "Great night at Fendika", status: "public" | "restricted" = "public") {
  return prisma.post.create({ data: { authorId, type: "text", caption, status } });
}

/** A client–vendor conversation with one message from `senderId`. */
export async function chatMessage(clientId: string, vendorId: string, senderId: string, body = "Hello") {
  await prisma.vendorProfile.upsert({ where: { userId: vendorId }, create: { userId: vendorId, headline: "DJ" }, update: {} });
  const req = await prisma.bookingRequest.create({
    data: { clientId, vendorId, eventDate: new Date("2026-12-01"), startTime: "20:00", venue: "Bole", eventType: "wedding", guests: 100 },
  });
  const c = await prisma.conversation.create({ data: { bookingRequestId: req.id, clientId, vendorId } });
  return prisma.message.create({ data: { conversationId: c.id, senderId, body, originalBody: body } });
}
