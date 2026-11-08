"use strict";
// Phase 5 (admin): Excel backup / template / validated import, construction progress, photos & documents, report launcher.
const stamp = () => { const d = new Date(), p = (n) => String(n).padStart(2, "0"); return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()); };
async function fetchAll(table, order = "id") { const out = []; for (let off = 0; off < 30000; off += 1000) { const part = await rest(table + "?select=*&order=" + order + "&limit=1000&offset=" + off); out.push(...part); if (part.length < 1000) break; } return out; }
const toSheet = (rows) => { if (!rows.length) return [["(কোনো তথ্য নেই)"]]; const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))]; return [keys, ...rows.map((r) => keys.map((k) => r[k] ?? null))]; };

// [sheet, table, order] — everything an admin can create
const EXP = [["Donors","donors"],["Cash Donations","donations"],["Material Donations","material_donations"],["Donation Promises","donation_promises"],["Promise Links","promise_payments","promise_id"],
  ["Expenses","expenses"],["Expense Payments","expense_payments"],["Workers","workers"],["Worker Attendance","worker_attendance"],["Worker Payments","worker_payments"],["Contractors","contractors"],["Contracts","contracts"],
  ["Suppliers","suppliers"],["Purchases","purchases"],["Purchase Items","purchase_items"],["Inventory","inventory_items"],["Stock Movements","stock_movements"],["Accounts","financial_accounts"],
  ["Cashbook & Bankbook","financial_transactions"],["Reconciliations","reconciliations"],["Construction Progress","construction_stages"],["Gallery Index","project_gallery"],["Documents Index","project_documents"],["Import Logs","import_logs"],["Audit Log","audit_logs"]];

