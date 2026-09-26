/**
 * Demo seed: Addis venues, 2 organisers, events tonight / this weekend / upcoming, ticket tiers,
 * and demo accounts. Dates are relative to "now" so the home feed always looks alive.
 * Demo logins (DEMO_MODE=true, code 123456):
 *   buyer     0911000001
 *   scanner   0911000002  (gate staff for both organisers)
 *   organiser 0911000003
 *   admin     0911000004
 *   new organiser with an event in review  0911000006
 *   organiser application waiting for admin 0911000007
 *   second moderator (for appeals)         0911000008
 */
import { createCipheriv, randomBytes } from "node:crypto";
import * as ed from "@noble/ed25519";
import { PrismaClient, type EventCategory } from "@prisma/client";

const prisma = new PrismaClient();

function b64url(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64url");
}

function encrypt(plain: Uint8Array): string {
  const secret = process.env.KEY_ENCRYPTION_SECRET;
  if (!secret) throw new Error("KEY_ENCRYPTION_SECRET is not set (see .env.example)");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(secret, "base64"), iv);
  const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
  return [iv, cipher.getAuthTag(), ct].map((b) => b.toString("base64")).join(".");
}

/** A time in Addis (UTC+3) `dayOffset` days from today at hh:mm. */
function addisAt(dayOffset: number, hh: number, mm = 0): Date {
  const now = new Date();
  const addisNow = new Date(now.getTime() + 3 * 3600_000);
  const d = Date.UTC(addisNow.getUTCFullYear(), addisNow.getUTCMonth(), addisNow.getUTCDate() + dayOffset, hh - 3, mm);
  return new Date(d);
}

function nextWeekday(target: number): number {
  const addisDay = new Date(Date.now() + 3 * 3600_000).getUTCDay();
  const diff = (target - addisDay + 7) % 7;
  return diff === 0 ? 7 : diff;
}

const venues = [
  { key: "millennium", name: "Millennium Hall", address: "Bole Road, Addis Ababa", lat: 8.9936, lng: 38.7884 },
  { key: "ghion", name: "Ghion Hotel Gardens", address: "Ras Desta Damtew St, Addis Ababa", lat: 9.0117, lng: 38.7613 },
  { key: "meskel", name: "Meskel Square", address: "Meskel Square, Addis Ababa", lat: 9.0107, lng: 38.7613 },
  { key: "fendika", name: "Fendika Cultural Center", address: "Kazanchis, Addis Ababa", lat: 9.0181, lng: 38.7676 },
  { key: "bole", name: "Bole Rooftop Lounge", address: "Bole Atlas, Addis Ababa", lat: 8.9967, lng: 38.7856 },
  { key: "nationaltheatre", name: "National Theatre", address: "Churchill Ave, Addis Ababa", lat: 9.0232, lng: 38.7503 },
  { key: "entoto", name: "Entoto Park", address: "Entoto, Addis Ababa", lat: 9.0913, lng: 38.7629 },
  { key: "stadium", name: "Addis Ababa Stadium", address: "Stadium, Addis Ababa", lat: 9.0125, lng: 38.7577 },
];

interface SeedEvent {
  slug: string;
  org: 0 | 1;
  titleEn: string;
  titleAm: string;
  descEn: string;
  descAm: string;
  category: EventCategory;
  venue: string;
  startsAt: Date;
  hours: number;
  lineup: string[];
  featured?: boolean;
  tiers: { name: string; birr: number; capacity: number; soldPct?: number }[];
}

