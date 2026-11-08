"use strict";
const C = window.APP_CONFIG || {}, $ = (s) => document.querySelector(s);
let tok = sessionStorage.getItem("tok");
const H = (t) => { const h = { apikey: C.SUPABASE_ANON_KEY, "Content-Type": "application/json" }, bearer = t || ((C.SUPABASE_ANON_KEY || "").startsWith("eyJ") ? C.SUPABASE_ANON_KEY : ""); if (bearer) h.Authorization = "Bearer " + bearer; return h; }; // new-style sb_publishable keys are not JWTs, so they go in apikey only
function el(tag, text, cls) { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; }
function say(text, ok) { const m = $("#msg"); m.textContent = text; m.className = "toast " + (ok ? "ok" : "err"); }

async function rest(path, method = "GET", body) {
  const r = await fetch(C.SUPABASE_URL + "/rest/v1/" + path, { method, headers: { ...H(tok), Prefer: "return=minimal" }, body: body ? JSON.stringify(body) : undefined });
  if (r.status === 401) { logout(); throw new Error("সেশন শেষ। আবার লগইন করুন।"); }
  if (!r.ok) { let e = {}; try { e = await r.json(); } catch {} throw new Error(e.message || "ত্রুটি " + r.status); }
  return method === "GET" ? r.json() : null;
}
async function isAdmin(t) {
  try { const r = await fetch(C.SUPABASE_URL + "/rest/v1/admin_users?select=user_id", { headers: H(t) }); return r.ok && (await r.json()).length === 1; } catch { return false; }
}
function logout() { sessionStorage.removeItem("tok"); tok = null; $("#f").hidden = false; $("#dash").hidden = true; }

// ---- field spec: [key,label,type,required,options] ----
const DONOR_CATS = [["general","সাধারণ দাতা"],["monthly","মাসিক দাতা"],["major","প্রধান দাতা"],["overseas","প্রবাসী দাতা"],["business","ব্যবসায়ী দাতা"],["family","পারিবারিক দাতা"],["anonymous","বেনামী দাতা"],["material","সামগ্রী দাতা"]];
const METHODS = [["cash","নগদ"],["bkash","বিকাশ"],["nagad","নগদ (Nagad)"],["rocket","রকেট"],["bank","ব্যাংক"],["cheque","চেক"],["other","অন্যান্য"]];
const UNITS = ["kg","ton","bag","piece","cft","sft","meter","bundle","trip","litre","other"].map((x) => [x, x]);
const DSTAT = [["pending","অপেক্ষমাণ"],["received","গৃহীত"],["verified","যাচাইকৃত"],["rejected","বাতিল"],["refunded","ফেরত"]];
const today = () => new Date().toISOString().slice(0, 10);
const label = (list, v) => (list.find((x) => x[0] === v) || [v, v])[1];