// Import spec: [sheet, table, natural-key columns, columns]. name* = required. types: uuid date num pos bool enum(a|b) ref(table)
const IMP = [
  ["Donors","donors",["donor_code"],"id:uuid,donor_code,full_name*,father_name,phone,alt_phone,address,village,union_name,upazila,district,category:enum(general|monthly|major|overseas|business|family|anonymous|material),public_display:enum(name|anonymous),notes"],
  ["Workers","workers",["worker_code"],"id:uuid,worker_code,full_name*,father_name,phone,address,category:enum(mason|helper|electrician|plumber|painter|carpenter|rod_binder|supervisor|other),daily_wage*:num,joining_date:date,notes"],
  ["Suppliers","suppliers",["supplier_code"],"id:uuid,supplier_code,business_name*,owner_name,phone,address,category"],
  ["Contractors","contractors",[],"id:uuid,name*,phone,address,notes"],
  ["Inventory","inventory_items",["name"],"id:uuid,name*,unit*:enum(kg|ton|bag|piece|cft|sft|meter|bundle|trip|litre|other),storage_location,opening_stock*:num"],
  ["Cash Donations","donations",["receipt_no"],"id:uuid,receipt_no,donor_id*:ref(donors),donation_date*:date,amount*:pos,method*:enum(cash|bkash|nagad|rocket|bank|cheque|other),txn_ref,bank_name,collected_by,received_by,verified_by,notes,status:enum(pending|received|verified|rejected|refunded)"],
  ["Material Donations","material_donations",[],"id:uuid,donor_id*:ref(donors),category*,material_name*,quantity*:pos,unit*:enum(kg|ton|bag|piece|cft|sft|meter|bundle|trip|litre|other),est_unit_price:num,donation_date*:date,received_by,storage_location,notes,status:enum(pending|received|verified|rejected)"],
  ["Donation Promises","donation_promises",[],"id:uuid,donor_id*:ref(donors),promised_amount:num,promised_material,promise_date*:date,expected_date:date,follow_up_date:date,notes,status:enum(promised|partial|fulfilled|cancelled|follow_up)"],
  ["Expenses","expenses",[],"id:uuid,expense_date*:date,category*,description*,total_amount*:num,paid_to,supplier_name,invoice_no,approved_by,notes,is_public:bool"],
  ["Worker Attendance","worker_attendance",["worker_id","work_date"],"id:uuid,worker_id*:ref(workers),work_date*:date,present:bool,work_category,daily_wage*:num,overtime:num"]
].map(([sheet, table, key, spec]) => ({ sheet, table, key, cols: spec.split(",").map((s) => { const m = /^([a-z_]+)(\*)?(?::(.+))?$/.exec(s); return { n: m[1], req: !!m[2], t: m[3] || "text" }; }) }));
const GEN_ID = new Set(["donors", "workers"]);
const serial = (n) => new Date(Math.round((n - 25569) * 86400000)).toISOString().slice(0, 10);
function conv(v, c, refs) { // -> [value, error]
  if (v === undefined || v === null || String(v).trim() === "") return [undefined, c.req ? c.n + " আবশ্যক" : null];
  const s = typeof v === "string" ? v.trim() : v;
  if (c.t === "text") return [String(s), null];
  if (c.t === "uuid") return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s) ? [String(s).toLowerCase(), null] : [undefined, c.n + " সঠিক আইডি নয়"];
  if (c.t === "num" || c.t === "pos") { const n = Number(String(s).replace(/,/g, "")); return !isFinite(n) || n < 0 || (c.t === "pos" && n <= 0) ? [undefined, c.n + (c.t === "pos" ? " শূন্যের বেশি সংখ্যা হতে হবে" : " সঠিক সংখ্যা নয়")] : [n, null]; }
  if (c.t === "date") { const d = typeof s === "number" ? serial(s) : String(s).slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d)) ? [d, null] : [undefined, c.n + " তারিখ YYYY-MM-DD হতে হবে"]; }
  if (c.t === "bool") { const b = String(s).toLowerCase(); return ["true", "1", "yes", "হ্যাঁ"].includes(b) ? [true, null] : ["false", "0", "no", "না"].includes(b) ? [false, null] : [undefined, c.n + " হ্যাঁ/না হতে হবে"]; }
  if (c.t.startsWith("enum(")) { const l = c.t.slice(5, -1).split("|"), x = String(s).toLowerCase(); return l.includes(x) ? [x, null] : [undefined, c.n + " অবশ্যই: " + l.join("/")]; }
  if (c.t.startsWith("ref(")) { const id = refs[c.t.slice(4, -1)].get(String(s).toLowerCase()); return id ? [id, null] : [undefined, c.n + " '" + s + "' পাওয়া যায়নি"]; }
  return [String(s), null];
}
async function analyse(wb) {
  const existing = {}, refs = { donors: new Map(), workers: new Map() }, plan = [];
  for (const sp of IMP) { const keys = ["id", ...sp.key].join(","); existing[sp.table] = await rest(sp.table + "?select=" + keys + "&limit=100000"); }
  existing.donors.forEach((r) => { refs.donors.set(r.id, r.id); if (r.donor_code) refs.donors.set(r.donor_code.toLowerCase(), r.id); });
  existing.workers.forEach((r) => { refs.workers.set(r.id, r.id); if (r.worker_code) refs.workers.set(r.worker_code.toLowerCase(), r.id); });
  for (const sp of IMP) {
    const rows = wb[sp.sheet]; if (!rows) continue;
    const head = (rows[0] || []).map((h) => String(h ?? "").trim()), idx = Object.fromEntries(head.map((h, i) => [h, i])), res = { sp, valid: [], dup: 0, errors: [], total: 0, headErr: null };
    const miss = sp.cols.filter((c) => c.req && !(c.n in idx) && !(c.n === "donor_id" && "donor_code" in idx)).map((c) => c.n);
    if (miss.length) { res.headErr = "কলাম নেই: " + miss.join(", "); plan.push(res); continue; }
    const seenId = new Set(existing[sp.table].map((r) => r.id)), seenKey = new Set(existing[sp.table].map((r) => sp.key.map((k) => String(r[k] ?? "").toLowerCase()).join("|")).filter((k) => k.replace(/\|/g, "")));
    // pass 1: register new donors/workers so later sheets (and later rows) can reference them
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] || []; if (row.every((x) => x === undefined || x === null || x === "")) continue; res.total++;
      const obj = {}, errs = [];
      for (const c of sp.cols) { const [v, e] = conv(row[idx[c.n]], c, refs); if (e) errs.push(e); else if (v !== undefined) obj[c.n] = v; }
      if (errs.length) { res.errors.push("সারি " + (i + 1) + ": " + errs.join("; ")); continue; }
      const k = sp.key.map((kk) => String(obj[kk] ?? "").toLowerCase()).join("|");
      if ((obj.id && seenId.has(obj.id)) || (k.replace(/\|/g, "") && seenKey.has(k))) { res.dup++; continue; }
      if (GEN_ID.has(sp.table) && !obj.id) obj.id = crypto.randomUUID();
      if (obj.id) seenId.add(obj.id); if (k.replace(/\|/g, "")) seenKey.add(k);
      if (sp.table === "donors") { refs.donors.set(obj.id, obj.id); if (obj.donor_code) refs.donors.set(obj.donor_code.toLowerCase(), obj.id); }
      if (sp.table === "workers") { refs.workers.set(obj.id, obj.id); if (obj.worker_code) refs.workers.set(obj.worker_code.toLowerCase(), obj.id); }
      res.valid.push(obj);
    }
    plan.push(res);
  }
  return plan;
}
async function runImport(plan, filename) {
  const log = [];
  for (const r of plan) { if (!r.valid.length) { log.push({ sheet: r.sp.sheet, imported: 0, duplicates: r.dup, errors: r.errors.length }); continue; }
    try { for (let i = 0; i < r.valid.length; i += 100) await rest(r.sp.table, "POST", r.valid.slice(i, i + 100));
      log.push({ sheet: r.sp.sheet, imported: r.valid.length, duplicates: r.dup, errors: r.errors.length }); }
    catch (er) { log.push({ sheet: r.sp.sheet, imported: 0, duplicates: r.dup, errors: r.errors.length, failed: er.message }); break; } }
  await rest("import_logs", "POST", { filename, summary: log }).catch(() => {}); return log;
}

