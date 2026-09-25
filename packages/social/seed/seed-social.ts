/**
 * Demo social seed (runs after packages/db's seed): Addis creators with profiles, follows,
 * interests, posts, placeholder reels, event Moments, reactions and comments, so the feed feels
 * alive for sponsor demos (PRD 8). Safe to re-run: it only adds what is missing, then moves the
 * seeded posts' dates forward so the feed never looks stale.
 *
 * All people here are fictional. Photos are generated artwork (/art) and reels are placeholder
 * clips (apps/web/public/seed/reels) until real Addis content is added.
 */
import { prisma, type PostType } from "@dinkuan/db";
import {
  addComment,
  ensureProfile,
  follow,
  react,
  refreshRank,
  REACTIONS,
  setInterests,
  syncTags,
  updateProfile,
  type InterestKey,
} from "../src";

type Person = {
  phone: string;
  name: string;
  username: string;
  displayName: string;
  bio: string;
  interests: InterestKey[];
  verified?: boolean;
  creator?: boolean;
  subCity?: string;
};

const CREATORS: Person[] = [
  { phone: "+251911100001", name: "Kaleb Tesfaye", username: "djkaleb", displayName: "DJ Kaleb", bio: "Afro house & amapiano from Bole. Rooftop every Friday 🌇", interests: ["music", "nightlife"], verified: true, creator: true, subCity: "Bole" },
  { phone: "+251911100002", name: "Selam Worku", username: "selam.beats", displayName: "ሰላም ቢትስ", bio: "ዲጄ · Ethio-electronic · የአዲስ ምሽቶች", interests: ["music", "nightlife"], creator: true, subCity: "Kazanchis" },
  { phone: "+251911100003", name: "Nahom Girma", username: "nahom.deep", displayName: "Nahom Deep", bio: "Deep house selector. Slow burns only.", interests: ["music", "nightlife"] },
  { phone: "+251911100004", name: "Meklit Haile", username: "meklit.jazz", displayName: "መክሊት", bio: "Ethio-jazz vocalist 🎷 Weekend sessions", interests: ["music", "art"], verified: true, creator: true, subCity: "Arada" },
  { phone: "+251911100005", name: "Tizita House", username: "tizita.azmari", displayName: "Tizita Azmari House", bio: "Azmari nights, masinko and good company · Kazanchis", interests: ["music", "nightlife"], subCity: "Kirkos" },
  { phone: "+251911100006", name: "Abel Mekonnen", username: "abel.laughs", displayName: "Abel Laughs", bio: "Stand-up in Amharic & English. Friday nights 🎤", interests: ["comedy"], creator: true },
  { phone: "+251911100007", name: "Hiwot Alemayehu", username: "hiwot.lens", displayName: "ሕይወት ሌንስ", bio: "Event photographer · Addis moments 📸", interests: ["art", "weddings", "nightlife"], verified: true, creator: true, subCity: "Yeka" },
  { phone: "+251911100008", name: "Run Addis", username: "runaddis", displayName: "Run Addis", bio: "Sunrise runs up Entoto every Saturday. All paces welcome 🏃🏾", interests: ["sports"], subCity: "Gullele" },
  { phone: "+251911100009", name: "Betelhem Assefa", username: "beti.eats", displayName: "Beti Eats", bio: "Finding the best beyaynetu, tibs and macchiato in Addis 🍲", interests: ["food"], creator: true, subCity: "Arada" },
  { phone: "+251911100010", name: "Liya Tadesse", username: "liya.weddings", displayName: "Liya Weddings", bio: "Wedding planner · melse & kelekel ideas 💍", interests: ["weddings", "art"] },
  { phone: "+251911100011", name: "Dawit Bekele", username: "eskista.dawit", displayName: "Dawit Eskista", bio: "Eskista teacher. Join the #EskistaChallenge 🕺🏾", interests: ["music", "art"], creator: true },
  { phone: "+251911100012", name: "Addis Art Walk", username: "addis.artwalk", displayName: "Addis Art Walk", bio: "Galleries and street art around Piassa, every first Sunday", interests: ["art"], subCity: "Arada" },
  { phone: "+251911100013", name: "Samuel Kebede", username: "sami.derby", displayName: "Sami ⚽", bio: "Derby days and watch parties", interests: ["sports", "nightlife"] },
  { phone: "+251911100014", name: "Rahel Getachew", username: "rahel.style", displayName: "ራሔል", bio: "Habesha kemis & street style ✨", interests: ["art", "weddings"], creator: true },
  { phone: "+251911100015", name: "Yonas Alemu", username: "yonas.builds", displayName: "Yonas", bio: "Startups and tech meetups in Addis", interests: [] },
  { phone: "+251911100016", name: "Tsion Mulugeta", username: "tsion.sings", displayName: "ፅዮን", bio: "Singer · classic Ethiopian covers 🎶", interests: ["music"], creator: true },
];

