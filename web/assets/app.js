"use strict";
const C = window.APP_CONFIG || {};
const $ = (s) => document.querySelector(s);
const T = {
  bn: { name:"হাঁড়ী-চৌধুরী জামে মসজিদ", sub:"পুরাতন মসজিদ ভেঙে একই স্থানে নতুন মসজিদ নির্মাণ",
    intro:"এই মসজিদ আমাদের সবার দানে নির্মিত হচ্ছে। প্রতিটি যাচাইকৃত দান ও খরচের হিসাব এখানে সবার জন্য উন্মুক্ত।",
    cash:"যাচাইকৃত নগদ দান", mat:"সামগ্রী দানের আনুমানিক মূল্য", exp:"মোট পরিশোধিত খরচ", bal:"নগদ তহবিলের জের",
    unpaid:"অপরিশোধিত বিল", pledge:"বাকি প্রতিশ্রুতি", donors:"যাচাইকৃত দাতা",
    recent:"সাম্প্রতিক দান", date:"তারিখ", donor:"দাতা", amt:"পরিমাণ", method:"মাধ্যম", anon:"বেনামী দাতা",
    materials:"সামগ্রী দান", cat:"ধরন", qty:"পরিমাণ", unit:"একক", val:"আনুমানিক মূল্য",
    news:"ঘোষণা", how:"কীভাবে দান করবেন", noPay:"দানের নির্দেশনা শীঘ্রই প্রকাশ করা হবে।",
    empty:"এখনও কোনো তথ্য নেই।", load:"লোড হচ্ছে…", fail:"তথ্য আনা যায়নি। পরে আবার চেষ্টা করুন।",
    setup:"সাইট এখনও সংযুক্ত হয়নি। config.js ফাইলে Supabase তথ্য দিন।",
    sepNote:"নগদ, সামগ্রী ও প্রতিশ্রুতি আলাদাভাবে গণনা করা হয়; কখনও একসাথে যোগ করা হয় না।",
    admin:"অ্যাডমিন লগইন", other:"English", tk:"৳", prog:"নির্মাণ অগ্রগতি", overall:"সামগ্রিক অগ্রগতি", chart:"মাসভিত্তিক দান ও খরচ", donL:"দান", expL:"খরচ", gal:"ছবি", dls:"রিপোর্ট ডাউনলোড", dlx:"Excel রিপোর্ট", dlp:"PDF রিপোর্ট (প্রিন্ট)", g:{old_mosque:"পুরাতন মসজিদ",proposed:"প্রস্তাবিত নতুন মসজিদ",design:"স্থাপত্য নকশা",demolition:"ভাঙার কাজ",foundation:"ভিত্তি",construction:"নির্মাণ",interior:"অভ্যন্তর",exterior:"বহির্ভাগ",final:"সমাপ্তি"} },
  en: { name:"Hari-Chowdhury Jame Mosque", sub:"Rebuilding the old mosque at the same site",
    intro:"This mosque is being built by our community. Every verified donation and expense is open for everyone to see.",
    cash:"Verified cash donations", mat:"Estimated value of material donations", exp:"Total expenses paid", bal:"Cash fund balance",
    unpaid:"Unpaid bills", pledge:"Outstanding pledges", donors:"Verified donors",
    recent:"Recent donations", date:"Date", donor:"Donor", amt:"Amount", method:"Method", anon:"Anonymous donor",
    materials:"Material donations", cat:"Type", qty:"Quantity", unit:"Unit", val:"Estimated value",
    news:"Announcements", how:"How to donate", noPay:"Donation instructions will be published soon.",
    empty:"No records yet.", load:"Loading…", fail:"Could not load data. Please try again later.",
    setup:"Site not connected yet. Add your Supabase details in config.js.",
    sepNote:"Cash, materials and pledges are counted separately and never added together.",
    admin:"Admin login", other:"বাংলা", tk:"BDT ", prog:"Construction progress", overall:"Overall progress", chart:"Donations and expenses by month", donL:"Donations", expL:"Expenses", gal:"Photos", dls:"Download reports", dlx:"Excel report", dlp:"PDF report (print)", g:{old_mosque:"Old mosque",proposed:"Proposed new mosque",design:"Architectural design",demolition:"Demolition",foundation:"Foundation",construction:"Construction",interior:"Interior",exterior:"Exterior",final:"Completion"} }
};
let lang = localStorage.getItem("lang") || "bn";
const t = (k) => T[lang][k];
const loc = () => (lang === "bn" ? "bn-BD" : "en-US");
const money = (n) => t("tk") + Number(n || 0).toLocaleString(loc(), { maximumFractionDigits: 2 });
const num = (n) => Number(n || 0).toLocaleString(loc(), { maximumFractionDigits: 3 });
const IDS = ["#cards", "#recent", "#mats", "#news", "#pay"];