CUSTOM.backup = { title: "এক্সেল ও ব্যাকআপ", run: async (pane) => {
  say(""); const out = el("div"), imp = el("div");
  const b1 = el("button", "সম্পূর্ণ ব্যাকআপ ডাউনলোড (Excel)", "btn"), b2 = el("button", "খালি টেমপ্লেট ডাউনলোড", "btn"), file = Object.assign(el("input"), { type: "file", accept: ".xlsx", id: "xf" });
  b1.addEventListener("click", async () => { b1.disabled = true; say("ব্যাকআপ তৈরি হচ্ছে…", 1);
    try { const sheets = {}, tot = await rest("public_totals?select=*"), bal = await rest("admin_account_balances?select=name_bn,balance");
      sheets["Dashboard"] = [["বিষয়", "মান"], ["তৈরির সময়", new Date().toISOString()], ...Object.entries(tot[0] || {}), ...bal.map((b) => ["জের: " + b.name_bn, Number(b.balance)])];
      for (const [sn, t, o] of EXP) sheets[sn] = toSheet(await fetchAll(t, o || "id"));
      MXL.download(sheets, "hari-chowdhury-backup-" + stamp() + ".xlsx"); say("ব্যাকআপ ডাউনলোড হয়েছে। নিরাপদ জায়গায় রাখুন।", 1); } catch (er) { say(er.message); } b1.disabled = false; });
  b2.addEventListener("click", () => { const s = { "নির্দেশনা": [["নিয়ম"], ["তারিখ: YYYY-MM-DD"], ["* চিহ্নিত কলাম আবশ্যক (নিচে দেখুন)"], ["দাতা/শ্রমিকের কলামে আইডি বা কোড (যেমন D-..., W-...) দিন"], ["বিদ্যমান রেকর্ড কখনও পরিবর্তন হয় না; ডুপ্লিকেট বাদ যাবে"], ["status=verified দিলে নগদ দান হিসাবখাতায় জমা হবে"]] };
    IMP.forEach((sp) => { s[sp.sheet] = [sp.cols.map((c) => c.n)]; s["নির্দেশনা"].push([sp.sheet + ": আবশ্যক — " + sp.cols.filter((c) => c.req).map((c) => c.n).join(", ")]); });
    MXL.download(s, "hari-chowdhury-template.xlsx"); });
  const prev = el("div");
  file.addEventListener("change", async () => { prev.replaceChildren(el("div", "ফাইল পরীক্ষা করা হচ্ছে…", "state"));
    try { const f = file.files[0]; if (!f) return; if (f.size > 8e6) throw new Error("ফাইল ৮ MB-এর বেশি।");
      const wb = await MXL.read(await f.arrayBuffer()), plan = await analyse(wb); if (!plan.length) throw new Error("চেনা কোনো শিট পাওয়া যায়নি (" + IMP.map((x) => x.sheet).join(", ") + ")");
      const tb = el("table"), h = el("tr"); ["শিট", "মোট সারি", "ইমপোর্ট হবে", "ডুপ্লিকেট (বাদ)", "ত্রুটি (বাদ)"].forEach((x) => h.append(el("th", x))); tb.append(h);
      plan.forEach((r) => { const tr = el("tr"); [r.sp.sheet, r.total, r.headErr || r.valid.length, r.dup, r.errors.length].forEach((x) => tr.append(el("td", x))); tb.append(tr); });
      const bx = el("div", null, "tablebox"); bx.append(tb); const errs = plan.flatMap((r) => r.errors.slice(0, 15).map((e) => r.sp.sheet + " — " + e));
      const go = el("button", "ইমপোর্ট নিশ্চিত করুন", "btn"); go.disabled = !plan.some((r) => r.valid.length);
      go.addEventListener("click", async () => { if (!confirm("ফাইলের বৈধ সারিগুলো যুক্ত হবে। নিশ্চিত?")) return; go.disabled = true; const log = await runImport(plan, f.name);
        say(log.some((l) => l.failed) ? "ইমপোর্ট আংশিক: " + log.find((l) => l.failed).failed : "ইমপোর্ট সম্পন্ন: " + log.reduce((s, l) => s + l.imported, 0) + "টি সারি।", log.some((l) => l.failed) ? 0 : 1);
        prev.replaceChildren(el("h2", "ইমপোর্ট সারাংশ"), (() => { const t = el("table"), hh = el("tr"); ["শিট", "যুক্ত", "ডুপ্লিকেট", "ত্রুটি", "ব্যর্থতা"].forEach((x) => hh.append(el("th", x))); t.append(hh); log.forEach((l) => { const tr = el("tr"); [l.sheet, l.imported, l.duplicates, l.errors, l.failed || ""].forEach((x) => tr.append(el("td", x))); t.append(tr); }); const b = el("div", null, "tablebox"); b.append(t); return b; })()); });
      prev.replaceChildren(el("h2", "প্রিভিউ — এখনও কিছু যুক্ত হয়নি"), bx, ...(errs.length ? [el("p", "ত্রুটির উদাহরণ:", "note"), el("pre", errs.join("\n"), "note")] : []), go);
    } catch (er) { prev.replaceChildren(el("div", er.message, "state err")); } });
  imp.append(el("h2", "Excel থেকে তথ্য আমদানি"), el("p", "প্রথমে টেমপ্লেট নামিয়ে পূরণ করুন। সিস্টেম যাচাই করে প্রিভিউ দেখাবে; আপনি নিশ্চিত না করা পর্যন্ত কিছু যুক্ত হবে না। বিদ্যমান রেকর্ড কখনও মোছা বা বদলানো হয় না।", "note"), file, prev);
  const bx = el("div", null, "cards small"); [b1, b2].forEach((b) => { b.style.maxWidth = ""; });
  out.append(el("h2", "ব্যাকআপ"), el("p", "সব তালিকা একটি Excel ফাইলে নামবে (ব্যক্তিগত তথ্যসহ — নিরাপদে রাখুন)। এটি রেকর্ড/পুনরুদ্ধারের সহায়ক; মূল তথ্যভান্ডার Supabase। ছবি/নথির ফাইল এতে থাকে না, শুধু তালিকা।", "note"), b1, b2);
  pane.replaceChildren(out, imp);
} };

