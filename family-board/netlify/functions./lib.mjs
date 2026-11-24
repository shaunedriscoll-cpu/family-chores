import { timingSafeEqual } from "node:crypto";

export const PEOPLE = ["shaun", "chungha", "calean", "jayden"];

/* Starting lists. Once you edit a list on the website, the saved version replaces these. */
export const CHORES = [
  { id: "dishes",    name: "Dishes",          pts: 5,  icon: "🍽️" },
  { id: "vacuum",    name: "Vacuum",          pts: 8,  icon: "🧹" },
  { id: "bedrooms",  name: "Clean bedrooms",  pts: 8,  icon: "🛏️" },
  { id: "laundry",   name: "Laundry",         pts: 8,  icon: "🧺" },
  { id: "mop",       name: "Mop",             pts: 8,  icon: "🪣" },
  { id: "litter",    name: "Cat litter",      pts: 4,  icon: "🐱" },
  { id: "dogs",      name: "Walk the dogs",   pts: 5,  icon: "🐕" },
  { id: "garbage",   name: "Garbage",         pts: 3,  icon: "🗑️" },
  { id: "bathrooms", name: "Clean bathrooms", pts: 10, icon: "🚿" },
  { id: "tidy",      name: "Tidy up",         pts: 3,  icon: "✨" }
];

export const REWARDS = [
  { id: "dinner", name: "Choose dinner",              cost: 25, icon: "🍽️" },
  { id: "movie",  name: "Pick the family movie",      cost: 30, icon: "🎬" },
  { id: "sleep",  name: "Sleep-in pass",              cost: 35, icon: "😴" },
  { id: "skip",   name: "Skip one chore",             cost: 40, icon: "🎟️" },
  { id: "treat",  name: "Treat of your choice ($10)", cost: 50, icon: "🍦" },
  { id: "outing", name: "Pick the family outing",     cost: 60, icon: "🎡" }
];

export const BANK = [
  { id: "garage",     title: "Clean out the garage",              points: 20 },
  { id: "car",        title: "Wash the car",                      points: 10 },
  { id: "carinside",  title: "Clean the inside of the car",       points: 8 },
  { id: "snow",       title: "Shovel the driveway and walks",     points: 10 },
  { id: "lawn",       title: "Mow the lawn",                      points: 15 },
  { id: "fridge",     title: "Clean out the fridge",              points: 8 },
  { id: "counters",   title: "Wipe the kitchen counters and stove", points: 4 },
  { id: "oven",       title: "Clean the oven",                    points: 12 },
  { id: "windows",    title: "Clean the windows",                 points: 10 },
  { id: "baseboards", title: "Wipe the baseboards",               points: 8 },
  { id: "closet",     title: "Organize a closet",                 points: 10 },
  { id: "sheets",     title: "Change the bed sheets",             points: 5 },
  { id: "fold",       title: "Fold and put away the laundry",     points: 5 },
  { id: "recycling",  title: "Take out the recycling",            points: 3 },
  { id: "plants",     title: "Water the plants",                  points: 3 },
  { id: "groceries",  title: "Help put away the groceries",       points: 3 },
  { id: "yard",       title: "Pick up the yard",                  points: 5 }
];

const TZ = "America/Edmonton";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SPENT_ID_RE = /^\d+_[a-z0-9]+$/;
const ID_SAFE = /^[a-z0-9_]{1,40}$/;
const TASK_KEEP_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_FAILS = 10;
const LOCK_MS = 15 * 60 * 1000;
const MAX_ITEMS = 40;
const CHAT_KEEP_MS = 60 * 24 * 60 * 60 * 1000;
const CHAT_SHOW = 100;
const MAX_PINS = 20;
const CHAT_KEY_RE = /^c\/(\d+)_([a-z]+)_[a-z0-9]+$/;
const CHAT_ID_RE = /^\d+_(shaun|chungha|calean|jayden)_[a-z0-9]+$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function todayStr(now) {
  return new Date(now).toLocaleDateString("en-CA", { timeZone: TZ });
}

export function weekStartOf(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
  return dt.toISOString().slice(0, 10);
}

