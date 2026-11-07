import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// A 20-Strategist threaded debate for LOCAL development, demos and the
// performance test. Everything it creates is marked as test data. Idempotent:
// if the debate Campaign already exists, nothing is written.

export const DEBATE_SLUG = "test-debate-car-free-saturdays";
export const DEBATE_PASSWORD = "debate-test-password";
const INVITE_CODE = "TEST-DEBATE-SEED";

const NAMES = [
  "Amara", "Bilal", "Ciaran", "Delyth", "Eilidh", "Farah", "Gethin", "Hamid", "Isla", "Jonah",
  "Kezia", "Leon", "Maryam", "Niamh", "Owain", "Priya", "Quentin", "Rhian", "Sanjay", "Tamsin",
];

export const debateHandles = NAMES.map((n) => `Test_${n}`);
export const debateEmail = (i: number) => `debater${String(i + 1).padStart(2, "0")}@example.test`;

/** Refuses anything but a local Supabase. The same rule as topics:load's host check, but stricter: local only. */
export function assertLocal(url: string) {
  const host = new URL(url).hostname;
  if (!["127.0.0.1", "localhost"].includes(host)) {
    throw new Error(`Refusing to seed test data into ${host}. seed:debate only runs against local Supabase.`);
  }
}

// Small deterministic random generator, so every run produces the same debate.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const ARGUMENTS_FOR = [
  "Car-free Saturdays bring people back to the high street. Where towns have tried it, people stay longer, and longer visits mean more spending in local shops and cafés.",
  "Cleaner air on the busiest shopping day matters most to children and older people, who are the most likely to be walking along the high street on a Saturday.",
  "A car-free day is a low-cost trial. If it does not work, the council can stop. It is far cheaper than permanent road changes.",
  "Market stalls, buskers and pop-up events need space. Taking cars out for one day a week gives that space without new building work.",
  "Most people reach our high street on foot, by bus or by bike already. A small number of drivers take up most of the space.",
  "Road danger puts parents off bringing children into town. A car-free Saturday removes the main reason families stay away.",
  "Independent shops cannot compete with out-of-town parks on parking. They can compete on atmosphere, and car-free streets create atmosphere.",
  "Noise falls sharply without traffic. Cafés can put tables outside and people can actually talk to each other.",
  "Other European towns have run weekly car-free days for years without collapsing trade. The fear is bigger than the evidence.",
];

const ARGUMENTS_AGAINST = [
  "Many shoppers are older or disabled and rely on cars. Closing the high street on its busiest day shuts them out exactly when they want to come in.",
  "Traders fear losing Saturday trade, which can be a third of their week. One bad month could close a small shop for good.",
  "Traffic does not disappear. It moves to residential side streets, which become more dangerous and polluted for the people who live there.",
  "Deliveries and tradespeople still need access. Exemptions quickly make a car-free day confusing and hard to enforce.",
  "Rural visitors have no realistic bus service on Saturdays. For them, car-free means visit-free.",
  "The council should fix the basics first: better buses, safer crossings and cheaper parking near the centre. Closing roads is the wrong first step.",
  "A trial that starts in summer will look good and then fail in winter, when fewer people want to walk in the rain.",
  "Shops that sell bulky goods, from hardware to furniture, depend on customers who can load a car outside.",
];

const ARGUMENTS_UNDECIDED = [
  "I can see both sides. Could a trial run on two Saturdays a month, with blue-badge access kept, give us real evidence before we decide?",
  "The answer may depend on the town. A compact market town is not the same as a long high street with no bus station nearby.",
  "What matters most is what the traders and disabled residents say. Has anyone asked them properly, rather than guessing?",
];

const EVIDENCE = [
  { body: "Footfall counts from a pilot in a comparable town rose on car-free days. Worth reading the method section before relying on it.", title: "Example footfall survey (test data)" },
  { body: "A survey of traders found most were worried before the trial and fewer were worried after it. The sample was small.", title: "Example trader survey (test data)" },
  { body: "Air quality readings near the high street dropped on days without traffic, especially for nitrogen dioxide.", title: "Example air quality report (test data)" },
  { body: "Disability groups set out what access must be kept on car-free days, including blue-badge drop-off points.", title: "Example access guidance (test data)" },
  { body: "Bus timetables show only one rural service on Saturday afternoons, which supports the access concern.", title: "Example timetable (test data)" },
];