const MODS = {
  donors: { title: "দাতা", table: "donors", fields: [
    ["full_name","পূর্ণ নাম","text",1],["father_name","পিতার নাম","text"],["phone","মোবাইল","tel"],["alt_phone","বিকল্প মোবাইল","tel"],
    ["address","ঠিকানা","text"],["village","গ্রাম","text"],["union_name","ইউনিয়ন","text"],["upazila","উপজেলা","text"],["district","জেলা","text"],
    ["category","দাতার ধরন","select",1,DONOR_CATS],["public_display","জনসমক্ষে","select",1,[["name","নাম দেখানো হবে"],["anonymous","বেনামী থাকবে"]]],["notes","মন্তব্য","text"]],
    cols: [["donor_code","আইডি"],["full_name","নাম"],["phone","মোবাইল"],["category","ধরন",(r)=>label(DONOR_CATS,r.category)],["cash_total","নগদ (যাচাইকৃত)",(r)=>taka(r.cash_total)],["material_total","সামগ্রী মূল্য",(r)=>taka(r.material_total)]] },
  donations: { title: "নগদ দান", table: "donations", fields: [
    ["donor_id","দাতা","donor",1],["donation_date","তারিখ","date",1],["amount","পরিমাণ (৳)","number",1],["method","মাধ্যম","select",1,METHODS],
    ["txn_ref","ট্রানজেকশন আইডি","text"],["bank_name","ব্যাংকের নাম","text"],["collected_by","সংগ্রহকারী","text"],["received_by","গ্রহণকারী","text"],["notes","মন্তব্য","text"]],
    cols: [["receipt_no","রসিদ"],["donation_date","তারিখ"],["donor","দাতা",(r)=>r.donors&&r.donors.full_name],["amount","পরিমাণ",(r)=>taka(r.amount)],["method","মাধ্যম",(r)=>label(METHODS,r.method)],["status","অবস্থা",(r)=>label(DSTAT,r.status)]],
    select: "*,donors(full_name)", verify: true, receipt: true },
  material_donations: { title: "সামগ্রী দান", table: "material_donations", fields: [
    ["donor_id","দাতা","donor",1],["donation_date","তারিখ","date",1],["category","ধরন (যেমন: রড, ইট)","text",1],["material_name","সামগ্রীর নাম","text",1],
    ["quantity","পরিমাণ","number",1],["unit","একক","select",1,UNITS],["est_unit_price","আনুমানিক একক মূল্য (৳)","number",1],["received_by","গ্রহণকারী","text"],["storage_location","সংরক্ষণস্থান","text"],["notes","মন্তব্য","text"]],
    cols: [["donation_date","তারিখ"],["donor","দাতা",(r)=>r.donors&&r.donors.full_name],["material_name","সামগ্রী"],["quantity","পরিমাণ",(r)=>r.quantity+" "+r.unit],["est_value","মূল্য",(r)=>taka(r.est_value)],["status","অবস্থা",(r)=>label(DSTAT,r.status)]],
    select: "*,donors(full_name)", verify: true },
  donation_promises: { title: "প্রতিশ্রুতি", table: "donation_promises", fields: [
    ["donor_id","দাতা","donor",1],["promise_date","তারিখ","date",1],["promised_amount","প্রতিশ্রুত টাকা (৳)","number",1],["promised_material","প্রতিশ্রুত সামগ্রী","text"],
    ["expected_date","প্রত্যাশিত তারিখ","date"],["follow_up_date","ফলো-আপ তারিখ","date"],["notes","মন্তব্য","text"]],
    cols: [["promise_date","তারিখ"],["donor","দাতা",(r)=>r.donors&&r.donors.full_name],["promised_amount","প্রতিশ্রুত",(r)=>taka(r.promised_amount)],["received","গৃহীত",(r)=>taka(r.received)],["outstanding","বাকি",(r)=>taka(r.outstanding)]],
    select: "*,donors(full_name)", link: true }
};
const taka = (n) => "৳" + Number(n || 0).toLocaleString("bn-BD", { maximumFractionDigits: 2 });
let donors = [];
const CUSTOM = {};