async function api(path) {
  if (!C.SUPABASE_URL || !C.SUPABASE_ANON_KEY) throw new Error("setup");
  const r = await fetch(C.SUPABASE_URL + "/rest/v1/" + path, { headers: C.SUPABASE_ANON_KEY.startsWith("eyJ") ? { apikey: C.SUPABASE_ANON_KEY, Authorization: "Bearer " + C.SUPABASE_ANON_KEY } : { apikey: C.SUPABASE_ANON_KEY } });
  if (!r.ok) throw new Error("http " + r.status);
  return r.json();
}
function el(tag, text, cls) { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; }
function table(heads, rows, numCols = []) {
  const tb = el("table"), h = el("tr");
  heads.forEach((x) => h.append(el("th", x))); tb.append(h);
  rows.forEach((r) => { const tr = el("tr"); r.forEach((c, i) => tr.append(el("td", c, numCols.includes(i) ? "n" : ""))); tb.append(tr); });
  const box = el("div", null, "tablebox"); box.append(tb); return box;
}
const fill = (sel, node) => $(sel).replaceChildren(node);
const msg = (sel, text, err) => fill(sel, el("div", text, "state" + (err ? " err" : "")));

async function load() {
  document.documentElement.lang = lang; document.title = t("name");
  document.querySelectorAll("[data-i]").forEach((e) => (e.textContent = t(e.dataset.i)));
  IDS.forEach((s) => msg(s, t("load")));
  loadExtras();
  try {
    const [tot, bal, rec, mat, ann, set] = await Promise.all(
      ["public_totals", "public_cash_balance", "public_recent_donations", "public_material_summary",
       "public_announcements?order=created_at.desc", "public_settings"].map(api));
    const a = tot[0];
    const cards = [["cash", money(a.cash_received), ""], ["exp", money(a.expenses_paid), ""], ["bal", money(bal[0].balance), ""],
      ["mat", money(a.material_value), "gold"], ["pledge", money(a.pledges_outstanding), "gold"],
      ["unpaid", money(a.unpaid_bills), "bad"], ["donors", num(a.verified_donors), ""]];
    const box = el("div", null, "cards");
    cards.forEach(([k, v, c]) => { const d = el("div", null, "card " + c); d.append(el("small", t(k)), el("b", v)); box.append(d); });
    fill("#cards", box);
    fill("#recent", rec.length ? table([t("date"), t("donor"), t("amt"), t("method")],
      rec.map((r) => [r.donation_date, r.display_name || t("anon"), money(r.amount), r.method]), [2]) : el("div", t("empty"), "state"));
    fill("#mats", mat.length ? table([t("cat"), t("qty"), t("unit"), t("val")],
      mat.map((r) => [r.category, num(r.total_quantity), r.unit, money(r.est_value)]), [1, 3]) : el("div", t("empty"), "state"));
    const nb = el("div");
    ann.forEach((x) => { const d = el("div", null, "ann");
      d.append(el("b", lang === "bn" ? x.title_bn : x.title_en || x.title_bn), el("div", (lang === "bn" ? x.body_bn : x.body_en || x.body_bn) || "")); nb.append(d); });
    fill("#news", ann.length ? nb : el("div", t("empty"), "state"));
    const p = set.find((s) => s.key === "payment_instructions");
    const pv = p && (lang === "bn" ? p.value_bn : p.value_en || p.value_bn);
    fill("#pay", pv ? el("div", pv, "pay") : el("div", t("noPay"), "state"));
  } catch (e) { IDS.forEach((s) => msg(s, e.message === "setup" ? t("setup") : t("fail"), true)); }
}
document.addEventListener("DOMContentLoaded", () => {
  $("#lang").addEventListener("click", () => { lang = lang === "bn" ? "en" : "bn"; localStorage.setItem("lang", lang); load(); });
  load();
});

