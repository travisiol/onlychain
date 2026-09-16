import "server-only";
import { parseUnits } from "viem";
import { db, getMeta, setMeta } from "@/lib/server/db";
import { insertComment, insertMedia, insertMessage, insertPost, newId, setLike, updateProfile, ensureProfile } from "@/lib/server/store";
import personas from "@/lib/seed/personas.json";
import { site } from "@/lib/site";
import type { PostAccess } from "@/lib/model";

/**
 * Ten invented creators with eight posts each, four fans who like and
 * comment, and a few messages — enough for the shell to look inhabited.
 * Faces are StyleGAN people who do not exist (thispersondoesnotexist.com,
 * adults only, cropped), banners and photo posts are Lorem Picsum
 * placeholders, the rest is the generated SVG art — all under public/seed
 * (`seed:` paths). Every row carries `sample = 1` and the UI chips it
 * "Sample". ONLYCHAIN_NO_SEED=1 skips all of it. Bumping SEED_VERSION
 * replaces the sample rows on the next start (real rows are never touched).
 *
 * Their subscription plans live on the chain: chain/scripts/seed-local.ts
 * sets the same prices for the same addresses on the local node.
 */

const DAY = 86_400_000;
const HOUR = 3_600_000;

type Persona = (typeof personas.creators)[number];

const CAPTIONS: Record<string, string[]> = {
  Fitness: [
    "Morning flow, day 12 of the mobility program. Hips first, always. Full 40-minute session below.",
    "The one stretch I do before every single session. Free for everyone — try it tonight.",
    "New 30-day program drops Monday. Subscribers get the full PDF and the follow-along videos.",
    "Behind the scenes of filming the shoulder series. Three takes, one coffee, zero warm-up (do as I say…).",
    "Q&A from your DMs: hamstrings, sleep, and why I stopped counting calories.",
    "Recovery day. This is what my actual routine looks like when nobody's filming.",
    "Handstand progress, month four. Still falling. Still filming it.",
    "Full-length session: 55 minutes, no cuts, no music. Just the work.",
  ],
  Cosplay: [
    "Armor build, part 3 — the pauldrons finally hold. Pattern files attached for subscribers.",
    "Con recap! Thank you to everyone who stopped by. Outtakes and the mess in the hotel room below.",
    "Testing the LED wiring at 2 a.m. It works. I'm going to bed.",
    "Full photoset from Saturday's shoot — 46 photos, unedited RAWs for subscribers.",
    "Vlog: sourcing fabric for the next build. The one shop that had exactly the right satin.",
    "Live paint session tonight at 9 — bring questions about weathering.",
    "The wig. Three days of styling. Worth it.",
    "Pattern drop: the full cape, all sizes, with the seam notes I wish I'd had.",
  ],
  Art: [
    "Finished piece of the week. You voted for the lighthouse — here it is, with the full process video.",
    "Sketchbook Sunday. Twenty thumbnails, one idea worth keeping.",
    "Brush pack v3 is out for subscribers — 18 brushes, textures included.",
    "Speedpaint, 40 minutes, no reference. Trying to loosen up.",
    "The PSD of last week's piece, every layer intact. Take it apart.",
    "Colour studies from the trip. Free — take what you like.",
    "Commission reveal (with permission). Two months of work, one very patient client.",
    "Live tomorrow: I'll paint your suggestions from the comments.",
  ],
  Fashion: [
    "Lookbook 07 — before it goes anywhere else. Twelve outfits, all thrifted, all under 60.",
    "Fitting-room chaos, unfiltered. Nine tries, two keepers.",
    "Try-on on request: the oversized blazer everyone asked about.",
    "How I plan a week of outfits in ten minutes. Free for everyone.",
    "Thrift haul, part 2 — the coat. THE coat.",
    "Styling one white shirt five ways. The fifth one is the one.",
    "Behind the shoot: how the lookbook photos actually get made (badly, then well).",
    "The full autumn edit — 30 pieces, links and alternatives for subscribers.",
  ],
  Food: [
    "Sunday ragù — the real quantities, the real timing, the pot I've used for eleven years.",
    "Weekly live cook tonight: gnocchi from scratch. Have 1 kg of potatoes ready.",
    "The dish that never made the menu. Now it's yours.",
    "Knife skills, five minutes, free. Start here.",
    "Bread, day three of the sourdough diary. It's alive.",
    "Full recipe: the lemon tart. Pastry included, no shortcuts.",
    "Market run and what I bought. The tomatoes decided dinner.",
    "Ask me anything from the comments — answered in tonight's video.",
  ],
  Music: [
    "Unreleased: the track I've been closing every set with. Stems for subscribers.",
    "Full set from the booth, Saturday night. Two hours, warm room.",
    "Production breakdown: how the drop in 'Midnight' actually works.",
    "Free download — a loop pack from this month's sessions.",
    "Studio day. New synth, same coffee.",
    "The ID everyone keeps asking about. Here it is, finally.",
    "Rehearsing the live set. Cables everywhere.",
    "Mix session, raw. What a track sounds like before it's finished.",
  ],
  Travel: [
    "Country 41. The RAWs and the preset from this morning's light, for subscribers.",
    "The place I don't post anywhere public. You know why.",
    "Preset pack: 'Coast' — 12 presets, mobile and desktop.",
    "Free wallpaper set from last week. Take them.",
    "How I pack for six weeks in one bag. The list.",
    "Golden hour, day 3. Waited two hours for these four minutes.",
    "Unedited vs edited — the before and afters from the mountain set.",
    "Route notes for the trip, with the guesthouse I'd go back to.",
  ],
  Photography: [
    "Street set from Thursday. The full shoot is pay-per-view; here's the one I love most.",
    "Free page, open feed — the full sets are PPV. This one's on me.",
    "Model shoot, studio light only. 32 frames, unlocked below.",
    "Contact sheet from the night walk. Pick your favourite in the comments.",
    "The full shoot from the rooftop — 40 frames.",
    "Editing walkthrough: how I get the colours. Free.",
    "The winter series, complete. 28 frames.",
    "Behind the shoot: how the rooftop set came together.",
  ],
  ASMR: [
    "Friday trigger set — 60 minutes, new mics. Headphones.",
    "Sleep session, long-form: 2 hours, rain, no talking.",
    "Personal audio requests open this week for subscribers. Tell me your name in the DMs.",
    "Free 10-minute wind-down. Try it tonight.",
    "The new setup. Two mics, one very quiet room.",
    "Whispered reading, chapter three.",
    "Answering your questions, softly.",
    "Full-length: the 90-minute tapping session you asked for.",
  ],
  Gaming: [
    "Subscriber-only run: new PB attempt, full VOD. It did not go well. It went great.",
    "Route notes for the any% category — the skip that saves 40 seconds.",
    "Free: the first hour of Saturday's stream, for everyone.",
    "Setup tour. Yes, that's a lot of monitors.",
    "The VOD that never hit the channel. You'll see why.",
    "Practice session, no commentary, just splits.",
    "Community race tonight — join in the Discord, subscribers get the seed early.",
    "Reacting to my first ever run. Painful.",
  ],
};