async function main() {
  const sat = nextWeekday(6);
  const addisDay = new Date(Date.now() + 3 * 3600_000).getUTCDay();
  const fri = (5 - addisDay + 7) % 7; // today if it is Friday
  const events: SeedEvent[] = [
    {
      slug: "afro-house-rooftop-tonight",
      org: 0,
      titleEn: "Afro House Rooftop",
      titleAm: "አፍሮ ሃውስ በጣሪያ ላይ",
      descEn: "Sunset to late: deep Afro house over the Bole skyline with Addis's best selectors.",
      descAm: "ከፀሐይ መጥለቅ እስከ ምሽት፦ በቦሌ ሰማይ ስር ምርጥ የአፍሮ ሃውስ ሙዚቃ።",
      category: "nightlife",
      venue: "bole",
      startsAt: addisAt(0, 20),
      hours: 6,
      lineup: ["DJ Kaleb", "Selam Beats", "Nahom Deep"],
      featured: true,
      tiers: [
        { name: "Early Bird", birr: 300, capacity: 100, soldPct: 100 },
        { name: "Regular", birr: 500, capacity: 200, soldPct: 70 },
        { name: "VIP", birr: 1500, capacity: 40, soldPct: 50 },
      ],
    },
    {
      slug: "fendika-azmari-night",
      org: 1,
      titleEn: "Azmari Night at Fendika",
      titleAm: "የአዝማሪ ምሽት በፈንዲቃ",
      descEn: "Masinko, kebero and eskista. A night of live azmari music and traditional dance.",
      descAm: "ማሲንቆ፣ ከበሮና እስክስታ። የቀጥታ የአዝማሪ ሙዚቃና የባህል ውዝዋዜ ምሽት።",
      category: "arts_culture",
      venue: "fendika",
      startsAt: addisAt(0, 21),
      hours: 4,
      lineup: ["Fendika Ensemble", "Azmari Tsehay"],
      tiers: [
        { name: "Regular", birr: 400, capacity: 120, soldPct: 40 },
        { name: "Table (4 people)", birr: 2400, capacity: 10, soldPct: 30 },
      ],
    },
    {
      slug: "addis-jazz-weekend",
      org: 1,
      titleEn: "Addis Ethio-Jazz Weekend",
      titleAm: "የአዲስ ኢትዮ-ጃዝ ቅዳሜና እሁድ",
      descEn: "Two stages of Ethio-jazz in the Ghion gardens, celebrating the sound that put Addis on the map.",
      descAm: "በግዮን የአትክልት ስፍራ ሁለት መድረኮች፣ አዲስ አበባን በዓለም ያስተዋወቀውን የኢትዮ-ጃዝ ድምፅ በማክበር።",
      category: "concert",
      venue: "ghion",
      startsAt: addisAt(sat, 16),
      hours: 7,
      lineup: ["Ethio Groove Collective", "Mahlet Quartet", "Addis Brass"],
      featured: true,
      tiers: [
        { name: "Early Bird", birr: 600, capacity: 150, soldPct: 100 },
        { name: "Regular", birr: 900, capacity: 400, soldPct: 35 },
        { name: "VIP", birr: 2500, capacity: 60, soldPct: 20 },
      ],
    },
    {
      slug: "friday-comedy-night",
      org: 0,
      titleEn: "Friday Stand-up Comedy",
      titleAm: "የዓርብ ኮሜዲ ምሽት",
      descEn: "Addis's funniest comedians, in Amharic and English. Come early for good seats.",
      descAm: "የአዲስ አበባ ምርጥ ኮሜዲያኖች በአማርኛና በእንግሊዝኛ። ጥሩ ቦታ ለማግኘት ቀድመው ይምጡ።",
      category: "comedy",
      venue: "nationaltheatre",
      startsAt: addisAt(fri, 19, 30),
      hours: 2,
      lineup: ["Dawit Laughs", "Meron T.", "Yonas Standup"],
      tiers: [{ name: "Regular", birr: 350, capacity: 300, soldPct: 55 }],
    },
    {
      slug: "entoto-sunrise-run",
      org: 1,
      titleEn: "Entoto Sunrise Run 10K",
      titleAm: "የእንጦጦ የንጋት ሩጫ 10ኪ.ሜ",
      descEn: "Run the hills where champions train. Medal, t-shirt and buna at the finish.",
      descAm: "ሻምፒዮኖች በሚለማመዱበት ተራራ ይሩጡ። ሜዳሊያ፣ ቲሸርትና ቡና በመጨረሻው መስመር።",
      category: "sports",
      venue: "entoto",
      startsAt: addisAt(sat + 1, 6, 30),
      hours: 4,
      lineup: [],
      tiers: [
        { name: "Runner", birr: 250, capacity: 500, soldPct: 60 },
        { name: "Community (free)", birr: 0, capacity: 200, soldPct: 30 },
      ],
    },
    {
      slug: "meskel-square-festival",
      org: 0,
      titleEn: "Addis Food & Music Festival",
      titleAm: "የአዲስ ምግብና ሙዚቃ ፌስቲቫል",
      descEn: "Food from every sub-city, three stages of music and a kids' corner. Family friendly.",
      descAm: "ከሁሉም ክፍለ ከተሞች ምግብ፣ ሦስት የሙዚቃ መድረኮችና የልጆች ቦታ። ለቤተሰብ ተስማሚ።",
      category: "festival",
      venue: "meskel",
      startsAt: addisAt(sat + 7, 11),
      hours: 10,
      lineup: ["Addis Brass", "Selam Beats", "Tizita Band"],
      featured: true,
      tiers: [
        { name: "Day pass", birr: 200, capacity: 3000, soldPct: 25 },
        { name: "VIP lounge", birr: 1800, capacity: 100, soldPct: 10 },
      ],
    },
    {
      slug: "startup-summit-addis",
      org: 1,
      titleEn: "Addis Startup Summit",
      titleAm: "የአዲስ ስታርትአፕ ጉባኤ",
      descEn: "Founders, investors and builders from across Ethiopia. Talks, demos and networking.",
      descAm: "ከመላው ኢትዮጵያ መሥራቾች፣ ባለሀብቶችና ገንቢዎች። ንግግሮች፣ ማሳያዎችና ትውውቅ።",
      category: "conference",
      venue: "millennium",
      startsAt: addisAt(sat + 12, 9),
      hours: 8,
      lineup: ["Keynote: Tech in Addis"],
      tiers: [
        { name: "Student", birr: 150, capacity: 300, soldPct: 20 },
        { name: "General", birr: 750, capacity: 800, soldPct: 15 },
      ],
    },
    {
      slug: "derby-watch-party",
      org: 0,
      titleEn: "Big Match Watch Party",
      titleAm: "የትልቁ ጨዋታ የጋራ እይታ",
      descEn: "Giant screen, loud crowd, cold drinks. Watch the derby together.",
      descAm: "ግዙፍ ስክሪን፣ ደማቅ ተመልካች፣ ቀዝቃዛ መጠጥ። ጨዋታውን አብረን እንይ።",
      category: "sports",
      venue: "stadium",
      startsAt: addisAt(sat + 3, 18),
      hours: 3,
      lineup: [],
      tiers: [{ name: "Entry", birr: 100, capacity: 1000, soldPct: 45 }],
    },
    {
      slug: "meskel-community-celebration",
      org: 1,
      titleEn: "Meskel Community Celebration",
      titleAm: "የመስቀል የማኅበረሰብ በዓል",
      descEn: "Demera, songs and coffee with the neighbourhood. Free entry, registration required.",
      descAm: "ደመራ፣ ዝማሬና ቡና ከሰፈሩ ጋር። መግቢያ ነፃ፣ ምዝገባ ያስፈልጋል።",
      category: "holiday",
      venue: "meskel",
      startsAt: addisAt(sat + 20, 16),
      hours: 5,
      lineup: [],
      tiers: [{ name: "Free registration", birr: 0, capacity: 2000, soldPct: 10 }],
    },
  ];

  const venueIds = new Map<string, string>();
  for (const v of venues) {
    const existing = await prisma.venue.findFirst({ where: { name: v.name } });
    const row = existing ?? (await prisma.venue.create({ data: { name: v.name, address: v.address, lat: v.lat, lng: v.lng } }));
    venueIds.set(v.key, row.id);
  }

  // Demo accounts are adults, so every seeded event can be bought (F22-AC8).
  const ADULT_BIRTH_DATE = new Date("1995-05-05T00:00:00Z");
  const user = async (phone: string, name: string, roles: ("buyer" | "organiser" | "admin")[]) =>
    prisma.user.upsert({
      where: { phone },
      update: { name, birthDate: ADULT_BIRTH_DATE },
      create: { phone, name, birthDate: ADULT_BIRTH_DATE, roles: { create: roles.map((role) => ({ role })) } },
    });

  const buyer = await user("+251911000001", "Hanna Tesfaye", ["buyer"]);
  const scanner = await user("+251911000002", "Gate Staff", ["buyer"]);
  const orgOwner = await user("+251911000003", "Dawit Alemu", ["buyer", "organiser"]);
  await user("+251911000004", "Dinkuan Admin", ["buyer", "admin"]);
  // A second moderator: appeals must be decided by someone other than the one who acted (F22-AC6).
  await user("+251911000008", "Trust & Safety", ["buyer", "admin"]);
  const orgOwner2 = await user("+251911000005", "Meron Bekele", ["buyer", "organiser"]);

  const orgs = [];
  for (const [owner, name] of [
    [orgOwner, "Addis Nights Entertainment"],
    [orgOwner2, "Habesha Live Events"],
  ] as const) {
    const existing = await prisma.organiser.findFirst({ where: { name } });
    const org =
      existing ??
      (await prisma.organiser.create({
        data: { ownerUserId: owner.id, name, type: "business", status: "approved", payoutMethod: "telebirr", payoutAccount: owner.phone },
      }));
    await prisma.organiserMember.upsert({
      where: { organiserId_userId: { organiserId: org.id, userId: scanner.id } },
      update: {},
      create: { organiserId: org.id, userId: scanner.id, role: "scanner" },
    });
    orgs.push(org);
  }

  for (const e of events) {
    const exists = await prisma.event.findUnique({ where: { slug: e.slug } });
    if (exists) {
      // Keep dates fresh on re-seed so Tonight / This weekend never go stale.
      await prisma.event.update({
        where: { id: exists.id },
        data: { startsAt: e.startsAt, endsAt: new Date(e.startsAt.getTime() + e.hours * 3600_000), status: "published" },
      });
      continue;
    }
    const privateKey = ed.utils.randomSecretKey();
    const publicKey = await ed.getPublicKeyAsync(privateKey);
    await prisma.event.create({
      data: {
        slug: e.slug,
        organiserId: orgs[e.org]!.id,
        titleEn: e.titleEn,
        titleAm: e.titleAm,
        descEn: e.descEn,
        descAm: e.descAm,
        category: e.category,
        posterUrl: `/posters/${e.slug}`,
        venueId: venueIds.get(e.venue)!,
        startsAt: e.startsAt,
        endsAt: new Date(e.startsAt.getTime() + e.hours * 3600_000),
        lineup: e.lineup,
        status: "published",
        featured: e.featured ?? false,
        signingPublicKey: b64url(publicKey),
        signingKey: { create: { privateKeyEncrypted: encrypt(privateKey) } },
        ticketTypes: {
          create: e.tiers.map((t, i) => ({
            name: t.name,
            priceSantim: t.birr * 100,
            capacity: t.capacity,
            // Pre-sold counts make the demo look like a live marketplace (no orders behind them).
            sold: Math.floor((t.capacity * (t.soldPct ?? 0)) / 100),
            sortOrder: i,
          })),
        },
      },
    });
  }
  // Admin queues (F12-AC1) are not empty in the demo: one application and one event to review.
  const newOwner = await user("+251911000006", "Selam Haile", ["buyer", "organiser"]);
  const applicant = await user("+251911000007", "Yonas Girma", ["buyer", "organiser"]);
  const newOrg =
    (await prisma.organiser.findFirst({ where: { name: "Arat Kilo Comedy Club" } })) ??
    (await prisma.organiser.create({
      data: { ownerUserId: newOwner.id, name: "Arat Kilo Comedy Club", type: "business", status: "approved", tin: "0045671234", payoutMethod: "telebirr", payoutAccount: newOwner.phone },
    }));
  if (!(await prisma.organiser.findFirst({ where: { ownerUserId: applicant.id } }))) {
    await prisma.organiser.create({
      data: {
        ownerUserId: applicant.id,
        name: "Entoto Adventures",
        type: "business",
        status: "submitted",
        submittedAt: new Date(),
        tin: "0098761234",
        payoutMethod: "bank",
        payoutAccount: "CBE 1000234567890",
      },
    });
  }
  const reviewSlug = "open-mic-arat-kilo";
  const reviewStart = addisAt(9, 19, 30);
  const inReview = await prisma.event.findUnique({ where: { slug: reviewSlug } });
  if (!inReview) {
    await prisma.event.create({
      data: {
        slug: reviewSlug,
        organiserId: newOrg.id,
        titleEn: "Open Mic Night",
        titleAm: "ክፍት መድረክ ምሽት",
        descEn: "Ten new comedians, five minutes each. Bring friends.",
        descAm: "አሥር አዲስ ኮሜዲያኖች፣ እያንዳንዳቸው አምስት ደቂቃ። ጓደኞችዎን ይዘው ይምጡ።",
        category: "comedy",
        posterUrl: `/posters/${reviewSlug}`,
        venueId: venueIds.get("fendika")!,
        startsAt: reviewStart,
        endsAt: new Date(reviewStart.getTime() + 3 * 3600_000),
        lineup: ["Selam Haile"],
        status: "pending_review",
        ticketTypes: { create: [{ name: "Regular", priceSantim: 200_00, capacity: 120, sortOrder: 0 }] },
      },
    });
  } else if (inReview.status === "pending_review") {
    await prisma.event.update({ where: { id: inReview.id }, data: { startsAt: reviewStart, endsAt: new Date(reviewStart.getTime() + 3 * 3600_000) } });
  }

  console.info(`Seeded ${venues.length} venues, ${orgs.length} organisers, ${events.length} events. Buyer: ${buyer.phone}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
