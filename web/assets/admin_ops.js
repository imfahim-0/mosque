"use strict";
// Phase 4: workers, attendance, wages, suppliers, purchases, inventory, contractors, contracts.
var REFS = {}; const MATNAMES = []; // live list of material names used so far (suggestions keep spelling consistent)
async function loadRefs() {
  const [d, w, c, s, i, pm, mc] = await Promise.all([
    rest("donors?select=id,full_name,phone&deleted_at=is.null&order=full_name"), rest("workers?select=id,full_name&deleted_at=is.null&order=full_name"),
    rest("contractors?select=id,name&deleted_at=is.null&order=name"), rest("suppliers?select=id,business_name&deleted_at=is.null&order=business_name"),
    rest("inventory_items?select=id,name,unit&deleted_at=is.null&order=name"),
    rest("donation_promises?select=id,promised_material,promised_quantity,promised_unit,promised_amount,donors(full_name)&status=neq.cancelled&deleted_at=is.null&order=promise_date.desc"),
    rest("material_donations?select=category&deleted_at=is.null&limit=2000")]);
  donors = d;
  REFS.donor = d.map((x) => [x.id, x.full_name + (x.phone ? " (" + x.phone + ")" : "")]); REFS.worker = w.map((x) => [x.id, x.full_name]);
  REFS.contractor = c.map((x) => [x.id, x.name]); REFS.supplier = s.map((x) => [x.id, x.business_name]); REFS.item = i.map((x) => [x.id, x.name + " (" + x.unit + ")"]);
  REFS.promise = pm.map((x) => [x.id, x.donors.full_name + " — " + [x.promised_quantity ? x.promised_quantity + " " + (x.promised_unit || "") + " " + (x.promised_material || "") : "", Number(x.promised_amount) ? "৳" + x.promised_amount : ""].filter(Boolean).join(" + ")]);
  MATNAMES.length = 0; MATNAMES.push(...new Set([...mc.map((x) => x.category), ...pm.map((x) => x.promised_material)].filter(Boolean)));
}
const accSel = (id) => { const s = sel(id, []); accounts().then((l) => l.forEach((a) => s.append(Object.assign(el("option", a.name_bn), { value: a.id })))); return s; };
const mk = (title, parts, lab, run) => { const f = el("form", null, "form"); f.append(el("b", title)); parts.forEach(([l, n]) => f.append(fld(l, n))); f.append(btn(lab));
  f.addEventListener("submit", async (e) => { e.preventDefault(); try { await run(); } catch (er) { fail(er); } }); return f; };
const WCAT = [["mason","রাজমিস্ত্রি"],["helper","জোগালি/হেলপার"],["electrician","ইলেকট্রিশিয়ান"],["plumber","প্লাম্বার"],["painter","রংমিস্ত্রি"],["carpenter","কাঠমিস্ত্রি"],["rod_binder","রড বাইন্ডার"],["supervisor","সুপারভাইজার"],["other","অন্যান্য"]];
const needPos = (v) => { if (!(Number(v) > 0)) { say("পরিমাণ শূন্যের বেশি দিন।"); return false; } return true; };