function pinMatches(given, expected) {
  const a = Buffer.from(String(given || ""));
  const b = Buffer.from(String(expected || ""));
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function readJson(store, key) {
  const v = await store.get(key, { type: "json" });
  return v == null ? null : v;
}

/* Returns "ok", "bad", "locked" or "unset". Ten wrong tries lock that PIN for 15 minutes. */
async function checkPin(store, now, given, expected, lockKey) {
  if (!expected) return "unset";
  const lock = (await readJson(store, lockKey)) || { fails: 0, until: 0 };
  if (lock.until > now) return "locked";
  if (!pinMatches(given, expected)) {
    const fails = (lock.fails || 0) + 1;
    await store.setJSON(lockKey, fails >= MAX_FAILS ? { fails: 0, until: now + LOCK_MS } : { fails, until: 0 });
    return "bad";
  }
  if (lock.fails) await store.setJSON(lockKey, { fails: 0, until: 0 });
  return "ok";
}

async function loadList(store, kind, defaults) {
  const c = await readJson(store, "config/" + kind);
  return c && Array.isArray(c.items) ? c.items : defaults;
}

function newId(now) {
  return "i" + now.toString(36) + Math.random().toString(36).slice(2, 5);
}
function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}
function cleanIcon(v, fallback) {
  return Array.from(String(v || "").trim()).slice(0, 2).join("") || fallback;
}

/* Checks and cleans a list a parent sends from the website. Returns null when the list is not valid. */
export function cleanItems(kind, items, now) {
  if (!["chores", "rewards", "bank"].includes(kind)) return null;
  if (!Array.isArray(items) || items.length > MAX_ITEMS) return null;
  const seen = new Set();
  const out = [];
  for (const raw of items) {
    if (!raw || typeof raw !== "object") return null;
    let id = typeof raw.id === "string" && ID_SAFE.test(raw.id) && !raw.id.startsWith("task_") ? raw.id : newId(now);
    while (seen.has(id)) id = newId(now);
    seen.add(id);
    const text = String((kind === "bank" ? raw.title : raw.name) || "").trim().slice(0, kind === "bank" ? 80 : 40);
    if (!text) return null;
    const num = Math.round(Number(kind === "rewards" ? raw.cost : kind === "bank" ? raw.points : raw.pts));
    if (!Number.isFinite(num)) return null;
    if (kind === "chores") {
      const item = { id, name: text, pts: clamp(num, 0, 50), icon: cleanIcon(raw.icon, "✅") };
      const who = Array.isArray(raw.who) ? PEOPLE.filter((p) => raw.who.includes(p)) : [];
      if (who.length > 0 && who.length < PEOPLE.length) item.who = who;
      out.push(item);
    }
    else if (kind === "rewards") out.push({ id, name: text, cost: clamp(num, 1, 500), icon: cleanIcon(raw.icon, "🎁") });
    else out.push({ id, title: text, points: clamp(num, 0, 50) });
  }
  return out;
}

export async function loadState(store, now) {
  const today = todayStr(now);
  const entries = [];
  const months = await store.list({ prefix: "m/" });
  const monthRecs = await Promise.all(months.blobs.map((b) => readJson(store, b.key)));
  for (const rec of monthRecs) {
    if (!rec || !rec.days || !PEOPLE.includes(rec.person)) continue;
    for (const date of Object.keys(rec.days)) {
      const day = rec.days[date] || {};
      for (const chore of Object.keys(day)) {
        const it = day[chore] || {};
        entries.push({
          date,
          person: rec.person,
          chore,
          pts: Number(it.pts) || 0,
          ts: Number(it.ts) || 0,
          label: typeof it.label === "string" ? it.label : undefined
        });
      }
    }
  }
  const spentList = await store.list({ prefix: "s/" });
  const spentRecs = await Promise.all(
    spentList.blobs.map(async (b) => {
      const v = await readJson(store, b.key);
      return v ? { ...v, id: b.key.slice(2) } : null;
    })
  );
  const spent = spentRecs.filter((s) => s && PEOPLE.includes(s.person));
  const taskList = await store.list({ prefix: "t/" });
  const taskRecs = await Promise.all(taskList.blobs.map((b) => readJson(store, b.key)));
  const tasks = taskRecs
    .filter((t) => t && PEOPLE.includes(t.assignee))
    .filter((t) => !t.done || now - (t.doneAt || 0) < TASK_KEEP_MS);
  const chatList = await store.list({ prefix: "c/" });
  const chatKeys = chatList.blobs
    .map((b) => {
      const m = CHAT_KEY_RE.exec(b.key);
      return m ? { ts: Number(m[1]), person: m[2] } : null;
    })
    .filter((k) => k && PEOPLE.includes(k.person))
    .sort((a, b) => a.ts - b.ts)
    .slice(-CHAT_SHOW);
  const [chores, rewards, bank] = await Promise.all([
    loadList(store, "chores", CHORES),
    loadList(store, "rewards", REWARDS),
    loadList(store, "bank", BANK)
  ]);
  return {
    today,
    weekStart: weekStartOf(today),
    people: PEOPLE,
    chores,
    rewards,
    bank,
    entries,
    spent,
    tasks,
    chatKeys
  };
}