// ---------- Construction progress ----------
CUSTOM.progress = { title: "নির্মাণ অগ্রগতি", run: async (pane) => {
  say(""); pane.replaceChildren(el("div", "লোড হচ্ছে…", "state"));
  try {
    const st = await rest("construction_stages?select=*&order=seq"), avg = st.length ? Math.round(st.reduce((s, x) => s + x.progress_pct, 0) / st.length) : 0;
    const bar = el("div", null, "card gold"); bar.append(el("small", "সামগ্রিক অগ্রগতি (সব ধাপের গড়)"), el("b", avg + "%"));
    const tb = el("table"), h = el("tr"); ["#", "ধাপ", "%", "শুরু", "প্রত্যাশিত শেষ", "প্রকৃত শেষ", "আনুমানিক খরচ", "প্রকৃত খরচ", "দায়িত্বপ্রাপ্ত", "মন্তব্য", "প্রকাশ", ""].forEach((x) => h.append(el("th", x))); tb.append(h);
    st.forEach((s) => { const tr = el("tr"), I = (t, v, w) => { const i = Object.assign(el("input"), { type: t, value: v ?? "" }); if (t === "number") { i.min = "0"; i.step = "0.01"; } i.style.minWidth = w || "110px"; return i; };
      const f = { p: I("number", s.progress_pct, "70px"), a: I("date", s.start_date), b: I("date", s.expected_end), c: I("date", s.actual_end), d: I("number", s.estimated_cost), e: I("number", s.actual_cost), r: I("text", s.responsible), n: I("text", s.notes, "160px"), pub: Object.assign(el("input"), { type: "checkbox", checked: s.is_public }) };
      f.p.max = "100"; f.p.step = "1"; const sv = el("button", "সংরক্ষণ", "mini");
      sv.addEventListener("click", async () => { const pc = Number(f.p.value); if (!(pc >= 0 && pc <= 100)) return say("শতাংশ ০–১০০ হতে হবে।");
        try { await rest("construction_stages?id=eq." + s.id, "PATCH", { progress_pct: pc, start_date: f.a.value || null, expected_end: f.b.value || null, actual_end: f.c.value || null, estimated_cost: Number(f.d.value || 0), actual_cost: Number(f.e.value || 0), responsible: f.r.value || null, notes: f.n.value || null, is_public: f.pub.checked }); say("সংরক্ষিত।", 1); CUSTOM.progress.run(pane); } catch (er) { say(er.message); } });
      [el("td", s.seq), el("td", s.name_bn), ...["p", "a", "b", "c", "d", "e", "r", "n", "pub"].map((k) => { const td = el("td"); td.append(f[k]); return td; }), (() => { const td = el("td"); td.append(sv); return td; })()].forEach((td) => tr.append(td)); tb.append(tr); });
    const bx = el("div", null, "tablebox"); bx.append(tb); pane.replaceChildren(bar, el("p", "সামগ্রিক % সব ধাপের সমান গড়; খরচের ঘর হাতে দেওয়া আনুমানিক তথ্য (হিসাবখাতা থেকে স্বয়ংক্রিয় নয়)।", "note"), bx);
  } catch (er) { pane.replaceChildren(el("div", er.message, "state err")); }
} };