function input(f) {
  const [k, lab, type, req, opts] = f, w = el("div"), id = "f_" + k;
  const l = el("label", lab + (req ? " *" : "")); l.htmlFor = id; w.append(l);
  let i;
  if (type === "select" || type === "donor" || REFS[type]) {
    i = el("select"); const list = REFS[type] ? [["", "— বাছাই করুন —"], ...REFS[type]] : type === "donor" ? [["", "— বাছাই করুন —"], ...donors.map((d) => [d.id, d.full_name + (d.phone ? " (" + d.phone + ")" : "")])] : opts;
    list.forEach(([v, t]) => { const o = el("option", t); o.value = v; i.append(o); });
  } else if (type === "textarea") { i = el("textarea"); i.rows = 4; } else { i = el("input"); i.type = type; if (Array.isArray(opts) && type === "text") { const dl = el("datalist"); dl.id = "dl_" + k; opts.forEach((o) => dl.append(Object.assign(el("option"), { value: o }))); i.setAttribute("list", dl.id); w.append(dl); } if (type === "number") { i.step = "0.01"; i.min = "0"; } if (type === "date" && req) i.value = today(); }
  i.id = id; i.name = k; if (req) i.required = true; w.append(i); return w;
}
function formFor(m, after) {
  const f = el("form", null, "form");
  m.fields.forEach((x) => f.append(input(x)));
  f.append(Object.assign(el("button", "সংরক্ষণ করুন", "btn"), { type: "submit" }));
  f.addEventListener("submit", async (e) => {
    e.preventDefault(); const body = {};
    m.fields.forEach(([k, , type]) => { if (type === "checkbox") { body[k] = f.elements[k].checked; return; } const v = f.elements[k].value.trim(); body[k] = v === "" ? null : type === "number" ? Number(v) : v; });
    if (m.table === "donations" && body.amount <= 0) return say("পরিমাণ শূন্যের বেশি হতে হবে।");
    try { await (f.dataset.edit ? rest(m.table + "?id=eq." + f.dataset.edit, "PATCH", body) : m.rpc ? rest("rpc/" + m.rpc, "POST", body) : rest(m.table, "POST", body)); say("সংরক্ষিত হয়েছে।", 1); f.reset(); after(); } catch (er) { say(er.message); }
  });
  return f;
}
async function openTab(key) {
  document.querySelectorAll("#tabs button").forEach((b) => b.setAttribute("aria-selected", b.dataset.k === key));
  if (CUSTOM[key]) return CUSTOM[key].run($("#pane"));
  const m = MODS[key], pane = $("#pane"); pane.replaceChildren(el("div", "লোড হচ্ছে…", "state")); say("");
  try {
    donors = await rest("donors?select=id,full_name,phone&deleted_at=is.null&order=full_name");
    await loadRefs();
    let rows = await rest((m.listFrom || m.table) + "?select=" + (m.select || "*") + "&deleted_at=is.null&order=created_at.desc");
    if (key === "donors") { const t = await rest("admin_donor_totals?select=*"); const mp = Object.fromEntries(t.map((x) => [x.donor_id, x])); rows = rows.map((r) => ({ ...r, ...mp[r.id] })); }
    if (key === "donation_promises") { const t = await rest("admin_promise_status?select=*"); const mp = Object.fromEntries(t.map((x) => [x.promise_id, x])); rows = rows.map((r) => ({ ...r, ...mp[r.id] })); }
    if (m.merge) rows = await m.merge(rows);
    const sb = Object.assign(el("input"), { type: "search", placeholder: "খুঁজুন: নাম, মোবাইল, আইডি, রসিদ…" }); sb.className = "search";
    const box = el("div"); pane.replaceChildren(formFor(m, () => openTab(key)), sb);
    if (m.link) pane.append(linkForm(rows));
    if (m.top) pane.append(m.top(rows)); pane.append(box);
    const draw = () => { const q = sb.value.toLowerCase(); box.replaceChildren(list(m, rows.filter((r) => !q || JSON.stringify(r).toLowerCase().includes(q)), key)); };
    sb.addEventListener("input", draw); draw();
  } catch (er) { pane.replaceChildren(el("div", er.message, "state err")); }
}
function list(m, rows, key) {
  if (!rows.length) return el("div", "এখনও কোনো তথ্য নেই।", "state");
  const tb = el("table"), h = el("tr"); m.cols.forEach((c) => h.append(el("th", c[1]))); h.append(el("th", "কাজ")); tb.append(h);
  rows.forEach((r) => {
    const tr = el("tr"); m.cols.forEach(([k, , fn]) => tr.append(el("td", fn ? fn(r) : r[k] ?? "")));
    const td = el("td");
    const act = (t, fn) => { const b = el("button", t, "mini"); b.addEventListener("click", fn); td.append(b); };
    if (!m.rpc && r.status !== "verified") act("সম্পাদনা", () => editRow(m, r));
    if (m.verify && r.status !== "verified") act("যাচাই করুন", () => patch(m, r, m.table === "donations" ? { status: "verified", verified_by: "admin" } : { status: "verified" }, key));
    if (m.extra) m.extra(r, act, () => openTab(key));
    if (m.receipt) act("রসিদ", () => window.open("receipt.html?id=" + r.id, "_blank"));
    act("মুছুন", () => confirm("এই তথ্য আর্কাইভে যাবে (স্থায়ীভাবে মুছবে না)। নিশ্চিত?") && patch(m, r, { deleted_at: new Date().toISOString() }, key));
    tr.append(td); tb.append(tr);
  });
  const b = el("div", null, "tablebox"); b.append(tb); return b;
}
function editRow(m, r) { // fill the form above with this record; saving PATCHes it (the database still refuses edits to verified money records)
  const f = $("#pane").querySelector("form"); if (!f) return;
  m.fields.forEach(([k, , type]) => { const c = f.elements[k]; if (!c) return; if (type === "checkbox") c.checked = !!r[k]; else c.value = r[k] ?? ""; });
  f.dataset.edit = r.id; f.querySelector("button[type=submit]").textContent = "হালনাগাদ করুন (সম্পাদনা চলছে)"; f.scrollIntoView({ behavior: "smooth" }); say("সম্পাদনা মোড: ফর্মে বদলে 'হালনাগাদ করুন' চাপুন। বাতিল করতে ট্যাবটি আবার খুলুন।", 1);
}
async function patch(m, r, body, key) {
  if (body.status === "verified" && !confirm("যাচাই করলে পরিমাণ আর পরিবর্তন করা যাবে না। নিশ্চিত?")) return;
  try { await rest(m.table + "?id=eq." + r.id, "PATCH", body); say("হালনাগাদ হয়েছে।", 1); openTab(key); } catch (er) { say(er.message); }
}
function linkForm(promises) {
  const f = el("form", null, "form"), a = el("div"), b = el("div"); f.append(a, b);
  const sp = el("select"), sd = el("select"); sp.id = "lp"; sd.id = "ld";
  a.append(Object.assign(el("label", "প্রতিশ্রুতি"), { htmlFor: "lp" }), sp); b.append(Object.assign(el("label", "যে দান এই প্রতিশ্রুতির বিপরীতে (আগে যাচাই করুন)"), { htmlFor: "ld" }), sd);
  promises.forEach((p) => { const o = el("option", (p.donors && p.donors.full_name) + " — " + taka(p.promised_amount)); o.value = p.id; o.dataset.d = p.donor_id; sp.append(o); });
  const fillD = async () => { sd.replaceChildren(); const did = sp.selectedOptions[0] && sp.selectedOptions[0].dataset.d; if (!did) return;
    const ds = await rest("donations?select=id,receipt_no,amount&donor_id=eq." + did + "&status=eq.verified&deleted_at=is.null");
    ds.forEach((d) => { const o = el("option", d.receipt_no + " — " + taka(d.amount)); o.value = d.id; sd.append(o); }); };
  sp.addEventListener("change", fillD); fillD();
  f.append(Object.assign(el("button", "প্রতিশ্রুতির সাথে যুক্ত করুন", "btn"), { type: "submit" }));
  f.addEventListener("submit", async (e) => { e.preventDefault(); if (!sd.value) return say("এই দাতার কোনো যাচাইকৃত দান নেই।");
    try { await rest("promise_payments", "POST", { promise_id: sp.value, donation_id: sd.value }); say("যুক্ত হয়েছে।", 1); openTab("donation_promises"); } catch (er) { say(er.message.includes("duplicate") ? "এই দান আগেই যুক্ত করা হয়েছে।" : er.message); } });
  return f;
}
function start() {
  $("#f").hidden = true; $("#dash").hidden = false; const nav = $("#tabs"); nav.replaceChildren();
  Object.entries({ summary: CUSTOM.summary, ...MODS, ...CUSTOM }).forEach(([k, m]) => { const b = el("button", m.title); b.dataset.k = k; b.addEventListener("click", () => openTab(k)); nav.append(b); });
  openTab("summary");
}
$("#f").addEventListener("submit", async (e) => {
  e.preventDefault(); const m = $("#m");
  if (!C.SUPABASE_URL) { m.textContent = "config.js-এ Supabase তথ্য দিন।"; return; }
  m.textContent = "অপেক্ষা করুন…";
  let r; try { r = await fetch(C.SUPABASE_URL + "/auth/v1/token?grant_type=password", { method: "POST", headers: H(), body: JSON.stringify({ email: $("#e").value.trim(), password: $("#p").value }) }); }
  catch { m.textContent = "Supabase-এর সাথে যোগাযোগ হয়নি। ইন্টারনেট দেখুন এবং config.js-এর SUPABASE_URL ঠিক আছে কিনা দেখুন।"; return; }
  if (!r.ok) { let e = {}; try { e = await r.json(); } catch {} const code = e.error_code || e.code || "", raw = e.msg || e.message || e.error_description || e.error || "";
    m.textContent = code === "invalid_credentials" || /invalid login/i.test(raw) ? "ইমেইল বা পাসওয়ার্ড ভুল। মনে রাখুন: লাগবে Authentication → Users-এ দেওয়া অ্যাডমিন পাসওয়ার্ড, প্রজেক্ট তৈরির সময়ের ডাটাবেস পাসওয়ার্ড নয়।"
      : code === "email_not_confirmed" || /not confirmed/i.test(raw) ? "ইমেইল নিশ্চিত (confirm) হয়নি। Supabase → Authentication → Users-এ ইউজার মুছে 'Auto Confirm User' টিক দিয়ে আবার বানান।"
      : r.status === 401 || r.status === 403 || /api key|apikey/i.test(raw) ? "চাবি (key) ভুল। config.js-এ SUPABASE_ANON_KEY আবার কপি করুন। (" + r.status + ")"
      : "লগইন হয়নি (কোড " + r.status + "): " + raw; return; }
  const t = (await r.json()).access_token;
  if (!(await isAdmin(t))) { m.textContent = "পাসওয়ার্ড ঠিক, কিন্তু এই ইউজার এখনও অ্যাডমিন তালিকায় নেই। SQL Editor-এ insert into admin_users … লাইনটি আবার চালান, তারপর select * from admin_users; দিয়ে দেখুন।"; return; }
  tok = t; sessionStorage.setItem("tok", t); m.textContent = ""; start();
});
$("#out").addEventListener("click", logout);
(async () => { if (tok && (await isAdmin(tok))) start(); else logout(); })();