/** Demo accounts from packages/db's seed get profiles too. */
const DEMO: { phone: string; username: string; displayName: string; bio?: string; interests?: InterestKey[] }[] = [
  { phone: "+251911000001", username: "hanna.t", displayName: "Hanna Tesfaye", bio: "Weekend plans: live music and good coffee ☕", interests: ["music", "food", "comedy"] },
  { phone: "+251911000002", username: "gate.staff", displayName: "Gate Staff" },
  { phone: "+251911000003", username: "addisnights", displayName: "Addis Nights Entertainment", bio: "Organisers of rooftop nights, jazz weekends and more.", interests: ["nightlife", "music"] },
  { phone: "+251911000004", username: "demo.admin", displayName: "Dinkuan Team" },
  { phone: "+251911000005", username: "habesha.live", displayName: "Habesha Live Events", bio: "Comedy, culture and community events.", interests: ["comedy", "art"] },
];

type Media =
  | { art: string; text: string; palette: number; portrait?: boolean }
  | { reel: string };

type SeedPost = {
  by: string;
  type: PostType;
  caption: string;
  hoursAgo: number;
  event?: string;
  media?: Media[];
  reactions: number;
  views?: number;
  comments?: [string, string][];
  audience?: "public" | "followers";
};

const POSTS: SeedPost[] = [
  { by: "djkaleb", type: "reel", caption: "Tonight on the rooftop. Sunset set starts at 8 🌇 #AfroHouse #AddisNights", hoursAgo: 2, event: "afro-house-rooftop-tonight", media: [{ reel: "afro-house" }], reactions: 14, views: 4200, comments: [["hanna.t", "See you there! 🔥"], ["selam.beats", "Save me a spot by the decks"]] },
  { by: "hiwot.lens", type: "photo", caption: "Golden hour over Bole from last Friday's rooftop. Tag yourself if you were there 📸 #ድንኳን", hoursAgo: 5, event: "afro-house-rooftop-tonight", media: [{ art: "rooftop1", text: "Golden hour, Bole", palette: 0, portrait: true }, { art: "rooftop2", text: "Hands up", palette: 3, portrait: true }, { art: "rooftop3", text: "Last song", palette: 2, portrait: true }], reactions: 12, comments: [["djkaleb", "These are 🔥 thank you Hiwot"], ["rahel.style", "That light!"]] },
  { by: "meklit.jazz", type: "reel", caption: "Rehearsal for this weekend's Ethio-jazz sessions 🎷 Come early for the good seats. #EthioJazz", hoursAgo: 8, event: "addis-jazz-weekend", media: [{ reel: "ethio-jazz" }], reactions: 11, views: 3100, comments: [["tsion.sings", "ድምፅሽ ❤️"], ["hanna.t", "Got my tickets already!"]] },
  { by: "abel.laughs", type: "text", caption: "ታክሲ ውስጥ 'ወራጅ አለ' ስትል ሁሉም ሰው ወራጅ ሲሆን... 😂 Friday I'm telling the full story. #AddisComedy", hoursAgo: 3, event: "friday-comedy-night", reactions: 13, comments: [["sami.derby", "😂😂😂 every single time"], ["beti.eats", "I need the full story now"]] },
  { by: "eskista.dawit", type: "reel", caption: "#EskistaChallenge week 3! Shoulders only, no cheating 🕺🏾 Post yours and tag me.", hoursAgo: 11, media: [{ reel: "dance" }], reactions: 15, views: 5300, comments: [["rahel.style", "My shoulders are not ready"], ["liya.weddings", "Doing this at the next wedding"]] },
  { by: "beti.eats", type: "photo", caption: "Best beyaynetu under 200 Br in Piassa? This one. Fasting Wednesday sorted 🍲 #AddisFood", hoursAgo: 14, media: [{ art: "beyaynetu", text: "Beyaynetu, Piassa", palette: 4 }], reactions: 10, comments: [["hanna.t", "Where exactly? 👀"], ["beti.eats", "Behind the post office, ask for Emama"]] },
  { by: "runaddis", type: "reel", caption: "Saturday 6 AM. Entoto. Who's coming? Pace groups for everyone 🏃🏾‍♀️ #RunAddis", hoursAgo: 20, event: "entoto-sunrise-run", media: [{ reel: "entoto-run" }], reactions: 8, views: 1900, comments: [["sami.derby", "I'll be in the slow group 😅"]] },
  { by: "selam.beats", type: "text", caption: "New mix drops Friday. ትዝታ meets deep house. Who wants a preview? 🎧", hoursAgo: 26, reactions: 9, comments: [["nahom.deep", "Send it!"], ["djkaleb", "B2B soon?"]] },
  { by: "tizita.azmari", type: "reel", caption: "Masinko, poetry and a full house. Azmari night every Thursday ✨", hoursAgo: 30, media: [{ reel: "azmari" }], reactions: 12, views: 2700, comments: [["meklit.jazz", "Best night in Kazanchis"]] },
  { by: "rahel.style", type: "photo", caption: "Meskel looks: white, gold and a little green ✨ #HabeshaKemis #Meskel", hoursAgo: 34, event: "meskel-square-festival", media: [{ art: "kemis1", text: "Meskel looks", palette: 4, portrait: true }, { art: "kemis2", text: "Gold details", palette: 0, portrait: true }], reactions: 11, comments: [["liya.weddings", "Stunning 😍"], ["hiwot.lens", "Let's shoot this at the square"]] },
  { by: "liya.weddings", type: "photo", caption: "Kelekel decor ideas for small budgets 💍 Swipe for the table setup. #AddisWeddings", hoursAgo: 40, media: [{ art: "wed1", text: "Kelekel ideas", palette: 3 }, { art: "wed2", text: "Table setup", palette: 1 }], reactions: 7, comments: [["hanna.t", "Saving this for my sister"]] },
  { by: "sami.derby", type: "meme", caption: "Every derby, same story 😂", hoursAgo: 44, event: "derby-watch-party", media: [{ art: "meme-derby", text: "Me: calm. 89th minute: 😱", palette: 5 }], reactions: 9, comments: [["abel.laughs", "Too real"]] },
  { by: "addis.artwalk", type: "photo", caption: "First Sunday walk: 6 galleries, 2 murals and one very good macchiato. Meet at the Piassa roundabout, 10 AM. #AddisArt", hoursAgo: 50, media: [{ art: "art1", text: "Murals of Piassa", palette: 6 }, { art: "art2", text: "Gallery No. 3", palette: 2 }], reactions: 6 },
  { by: "meklit.jazz", type: "text", caption: "ቅዳሜ ምሽት ከባንዱ ጋር አዲስ ዘፈን እናቀርባለን። ማን ይመጣል? 🎶", hoursAgo: 56, event: "addis-jazz-weekend", reactions: 8, comments: [["tsion.sings", "እኔ! 🙋🏾‍♀️"]] },
  { by: "abel.laughs", type: "reel", caption: "Crowd work at last week's show 😂 Full set Friday. #AddisComedy", hoursAgo: 60, event: "friday-comedy-night", media: [{ reel: "comedy" }], reactions: 10, views: 2400, comments: [["hanna.t", "The guy in the front row 😭"]] },
  { by: "beti.eats", type: "reel", caption: "60 seconds of sizzling tibs. Sound on 🔊 #AddisFood", hoursAgo: 68, media: [{ reel: "food" }], reactions: 9, views: 2100, comments: [["sami.derby", "Now I'm hungry"]] },
  { by: "habesha.live", type: "reel", caption: "Demera, songs and coffee with the neighbourhood. Free entry, register in the app 🔥 #Meskel", hoursAgo: 72, event: "meskel-community-celebration", media: [{ reel: "meskel" }], reactions: 7, views: 1600 },
  { by: "hanna.t", type: "text", caption: "Weekend plan: jazz on Saturday, comedy on Friday, and Entoto if I wake up 😅 Who's in?", hoursAgo: 6, reactions: 5, comments: [["runaddis", "You'll wake up. We'll bring coffee ☕"], ["abel.laughs", "Front row is free for you"]] },
  { by: "hanna.t", type: "photo", caption: "Macchiato break between events ☕ #AddisCoffee", hoursAgo: 28, media: [{ art: "coffee", text: "Macchiato o'clock", palette: 7 }], reactions: 4 },
  { by: "nahom.deep", type: "text", caption: "Unpopular opinion: the best set of the night is always the 2 AM one.", hoursAgo: 36, reactions: 6, comments: [["djkaleb", "Correct."]] },
  { by: "tsion.sings", type: "text", caption: "Learning a classic this week. Guess the song from one line: 'ትዝታ...' 🎶", hoursAgo: 46, reactions: 7, comments: [["meklit.jazz", "Easy 😄"]] },
  { by: "yonas.builds", type: "text", caption: "Startup Summit Addis is coming. Looking for 3 founders to demo on stage. DM me. #AddisTech", hoursAgo: 52, event: "startup-summit-addis", reactions: 4 },
  { by: "addisnights", type: "photo", caption: "Tonight's rooftop is almost sold out. Early Bird gone, a few Regular left 🎟", hoursAgo: 4, event: "afro-house-rooftop-tonight", media: [{ art: "an-tonight", text: "Almost sold out", palette: 0 }], reactions: 6 },
  { by: "hiwot.lens", type: "text", caption: "Photographers: follow the light, not the crowd. Tips thread in the comments 👇", hoursAgo: 80, reactions: 5, comments: [["rahel.style", "Please do a workshop!"]], audience: "followers" },
];