// ---------- Workers + wage payments ----------
MODS.workers = { title: "শ্রমিক", table: "workers", listFrom: "admin_worker_balances", fields: [
  ["full_name","পূর্ণ নাম","text",1],["father_name","পিতার নাম","text"],["phone","মোবাইল","tel"],["address","ঠিকানা","text"],["category","কাজের ধরন","select",1,WCAT],
  ["daily_wage","দৈনিক মজুরি (৳)","number",1],["joining_date","যোগদানের তারিখ","date"],["notes","মন্তব্য","text"]],
  cols: [["worker_code","আইডি"],["full_name","নাম"],["category","ধরন",(r)=>label(WCAT,r.category)],["daily_wage","দৈনিক মজুরি",(r)=>taka(r.daily_wage)],["days_present","উপস্থিত দিন"],["total_bill","মোট মজুরি",(r)=>taka(r.total_bill)],["paid","পরিশোধিত",(r)=>taka(r.paid)],["outstanding","বাকি (ঋণাত্মক = অগ্রিম)",(r)=>taka(r.outstanding)]],
  top: (rows) => {
    const w = sel("wp", rows.map((r) => [r.id, r.full_name + " — বাকি " + taka(r.outstanding)])), a = accSel("wa"), m = num("wm"), k = sel("wk", [["wage", "মজুরি"], ["advance", "অগ্রিম"]]), d = dt("wd"), n = txt("wn");
    const f = mk("মজুরি / অগ্রিম প্রদান", [["শ্রমিক", w], ["কোন খাত থেকে", a], ["পরিমাণ (৳)", m], ["ধরন", k], ["তারিখ", d], ["মন্তব্য", n]], "পরিশোধ নথিভুক্ত করুন", async () => {
      if (!w.value || !needPos(m.value)) return;
      await rest("worker_payments", "POST", { worker_id: w.value, account_id: a.value, amount: Number(m.value), kind: k.value, payment_date: d.value, notes: n.value || null });
      say("নথিভুক্ত হয়েছে।", 1); openTab("workers"); });
    const wrap = el("div"), tg = el("button", "…", "mini"); let on = false;
    rest("site_settings?key=eq.publish_labour_totals&select=value_en").then((r) => { on = r[0] && r[0].value_en === "yes"; tg.textContent = on ? "মজুরির মোট জনসমক্ষে প্রকাশিত — বন্ধ করুন" : "মজুরির মোট (নামহীন) জনসমক্ষে প্রকাশ করুন"; });
    tg.addEventListener("click", async () => { try { await rest("site_settings?key=eq.publish_labour_totals", "PATCH", { value_en: on ? "no" : "yes", value_bn: on ? "no" : "yes" }); say("হালনাগাদ হয়েছে।", 1); openTab("workers"); } catch (er) { say(er.message); } });
    wrap.append(f, tg); return wrap;
  } };

// ---------- Daily attendance (many workers, one date, no duplicates) ----------
CUSTOM.attendance = { title: "হাজিরা", run: async (pane) => {
  say(""); const d = dt("ad2"), body = el("div"), bar = el("div", null, "form"); bar.append(fld("তারিখ", d)); pane.replaceChildren(bar, body);
  const load = async () => {
    body.replaceChildren(el("div", "লোড হচ্ছে…", "state"));
    try {
      const [ws, at] = await Promise.all([rest("workers?select=id,full_name,category,daily_wage&deleted_at=is.null&order=full_name"), rest("worker_attendance?work_date=eq." + d.value + "&select=*")]);
      if (!ws.length) return body.replaceChildren(el("div", "আগে 'শ্রমিক' ট্যাবে শ্রমিক যুক্ত করুন।", "state"));
      const ex = Object.fromEntries(at.map((a) => [a.worker_id, a])), tb = el("table"), h = el("tr"), sum = el("p", "", "note");
      ["শ্রমিক", "উপস্থিত", "ওভারটাইম (৳)", "দৈনিক মজুরি", "অবস্থা"].forEach((x) => h.append(el("th", x))); tb.append(h);
      const ui = ws.map((w) => { const a = ex[w.id], wage = a ? a.daily_wage : w.daily_wage, tr = el("tr"),
        cb = Object.assign(el("input"), { type: "checkbox", checked: a ? a.present : false }), ot = Object.assign(el("input"), { type: "number", min: "0", step: "0.01", value: a ? a.overtime : 0 });
        const c1 = el("td"), c2 = el("td"); c1.append(cb); c2.append(ot); tr.append(el("td", w.full_name), c1, c2, el("td", taka(wage)), el("td", a ? "নথিভুক্ত" : "নতুন")); tb.append(tr); return { w, a, wage, cb, ot }; });
      const upd = () => { let n = 0, t = 0; ui.forEach((u) => { if (u.cb.checked) { n++; t += Number(u.wage) + Number(u.ot.value || 0); } }); sum.textContent = "উপস্থিত " + n + " জন • মোট দৈনিক মজুরি " + taka(t); };
      tb.addEventListener("input", upd); upd();
      const sv = el("button", "হাজিরা সংরক্ষণ করুন", "btn"); sv.addEventListener("click", async () => {
        try { for (const u of ui) { const o = Number(u.ot.value || 0);
            if (u.a) { if (u.a.present !== u.cb.checked || Number(u.a.overtime) !== o) await rest("worker_attendance?id=eq." + u.a.id, "PATCH", { present: u.cb.checked, overtime: o }); }
            else await rest("worker_attendance", "POST", { worker_id: u.w.id, work_date: d.value, present: u.cb.checked, work_category: u.w.category, daily_wage: u.w.daily_wage, overtime: o }); }
          say("হাজিরা সংরক্ষিত হয়েছে।", 1); load(); } catch (er) { say(/duplicate|unique/i.test(er.message) ? "এই তারিখে হাজিরা আগেই আছে। পাতাটি রিফ্রেশ করুন।" : er.message); } });
      const box = el("div", null, "tablebox"); box.append(tb); body.replaceChildren(box, sum, sv);
    } catch (er) { body.replaceChildren(el("div", er.message, "state err")); }
  };
  d.addEventListener("change", load); load();
} };

