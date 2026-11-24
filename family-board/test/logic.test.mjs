import assert from "node:assert/strict";
import { handle, weekStartOf, todayStr, cleanItems } from "../netlify/functions/lib.mjs";

class MemStore {
  constructor() { this.m = new Map(); }
  async get(k) { return this.m.has(k) ? JSON.parse(this.m.get(k)) : null; }
  async setJSON(k, v) { this.m.set(k, JSON.stringify(v)); }
  async delete(k) { this.m.delete(k); }
  async list({ prefix }) { return { blobs: [...this.m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; }
}

const env = { FAMILY_PIN: "5828", PARENT_PIN: "1234" };
const store = new MemStore();
// Monday 2026-11-23 10:00 in Calgary = 17:00 UTC
const T = Date.UTC(2026, 10, 23, 17, 0, 0);
const call = (o, now = T) => handle({ pin: "5828", ...o }, store, env, now);
const parent = (o, now = T) => call({ ppin: "1234", ...o }, now);
const pts = (body, p) => body.entries.filter((e) => e.person === p).reduce((a, e) => a + e.pts, 0);

// ---- dates ----
assert.equal(todayStr(T), "2026-11-23");
assert.equal(weekStartOf("2026-11-23"), "2026-11-23");
assert.equal(weekStartOf("2026-11-29"), "2026-11-23");
assert.equal(weekStartOf("2026-11-22"), "2026-11-16");
assert.equal(todayStr(Date.UTC(2026, 10, 24, 5, 30)), "2026-11-23");

// ---- family PIN ----
assert.equal((await handle({ pin: "x", action: "state" }, store, {}, T)).status, 500);
assert.equal((await handle({ pin: "0000", action: "state" }, new MemStore(), env, T)).status, 401);

// ---- chores ----
let r = await call({ action: "state" });
assert.equal(r.status, 200);
assert.equal(r.body.entries.length, 0);
assert.equal(r.body.chores.length, 10);
assert.ok(r.body.bank.length >= 10, "task bank has starter tasks");

r = await call({ action: "done", person: "calean", chore: "vacuum", pts: 9999 });
assert.equal(r.body.entries.length, 1);
assert.equal(r.body.entries[0].pts, 8);
assert.equal(r.body.entries[0].label, "Vacuum");
r = await call({ action: "done", person: "calean", chore: "vacuum" });
assert.equal(r.body.entries.length, 1, "double tap does not double count");
r = await call({ action: "done", person: "jayden", chore: "vacuum" });
assert.equal(r.body.entries.length, 2);
assert.equal((await call({ action: "done", person: "bob", chore: "vacuum" })).status, 400);
assert.equal((await call({ action: "done", person: "calean", chore: "nope" })).status, 400);
assert.equal((await call({ action: "undo", person: "calean", chore: "vacuum", date: "../x" })).status, 400);
assert.equal((await call({ action: "undo", person: "calean", chore: "task_123_abc", date: "2026-11-23" })).status, 400);

// ---- rewards ----
assert.equal((await call({ action: "redeem", person: "calean", reward: "dinner" })).status, 400);
for (const c of ["dishes", "laundry", "bathrooms"]) await call({ action: "done", person: "calean", chore: c });
r = await call({ action: "state" });
assert.equal(pts(r.body, "calean"), 8 + 5 + 8 + 10);
r = await call({ action: "redeem", person: "calean", reward: "dinner" });
assert.equal(r.body.spent.length, 1);
assert.equal((await call({ action: "redeem", person: "calean", reward: "dinner" })).status, 400);
r = await call({ action: "refund", id: r.body.spent[0].id });
assert.equal(r.body.spent.length, 0);
assert.equal((await call({ action: "refund", id: "../meta/lock" })).status, 400);
r = await call({ action: "undo", person: "calean", chore: "vacuum", date: "2026-11-23" });
assert.equal(r.body.entries.filter((e) => e.person === "calean" && e.chore === "vacuum").length, 0);
r = await call({ action: "done", person: "jayden", chore: "vacuum" }, T + 24 * 3600 * 1000);
assert.equal(r.body.entries.filter((e) => e.person === "jayden" && e.chore === "vacuum").length, 2);

// ---- parent PIN gate ----
assert.equal((await call({ action: "parentCheck" })).status, 403);
assert.equal((await call({ action: "parentCheck", ppin: "9999" })).status, 403);
assert.equal((await parent({ action: "parentCheck" })).status, 200);
assert.equal((await handle({ pin: "5828", ppin: "1234", action: "parentCheck" }, new MemStore(), { FAMILY_PIN: "5828" }, T)).status, 403, "parent PIN unset on server");

// ---- assigned tasks ----
assert.equal((await call({ action: "assign", by: "shaun", assignee: "jayden", title: "Hack", points: 50 })).status, 403, "no parent PIN");
assert.equal((await call({ action: "assign", by: "calean", assignee: "jayden", title: "Hack", ppin: "0000" })).status, 403);
assert.equal((await parent({ action: "assign", assignee: "bob", title: "x" })).status, 400);
assert.equal((await parent({ action: "assign", assignee: "jayden", title: "   " })).status, 400);
assert.equal((await parent({ action: "assign", assignee: "jayden", title: "x", due: "tomorrow" })).status, 400);
r = await parent({ action: "assign", by: "shaun", assignee: "jayden", title: "  Clean out the garage  ", points: 500, due: "2026-11-30" });
assert.equal(r.status, 200);
assert.equal(r.body.tasks[0].title, "Clean out the garage");
assert.equal(r.body.tasks[0].points, 50);
assert.equal(r.body.tasks[0].by, "shaun");
const taskId = r.body.tasks[0].id;
const before = pts(r.body, "jayden");

assert.equal((await call({ action: "completeTask", id: taskId, person: "calean" })).status, 403, "sibling cannot finish it");
r = await call({ action: "completeTask", id: taskId, person: "jayden" });
assert.equal(r.body.tasks[0].done, true);
assert.equal(pts(r.body, "jayden") - before, 50);
assert.equal(r.body.entries.find((e) => e.chore === "task_" + taskId).label, "Clean out the garage");
r = await call({ action: "completeTask", id: taskId, person: "jayden" });
assert.equal(pts(r.body, "jayden") - before, 50, "double tap does not double count");

assert.equal((await call({ action: "reopenTask", id: taskId, person: "calean" })).status, 403);
r = await call({ action: "reopenTask", id: taskId, person: "jayden" });
assert.equal(r.body.tasks[0].done, false);
assert.equal(pts(r.body, "jayden"), before);

r = await parent({ action: "completeTask", id: taskId, person: "shaun" });
assert.equal(r.body.tasks[0].done, true, "parent can finish it for them");
assert.equal((await call({ action: "deleteTask", id: taskId })).status, 403);
r = await parent({ action: "deleteTask", id: taskId });
assert.equal(r.body.tasks.length, 0);
assert.equal((await call({ action: "completeTask", id: taskId, person: "jayden" })).status, 404);

r = await parent({ action: "assign", assignee: "calean", title: "Wash the car", points: 8 });
const oldId = r.body.tasks[0].id;
await call({ action: "completeTask", id: oldId, person: "calean" });
const later = T + 31 * 24 * 3600 * 1000;
r = await call({ action: "state" }, later);
assert.equal(r.body.tasks.length, 0, "finished tasks drop off after 30 days");
r = await parent({ action: "assign", assignee: "calean", title: "Mow", points: 5 }, later);
assert.equal(await store.get("t/" + oldId), null, "old finished task pruned");
assert.equal(r.body.entries.filter((e) => e.label === "Wash the car").length, 1, "points from pruned task stay");

// ---- editable lists ----
assert.equal((await call({ action: "setConfig", kind: "chores", items: [] })).status, 403, "needs parent PIN");
assert.equal((await parent({ action: "setConfig", kind: "weird", items: [] })).status, 400);
assert.equal((await parent({ action: "setConfig", kind: "chores", items: [{ name: "", pts: 3 }] })).status, 400);
assert.equal((await parent({ action: "setConfig", kind: "chores", items: new Array(41).fill({ name: "x", pts: 1 }) })).status, 400);

// add a chore, keep existing ids
r = await call({ action: "state" });
const chores = r.body.chores.map((c) => ({ ...c }));
chores.push({ name: "Set the table", pts: 2, icon: "🍴" });
r = await parent({ action: "setConfig", kind: "chores", items: chores });
assert.equal(r.status, 200);
assert.equal(r.body.chores.length, 11);
const newChore = r.body.chores[10];
assert.match(newChore.id, /^[a-z0-9_]+$/);
assert.equal(r.body.chores[0].id, "dishes");
r = await call({ action: "done", person: "jayden", chore: newChore.id });
assert.equal(r.status, 200);
assert.equal(r.body.entries.find((e) => e.chore === newChore.id).pts, 2);

// remove a chore: earned points and label stay
const kept = r.body.chores.filter((c) => c.id !== newChore.id);
r = await parent({ action: "setConfig", kind: "chores", items: kept });
assert.equal(r.body.chores.length, 10);
assert.equal(r.body.entries.find((e) => e.chore === newChore.id).label, "Set the table");
assert.equal((await call({ action: "done", person: "jayden", chore: newChore.id }, T + 5000)).status, 400, "removed chore cannot be done");

// bank and rewards edits, clamping, bad ids
r = await parent({ action: "setConfig", kind: "bank", items: [{ title: "Clean the garage", points: 999 }, { id: "task_x", title: "Odd id", points: 1 }] });
assert.equal(r.body.bank[0].points, 50);
assert.notEqual(r.body.bank[1].id, "task_x");
r = await parent({ action: "setConfig", kind: "rewards", items: [{ name: "Game night pick", cost: 0 }] });
assert.equal(r.body.rewards[0].cost, 1);
assert.equal(r.body.rewards[0].icon, "🎁");
r = await parent({ action: "setConfig", kind: "bank", items: [] });
assert.equal(r.body.bank.length, 0, "an emptied list stays empty");
assert.equal(cleanItems("chores", [{ id: "a", name: "A", pts: 1 }, { id: "a", name: "B", pts: 1 }], T).length, 2);
assert.notEqual(cleanItems("chores", [{ id: "a", name: "A", pts: 1 }, { id: "a", name: "B", pts: 1 }], T)[1].id, "a");

// ---- family chat ----
const cstore = new MemStore();
const cc = (o, now = T) => handle({ pin: "5828", ...o }, cstore, env, now);
r = await cc({ action: "chat" });
assert.equal(r.status, 200);
assert.deepEqual(r.body.chat.messages, []);
assert.deepEqual(r.body.chatKeys, []);

assert.equal((await cc({ action: "post", person: "bob", text: "hi" })).status, 400);
assert.equal((await cc({ action: "post", person: "calean", text: "   " })).status, 400);
r = await cc({ action: "post", person: "calean", text: "  Practice ends at 6, can someone pick me up?  " });
assert.equal(r.status, 200);
assert.equal(r.body.chat.messages.length, 1);
assert.equal(r.body.chat.messages[0].text, "Practice ends at 6, can someone pick me up?");
assert.equal(r.body.chatKeys.length, 1);
assert.equal(r.body.chatKeys[0].person, "calean");
const long = await cc({ action: "post", person: "shaun", text: "x".repeat(900) }, T + 1000);
assert.equal(long.body.chat.messages[0].text.length, 500, "long text is cut to 500");

// reminders
assert.equal((await cc({ action: "post", person: "shaun", kind: "reminder", text: "r", date: "soon" })).status, 400);
assert.equal((await cc({ action: "post", person: "shaun", kind: "reminder", text: "r", date: "2026-11-27", time: "25:99" })).status, 400);
r = await cc({ action: "post", person: "shaun", kind: "reminder", text: "Dentist at 4", forWho: "jayden", date: "2026-11-27", time: "15:30" }, T + 2000);
const rem = r.body.chat.messages[0];
assert.equal(rem.kind, "reminder");
assert.equal(rem.for, "jayden");
assert.equal(rem.time, "15:30");
assert.equal((await cc({ action: "ackReminder", id: rem.id, person: "calean" })).status, 403, "reminder is for Jayden");
r = await cc({ action: "ackReminder", id: rem.id, person: "jayden" });
assert.deepEqual(r.body.chat.messages.find((m) => m.id === rem.id).acks, ["jayden"]);
r = await cc({ action: "ackReminder", id: rem.id, person: "jayden" });
assert.deepEqual(r.body.chat.messages.find((m) => m.id === rem.id).acks, ["jayden"], "ack once");
r = await cc({ action: "post", person: "chungha", kind: "reminder", text: "Family dinner", forWho: "nobody" }, T + 3000);
assert.equal(r.body.chat.messages[0].for, "all", "unknown target falls back to everyone");
assert.equal(r.body.chat.messages[0].time, null, "time needs a date");

// delete rules
const calMsg = (await cc({ action: "chat" })).body.chat.messages.find((m) => m.person === "calean");
assert.equal((await cc({ action: "deleteMsg", id: calMsg.id, person: "jayden" })).status, 403);
assert.equal((await cc({ action: "deleteMsg", id: "../x", person: "jayden" })).status, 400);
r = await cc({ action: "deleteMsg", id: calMsg.id, person: "calean" });
assert.equal(r.body.chat.messages.some((m) => m.id === calMsg.id), false, "author can delete");
const shaunMsg = r.body.chat.messages.find((m) => m.id === rem.id);
assert.equal((await cc({ action: "deleteMsg", id: shaunMsg.id, person: "calean", ppin: "0000" })).status, 403);
r = await cc({ action: "deleteMsg", id: shaunMsg.id, person: "calean", ppin: "1234" });
assert.equal(r.body.chat.messages.some((m) => m.id === shaunMsg.id), false, "parent can delete any");

// pinned info is parent only
assert.equal((await cc({ action: "pinInfo", person: "shaun", text: "Wifi is in the drawer" })).status, 403);
r = await cc({ action: "pinInfo", person: "shaun", text: "Dentist Thursday at 4", ppin: "1234" });
assert.equal(r.body.chat.pins.length, 1);
assert.equal((await cc({ action: "pinInfo", person: "shaun", text: " ", ppin: "1234" })).status, 400);
assert.equal((await cc({ action: "deletePin", id: r.body.chat.pins[0].id })).status, 403);
r = await cc({ action: "deletePin", id: r.body.chat.pins[0].id, ppin: "1234" });
assert.equal(r.body.chat.pins.length, 0);
for (let i = 0; i < 20; i++) await cc({ action: "pinInfo", text: "note " + i, ppin: "1234" }, T + 10 + i);
assert.equal((await cc({ action: "pinInfo", text: "one too many", ppin: "1234" }, T + 100)).status, 400, "pin limit");

// only the newest 100 are shown, and messages older than 60 days are pruned on the next post
const bigStore = new MemStore();
const bc = (o, now) => handle({ pin: "5828", ...o }, bigStore, env, now);
for (let i = 0; i < 105; i++) await bc({ action: "post", person: "jayden", text: "m" + i }, T + i * 1000);
r = await bc({ action: "chat" }, T + 200000);
assert.equal(r.body.chat.messages.length, 100);
assert.equal(r.body.chat.messages[0].text, "m104");
assert.equal(r.body.chatKeys.length, 100);
const muchLater = T + 61 * 24 * 3600 * 1000;
await bc({ action: "post", person: "calean", text: "fresh" }, muchLater);
r = await bc({ action: "chat" }, muchLater);
assert.equal(r.body.chat.messages.length, 1, "old messages pruned");

// ---- lockouts ----
const lockStore = new MemStore();
for (let i = 0; i < 10; i++) assert.equal((await handle({ pin: "0000", action: "state" }, lockStore, env, T)).status, 401);
assert.equal((await handle({ pin: "5828", action: "state" }, lockStore, env, T + 1000)).status, 429);
assert.equal((await handle({ pin: "5828", action: "state" }, lockStore, env, T + 16 * 60 * 1000)).status, 200);

const pStore = new MemStore();
for (let i = 0; i < 10; i++) assert.equal((await handle({ pin: "5828", ppin: "0000", action: "parentCheck" }, pStore, env, T)).status, 403);
const locked = await handle({ pin: "5828", ppin: "1234", action: "parentCheck" }, pStore, env, T + 1000);
assert.equal(locked.status, 403);
assert.match(locked.body.error, /Too many/);
assert.equal((await handle({ pin: "5828", ppin: "1234", action: "parentCheck" }, pStore, env, T + 16 * 60 * 1000)).status, 200);
assert.equal((await handle({ pin: "5828", action: "state" }, pStore, env, T + 1000)).status, 200, "family PIN still works while parent PIN is locked");

console.log("ALL TESTS PASSED");