export async function loadChat(store) {
  const list = await store.list({ prefix: "c/" });
  const keys = list.blobs
    .map((b) => b.key)
    .filter((k) => CHAT_KEY_RE.test(k))
    .sort((a, b) => Number(CHAT_KEY_RE.exec(a)[1]) - Number(CHAT_KEY_RE.exec(b)[1]))
    .slice(-CHAT_SHOW);
  const recs = await Promise.all(keys.map((k) => readJson(store, k)));
  const messages = recs.filter((m) => m && PEOPLE.includes(m.person)).sort((a, b) => b.ts - a.ts);
  const pinList = await store.list({ prefix: "p/" });
  const pinRecs = await Promise.all(pinList.blobs.map((b) => readJson(store, b.key)));
  const pins = pinRecs.filter((p) => p && typeof p.text === "string").sort((a, b) => b.ts - a.ts);
  return { messages, pins };
}

async function pruneChat(store, now) {
  const list = await store.list({ prefix: "c/" });
  await Promise.all(
    list.blobs.map(async (b) => {
      const m = CHAT_KEY_RE.exec(b.key);
      if (m && now - Number(m[1]) >= CHAT_KEEP_MS) await store.delete(b.key);
    })
  );
}

async function pruneTasks(store, now) {
  const list = await store.list({ prefix: "t/" });
  await Promise.all(
    list.blobs.map(async (b) => {
      const t = await readJson(store, b.key);
      if (t && t.done && now - (t.doneAt || 0) >= TASK_KEEP_MS) await store.delete(b.key);
    })
  );
}

function balanceOf(state, person) {
  let earned = 0;
  let spent = 0;
  for (const e of state.entries) if (e.person === person) earned += e.pts;
  for (const s of state.spent) if (s.person === person) spent += Number(s.cost) || 0;
  return earned - spent;
}

function reply(status, body) {
  return { status, body };
}