// ---------- Photos (public bucket, approved ones listed) and private documents ----------
const GCAT = [["old_mosque","পুরাতন মসজিদ"],["proposed","প্রস্তাবিত নতুন মসজিদ"],["design","স্থাপত্য নকশা"],["demolition","ভাঙার কাজ"],["foundation","ভিত্তি"],["construction","নির্মাণ"],["interior","অভ্যন্তর"],["exterior","বহির্ভাগ"],["final","সমাপ্তির ছবি"]];
const DKIND = [["bill","বিল"],["invoice","ইনভয়েস"],["receipt","রসিদ"],["contract","চুক্তিপত্র"],["bank_slip","ব্যাংক জমা স্লিপ"],["delivery_note","মাল বুঝে পাওয়ার রসিদ"],["other","অন্যান্য"]];
const pubUrl = (p) => C.SUPABASE_URL + "/storage/v1/object/public/public-gallery/" + p.split("/").map(encodeURIComponent).join("/");
async function shrink(file, maxDim, q) { const b = await createImageBitmap(file), s = Math.min(1, maxDim / Math.max(b.width, b.height)), c = document.createElement("canvas"); c.width = Math.round(b.width * s); c.height = Math.round(b.height * s); c.getContext("2d").drawImage(b, 0, 0, c.width, c.height); return new Promise((r) => c.toBlob(r, "image/jpeg", q)); }
async function putObj(bucket, path, blob) { const r = await fetch(C.SUPABASE_URL + "/storage/v1/object/" + bucket + "/" + path, { method: "POST", headers: { apikey: C.SUPABASE_ANON_KEY, Authorization: "Bearer " + tok, "Content-Type": blob.type }, body: blob }); if (!r.ok) throw new Error("আপলোড ব্যর্থ (" + r.status + ")। স্টোরেজ সীমা বা অনুমতি দেখুন।"); }
async function delObj(bucket, path) { await fetch(C.SUPABASE_URL + "/storage/v1/object/" + bucket + "/" + path, { method: "DELETE", headers: { apikey: C.SUPABASE_ANON_KEY, Authorization: "Bearer " + tok } }).catch(() => {}); }
async function prepare(file, allowPdf) {
  if (file.size > 20e6) throw new Error("ফাইল ২০ MB-এর বেশি।");
  if (file.type === "application/pdf" && allowPdf) { if (file.size > 5e6) throw new Error("PDF ৫ MB-এর বেশি।"); return { blob: file, ext: "pdf" }; }
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("শুধু JPG, PNG, WEBP" + (allowPdf ? " বা PDF" : "") + " অনুমোদিত।");
  let blob = await shrink(file, 1600, 0.8); if (blob.size > 1.9e6) blob = await shrink(file, 1200, 0.6); if (blob.size > 1.9e6) throw new Error("ছবি সংকুচিত করেও ২ MB-এর বেশি।"); return { blob, ext: "jpg" };
}
CUSTOM.gallery = { title: "ছবি ও নথি", run: async (pane) => {
  say(""); pane.replaceChildren(el("div", "লোড হচ্ছে…", "state"));
  try {
    const [gal, docs] = await Promise.all([rest("project_gallery?select=*&deleted_at=is.null&order=created_at.desc"), rest("project_documents?select=*&deleted_at=is.null&order=created_at.desc")]);
    const gc = sel("gc", GCAT), gt = txt("gt"), gf = Object.assign(el("input"), { type: "file", accept: "image/jpeg,image/png,image/webp", id: "gf" }), gp = Object.assign(el("input"), { type: "checkbox", id: "gp" });
    const f1 = mk("ছবি আপলোড (স্বয়ংক্রিয়ভাবে সংকুচিত হবে)", [["ধরন", gc], ["শিরোনাম", gt], ["ছবি", gf], ["জনসমক্ষে প্রকাশ করুন", gp]], "আপলোড", async () => {
      const file = gf.files[0]; if (!file) return say("ছবি বাছাই করুন।"); const { blob, ext } = await prepare(file, false), path = gc.value + "/" + crypto.randomUUID() + "." + ext;
      await putObj("public-gallery", path, blob);
      try { await rest("project_gallery", "POST", { category: gc.value, title: gt.value || null, storage_path: path, is_public: gp.checked }); } catch (er) { await delObj("public-gallery", path); throw er; }
      say("আপলোড হয়েছে।", 1); CUSTOM.gallery.run(pane); });
    const dk = sel("dk", DKIND), dt2 = txt("dt2"), df = Object.assign(el("input"), { type: "file", accept: "application/pdf,image/jpeg,image/png,image/webp", id: "df" });
    const f2 = mk("ব্যক্তিগত নথি আপলোড (বিল, চুক্তি, স্লিপ — কখনও জনসমক্ষে নয়)", [["ধরন", dk], ["শিরোনাম", dt2], ["ফাইল (PDF/ছবি)", df]], "আপলোড", async () => {
      const file = df.files[0]; if (!file) return say("ফাইল বাছাই করুন।"); const { blob, ext } = await prepare(file, true), path = dk.value + "/" + crypto.randomUUID() + "." + ext;
      await putObj("private-docs", path, blob);
      try { await rest("project_documents", "POST", { kind: dk.value, title: dt2.value || null, storage_path: path }); } catch (er) { await delObj("private-docs", path); throw er; }
      say("আপলোড হয়েছে।", 1); CUSTOM.gallery.run(pane); });
    const grid = el("div", null, "cards small");
    gal.forEach((g) => { const c = el("div", null, "card " + (g.is_public ? "" : "gold")), im = Object.assign(el("img"), { src: pubUrl(g.storage_path), alt: g.title || "", loading: "lazy" }); im.className = "thumb";
      const t1 = el("small", label(GCAT, g.category) + " — " + (g.is_public ? "প্রকাশিত" : "অপ্রকাশিত") + (g.title ? " — " + g.title : ""));
      const a = el("button", g.is_public ? "গোপন করুন" : "প্রকাশ করুন", "mini"), d = el("button", "আর্কাইভ", "mini");
      a.addEventListener("click", async () => { try { await rest("project_gallery?id=eq." + g.id, "PATCH", { is_public: !g.is_public }); CUSTOM.gallery.run(pane); } catch (er) { say(er.message); } });
      d.addEventListener("click", async () => { if (!confirm("তালিকা থেকে সরানো হবে। নিশ্চিত?")) return; try { await rest("project_gallery?id=eq." + g.id, "PATCH", { deleted_at: new Date().toISOString(), is_public: false }); CUSTOM.gallery.run(pane); } catch (er) { say(er.message); } });
      c.append(im, t1, a, d); grid.append(c); });
    const dl = el("div"); docs.forEach((d) => { const r = el("p"), b = el("button", "খুলুন", "mini"); r.append(b, document.createTextNode(" " + label(DKIND, d.kind) + (d.title ? " — " + d.title : "") + " (" + d.created_at.slice(0, 10) + ")"));
      b.addEventListener("click", async () => { try { const x = await fetch(C.SUPABASE_URL + "/storage/v1/object/sign/private-docs/" + d.storage_path.split("/").map(encodeURIComponent).join("/"), { method: "POST", headers: { apikey: C.SUPABASE_ANON_KEY, Authorization: "Bearer " + tok, "Content-Type": "application/json" }, body: JSON.stringify({ expiresIn: 300 }) });
        if (!x.ok) throw new Error("লিংক তৈরি হয়নি"); window.open(C.SUPABASE_URL + "/storage/v1" + (await x.json()).signedURL, "_blank", "noopener"); } catch (er) { say(er.message); } }); dl.append(r); });
    pane.replaceChildren(f1, el("h2", "ছবির তালিকা"), gal.length ? grid : el("div", "এখনও কোনো ছবি নেই।", "state"), f2, el("h2", "নথির তালিকা"), docs.length ? dl : el("div", "এখনও কোনো নথি নেই।", "state"),
      el("p", "নথি ব্যক্তিগত বাকেটে থাকে; ৫ মিনিটের অস্থায়ী লিংকে খোলে। ছবি প্রকাশের বাকেটে থাকে (ফাইলের নাম অনুমান করা যায় না); কেবল 'প্রকাশিত' ছবি সাইটে দেখায়।", "note"));
  } catch (er) { pane.replaceChildren(el("div", er.message, "state err")); }
} };