const COMMENTS = [
  "This is exactly what I needed today.",
  "Subscribed for this. Worth it.",
  "How long did this take?",
  "The last one is my favourite.",
  "Can you do a follow-up on this?",
  "Saved. Thank you!",
  "Incredible as always.",
  "Paid in ONLY, felt good.",
  "More of this please.",
  "First!",
];

/** Access pattern per creator: a free page is mostly free + PPV; a paid page is mostly subscribers-only with a free teaser. */
function accessFor(p: Persona, i: number): { access: PostAccess; price: string } {
  const free = p.monthlyPrice === "0";
  if (free) {
    if (i % 3 === 1) return { access: "ppv", price: parseUnits(String(12 + (i % 3) * 4), site.token.decimals).toString() };
    return { access: "free", price: "0" };
  }
  if (i === 1 || i === 5) return { access: "free", price: "0" };
  if (i === 7) return { access: "ppv", price: parseUnits(String(Number(p.monthlyPrice) * 2), site.token.decimals).toString() };
  return { access: "subscribers", price: "0" };
}

const SEED_VERSION = "3";

function seedMedia(owner: string, file: string, size: [number, number] = [1200, 900]): string {
  const id = newId();
  const mime = file.endsWith(".jpg") ? "image/jpeg" : "image/svg+xml";
  insertMedia({ id, owner, mime, path: `seed:${file}`, width: size[0], height: size[1], bytes: 0 });
  return id;
}

export function seedIfEmpty(): void {
  if (globalThis.__onlychainSeeded) return;
  globalThis.__onlychainSeeded = true;
  if (process.env.ONLYCHAIN_NO_SEED === "1") return;
  const n = (db().prepare("SELECT COUNT(*) AS n FROM profiles WHERE sample = 1").get() as { n: number }).n;
  if (n > 0 && getMeta("seed_version") === SEED_VERSION) return;
  if (n > 0) removeSample();
  seed();
  setMeta("seed_version", SEED_VERSION);
}

/** Drop every sample row (and what hangs off it) so a new seed can replace it. */
function removeSample(): void {
  const d = db();
  d.exec("BEGIN");
  try {
    d.exec(`
      DELETE FROM likes WHERE post_id IN (SELECT id FROM posts WHERE sample = 1);
      DELETE FROM comments WHERE post_id IN (SELECT id FROM posts WHERE sample = 1);
      DELETE FROM posts WHERE sample = 1;
      DELETE FROM messages WHERE sender IN (SELECT address FROM profiles WHERE sample = 1) AND recipient IN (SELECT address FROM profiles WHERE sample = 1);
      DELETE FROM media WHERE path LIKE 'seed:%';
      DELETE FROM profiles WHERE sample = 1;
    `);
    d.exec("COMMIT");
  } catch (err) {
    d.exec("ROLLBACK");
    throw err;
  }
}