export async function handle(input, store, env, now) {
  if (!env.FAMILY_PIN) return reply(500, { error: "FAMILY_PIN is not set on the server." });
  if (!input || typeof input !== "object") return reply(400, { error: "Bad request." });

  const fam = await checkPin(store, now, input.pin, env.FAMILY_PIN, "meta/lock");
  if (fam === "locked") return reply(429, { error: "Too many tries." });
  if (fam !== "ok") return reply(401, { error: "Wrong PIN." });

  /* Returns null when the parent PIN is right, or an error reply when it is not. */
  const parentGate = async () => {
    const r = await checkPin(store, now, input.ppin, env.PARENT_PIN, "meta/plock");
    if (r === "ok") return null;
    if (r === "unset") return reply(403, { error: "The parent PIN is not set on the server." });
    if (r === "locked") return reply(403, { error: "Too many tries. Wait 15 minutes." });
    return reply(403, { error: "Wrong parent PIN." });
  };

  const action = input.action;
  const person = input.person;

  if (action === "state") {
    return reply(200, await loadState(store, now));
  }

  if (action === "parentCheck") {
    const bad = await parentGate();
    if (bad) return bad;
    return reply(200, await loadState(store, now));
  }

  if (action === "done" || action === "undo") {
    if (!PEOPLE.includes(person)) return reply(400, { error: "Unknown person." });
    const chores = await loadList(store, "chores", CHORES);
    let chore = null;
    if (action === "done") {
      chore = chores.find((c) => c.id === input.chore);
      if (!chore) return reply(400, { error: "Unknown chore." });
      if (Array.isArray(chore.who) && chore.who.length && !chore.who.includes(person)) {
        return reply(400, { error: "That chore is not assigned to you." });
      }
    } else if (typeof input.chore !== "string" || !ID_SAFE.test(input.chore) || input.chore.startsWith("task_")) {
      return reply(400, { error: "Unknown chore." });
    }
    const date = action === "done" ? todayStr(now) : input.date;
    if (typeof date !== "string" || !DATE_RE.test(date)) return reply(400, { error: "Bad date." });
    const key = "m/" + date.slice(0, 7) + "_" + person;
    const rec = (await readJson(store, key)) || { month: date.slice(0, 7), person, days: {} };
    rec.days = rec.days || {};
    if (action === "done") {
      rec.days[date] = rec.days[date] || {};
      if (!rec.days[date][chore.id]) rec.days[date][chore.id] = { pts: chore.pts, ts: now, label: chore.name };
    } else if (rec.days[date]) {
      delete rec.days[date][input.chore];
      if (Object.keys(rec.days[date]).length === 0) delete rec.days[date];
    }
    await store.setJSON(key, rec);
    return reply(200, await loadState(store, now));
  }

  if (action === "redeem") {
    if (!PEOPLE.includes(person)) return reply(400, { error: "Unknown person." });
    const rewards = await loadList(store, "rewards", REWARDS);
    const reward = rewards.find((r) => r.id === input.reward);
    if (!reward) return reply(400, { error: "Unknown reward." });
    const state = await loadState(store, now);
    if (balanceOf(state, person) < reward.cost) return reply(400, { error: "Not enough points." });
    const id = now + "_" + Math.random().toString(36).slice(2, 8);
    await store.setJSON("s/" + id, { person, reward: reward.id, name: reward.name, cost: reward.cost, ts: now });
    return reply(200, await loadState(store, now));
  }

  if (action === "refund") {
    if (typeof input.id !== "string" || !SPENT_ID_RE.test(input.id)) return reply(400, { error: "Bad id." });
    await store.delete("s/" + input.id);
    return reply(200, await loadState(store, now));
  }

  if (action === "assign") {
    const bad = await parentGate();
    if (bad) return bad;
    if (!PEOPLE.includes(input.assignee)) return reply(400, { error: "Pick a person for the task." });
    const title = String(input.title || "").trim().slice(0, 80);
    if (!title) return reply(400, { error: "Add a task title." });
    let points = Number(input.points);
    if (!Number.isFinite(points)) points = 5;
    points = clamp(Math.round(points), 0, 50);
    const due = input.due ? String(input.due) : null;
    if (due && !DATE_RE.test(due)) return reply(400, { error: "Bad date." });
    const by = PEOPLE.includes(input.by) ? input.by : null;
    await pruneTasks(store, now);
    const id = now + "_" + Math.random().toString(36).slice(2, 8);
    await store.setJSON("t/" + id, { id, title, assignee: input.assignee, by, points, due, created: now, done: false });
    return reply(200, await loadState(store, now));
  }

  if (action === "completeTask" || action === "reopenTask") {
    if (typeof input.id !== "string" || !SPENT_ID_RE.test(input.id)) return reply(400, { error: "Bad id." });
    const t = await readJson(store, "t/" + input.id);
    if (!t) return reply(404, { error: "Task not found." });
    if (person !== t.assignee) {
      if (!input.ppin) return reply(403, { error: "That task is not yours." });
      const bad = await parentGate();
      if (bad) return bad;
    }
    const choreKey = "task_" + t.id;
    if (action === "completeTask") {
      if (!t.done) {
        const date = todayStr(now);
        const mkey = "m/" + date.slice(0, 7) + "_" + t.assignee;
        const rec = (await readJson(store, mkey)) || { month: date.slice(0, 7), person: t.assignee, days: {} };
        rec.days = rec.days || {};
        rec.days[date] = rec.days[date] || {};
        rec.days[date][choreKey] = { pts: t.points, ts: now, label: t.title };
        await store.setJSON(mkey, rec);
        t.done = true;
        t.doneAt = now;
        t.doneDate = date;
        await store.setJSON("t/" + t.id, t);
      }
    } else if (t.done) {
      const date = t.doneDate;
      if (typeof date === "string" && DATE_RE.test(date)) {
        const mkey = "m/" + date.slice(0, 7) + "_" + t.assignee;
        const rec = await readJson(store, mkey);
        if (rec && rec.days && rec.days[date]) {
          delete rec.days[date][choreKey];
          if (Object.keys(rec.days[date]).length === 0) delete rec.days[date];
          await store.setJSON(mkey, rec);
        }
      }
      t.done = false;
      delete t.doneAt;
      delete t.doneDate;
      await store.setJSON("t/" + t.id, t);
    }
    return reply(200, await loadState(store, now));
  }

  if (action === "deleteTask") {
    const bad = await parentGate();
    if (bad) return bad;
    if (typeof input.id !== "string" || !SPENT_ID_RE.test(input.id)) return reply(400, { error: "Bad id." });
    await store.delete("t/" + input.id);
    return reply(200, await loadState(store, now));
  }

  if (action === "setConfig") {
    const bad = await parentGate();
    if (bad) return bad;
    const items = cleanItems(input.kind, input.items, now);
    if (!items) return reply(400, { error: "That list is not valid." });
    await store.setJSON("config/" + input.kind, { items });
    return reply(200, await loadState(store, now));
  }

  /* ---- family chat ---- */
  const withChat = async () => ({ ...(await loadState(store, now)), chat: await loadChat(store) });

  if (action === "chat") {
    return reply(200, await withChat());
  }

  if (action === "post") {
    if (!PEOPLE.includes(person)) return reply(400, { error: "Tap your name first." });
    const text = String(input.text || "").trim().slice(0, 500);
    if (!text) return reply(400, { error: "Write a message first." });
    const kind = input.kind === "reminder" ? "reminder" : "msg";
    const msg = { kind, person, text, ts: now };
    if (kind === "reminder") {
      const forWho = input.forWho === "all" || PEOPLE.includes(input.forWho) ? input.forWho : "all";
      const date = input.date ? String(input.date) : null;
      const time = input.time ? String(input.time) : null;
      if (date && !DATE_RE.test(date)) return reply(400, { error: "Bad date." });
      if (time && !TIME_RE.test(time)) return reply(400, { error: "Bad time." });
      Object.assign(msg, { for: forWho, date, time: date ? time : null, acks: [] });
    }
    const id = now + "_" + person + "_" + Math.random().toString(36).slice(2, 8);
    msg.id = id;
    await pruneChat(store, now);
    await store.setJSON("c/" + id, msg);
    return reply(200, await withChat());
  }

  if (action === "ackReminder") {
    if (!PEOPLE.includes(person) || typeof input.id !== "string" || !CHAT_ID_RE.test(input.id)) return reply(400, { error: "Bad request." });
    const m = await readJson(store, "c/" + input.id);
    if (!m || m.kind !== "reminder") return reply(404, { error: "Reminder not found." });
    if (m.for !== "all" && m.for !== person) return reply(403, { error: "That reminder is for someone else." });
    m.acks = Array.isArray(m.acks) ? m.acks : [];
    if (!m.acks.includes(person)) {
      m.acks.push(person);
      await store.setJSON("c/" + input.id, m);
    }
    return reply(200, await withChat());
  }

  if (action === "deleteMsg") {
    if (typeof input.id !== "string" || !CHAT_ID_RE.test(input.id)) return reply(400, { error: "Bad id." });
    const m = await readJson(store, "c/" + input.id);
    if (!m) return reply(200, await withChat());
    if (m.person !== person) {
      if (!input.ppin) return reply(403, { error: "You can only delete your own messages." });
      const bad = await parentGate();
      if (bad) return bad;
    }
    await store.delete("c/" + input.id);
    return reply(200, await withChat());
  }

  if (action === "pinInfo") {
    const bad = await parentGate();
    if (bad) return bad;
    const text = String(input.text || "").trim().slice(0, 500);
    if (!text) return reply(400, { error: "Write the info first." });
    const list = await store.list({ prefix: "p/" });
    if (list.blobs.length >= MAX_PINS) return reply(400, { error: "Too many pinned notes. Remove one first." });
    const id = now + "_" + Math.random().toString(36).slice(2, 8);
    await store.setJSON("p/" + id, { id, text, ts: now, by: PEOPLE.includes(person) ? person : null });
    return reply(200, await withChat());
  }

  if (action === "deletePin") {
    const bad = await parentGate();
    if (bad) return bad;
    if (typeof input.id !== "string" || !SPENT_ID_RE.test(input.id)) return reply(400, { error: "Bad id." });
    await store.delete("p/" + input.id);
    return reply(200, await withChat());
  }

  return reply(400, { error: "Unknown action." });
}