// ---------- Report launcher ----------
const RTYPES = [["donations","দান প্রতিবেদন (দৈনিক/মাসিক/বার্ষিক — সময় বাছুন)"],["donors","দাতাভিত্তিক"],["materials","সামগ্রী দান"],["expenses","খরচ"],["wages","শ্রমিক মজুরি (সারসংক্ষেপ)"],["wagesheet","মজুরি শিট — সময় বাছুন, স্বাক্ষরসহ"],["contractors","ঠিকাদার পেমেন্ট"],["purchases","সরবরাহকারী ক্রয়"],["inventory","স্টক"],["pledges","বাকি প্রতিশ্রুতি"],["progress","নির্মাণ অগ্রগতি"],["financial","সম্পূর্ণ আর্থিক বিবরণী"]];
CUSTOM.reports = { title: "প্রতিবেদন", run: async (pane) => {
  say(""); const t = sel("rt", RTYPES), a = Object.assign(el("input"), { type: "date", id: "rf" }), b = Object.assign(el("input"), { type: "date", id: "rto" }), l = sel("rl", [["bn", "বাংলা"], ["en", "English"]]);
  const f = mk("প্রতিবেদন তৈরি (নতুন ট্যাবে খুলবে; Print → Save as PDF)", [["ধরন", t], ["শুরুর তারিখ (ঐচ্ছিক)", a], ["শেষ তারিখ (ঐচ্ছিক)", b], ["ভাষা", l]], "প্রতিবেদন খুলুন", async () => window.open("report.html?type=" + t.value + "&from=" + a.value + "&to=" + b.value + "&lang=" + l.value, "_blank"));
  pane.replaceChildren(f, el("p", "প্রতিবেদনে শুধু যাচাইকৃত/নথিভুক্ত তথ্য থাকে। তারিখ না দিলে সব সময়।", "note"));
} };