/** Deterministic pseudo-random numbers so re-seeds pick the same people. */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function mediaFor(m: Media, i: number) {
  if ("reel" in m) {
    return {
      kind: "video" as const,
      url: `/seed/reels/${m.reel}.mp4`,
      lowUrl: `/seed/reels/${m.reel}-240.mp4`,
      thumbUrl: `/seed/reels/${m.reel}.jpg`,
      width: 540,
      height: 960,
      durationS: 8,
      orderIdx: i,
    };
  }
  const url = `/art/${m.art}?t=${encodeURIComponent(m.text)}&p=${m.palette}${m.portrait ? "&s=portrait" : ""}`;
  return { kind: "image" as const, url, lowUrl: null, thumbUrl: url, width: 1080, height: m.portrait ? 1350 : 1080, durationS: null, orderIdx: i };
}

async function userByPhone(phone: string, name: string) {
  return prisma.user.upsert({
    where: { phone },
    update: {},
    create: { phone, name, roles: { create: { role: "buyer" } } },
  });
}

async function main() {
  const ids = new Map<string, string>();

  for (const p of CREATORS) {
    const user = await userByPhone(p.phone, p.name);
    await ensureProfile(user.id);
    await prisma.profile.update({
      where: { userId: user.id },
      data: {
        username: p.username,
        displayName: p.displayName,
        bio: p.bio,
        subCity: p.subCity ?? null,
        isVerified: !!p.verified,
        creatorMode: !!p.creator,
        onboarded: true,
      },
    });
    await setInterests(user.id, p.interests);
    ids.set(p.username, user.id);
  }
  for (const d of DEMO) {
    const user = await prisma.user.findUnique({ where: { phone: d.phone } });
    if (!user) continue;
    const profile = await ensureProfile(user.id);
    if (profile.username !== d.username) {
      const taken = await prisma.profile.findUnique({ where: { username: d.username } });
      if (!taken) await updateProfile(user.id, { username: d.username });
    }
    await prisma.profile.update({ where: { userId: user.id }, data: { displayName: d.displayName, bio: d.bio ?? null, onboarded: true } });
    if (d.interests) await setInterests(user.id, d.interests);
    ids.set(d.username, user.id);
  }

  const already = await prisma.post.count({ where: { authorId: ids.get("djkaleb")! } });
  if (already === 0) {
    const everyone = [...ids.entries()].filter(([u]) => u !== "gate.staff" && u !== "demo.admin").map(([, id]) => id);
    const rand = rng(42);

    // Follows: creators follow each other a bit; Hanna follows a handful; everyone follows the organisers.
    for (const a of everyone) {
      for (const b of everyone) {
        if (a !== b && rand() < 0.35) await follow(a, b);
      }
    }
    for (const u of ["djkaleb", "meklit.jazz", "abel.laughs", "beti.eats", "hiwot.lens", "runaddis", "addisnights"]) {
      await follow(ids.get("hanna.t")!, ids.get(u)!);
    }
    // A popular creator: most people follow DJ Kaleb and Meklit.
    for (const a of everyone) {
      for (const star of ["djkaleb", "meklit.jazz"]) if (a !== ids.get(star)) await follow(a, ids.get(star)!);
    }

    const events = new Map((await prisma.event.findMany({ select: { id: true, slug: true, venueId: true } })).map((e) => [e.slug, e]));
    const now = Date.now();
    for (const p of POSTS) {
      const authorId = ids.get(p.by);
      if (!authorId) continue;
      const event = p.event ? events.get(p.event) : undefined;
      const post = await prisma.$transaction(async (tx) => {
        const created = await tx.post.create({
          data: {
            authorId,
            type: p.type,
            caption: p.caption,
            audience: p.audience ?? "public",
            eventId: event?.id ?? null,
            venueId: event?.venueId ?? null,
            status: "public",
            createdAt: new Date(now - p.hoursAgo * 3600_000),
            viewCount: p.views ?? 0,
            completions: Math.round((p.views ?? 0) * 0.35),
            media: { create: (p.media ?? []).map(mediaFor) },
          },
        });
        await syncTags(tx, created.id, authorId, p.caption);
        await tx.profile.update({ where: { userId: authorId }, data: { postsCount: { increment: 1 } } });
        return created;
      });
      const fans = everyone.filter((id) => id !== authorId).sort(() => rand() - 0.5).slice(0, p.reactions);
      for (const [i, fan] of fans.entries()) {
        await react(fan, post.id, i % 3 === 0 ? REACTIONS[1 + Math.floor(rand() * (REACTIONS.length - 1))]! : "like").catch(() => undefined);
      }
      for (const [username, body] of p.comments ?? []) {
        const commenter = ids.get(username);
        if (commenter) await addComment(commenter, post.id, body).catch(() => undefined);
      }
      await refreshRank(prisma, post.id);
    }
    console.log(`Seeded ${POSTS.length} posts from ${CREATORS.length} creators.`);
  } else {
    // Keep the demo feed fresh: move seeded posts forward so the newest is about an hour old.
    const seededAuthors = [...ids.values()];
    const newest = await prisma.post.findFirst({ where: { authorId: { in: seededAuthors } }, orderBy: { createdAt: "desc" } });
    const shift = newest ? Date.now() - 3600_000 - newest.createdAt.getTime() : 0;
    if (shift > 6 * 3600_000) {
      await prisma.$executeRaw`
        UPDATE posts SET created_at = created_at + make_interval(secs => ${shift / 1000})
        WHERE author_id = ANY(${seededAuthors}::uuid[])`;
      const posts = await prisma.post.findMany({ where: { authorId: { in: seededAuthors } }, select: { id: true } });
      for (const p of posts) await refreshRank(prisma, p.id);
      console.log(`Moved ${posts.length} demo posts forward by ${Math.round(shift / 3600_000)} hours.`);
    } else {
      console.log("Social demo data already present.");
    }
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