export function seed(): void {
  const now = Date.now();
  const handle = db();
  handle.exec("BEGIN");
  try {
    for (const f of personas.fans) {
      ensureProfile(f.address);
      const avatar = seedMedia(f.address, `photos/avatar-${f.account}.jpg`, [512, 512]);
      updateProfile(f.address, { handle: f.handle, displayName: f.displayName, avatarMedia: avatar });
      handle.prepare("UPDATE profiles SET sample = 1, created_at = ? WHERE address = ?").run(now - 40 * DAY, f.address);
    }

    personas.creators.forEach((c, ci) => {
      ensureProfile(c.address);
      const avatar = seedMedia(c.address, `photos/avatar-${c.account}.jpg`, [512, 512]);
      const cover = seedMedia(c.address, `photos/cover-${c.account}.jpg`, [1200, 400]);
      updateProfile(c.address, { handle: c.handle, displayName: c.displayName, bio: c.bio, category: c.category, avatarMedia: avatar, coverMedia: cover, isCreator: true, hue: c.hue, welcomeMessage: ci % 2 === 0 ? `Welcome! Glad you're here — tell me what you'd like to see more of.` : "" });
      handle.prepare("UPDATE profiles SET sample = 1, verified = ?, created_at = ? WHERE address = ?").run(c.verified ? 1 : 0, now - (60 + ci * 3) * DAY, c.address);

      const captions = CAPTIONS[c.category] ?? CAPTIONS.Art;
      for (let i = 0; i < 8; i++) {
        const { access, price } = accessFor(c, i);
        const id = newId();
        const createdAt = now - (i * 2.3 + ci * 0.37) * DAY - (i * 5 + ci) * HOUR;
        // the three newest posts carry photos, one is text only, the rest carry the generated art
        // the newest post carries the three photos as a set, the next two one photo each, one is text only, the rest carry the generated art
        const mediaIds = i === 4 ? [] : i === 0 ? [1, 2, 3].map((k) => seedMedia(c.address, `photos/photo-${c.account}-${k}.jpg`, [1200, 800])) : i < 3 ? [seedMedia(c.address, `photos/photo-${c.account}-${i + 1}.jpg`, [1200, 800])] : [seedMedia(c.address, `art-${c.account}-${i + 1}.svg`)];
        insertPost({ id, creator: c.address, text: captions[i % captions.length], mediaIds, access, price, createdAt, sample: true });
        // likes and comments from the fans
        const likers = personas.fans.filter((_, fi) => (fi + i + ci) % 3 !== 0);
        for (const f of likers) setLike(id, f.address, true);
        if (i % 2 === 0) {
          const f = personas.fans[(i + ci) % personas.fans.length];
          insertComment({ id: newId(), postId: id, address: f.address, text: COMMENTS[(i + ci) % COMMENTS.length], createdAt: createdAt + 3 * HOUR });
        }
        if (i % 5 === 0) {
          const f = personas.fans[(i + ci + 1) % personas.fans.length];
          insertComment({ id: newId(), postId: id, address: f.address, text: COMMENTS[(i + ci + 4) % COMMENTS.length], createdAt: createdAt + 9 * HOUR });
        }
      }
    });

    // A few conversations so /messages is not empty for the sample fans.
    const [luna, mara] = personas.creators;
    const [theo, jules] = personas.fans;
    insertMessage({ id: newId(), sender: theo.address, recipient: luna.address, text: "Loved the hip series — is there a version for tight ankles?", mediaId: null, price: "0", createdAt: now - 2 * DAY });
    insertMessage({ id: newId(), sender: luna.address, recipient: theo.address, text: "Yes! Filming it this week. Sending you the first cut here before it goes on the page.", mediaId: null, price: "0", createdAt: now - 2 * DAY + 2 * HOUR });
    insertMessage({ id: newId(), sender: luna.address, recipient: theo.address, text: "Here it is — the ankle flow, 18 minutes.", mediaId: seedMedia(luna.address, `photos/photo-1-3.jpg`, [1200, 800]), price: parseUnits("10", site.token.decimals).toString(), createdAt: now - DAY });
    insertMessage({ id: newId(), sender: jules.address, recipient: mara.address, text: "The cape pattern worked perfectly, thank you!", mediaId: null, price: "0", createdAt: now - 3 * DAY });
    insertMessage({ id: newId(), sender: mara.address, recipient: jules.address, text: "Show me when it's done!!", mediaId: null, price: "0", createdAt: now - 3 * DAY + HOUR });

    handle.exec("COMMIT");
    console.log(`[onlychain] seeded ${personas.creators.length} sample creators, ${personas.creators.length * 8} posts`);
  } catch (err) {
    handle.exec("ROLLBACK");
    throw err;
  }
}