// ---------- Overall summary: cash in, materials in (pledged vs received), where money was spent ----------
CUSTOM.summary = { title: "সারসংক্ষেপ", run: async (pane) => {
  say(""); pane.replaceChildren(el("div", "লোড হচ্ছে…", "state"));
  try {
    const [don, mat, pl, ps, ex, wp, acc] = await Promise.all([
      rest("donations?select=amount,method&status=eq.verified&deleted_at=is.null"), rest("material_donations?select=category,unit,quantity,est_value&status=eq.verified&deleted_at=is.null"),
      rest("donation_promises?select=id,promised_amount,promised_material,promised_unit,promised_quantity&status=neq.cancelled&deleted_at=is.null"), rest("admin_promise_status?select=promise_id,outstanding,material_received"),
      rest("expenses?select=category,total_amount,paid_amount,outstanding,supplier_name,paid_to&deleted_at=is.null"), rest("worker_payments?select=amount&voided_at=is.null"), rest("admin_account_balances?select=name_bn,balance")]);
    const sum = (a, f) => a.reduce((s, x) => s + Number(f(x) || 0), 0), cash = sum(don, (x) => x.amount), paid = sum(ex, (x) => x.paid_amount), wages = sum(wp, (x) => x.amount), spent = paid + wages;
    const cards = el("div", null, "cards small"), card = (t, v, c) => { const d = el("div", null, "card " + (c || "")); d.append(el("small", t), el("b", v)); cards.append(d); };
    card("মোট নগদ দান (যাচাইকৃত)", taka(cash)); card("মোট খরচ (পরিশোধিত, মজুরিসহ)", taka(spent)); card("নগদ তহবিলের জের", taka(sum(acc, (a) => a.balance)));
    card("সামগ্রী দানের আনুমানিক মূল্য (নগদ নয়)", taka(sum(mat, (x) => x.est_value)), "gold"); card("অপরিশোধিত বিল", taka(sum(ex, (x) => x.outstanding)), "bad"); card("বাকি নগদ প্রতিশ্রুতি", taka(sum(ps, (x) => x.outstanding)), "gold");
    const T = (heads, rows) => { if (!rows.length) return el("div", "এখনও কোনো তথ্য নেই।", "state"); const tb = el("table"), h = el("tr"); heads.forEach((x) => h.append(el("th", x))); tb.append(h); rows.forEach((r) => { const tr = el("tr"); r.forEach((c, i) => tr.append(el("td", c, i ? "n" : ""))); tb.append(tr); }); const b = el("div", null, "tablebox"); b.append(tb); return b; };
    const byM = {}; don.forEach((x) => (byM[x.method] = (byM[x.method] || 0) + Number(x.amount)));
    const g = {}, key = (n, u) => String(n || "").trim().toLowerCase() + "|" + (u || ""), slot = (n, u) => (g[key(n, u)] ||= { n: String(n || "").trim(), u: u || "", got: 0, val: 0, pled: 0, pend: 0 });
    mat.forEach((x) => { const o = slot(x.category, x.unit); o.got += Number(x.quantity); o.val += Number(x.est_value); });
    const mr = Object.fromEntries(ps.map((x) => [x.promise_id, Number(x.material_received)]));
    pl.filter((p) => Number(p.promised_quantity) > 0).forEach((p) => { const o = slot(p.promised_material, p.promised_unit), q = Number(p.promised_quantity); o.pled += q; o.pend += Math.max(q - (mr[p.id] || 0), 0); });
    const cat = {}, who = {}; ex.forEach((x) => { const c = (cat[x.category] ||= { b: 0, p: 0, d: 0 }); c.b += +x.total_amount; c.p += +x.paid_amount; c.d += +x.outstanding; const w = x.supplier_name || x.paid_to || "—"; who[w] = (who[w] || 0) + +x.paid_amount; });
    const crow = Object.entries(cat).sort((a, b) => b[1].p - a[1].p).map(([k, v]) => [k, taka(v.b), taka(v.p), taka(v.d), spent ? Math.round((v.p / spent) * 100) + "%" : ""]); if (wages) crow.push(["শ্রমিক মজুরি", "", taka(wages), "", spent ? Math.round((wages / spent) * 100) + "%" : ""]);
    const wrow = Object.entries(who).filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => [k, taka(v)]);
    const btns = el("div", null, "dls"), rb = (t, ty) => { const b = el("button", t, "btn"); b.addEventListener("click", () => window.open("report.html?type=" + ty + "&lang=bn", "_blank")); btns.append(b); }; rb("আর্থিক বিবরণী (প্রিন্ট/PDF)", "financial"); rb("সামগ্রী প্রতিবেদন", "materials"); rb("খরচের প্রতিবেদন", "expenses");
    pane.replaceChildren(el("h2", "এক নজরে হিসাব"), cards, el("p", "শুধু যাচাইকৃত দান ও নথিভুক্ত খরচ। নগদ, সামগ্রী ও প্রতিশ্রুতি আলাদা — কখনও যোগ করা হয় না।", "note"), btns,
      el("h2", "নগদ দান — মাধ্যম অনুযায়ী"), T(["মাধ্যম", "পরিমাণ"], Object.entries(byM).map(([k, v]) => [label(METHODS, k), taka(v)])),
      el("h2", "সামগ্রী — কত প্রতিশ্রুত, কত পাওয়া গেছে"), T(["সামগ্রী", "একক", "প্রতিশ্রুত", "মোট গৃহীত (সব দান)", "প্রতিশ্রুতির বাকি", "আনুমানিক মূল্য"], Object.values(g).sort((a, b) => b.got - a.got).map((o) => [o.n || "—", o.u || "—", o.pled || "", o.got || "", o.pled ? o.pend : "", o.val ? taka(o.val) : ""])),
      el("p", "সামগ্রীর নাম ও একক একই লিখুন (সাজেশন আসে), নাহলে আলাদা সারি হবে। এক এককের সাথে অন্য একক কখনও মেশানো হয় না।", "note"),
      el("h2", "কোন খাতে কত খরচ"), T(["খাত", "মোট বিল", "পরিশোধিত", "বাকি", "মোট খরচের %"], crow),
      el("h2", "কাকে/কোথায় সবচেয়ে বেশি দেওয়া হয়েছে (শীর্ষ ১৫)"), T(["সরবরাহকারী / প্রাপক", "পরিশোধিত"], wrow));
  } catch (er) { pane.replaceChildren(el("div", er.message, "state err")); }
} };

// ---------- "How to donate" (text + QR/pictures) and committee signatures ----------
const SIGROLES = [["treasurer", "কোষাধ্যক্ষ"], ["secretary", "সম্পাদক"], ["president", "সভাপতি"]];
async function authImg(bucket, path) { const r = await fetch(C.SUPABASE_URL + "/storage/v1/object/authenticated/" + bucket + "/" + path.split("/").map(encodeURIComponent).join("/"), { headers: { apikey: C.SUPABASE_ANON_KEY, Authorization: "Bearer " + tok } });
  if (!r.ok) throw new Error("ছবি আনা যায়নি"); const b = await r.blob(); return new Promise((ok) => { const f = new FileReader(); f.onload = () => ok(f.result); f.readAsDataURL(b); }); }
