"use strict";
// Phase 3: expenses, payments, ledger (cashbook/bankbook), adjustments, reconciliation.
const CATS = ["ভাঙা (Demolition)","খনন","মাটি ভরাট","ভিত্তি","রড ক্রয়","সিমেন্ট ক্রয়","ইট ক্রয়","বালু ক্রয়","পাথর/খোয়া","রাজমিস্ত্রি","ছাদ","মেঝে","বৈদ্যুতিক কাজ","প্লাম্বিং","দরজা-জানালা","রং","শ্রমিক","পরিবহন","যন্ত্রপাতি ভাড়া","প্রকৌশলী ফি","স্থপতি ফি","সরকারি ফি","বিবিধ"];
let _acc; const accounts = async () => (_acc ||= await rest("financial_accounts?select=id,code,name_bn,kind&order=code"));
const sel = (id, opts) => { const s = el("select"); s.id = id; opts.forEach(([v, t]) => { const o = el("option", t); o.value = v; s.append(o); }); return s; };
const fld = (lab, node) => { const w = el("div"), l = el("label", lab); l.htmlFor = node.id; w.append(l, node); return w; };
const num = (id, ph) => Object.assign(el("input"), { id, type: "number", step: "0.01", min: "0.01", placeholder: ph || "" });
const dt = (id) => Object.assign(el("input"), { id, type: "date", value: today() });
const txt = (id) => Object.assign(el("input"), { id, type: "text" });
const fail = (er) => say(/check|constraint/i.test(er.message) ? "পরিশোধ বাকি পরিমাণের বেশি হতে পারে না।" : er.message);
const btn = (t) => Object.assign(el("button", t, "btn"), { type: "submit" });

MODS.expenses = { title: "খরচ", table: "expenses", fields: [
  ["expense_date","তারিখ","date",1],["category","খাত (নতুন লিখতেও পারেন)","text",1,CATS],["description","বিবরণ","text",1],["total_amount","মোট বিল (৳)","number",1],
  ["paid_to","যাকে দেওয়া","text"],["supplier_name","সরবরাহকারী","text"],["invoice_no","ইনভয়েস নং","text"],["approved_by","অনুমোদনকারী","text"],["notes","মন্তব্য","text"],
  ["is_public","জনসমক্ষে প্রকাশ করুন","checkbox"]],
  cols: [["expense_date","তারিখ"],["category","খাত"],["description","বিবরণ"],["total_amount","মোট বিল",(r)=>taka(r.total_amount)],["paid_amount","পরিশোধিত",(r)=>taka(r.paid_amount)],["outstanding","বাকি",(r)=>taka(r.outstanding)],["is_public","প্রকাশ",(r)=>r.is_public?"হ্যাঁ":"না"]],
  extra: (r, act, reload) => act(r.is_public ? "গোপন করুন" : "প্রকাশ করুন", async () => { try { await rest("expenses?id=eq." + r.id, "PATCH", { is_public: !r.is_public }); reload(); } catch (e) { say(e.message); } }),
  top: (rows) => {
    const f = el("form", null, "form"), open = rows.filter((r) => Number(r.outstanding) > 0);
    const se = sel("px", open.map((r) => [r.id, r.description + " — বাকি " + taka(r.outstanding)])), sa = sel("pa", []), am = num("pm"), d = dt("pd"), n = txt("pn");
    accounts().then((l) => l.forEach((a) => sa.append(Object.assign(el("option", a.name_bn), { value: a.id }))));
    const fillAmt = () => { const r = open.find((x) => x.id === se.value); if (r) am.value = r.outstanding; }; se.addEventListener("change", fillAmt); fillAmt();
    f.append(el("b", "বিল পরিশোধ করুন"), fld("খরচ", se), fld("কোন খাত থেকে (ক্যাশ/ব্যাংক/মোবাইল)", sa), fld("পরিমাণ (৳)", am), fld("তারিখ", d), fld("মন্তব্য", n), btn("পরিশোধ নথিভুক্ত করুন"));
    f.firstChild.className = "";
    f.addEventListener("submit", async (e) => { e.preventDefault(); if (!se.value) return say("বাকি কোনো বিল নেই।");
      try { await rest("expense_payments", "POST", { expense_id: se.value, account_id: sa.value, amount: Number(am.value), payment_date: d.value, notes: n.value || null }); say("পরিশোধ নথিভুক্ত হয়েছে।", 1); openTab("expenses"); } catch (er) { fail(er); } });
    return f;
  } };