// ---------- Suppliers ----------
MODS.suppliers = { title: "সরবরাহকারী", table: "suppliers", fields: [["business_name","প্রতিষ্ঠানের নাম","text",1],["owner_name","মালিকের নাম","text"],["phone","মোবাইল","tel"],["address","ঠিকানা","text"],["category","ধরন (যেমন: রড, ইট)","text"]],
  cols: [["supplier_code","আইডি"],["business_name","নাম"],["owner_name","মালিক"],["phone","মোবাইল"],["category","ধরন"]] };

// ---------- Inventory ----------
const MKIND = [["used","ব্যবহৃত"],["returned","ফেরত (সরবরাহকারীকে)"],["adjust_in","স্টক বাড়ানো (কারণ আবশ্যক)"],["adjust_out","স্টক কমানো (কারণ আবশ্যক)"]];
MODS.inventory_items = { title: "স্টক", table: "inventory_items", listFrom: "admin_stock", fields: [["name","সামগ্রীর নাম","text",1],["unit","একক (একবার ঠিক করলে বদলানো যাবে না)","select",1,UNITS],["opening_stock","প্রারম্ভিক স্টক","number",1],["storage_location","সংরক্ষণস্থান","text"]],
  cols: [["name","সামগ্রী"],["unit","একক"],["opening_stock","প্রারম্ভিক"],["purchased","ক্রীত"],["donated","দানকৃত"],["used","ব্যবহৃত"],["returned","ফেরত"],["current_stock","বর্তমান স্টক"]],
  top: (rows) => {
    const i = sel("si", rows.map((r) => [r.id, r.name + " (" + r.unit + ") — আছে " + r.current_stock])), k = sel("sk", MKIND), q = num("sq"), d = dt("sd"), n = txt("sn"); q.step = "0.001";
    return mk("স্টক ব্যবহার / সংশোধন", [["সামগ্রী", i], ["ধরন", k], ["পরিমাণ", q], ["তারিখ", d], ["মন্তব্য / কারণ", n]], "নথিভুক্ত করুন", async () => {
      if (!i.value || !needPos(q.value)) return;
      await rest("stock_movements", "POST", { item_id: i.value, kind: k.value, quantity: Number(q.value), movement_date: d.value, notes: n.value || null });
      say("নথিভুক্ত হয়েছে।", 1); openTab("inventory_items"); });
  } };
MODS.material_donations.fields.push(["inventory_item_id", "স্টকে যুক্ত করুন (ঐচ্ছিক; একক মিলতে হবে)", "item"]);