// ---- Phase 5 public extras: progress, monthly chart, approved photos, downloads ----
let PUB = {};
function chartSvg(data) {
  const NS = "http://www.w3.org/2000/svg", W = 640, H = 240, pad = 30, svg = document.createElementNS(NS, "svg"), step = (W - 2 * pad) / data.length, bw = Math.max(4, Math.min(22, step / 2 - 3));
  svg.setAttribute("viewBox", "0 0 " + W + " " + H); svg.setAttribute("role", "img"); svg.setAttribute("aria-label", t("chart")); svg.setAttribute("class", "chart");
  const max = Math.max(1, ...data.flatMap((d) => [+d.donations, +d.expenses])), mk = (n, a, tx) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); if (tx) e.textContent = tx; return e; };
  data.forEach((d, i) => { const x = pad + i * step + 2; [[d.donations, "d"], [d.expenses, "e"]].forEach(([v, c], j) => { const h = (H - 2 * pad) * (+v / max); svg.append(mk("rect", { x: x + j * (bw + 2), y: H - pad - h, width: bw, height: h, class: c })); });
    svg.append(mk("text", { x, y: H - pad + 14, "font-size": 10, fill: "currentColor" }, d.month.slice(2))); });
  svg.append(mk("text", { x: 2, y: 11, "font-size": 10, fill: "currentColor" }, money(max))); return svg;
}
async function loadExtras() {
  try {
    const [pg, mo, gl] = await Promise.all([api("public_progress?order=seq"), api("public_monthly"), api("public_gallery?order=created_at.desc&limit=24")]); PUB.pg = pg; PUB.mo = mo;
    const avg = pg.length ? Math.round(pg.reduce((s, x) => s + x.progress_pct, 0) / pg.length) : 0, box = el("div");
    if (pg.length) { const top = el("div", t("overall") + ": " + avg + "%"); top.className = "note"; const bar = el("div", null, "pbar"); bar.append(el("i")); bar.firstChild.setAttribute("data-w", avg); bar.firstChild.style.width = avg + "%"; bar.setAttribute("role", "progressbar"); bar.setAttribute("aria-valuenow", avg); box.append(top, bar);
      pg.forEach((s) => { const r = el("div", null, "stage"), b = el("div", null, "pbar"); const i = el("i"); i.style.width = s.progress_pct + "%"; b.append(i); const w = el("div"); w.append(el("small", lang === "bn" ? s.name_bn : s.name_en), b); r.append(w, el("span", s.progress_pct + "%")); box.append(r); }); }
    fill("#prog", pg.length ? box : el("div", t("empty"), "state"));
    const cb = el("div"); if (mo.length) { const lg = el("div", null, "legend"); lg.textContent = "■ " + t("donL") + "   ■ " + t("expL"); cb.append(chartSvg(mo), lg); } fill("#chart", mo.length ? cb : el("div", t("empty"), "state"));
    const g = el("div", null, "gal"); gl.forEach((x) => { const a = el("a"), im = el("img"); a.href = im.src = C.SUPABASE_URL + "/storage/v1/object/public/public-gallery/" + x.storage_path.split("/").map(encodeURIComponent).join("/"); a.target = "_blank"; a.rel = "noopener"; im.alt = x.title || ""; im.loading = "lazy"; a.append(im, el("small", (T[lang].g[x.category] || "") + (x.title ? " — " + x.title : ""))); g.append(a); });
    fill("#gal", gl.length ? g : el("div", t("empty"), "state"));
    const d = el("div", null, "dls"), bx = el("button", t("dlx"), "btn"), bp = el("a", t("dlp"), "btn"); bp.href = "report.html?type=public&lang=" + lang; bp.target = "_blank"; bp.rel = "noopener"; d.append(bx, bp); fill("#dl", d);
    bx.addEventListener("click", async () => { try { const [tot, bal, rec, mat] = await Promise.all(["public_totals", "public_cash_balance", "public_recent_donations", "public_material_summary"].map(api)), a = tot[0], z = (o) => Object.values(o);
      MXL.download({ Summary: [["Item", "Amount (BDT)"], ["Verified cash donations", +a.cash_received], ["Expenses paid", +a.expenses_paid], ["Cash fund balance", +bal[0].balance], ["Material donations est. value (not cash)", +a.material_value], ["Unpaid bills", +a.unpaid_bills], ["Outstanding pledges", +a.pledges_outstanding], ["Verified donors", +a.verified_donors]],
        "Recent donations": [["Date", "Donor", "Amount", "Method"], ...rec.map((r) => [r.donation_date, r.display_name || "Anonymous", +r.amount, r.method])], "Materials": [["Type", "Unit", "Quantity", "Est. value"], ...mat.map((r) => [r.category, r.unit, +r.total_quantity, +r.est_value])],
        "Progress": [["Stage", "Progress %"], ...pg.map((r) => [r.name_en, r.progress_pct])], "Monthly": [["Month", "Donations", "Expenses"], ...mo.map((r) => [r.month, +r.donations, +r.expenses])] }, "hari-chowdhury-public-report.xlsx"); } catch (e) { alert(t("fail")); } });
  } catch (e) { ["#prog", "#chart", "#gal"].forEach((s) => msg(s, e.message === "setup" ? t("setup") : t("fail"), true)); }
}