const REBUTTALS = [
  "That assumes the extra visitors spend money. People who wander about on a sunny day are not always buying anything.",
  "The evidence you cite comes from a bigger town with a tram. Our town has nothing like that, so I am not sure it transfers.",
  "Blue-badge access can be kept with a few drop-off bays. Excluding everyone with a car is not the only design.",
  "Side streets were monitored in the trials I have read about, and traffic there rose only slightly. Do you have figures showing otherwise?",
  "Fair challenge, but a month of lower takings is not the same as closing. Traders adapted quickly elsewhere.",
  "This is the strongest point against. The trial must include a proper winter period before anyone calls it a success.",
  "Deliveries before 10am solve most of that. Plenty of pedestrian zones already work this way.",
  "You are right that buses are poor, but that argues for fixing buses as well, not for doing nothing.",
  "I think you are mixing up congestion and pollution. Fewer cars can cut both, but they are different problems with different evidence.",
  "Restating your view to check I have it right: you accept the air quality gains but think the cost falls on people least able to bear it. Is that fair?",
  "If the trial is reversible, the risk you describe is limited. What would change your mind?",
  "The survey you quote asked people what they expected, not what happened. Expectations are not evidence.",
  "That is true for furniture shops, but most high-street units are cafés, services and small retailers.",
  "Agreed on asking residents. A citizens' panel before the trial would answer the legitimacy question too.",
];

type Row = { id: string; author: number };

/** Creates (or finds) the 20 test Strategists. Returns their user ids in order. */
async function ensureStrategists(admin: SupabaseClient): Promise<string[]> {
  await admin.from("invites").upsert({ code: INVITE_CODE, note: "seed:debate test Strategists (local only)", max_uses: 40 }, { onConflict: "code", ignoreDuplicates: true });

  const existing = new Map<string, string>();
  for (let page = 1; page < 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    for (const u of data.users) if (u.email) existing.set(u.email, u.id);
    if (data.users.length < 200) break;
  }

  const ids: string[] = [];
  for (let i = 0; i < NAMES.length; i++) {
    const email = debateEmail(i);
    let id = existing.get(email);
    if (!id) {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: DEBATE_PASSWORD,
        email_confirm: true,
        user_metadata: { invite_code: INVITE_CODE, age_confirmed: true, terms_accepted: true, public_acknowledged: true, terms_version: "test", privacy_version: "test" },
      });
      if (error) throw error;
      id = data.user.id;
    }
    const { error } = await admin
      .from("profiles")
      .update({ handle: debateHandles[i], handle_set_at: new Date().toISOString(), display_name: `${NAMES[i]} (test)`, bio: "Test Strategist created by seed:debate." })
      .eq("id", id);
    if (error) throw error;
    ids.push(id);
  }
  return ids;
}

export type SeedResult = { created: boolean; campaignId: string; dispatches: number; strategists: number };