async function shrinkPng(file, maxDim) { const b = await createImageBitmap(file), s = Math.min(1, maxDim / Math.max(b.width, b.height)), c = document.createElement("canvas"); c.width = Math.round(b.width * s); c.height = Math.round(b.height * s); c.getContext("2d").drawImage(b, 0, 0, c.width, c.height); return new Promise((r) => c.toBlob(r, "image/png")); }
CUSTOM.settings = { title: "দান নির্দেশনা ও স্বাক্ষর", run: async (pane) => {
  say(""); pane.replaceChildren(el("div", "লোড হচ্ছে…", "state"));
  try {
    const [st, imgs] = await Promise.all([rest("site_settings?select=key,value_bn,value_en"), rest("project_gallery?select=*&category=eq.donation&deleted_at=is.null&order=created_at.desc")]), S = Object.fromEntries(st.map((x) => [x.key, x]));
    const tb = Object.assign(el("textarea"), { id: "pi_bn", rows: 12, value: (S.payment_instructions && S.payment_instructions.value_bn) || "" }), te = Object.assign(el("textarea"), { id: "pi_en", rows: 12, value: (S.payment_instructions && S.payment_instructions.value_en) || "" });
    const f1 = mk("১. দানের নির্দেশনা (লেখা) — শুধু আপনার নিজে যাচাই করা নম্বর/অ্যাকাউন্ট লিখুন", [["বাংলায়", tb], ["English (ঐচ্ছিক)", te]], "সংরক্ষণ", async () => {
      const body = { value_bn: tb.value.trim() || null, value_en: te.value.trim() || null };
      if (S.payment_instructions) await rest("site_settings?key=eq.payment_instructions", "PATCH", body); else await rest("site_settings", "POST", { key: "payment_instructions", ...body, is_public: true });
      say("সংরক্ষিত হয়েছে। সাইটে দেখা যাবে।", 1); });
    Array.from(f1.children).forEach((c) => { if (c.tagName === "DIV") c.className = "full"; });
    const it = txt("qt"), iff = Object.assign(el("input"), { type: "file", accept: "image/jpeg,image/png,image/webp", id: "qf" });
    const f2 = mk("২. ছবি / QR কোড যোগ (যেমন: বিকাশ QR, ব্যাংকের তথ্যের ছবি)", [["শিরোনাম (যেমন: বিকাশ QR)", it], ["ছবি", iff]], "যোগ করুন", async () => {
      const f = iff.files[0]; if (!f) return say("ছবি বাছাই করুন।"); if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return say("শুধু JPG, PNG, WEBP।");
      let blob = await shrink(f, 1000, 0.92); if (blob.size > 1.9e6) blob = await shrink(f, 800, 0.85); if (blob.size > 1.9e6) return say("ছবি বড়। ছোট ছবি দিন।");
      const path = "donation/" + crypto.randomUUID() + ".jpg"; await putObj("public-gallery", path, blob);
      try { await rest("project_gallery", "POST", { category: "donation", title: it.value || null, storage_path: path, is_public: true }); } catch (er) { await delObj("public-gallery", path); throw er; }
      say("যোগ হয়েছে। QR হলে নিজের ফোন দিয়ে স্ক্যান করে পরীক্ষা করুন।", 1); CUSTOM.settings.run(pane); });
    const grid = el("div", null, "cards small");
    imgs.forEach((g) => { const c = el("div", null, "card"), im = Object.assign(el("img"), { src: pubUrl(g.storage_path), alt: g.title || "", loading: "lazy" }), d = el("button", "সরান", "mini"), rn = el("button", "নাম বদলান", "mini"); im.className = "thumb";
      rn.addEventListener("click", async () => { const v = prompt("নতুন শিরোনাম", g.title || ""); if (v === null) return; try { await rest("project_gallery?id=eq." + g.id, "PATCH", { title: v.trim() || null }); CUSTOM.settings.run(pane); } catch (er) { say(er.message); } });
      d.addEventListener("click", async () => { if (!confirm("সাইট থেকে সরানো হবে। নিশ্চিত?")) return; try { await rest("project_gallery?id=eq." + g.id, "PATCH", { deleted_at: new Date().toISOString(), is_public: false }); CUSTOM.settings.run(pane); } catch (er) { say(er.message); } });
      c.append(im, el("small", g.title || ""), rn, d); grid.append(c); });
    const forms = SIGROLES.map(([role, bn]) => { const key = "sig_" + role, cur = S[key] || {}, nm = Object.assign(txt("sn_" + role), { value: cur.value_bn || "" }), fi = Object.assign(el("input"), { type: "file", accept: "image/png,image/jpeg,image/webp", id: "sf_" + role }), prev = Object.assign(el("div", cur.value_en ? "লোড হচ্ছে…" : "এখনও স্বাক্ষর নেই", "note"), { id: "sp_" + role });
      if (cur.value_en) authImg("private-docs", cur.value_en).then((src) => { prev.replaceChildren(Object.assign(el("img"), { src, alt: bn, className: "sigprev" })); }).catch(() => (prev.textContent = "ছবি দেখানো যায়নি"));
      return mk(bn + " — নাম ও স্বাক্ষরের ছবি", [["বর্তমান স্বাক্ষর", prev], ["নাম", nm], ["নতুন স্বাক্ষরের ছবি (সাদা কাগজে সই, পরিষ্কার ছবি)", fi]], "সংরক্ষণ", async () => {
        const f = fi.files[0]; let np = null; if (f) { if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return say("PNG বা JPG ছবি দিন।"); np = "signatures/" + role + "-" + crypto.randomUUID() + ".png"; await putObj("private-docs", np, await shrinkPng(f, 600)); }
        const body = { value_bn: nm.value.trim() || null, value_en: np || cur.value_en || null };
        if (S[key]) await rest("site_settings?key=eq." + key, "PATCH", body); else await rest("site_settings", "POST", { key, ...body, is_public: false });
        if (np && cur.value_en) await delObj("private-docs", cur.value_en); say("সংরক্ষিত হয়েছে। প্রতিবেদনের স্বাক্ষর অংশে আসবে।", 1); CUSTOM.settings.run(pane); }); });
    pane.replaceChildren(f1, f2, imgs.length ? grid : el("div", "এখনও কোনো ছবি/QR নেই।", "state"), el("h2", "কমিটির স্বাক্ষর (প্রতিবেদনে ছাপা হবে)"), el("p", "স্বাক্ষরের ছবি ব্যক্তিগত স্থানে থাকে, জনসাধারণের পাতায় আসে না। শুধু প্রতিবেদনে (প্রিন্ট/PDF) দেখা যায়। সংশ্লিষ্ট ব্যক্তির অনুমতি নিয়ে দিন।", "note"), ...forms);
  } catch (er) { pane.replaceChildren(el("div", er.message, "state err")); }
} };