// ---------- Purchases (multi-item invoice -> one expense + stock receipts, atomically) ----------
CUSTOM.purchases = { title: "ক্রয়", run: async (pane) => {
  say(""); pane.replaceChildren(el("div", "লোড হচ্ছে…", "state"));
  try {
    await loadRefs();
    if (!REFS.item.length || !REFS.supplier.length) return pane.replaceChildren(el("div", "আগে 'সরবরাহকারী' ও 'স্টক' ট্যাবে অন্তত একটি করে যুক্ত করুন।", "state"));
    const list = await rest("purchases?select=*,suppliers(business_name),expenses(total_amount,paid_amount,outstanding),purchase_items(quantity,line_total,inventory_items(name,unit))&order=purchase_date.desc,created_at.desc");
    const sup = sel("ps", REFS.supplier), d = dt("pd2"), inv = txt("pi"), rb = txt("pr"), nt = txt("pnt"), rowsBox = el("div"), total = el("b", "মোট: ৳০"), lines = [];
    const recalc = () => total.textContent = "মোট: " + taka(lines.reduce((s, l) => s + Math.round(Number(l.q.value || 0) * Number(l.p.value || 0) * 100) / 100, 0));
    const addRow = () => { const row = el("div", null, "form"), it = sel("", REFS.item), q = num("", "পরিমাণ"), p = num("", "একক মূল্য (৳)"), x = Object.assign(el("button", "সরান", "mini"), { type: "button" });
      q.step = "0.001"; p.min = "0"; const l = { it, q, p, row }; lines.push(l); [q, p].forEach((n) => n.addEventListener("input", recalc));
      x.addEventListener("click", () => { if (lines.length > 1) { lines.splice(lines.indexOf(l), 1); row.remove(); recalc(); } }); row.append(it, q, p, x); rowsBox.append(row); };
    addRow();
    const add = Object.assign(el("button", "+ আরেকটি সামগ্রী", "mini"), { type: "button" }); add.addEventListener("click", addRow);
    const f = mk("নতুন ক্রয় (একটি ইনভয়েসে একাধিক সামগ্রী)", [["সরবরাহকারী", sup], ["তারিখ", d], ["ইনভয়েস নং", inv], ["গ্রহণকারী", rb], ["মন্তব্য", nt]], "ক্রয় সংরক্ষণ করুন", async () => {
      const items = lines.map((l) => ({ item_id: l.it.value, quantity: Number(l.q.value), unit_price: Number(l.p.value || 0) }));
      if (items.some((x) => !(x.quantity > 0))) return say("প্রতিটি সামগ্রীর পরিমাণ দিন।");
      await rest("rpc/create_purchase", "POST", { p_date: d.value, p_supplier: sup.value, p_invoice: inv.value || null, p_received_by: rb.value || null, p_notes: nt.value || null, p_items: items });
      say("ক্রয় সংরক্ষিত হয়েছে। স্টক বেড়েছে এবং বিল 'খরচ' ট্যাবে এসেছে — সেখান থেকে পরিশোধ করুন।", 1); CUSTOM.purchases.run(pane); });
    f.insertBefore(el("b", "সামগ্রীর তালিকা"), f.lastChild); f.insertBefore(rowsBox, f.lastChild); f.insertBefore(add, f.lastChild); f.insertBefore(total, f.lastChild);
    const tb = el("table"), h = el("tr"); ["তারিখ", "সরবরাহকারী", "ইনভয়েস", "সামগ্রী", "মোট", "পরিশোধিত", "বাকি"].forEach((x) => h.append(el("th", x))); tb.append(h);
    list.forEach((p) => { const tr = el("tr"); [p.purchase_date, p.suppliers && p.suppliers.business_name, p.invoice_no || "", p.purchase_items.map((i) => i.inventory_items.name + " " + i.quantity + " " + i.inventory_items.unit).join("; "), taka(p.expenses.total_amount), taka(p.expenses.paid_amount), taka(p.expenses.outstanding)].forEach((x) => tr.append(el("td", x ?? ""))); tb.append(tr); });
    const box = el("div", null, "tablebox"); box.append(tb);
    pane.replaceChildren(f, list.length ? box : el("div", "এখনও কোনো ক্রয় নেই।", "state"));
  } catch (er) { pane.replaceChildren(el("div", er.message, "state err")); }
} };

// ---------- Contractors + contracts (payments = expense payments linked to the contract) ----------
MODS.contractors = { title: "ঠিকাদার", table: "contractors", fields: [["name","নাম","text",1],["phone","মোবাইল","tel"],["address","ঠিকানা","text"],["notes","মন্তব্য","text"]],
  cols: [["name","নাম"],["phone","মোবাইল"],["address","ঠিকানা"]] };