export async function seedDebate(
  { url, serviceKey, anonKey }: { url: string; serviceKey: string; anonKey: string },
  log: (msg: string) => void = () => {},
): Promise<SeedResult> {
  assertLocal(url);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data: found } = await admin.from("campaigns").select("id").eq("slug", DEBATE_SLUG).maybeSingle();
  if (found) {
    const { count } = await admin.from("dispatches").select("id", { count: "exact", head: true }).eq("campaign_id", found.id);
    log(`Already seeded: ${count ?? 0} Dispatches in ${DEBATE_SLUG}. Nothing written.`);
    return { created: false, campaignId: found.id, dispatches: count ?? 0, strategists: NAMES.length };
  }

  log("Creating 20 test Strategists…");
  const users = await ensureStrategists(admin);

  const now = Date.now();
  const hour = 3_600_000;
  const start = now - 2 * 24 * hour;
  const roundBreak = now - hour;
  const end = now + 5 * 24 * hour;
  const { data: campaign, error: campaignError } = await admin
    .from("campaigns")
    .insert({
      slug: DEBATE_SLUG,
      title: "[Test data] Should high streets be car-free on Saturdays?",
      summary: "TEST DATA created by npm run seed:debate for local development. Twenty test Strategists debate a weekly car-free Saturday on the high street.",
      rules: "Be civil. Argue the point, not the person. Cite your sources. (Test data.)",
      category: "energy",
      format: "progressive",
      status: "open",
      starts_at: new Date(start).toISOString(),
      ends_at: new Date(end).toISOString(),
      current_round: 2,
    })
    .select("id")
    .single();
  if (campaignError) throw campaignError;
  const campaignId = campaign.id as string;

  const { error: roundsError } = await admin.from("campaign_rounds").insert([
    { campaign_id: campaignId, position: 1, title: "Opening arguments", starts_at: new Date(start).toISOString(), ends_at: new Date(roundBreak).toISOString(), allowed_kinds: ["argument", "evidence"] },
    { campaign_id: campaignId, position: 2, title: "Rebuttals", starts_at: new Date(roundBreak).toISOString(), ends_at: new Date(end).toISOString(), allowed_kinds: ["rebuttal", "evidence"] },
  ]);
  if (roundsError) throw roundsError;

  // Positions: 9 For, 8 Against, 3 Undecided.
  const positions = users.map((_, i) => (i < 9 ? "for" : i < 17 ? "against" : "undecided"));
  const { error: positionsError } = await admin
    .from("campaign_positions")
    .insert(users.map((id, i) => ({ campaign_id: campaignId, user_id: id, after_position: positions[i] })));
  if (positionsError) throw positionsError;

  const random = rng(20261103);
  const aiUse = () => {
    const r = random();
    return r < 0.65 ? "none" : r < 0.9 ? "assisted" : "generated";
  };
  let clock = start + hour;
  const tick = (spanHours: number) => (clock += Math.round(spanHours * hour * (0.5 + random())));

  async function insert(row: Record<string, unknown>, author: number): Promise<Row> {
    const { data, error } = await admin
      .from("dispatches")
      .insert({ campaign_id: campaignId, author_id: users[author], position: positions[author], moderation_status: "visible", ...row })
      .select("id")
      .single();
    if (error) throw error;
    return { id: data.id as string, author };
  }

  log("Round 1: arguments and evidence…");
  const roots: Row[] = [];
  const pools = [ARGUMENTS_FOR, ARGUMENTS_AGAINST, ARGUMENTS_UNDECIDED];
  for (let i = 0; i < 20; i++) {
    const position = positions[i];
    const pool = pools[position === "for" ? 0 : position === "against" ? 1 : 2];
    roots.push(await insert({ kind: "argument", body: pool[i % pool.length], ai_use: aiUse(), round_position: 1, created_at: new Date(tick(1)).toISOString() }, i));
  }
  for (let i = 0; i < EVIDENCE.length; i++) {
    const author = (i * 7 + 3) % 20;
    const e = EVIDENCE[i];
    roots.push(
      await insert(
        {
          kind: "evidence",
          body: e.body,
          ai_use: aiUse(),
          round_position: 1,
          sources: [{ url: `https://example.org/tgs-test/evidence-${i + 1}`, host: "example.org", title: e.title }],
          created_at: new Date(tick(1)).toISOString(),
        },
        author,
      ),
    );
  }

  log("Round 2: rebuttals…");
  clock = roundBreak + 5 * 60_000;
  const replies: Row[] = [];
  const replyTo = async (target: Row, n: number) => {
    let author = Math.floor(random() * 20);
    if (author === target.author) author = (author + 1) % 20;
    const row = await insert(
      { kind: "rebuttal", parent_id: target.id, body: REBUTTALS[n % REBUTTALS.length], ai_use: aiUse(), round_position: 2, created_at: new Date(tick(0.02)).toISOString() },
      author,
    );
    replies.push(row);
    return row;
  };
  let n = 0;
  // One long exchange that runs past depth 4, to show replies continuing flat.
  let chain = roots[0];
  for (let i = 0; i < 6; i++) chain = await replyTo(chain, n++);
  // Then a spread of replies across most threads, some two or three deep.
  for (let i = 1; i < roots.length && n < 46; i++) {
    const first = await replyTo(roots[i], n++);
    if (random() < 0.6) {
      const second = await replyTo(first, n++);
      if (random() < 0.4) await replyTo(second, n++);
    }
    if (random() < 0.3) await replyTo(roots[i], n++);
  }

  log("Reactions…");
  const keys = ["persuasive", "well_sourced", "fair_point"];
  const reactionRows: { dispatch_id: string; user_id: string; reaction: string }[] = [];
  for (const d of [...roots, ...replies]) {
    const howMany = Math.floor(random() * 6);
    for (let k = 0; k < howMany; k++) {
      const reactor = Math.floor(random() * 20);
      if (reactor === d.author) continue;
      reactionRows.push({ dispatch_id: d.id, user_id: users[reactor], reaction: keys[Math.floor(random() * keys.length)] });
    }
  }
  const unique = [...new Map(reactionRows.map((r) => [`${r.dispatch_id}:${r.user_id}:${r.reaction}`, r])).values()];
  const { error: reactionsError } = await admin.from("dispatch_reactions").insert(unique);
  if (reactionsError) throw reactionsError;

  // One Dispatch withdrawn by its author, through the real function.
  const withdrawer = roots[19];
  const userClient = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error: signInError } = await userClient.auth.signInWithPassword({ email: debateEmail(withdrawer.author), password: DEBATE_PASSWORD });
  if (signInError) throw signInError;
  const { error: withdrawError } = await userClient.rpc("withdraw_dispatch", { p_id: withdrawer.id });
  if (withdrawError) throw withdrawError;

  const total = roots.length + replies.length;
  log(`Created ${total} Dispatches (${roots.length} threads, ${replies.length} rebuttals) and ${unique.length} reactions.`);
  return { created: true, campaignId, dispatches: total, strategists: users.length };
}
