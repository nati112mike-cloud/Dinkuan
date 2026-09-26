/**
 * Demo marketplace seed (runs after the social seed): pro profiles for some Addis creators plus
 * a few new vendors, with packages, portfolio albums, stage credits, blocked dates and read-only
 * reviews, so Hire search, compare and pro profiles have something real-looking to show (PRD 8).
 * Safe to re-run: vendors that already have a pro profile are left alone.
 *
 * All people here are fictional. Photos are generated artwork (/art) and placeholder reel frames.
 */
import { prisma } from "@dinkuan/db";
import { ensureProfile, setInterests } from "@dinkuan/social";
import { addisToday, refreshVendorStats, savePackages, saveVendorProfile, setBlockedDates, type PackageInput, type VendorInput } from "../src";

type SeedVendor = {
  username: string;
  /** New accounts only; existing creators come from the social seed. */
  create?: { phone: string; name: string; displayName: string; bio: string; subCity: string };
  profile: VendorInput;
  packages: PackageInput[];
  albums: { title: string; event?: string; verified?: boolean; art: [string, string, number][] }[];
  credits: { name: string; event?: string }[];
  rating: { avg: number; count: number; bookings: number; replyMin: number };
  /** Days from today that are already taken. */
  blocked: number[];
};

const birr = (n: number) => n * 100;