CUSTOM.ledger = { title: "হিসাবখাতা", run: async (pane) => {
  pane.replaceChildren(el("div", "লোড হচ্ছে…", "state")); say("");
  try {
    const [accs, bal, tx, rec] = await Promise.all([accounts(), rest("admin_account_balances?select=*"), rest("financial_transactions?select=*&order=txn_date.asc,created_at.asc"), rest("reconciliations?select=*&order=created_at.desc&limit=20")]);
    const name = Object.fromEntries(accs.map((a) => [a.id, a.name_bn])), voided = new Set(tx.filter((t) => t.reference.endsWith(":REV")).map((t) => t.reference.replace(":REV", ":OUT")));
    const cards = el("div", null, "cards small"); let total = 0;
    bal.forEach((b) => { total += Number(b.balance); const c = el("div", null, "card " + (Number(b.balance) < 0 ? "bad" : "")); c.append(el("small", b.name_bn), el("b", taka(b.balance))); cards.append(c); });
    const tc = el("div", null, "card gold"); tc.append(el("small", "মোট নগদ তহবিল (সব খাত)"), el("b", taka(total))); cards.prepend(tc);

    const fa = el("form", null, "form"), sa = sel("aa", accs.map((a) => [a.id, a.name_bn])), sd = sel("ad", [["in", "জমা (যেমন: প্রারম্ভিক জের)"], ["out", "খরচ/কমানো"]]), amt = num("aam"), ad = dt("add"), rs = txt("ars");
    rs.required = amt.required = true;
    fa.append(el("b", "প্রারম্ভিক জের / সংশোধন এন্ট্রি (কারণ আবশ্যক)"), fld("খাত", sa), fld("ধরন", sd), fld("পরিমাণ (৳)", amt), fld("তারিখ", ad), fld("কারণ", rs), btn("এন্ট্রি করুন"));
    fa.addEventListener("submit", async (e) => { e.preventDefault(); if (!confirm("এই এন্ট্রি মোছা যাবে না। নিশ্চিত?")) return;
      try { await rest("rpc/add_adjustment", "POST", { p_account: sa.value, p_direction: sd.value, p_amount: Number(amt.value), p_date: ad.value, p_reason: rs.value }); say("এন্ট্রি হয়েছে।", 1); CUSTOM.ledger.run(pane); } catch (er) { say(er.message); } });

    const fr = el("form", null, "form"), ra = sel("ra", accs.map((a) => [a.id, a.name_bn])), rv = num("rv"), rn = txt("rn"); rv.min = "0";
    fr.append(el("b", "হিসাব মিলানো: হাতে/ব্যাংকে আসলে কত আছে?"), fld("খাত", ra), fld("প্রকৃত পরিমাণ (৳)", rv), fld("মন্তব্য", rn), btn("মিলিয়ে দেখুন"));
    fr.addEventListener("submit", async (e) => { e.preventDefault();
      try { await rest("rpc/reconcile", "POST", { p_account: ra.value, p_actual: Number(rv.value), p_note: rn.value || null }); say("নথিভুক্ত হয়েছে।", 1); CUSTOM.ledger.run(pane); } catch (er) { say(er.message); } });

    const fs = sel("fa", [["", "সব খাত"], ...accs.map((a) => [a.id, a.name_bn])]), gs = sel("gs", [["10", "দৈনিক সারসংক্ষেপ"], ["7", "মাসিক সারসংক্ষেপ"]]), out = el("div");
    const draw = () => {
      const rows = tx.filter((t) => !fs.value || t.account_id === fs.value); let run = 0;
      const withBal = rows.map((t) => { run += t.direction === "in" ? Number(t.amount) : -Number(t.amount); return { ...t, run }; }).reverse();
      const sum = {}; rows.forEach((t) => { const k = t.txn_date.slice(0, Number(gs.value)); (sum[k] ||= { i: 0, o: 0 })[t.direction === "in" ? "i" : "o"] += Number(t.amount); });
      const S = el("table"), sh = el("tr"); ["সময়", "জমা", "খরচ", "নিট"].forEach((x) => sh.append(el("th", x))); S.append(sh);
      Object.keys(sum).sort().reverse().forEach((k) => { const tr = el("tr"); [k, taka(sum[k].i), taka(sum[k].o), taka(sum[k].i - sum[k].o)].forEach((x) => tr.append(el("td", x))); S.append(tr); });
      const L = el("table"), lh = el("tr"); ["তারিখ", "খাত", "বিবরণ", "জমা", "খরচ", "জের", ""].forEach((x) => lh.append(el("th", x))); L.append(lh);
      withBal.forEach((t) => { const tr = el("tr"); [t.txn_date, name[t.account_id], t.description || "", t.direction === "in" ? taka(t.amount) : "", t.direction === "out" ? taka(t.amount) : "", fs.value ? taka(t.run) : "—"].forEach((x) => tr.append(el("td", x)));
        const td = el("td"); if (["expense_payment","worker_payment"].includes(t.source_type) && t.reference.endsWith(":OUT") && !voided.has(t.reference)) { const b = el("button", "বাতিল", "mini");
          b.addEventListener("click", async () => { if (!confirm("এই পরিশোধ বাতিল হবে (উল্টো এন্ট্রি হবে)। নিশ্চিত?")) return; try { await rest((t.source_type === "worker_payment" ? "worker_payments" : "expense_payments") + "?id=eq." + t.source_id, "PATCH", { voided_at: new Date().toISOString() }); say("বাতিল হয়েছে।", 1); CUSTOM.ledger.run(pane); } catch (er) { say(er.message); } }); td.append(b); }
        tr.append(td); L.append(tr); });
      const b1 = el("div", null, "tablebox"), b2 = el("div", null, "tablebox"); b1.append(S); b2.append(L);
      out.replaceChildren(el("h2", "সারসংক্ষেপ"), rows.length ? b1 : el("div", "এখনও কোনো লেনদেন নেই।", "state"), el("h2", "লেনদেনের খাতা"), rows.length ? b2 : el("div", "এখনও কোনো লেনদেন নেই।", "state"));
    };
    [fs, gs].forEach((x) => x.addEventListener("change", draw));
    const R = el("table"), rh = el("tr"); ["তারিখ", "খাত", "খাতা অনুযায়ী", "প্রকৃত", "পার্থক্য", "মন্তব্য"].forEach((x) => rh.append(el("th", x))); R.append(rh);
    rec.forEach((r) => { const tr = el("tr"); [r.on_date, name[r.account_id], taka(r.book_balance), taka(r.actual_balance), taka(r.difference), r.note || ""].forEach((x) => tr.append(el("td", x))); R.append(tr); });
    const rb = el("div", null, "tablebox"); rb.append(R);
    const filt = el("div", null, "form"); filt.append(fld("খাত বাছাই (ক্যাশবুক/ব্যাংকবুক)", fs), fld("সারসংক্ষেপ", gs));
    pane.replaceChildren(cards, el("p", "জমা/খরচ কেবল যাচাইকৃত দান ও নথিভুক্ত পরিশোধ থেকে স্বয়ংক্রিয়ভাবে আসে। সামগ্রী দান ও প্রতিশ্রুতি এখানে আসে না।", "note"), fa, fr, rec.length ? el("h2", "মিলানোর ইতিহাস") : el("span"), rec.length ? rb : el("span"), filt, out);
    draw();
  } catch (er) { pane.replaceChildren(el("div", er.message, "state err")); }
} };