const CTYPE = [["full","সম্পূর্ণ চুক্তি"],["partial","আংশিক"],["milestone","ধাপভিত্তিক (মাইলস্টোন)"]], PKIND = [["advance","অগ্রিম"],["partial","আংশিক"],["milestone","ধাপের পেমেন্ট"],["final","চূড়ান্ত"],["retention","রিটেনশন ছাড়"]];
MODS.contracts = { title: "চুক্তি", table: "contracts", rpc: "create_contract", select: "*,contractors(name),expenses(paid_amount,outstanding)", fields: [
  ["p_contractor_id","ঠিকাদার","contractor",1],["p_contract_type","চুক্তির ধরন","select",1,CTYPE],["p_description","কাজের বিবরণ","text",1],["p_agreement_date","চুক্তির তারিখ","date",1],
  ["p_total_value","মোট চুক্তি মূল্য (৳)","number",1],["p_retention_amount","রিটেনশন (৳)","number"],["p_start_date","শুরুর তারিখ","date"],["p_expected_end","প্রত্যাশিত শেষ","date"],["p_notes","মন্তব্য","text"]],
  cols: [["agreement_date","তারিখ"],["contractor","ঠিকাদার",(r)=>r.contractors&&r.contractors.name],["description","কাজ"],["total_value","চুক্তি মূল্য",(r)=>taka(r.total_value)],["paid","পরিশোধিত",(r)=>taka(r.expenses.paid_amount)],["bal","বাকি",(r)=>taka(r.expenses.outstanding)],["done","সমাপ্ত",(r)=>r.actual_end_date||"চলমান"]],
  extra: (r, act, reload) => { if (!r.actual_end_date) act("সম্পন্ন চিহ্নিত করুন", async () => { try { await rest("contracts?id=eq." + r.id, "PATCH", { actual_end_date: today() }); reload(); } catch (e) { say(e.message); } }); },
  top: (rows) => {
    const open = rows.filter((r) => Number(r.expenses.outstanding) > 0), c = sel("cp", open.map((r) => [r.id, (r.contractors && r.contractors.name) + " — " + r.description + " (বাকি " + taka(r.expenses.outstanding) + ")"])),
      a = accSel("ca"), m = num("cm"), k = sel("ck", PKIND), d = dt("cd"), n = txt("cn");
    return mk("ঠিকাদারকে পেমেন্ট", [["চুক্তি", c], ["কোন খাত থেকে", a], ["পরিমাণ (৳)", m], ["ধরন", k], ["তারিখ", d], ["মন্তব্য", n]], "পেমেন্ট নথিভুক্ত করুন", async () => {
      const r = open.find((x) => x.id === c.value); if (!r || !needPos(m.value)) return;
      await rest("expense_payments", "POST", { expense_id: r.expense_id, contract_id: r.id, account_id: a.value, amount: Number(m.value), kind: k.value, payment_date: d.value, notes: n.value || null });
      say("পেমেন্ট নথিভুক্ত হয়েছে।", 1); openTab("contracts"); });
  } };

// ---------- Pledge status is derived from verified payments (migration 007) ----------
const PST = { promised: "প্রতিশ্রুত", partial: "আংশিক গৃহীত", fulfilled: "সম্পূর্ণ গৃহীত", cancelled: "বাতিল", follow_up: "ফলো-আপ প্রয়োজন" };
MODS.donation_promises.cols.push(["derived_status", "অবস্থা", (r) => PST[r.derived_status] || ""]);

// ---------- In-kind pledges (migration 008) ----------
(() => {
  const pf = MODS.donation_promises.fields, pm = pf.find((f) => f[0] === "promised_material"); pm[1] = "প্রতিশ্রুত সামগ্রীর নাম (যেমন: ইট, রড)"; pm[3] = 0; pm[4] = MATNAMES;
  pf.splice(pf.indexOf(pm) + 1, 0, ["promised_quantity", "প্রতিশ্রুত পরিমাণ (সামগ্রী)", "number"], ["promised_unit", "একক", "select", 0, [["", "—"], ...UNITS]]);
  const mf = MODS.material_donations.fields; mf.find((f) => f[0] === "category")[4] = MATNAMES; mf.push(["promise_id", "কোন প্রতিশ্রুতির বিপরীতে (ঐচ্ছিক)", "promise"]);
  MODS.donation_promises.extra = (r, act, reload) => act(r.is_public ? "জনসমক্ষে গোপন করুন" : "জনসমক্ষে প্রকাশ করুন", async () => { try { await rest("donation_promises?id=eq." + r.id, "PATCH", { is_public: !r.is_public }); reload(); } catch (e) { say(e.message); } });
  MODS.donation_promises.cols.push(["is_public", "সাইটে", (r) => (r.is_public ? "দেখা যায়" : "গোপন")], ["promised_material", "প্রতিশ্রুত সামগ্রী", (r) => (r.promised_quantity ? r.promised_quantity + " " + (r.promised_unit || "") + " " + (r.promised_material || "") : "")],
    ["material_received", "গৃহীত সামগ্রী", (r) => (r.promised_quantity ? r.material_received : "")], ["material_outstanding", "বাকি সামগ্রী", (r) => (r.promised_quantity ? r.material_outstanding : "")]);
})();