const VENDORS: SeedVendor[] = [
  {
    username: "djkaleb",
    profile: {
      types: ["dj"],
      headline: "Afro house, amapiano and wedding sets",
      about: "Eight years behind the decks, from Bole rooftops to 600-guest weddings. I read the room: Ethiopian classics for the elders, amapiano when the young ones take over.",
      yearsExperience: 8,
      services: ["Weddings", "Rooftop parties", "Corporate nights", "Birthdays"],
      genres: ["Afro house", "Amapiano", "Ethio pop", "Hip hop"],
      languages: ["Amharic", "English"],
      areas: ["Bole", "Kirkos", "Yeka"],
      equipment: ["Pioneer XDJ-XZ", "2 × 1000 W speakers", "Wireless mic", "LED uplights"],
      teamSize: 2,
      socialLinks: ["https://instagram.com/djkaleb.demo"],
      coverUrl: "/seed/reels/afro-house.jpg",
    },
    packages: [
      { tier: "basic", name: "Party set", priceSantim: birr(8000), hours: 3, includes: ["DJ set", "Your playlist requests"], addons: [{ name: "Extra hour", priceSantim: birr(2000) }] },
      { tier: "standard", name: "Wedding classic", priceSantim: birr(15000), hours: 5, includes: ["DJ set", "Sound system for 200", "Wireless mic for speeches"], addons: [{ name: "Extra hour", priceSantim: birr(2500) }, { name: "Uplighting", priceSantim: birr(3000) }] },
      { tier: "premium", name: "Full night", priceSantim: birr(28000), hours: 8, includes: ["DJ + MC", "Sound for 500", "Lighting", "Smoke machine"], addons: [{ name: "Second venue setup", priceSantim: birr(6000) }] },
    ],
    albums: [
      { title: "Rooftop Fridays", event: "afro-house-rooftop-tonight", verified: true, art: [["kaleb1", "Rooftop Fridays", 0], ["kaleb2", "Hands up", 3], ["kaleb3", "Sunset set", 2]] },
      { title: "Selam and Dawit's wedding", art: [["kaleb4", "First dance", 4], ["kaleb5", "Eskista time", 1]] },
    ],
    credits: [{ name: "Afro House Rooftop · Bole", event: "afro-house-rooftop-tonight" }, { name: "Skylight Hotel New Year 2025" }, { name: "Addis Music Week 2024" }],
    rating: { avg: 480, count: 23, bookings: 31, replyMin: 12 },
    blocked: [2, 5, 9, 12],
  },
  {
    username: "selam.beats",
    profile: {
      types: ["dj"],
      headline: "Ethio-electronic DJ for modern weddings",
      about: "ትዝታ meets deep house. I blend Ethiopian classics with electronic beats for weddings and lounges that want something different.",
      yearsExperience: 5,
      services: ["Weddings", "Lounges", "Fashion shows"],
      genres: ["Ethio-electronic", "Deep house", "Ethio jazz"],
      languages: ["Amharic", "English"],
      areas: ["Kirkos", "Arada", "Bole"],
      equipment: ["Traktor S4", "Monitor speakers"],
      teamSize: 1,
      socialLinks: [],
      coverUrl: "/seed/reels/ethio-jazz.jpg",
    },
    packages: [
      { tier: "basic", name: "Lounge set", priceSantim: birr(6000), hours: 3, includes: ["DJ set"], addons: [] },
      { tier: "standard", name: "Wedding set", priceSantim: birr(12000), hours: 5, includes: ["DJ set", "Sound for 150", "Mic"], addons: [{ name: "Extra hour", priceSantim: birr(2000) }] },
    ],
    albums: [{ title: "Lounge nights", art: [["selam1", "Kazanchis lounge", 5], ["selam2", "Deep and slow", 6]] }],
    credits: [{ name: "Kuriftu Lounge · monthly residency" }],
    rating: { avg: 460, count: 11, bookings: 14, replyMin: 25 },
    blocked: [3, 10],
  },
  {
    username: "nahom.deep",
    profile: {
      types: ["dj"],
      headline: "Deep house selector for late nights",
      yearsExperience: 3,
      services: ["Club nights", "Private parties"],
      genres: ["Deep house", "Techno"],
      languages: ["Amharic", "English"],
      areas: ["Bole", "Yeka"],
      equipment: [],
      teamSize: 1,
      socialLinks: [],
    },
    packages: [{ tier: "basic", name: "Club set", priceSantim: birr(4500), hours: 4, includes: ["DJ set", "Bring your own sound"], addons: [] }],
    albums: [],
    credits: [],
    rating: { avg: 0, count: 0, bookings: 2, replyMin: 90 },
    blocked: [],
  },
  {
    username: "dj.mahi",
    create: { phone: "+251911200001", name: "Mahlet Yohannes", displayName: "DJ Mahi", bio: "Wedding and graduation DJ · Ethio pop and hits", subCity: "Lideta" },
    profile: {
      types: ["dj", "mc"],
      headline: "DJ and MC for weddings and graduations",
      about: "I host and play. One booking, one person who keeps the program on time and the dance floor full.",
      yearsExperience: 6,
      services: ["Weddings", "Graduations", "Engagements"],
      genres: ["Ethio pop", "Hits", "Afrobeats"],
      languages: ["Amharic", "English", "Afaan Oromo"],
      areas: ["Lideta", "Kolfe Keranio", "Nifas Silk-Lafto"],
      equipment: ["Full sound for 300", "2 wireless mics"],
      teamSize: 2,
      socialLinks: [],
    },
    packages: [
      { tier: "basic", name: "Graduation party", priceSantim: birr(7000), hours: 4, includes: ["DJ set", "Sound for 100"], addons: [] },
      { tier: "standard", name: "Wedding DJ + MC", priceSantim: birr(18000), hours: 6, includes: ["DJ + MC", "Program planning", "Sound for 300"], addons: [{ name: "Extra hour", priceSantim: birr(2500) }] },
    ],
    albums: [{ title: "Graduation season", art: [["mahi1", "Class of 2016 E.C.", 1], ["mahi2", "Caps off", 4]] }],
    credits: [{ name: "AAU graduation party 2024" }],
    rating: { avg: 470, count: 17, bookings: 22, replyMin: 18 },
    blocked: [1, 5, 6],
  },
  {
    username: "hiwot.lens",
    profile: {
      types: ["photographer"],
      headline: "Event and wedding photographer",
      about: "I follow the light, not the crowd. Natural, candid photos delivered in 7 days.",
      yearsExperience: 7,
      services: ["Weddings", "Events", "Portraits"],
      genres: [],
      languages: ["Amharic", "English"],
      areas: ["Yeka", "Bole", "Arada", "Kirkos"],
      equipment: ["Two full-frame bodies", "Off-camera flash"],
      teamSize: 2,
      socialLinks: [],
      coverUrl: "/art/hiwot-cover?t=Addis%20moments&p=2",
    },
    packages: [
      { tier: "basic", name: "Event coverage", priceSantim: birr(9000), hours: 4, includes: ["150+ edited photos", "Online gallery"], addons: [] },
      { tier: "standard", name: "Wedding day", priceSantim: birr(25000), hours: 10, includes: ["2 photographers", "400+ edited photos", "Online gallery"], addons: [{ name: "Printed album", priceSantim: birr(6000) }] },
      { tier: "premium", name: "Wedding + melse", priceSantim: birr(42000), hours: 16, includes: ["Two days", "2 photographers", "600+ photos", "Printed album"], addons: [] },
    ],
    albums: [
      { title: "Rooftop golden hour", event: "afro-house-rooftop-tonight", verified: true, art: [["hiwot1", "Golden hour, Bole", 0], ["hiwot2", "Last song", 2]] },
      { title: "Meskel colours", art: [["hiwot3", "Demera", 4], ["hiwot4", "Crowd at dusk", 3]] },
    ],
    credits: [{ name: "Afro House Rooftop · Bole", event: "afro-house-rooftop-tonight" }],
    rating: { avg: 490, count: 28, bookings: 35, replyMin: 30 },
    blocked: [4, 11],
  },
  {
    username: "liya.weddings",
    profile: {
      types: ["planner", "decor"],
      headline: "Wedding planner for small budgets",
      yearsExperience: 4,
      services: ["Full planning", "Day-of coordination", "Kelekel decor"],
      genres: [],
      languages: ["Amharic"],
      areas: ["Bole", "Kirkos", "Arada"],
      equipment: [],
      teamSize: 4,
      socialLinks: [],
    },
    packages: [
      { tier: "basic", name: "Day-of coordination", priceSantim: birr(10000), hours: 12, includes: ["Timeline", "Vendor calls on the day"], addons: [] },
      { tier: "standard", name: "Full planning", priceSantim: birr(35000), hours: 40, includes: ["Venue search", "Vendor booking", "Budget plan", "Day-of team"], addons: [] },
    ],
    albums: [{ title: "Kelekel tables", art: [["liya1", "Kelekel ideas", 3], ["liya2", "Table setup", 1]] }],
    credits: [],
    rating: { avg: 450, count: 6, bookings: 8, replyMin: 45 },
    blocked: [5],
  },
  {
    username: "tizita.azmari",
    profile: {
      types: ["band"],
      headline: "Azmari band for weddings and cultural nights",
      yearsExperience: 12,
      services: ["Weddings", "Cultural nights", "Corporate dinners"],
      genres: ["Azmari", "Traditional"],
      languages: ["Amharic", "Tigrinya"],
      areas: ["Kirkos", "Arada"],
      equipment: ["Masinko", "Kebero", "Krar", "Small PA"],
      teamSize: 4,
      socialLinks: [],
      coverUrl: "/seed/reels/azmari.jpg",
    },
    packages: [
      { tier: "basic", name: "Duo", priceSantim: birr(9000), hours: 3, includes: ["Masinko + singer"], addons: [] },
      { tier: "standard", name: "Full band", priceSantim: birr(20000), hours: 4, includes: ["4 musicians", "Small PA"], addons: [{ name: "Dancers (2)", priceSantim: birr(5000) }] },
    ],
    albums: [{ title: "Thursday azmari nights", art: [["tizita1", "Masinko nights", 5]] }],
    credits: [{ name: "Fendika · Thursday nights" }],
    rating: { avg: 470, count: 9, bookings: 12, replyMin: 60 },
    blocked: [],
  },
  {
    username: "tsion.sings",
    profile: {
      types: ["band"],
      headline: "Singer · classic Ethiopian covers",
      yearsExperience: 3,
      services: ["Weddings", "Dinners"],
      genres: ["Ethio classics", "Ethio jazz"],
      languages: ["Amharic", "English"],
      areas: ["Arada", "Gullele"],
      equipment: [],
      teamSize: 1,
      socialLinks: [],
    },
    packages: [{ tier: "basic", name: "Acoustic set", priceSantim: birr(5000), hours: 2, includes: ["Singer + guitarist"], addons: [] }],
    albums: [],
    credits: [],
    rating: { avg: 0, count: 0, bookings: 1, replyMin: 40 },
    blocked: [],
  },
  {
    username: "yared.films",
    create: { phone: "+251911200002", name: "Yared Tadesse", displayName: "Yared Films", bio: "Wedding films and event recaps 🎥", subCity: "Bole" },
    profile: {
      types: ["videographer"],
      headline: "Wedding films and event recap reels",
      yearsExperience: 5,
      services: ["Wedding films", "Event recaps", "Drone"],
      genres: [],
      languages: ["Amharic", "English"],
      areas: ["Bole", "Yeka", "Kirkos"],
      equipment: ["Cinema camera", "Gimbal", "Drone"],
      teamSize: 3,
      socialLinks: [],
      coverUrl: "/seed/reels/dance.jpg",
    },
    packages: [
      { tier: "basic", name: "Recap reel", priceSantim: birr(8000), hours: 4, includes: ["60-second reel", "Delivered in 3 days"], addons: [] },
      { tier: "standard", name: "Wedding film", priceSantim: birr(30000), hours: 10, includes: ["10-minute film", "Recap reel", "Drone shots"], addons: [{ name: "Same-day edit", priceSantim: birr(8000) }] },
    ],
    albums: [{ title: "Recap reels", art: [["yared1", "Wedding recap", 2], ["yared2", "Drone over Entoto", 6]] }],
    credits: [],
    rating: { avg: 460, count: 7, bookings: 9, replyMin: 35 },
    blocked: [5, 6],
  },
  {
    username: "mc.dawit",
    create: { phone: "+251911200003", name: "Dawit Haile", displayName: "MC Dawit", bio: "Bilingual MC · weddings, launches and galas", subCity: "Kirkos" },
    profile: {
      types: ["mc"],
      headline: "Bilingual MC for weddings and galas",
      yearsExperience: 9,
      services: ["Weddings", "Product launches", "Galas"],
      genres: [],
      languages: ["Amharic", "English"],
      areas: ["Kirkos", "Bole", "Arada"],
      equipment: [],
      teamSize: 1,
      socialLinks: [],
    },
    packages: [{ tier: "standard", name: "Event MC", priceSantim: birr(12000), hours: 5, includes: ["Program planning call", "Bilingual hosting"], addons: [] }],
    albums: [],
    credits: [{ name: "Addis Startup Summit 2024" }],
    rating: { avg: 480, count: 12, bookings: 15, replyMin: 20 },
    blocked: [5],
  },
  {
    username: "addis.sound",
    create: { phone: "+251911200004", name: "Addis Sound & Light", displayName: "Addis Sound & Light", bio: "Sound, stage and lighting rental with crew", subCity: "Nifas Silk-Lafto" },
    profile: {
      types: ["sound_lighting"],
      headline: "Sound, stage and lighting with crew",
      yearsExperience: 10,
      services: ["Sound rental", "Stage", "Lighting", "Generators"],
      genres: [],
      languages: ["Amharic", "English"],
      areas: ["Nifas Silk-Lafto", "Bole", "Akaky Kaliti", "Kirkos"],
      equipment: ["Line array for 1000", "Moving heads", "LED wall 3×2 m", "30 kVA generator"],
      teamSize: 8,
      socialLinks: [],
    },
    packages: [
      { tier: "basic", name: "Sound for 200", priceSantim: birr(10000), hours: 8, includes: ["Speakers", "Mixer", "2 mics", "Technician"], addons: [] },
      { tier: "premium", name: "Concert stage", priceSantim: birr(90000), hours: 12, includes: ["Line array", "Stage 8×6 m", "Lighting rig", "Crew of 6"], addons: [{ name: "LED wall", priceSantim: birr(25000) }] },
    ],
    albums: [],
    credits: [{ name: "Meskel Square Festival", event: "meskel-square-festival" }],
    rating: { avg: 440, count: 5, bookings: 20, replyMin: 50 },
    blocked: [],
  },
  {
    username: "beza.glam",
    create: { phone: "+251911200005", name: "Bezawit Kassa", displayName: "Beza Glam", bio: "Bridal makeup and hair · home visits", subCity: "Yeka" },
    profile: {
      types: ["makeup"],
      headline: "Bridal makeup and hair, home visits",
      yearsExperience: 4,
      services: ["Bridal makeup", "Hair", "Bridesmaids"],
      genres: [],
      languages: ["Amharic"],
      areas: ["Yeka", "Bole", "Kirkos"],
      equipment: [],
      teamSize: 3,
      socialLinks: [],
    },
    packages: [
      { tier: "basic", name: "Bride only", priceSantim: birr(6000), hours: 3, includes: ["Makeup", "Hair"], addons: [{ name: "Each bridesmaid", priceSantim: birr(1500) }] },
    ],
    albums: [{ title: "Brides of 2016 E.C.", art: [["beza1", "Bridal glow", 4]] }],
    credits: [],
    rating: { avg: 490, count: 14, bookings: 18, replyMin: 15 },
    blocked: [5, 12],
  },
];

const REVIEWS: [string, number, string][] = [
  ["hanna.t", 5, "Kept the dance floor full all night. Guests are still talking about it."],
  ["rahel.style", 5, "On time, professional and great with the elders' requests too."],
  ["sami.derby", 4, "Great vibe. Setup took a bit longer than planned."],
  ["beti.eats", 5, "Exactly what we asked for. Would book again."],
];

async function main() {
  const events = new Map((await prisma.event.findMany({ select: { id: true, slug: true, startsAt: true } })).map((e) => [e.slug, e]));
  const today = addisToday();
  let created = 0;

  for (const v of VENDORS) {
    let profile = await prisma.profile.findUnique({ where: { username: v.username } });
    if (!profile && v.create) {
      const c = v.create;
      const user = await prisma.user.upsert({
        where: { phone: c.phone },
        update: {},
        create: { phone: c.phone, name: c.name, roles: { create: { role: "buyer" } } },
      });
      await ensureProfile(user.id);
      profile = await prisma.profile.update({
        where: { userId: user.id },
        data: { username: v.username, displayName: c.displayName, bio: c.bio, subCity: c.subCity, creatorMode: true, onboarded: true },
      });
      await setInterests(user.id, ["weddings", "music"]);
    }
    if (!profile) continue;
    const vendorId = profile.userId;
    if (await prisma.vendorProfile.findUnique({ where: { userId: vendorId } })) continue;

    await saveVendorProfile(vendorId, v.profile);
    await savePackages(vendorId, v.packages);
    for (const a of v.albums) {
      const event = a.event ? events.get(a.event) : undefined;
      const items = a.art.map(([key, text, palette], i) => {
        const url = `/art/${key}?t=${encodeURIComponent(text)}&p=${palette}`;
        return { kind: "image" as const, url, thumbUrl: url, width: 1080, height: 1080, orderIdx: i };
      });
      await prisma.portfolioAlbum.create({
        data: {
          vendorId,
          title: a.title,
          eventId: event?.id ?? null,
          gigStatus: event ? (a.verified ? "verified" : "pending") : "none",
          coverUrl: items[0]?.url ?? null,
          items: { create: items },
        },
      });
    }
    for (const c of v.credits) {
      const event = c.event ? events.get(c.event) : undefined;
      await prisma.stageCredit.create({
        data: { vendorId, name: c.name, eventId: event?.id ?? null, date: event?.startsAt ?? null, verified: !!event },
      });
    }
    // Read-only demo reviews (writing reviews comes with deposits in Phase 2).
    const reviewers = await prisma.profile.findMany({ where: { username: { in: REVIEWS.map((r) => r[0]) } } });
    for (const [i, [username, stars, body]] of REVIEWS.slice(0, Math.min(REVIEWS.length, v.rating.count)).entries()) {
      const client = reviewers.find((r) => r.username === username);
      if (!client || client.userId === vendorId) continue;
      await prisma.review.create({
        data: {
          clientId: client.userId,
          vendorId,
          stars,
          punctuality: stars,
          quality: stars,
          value: Math.max(3, stars - (i % 2)),
          communication: stars,
          body,
          vendorReply: i === 0 ? "Thank you! It was a pleasure 🙏" : null,
          createdAt: new Date(Date.now() - (i + 1) * 12 * 86400_000),
        },
      });
    }
    // Demo track record, standing in for bookings made before Dinkuan.
    await prisma.vendorProfile.update({
      where: { userId: vendorId },
      data: {
        ratingAvg: v.rating.avg,
        ratingCount: v.rating.count,
        bookingsCount: v.rating.bookings,
        requestsCount: v.rating.bookings + 4,
        repliedCount: v.rating.bookings + 3,
        responseTimeMin: v.rating.replyMin,
      },
    });
    await refreshVendorStats(prisma, vendorId);
    if (v.blocked.length) {
      const base = new Date(`${today}T00:00:00.000Z`).getTime();
      await setBlockedDates(vendorId, { block: v.blocked.map((d) => new Date(base + d * 86400_000).toISOString().slice(0, 10)) });
    }
    created += 1;
  }
  console.log(created ? `Seeded ${created} pro profiles.` : "Marketplace demo data already present.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
