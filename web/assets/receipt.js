"use strict";
const C = window.APP_CONFIG || {}, box = document.querySelector("#r");
const el = (t, x, c) => { const e = document.createElement(t); if (x != null) e.textContent = x; if (c) e.className = c; return e; };
document.querySelector("#pr").addEventListener("click", () => window.print());
(async () => {
  try {
    const id = new URLSearchParams(location.search).get("id"), tok = sessionStorage.getItem("tok");
    if (!/^[0-9a-f-]{36}$/i.test(id || "") || !tok) throw new Error("অ্যাডমিন হিসেবে লগইন করে রসিদ খুলুন।");
    const r = await fetch(C.SUPABASE_URL + "/rest/v1/donations?id=eq." + id + "&select=*,donors(full_name,father_name,village)", { headers: { apikey: C.SUPABASE_ANON_KEY, Authorization: "Bearer " + tok } });
    const d = (await r.json())[0]; if (!r.ok || !d) throw new Error("রসিদ পাওয়া যায়নি।");
    const rows = [["রসিদ নং", d.receipt_no], ["তারিখ", d.donation_date], ["দাতার নাম", d.donors.full_name], ["পিতার নাম", d.donors.father_name || "—"], ["গ্রাম", d.donors.village || "—"],
      ["পরিমাণ", "৳ " + Number(d.amount).toLocaleString("bn-BD")], ["মাধ্যম", ({ cash: "নগদ", bkash: "বিকাশ", nagad: "নগদ (Nagad)", rocket: "রকেট", bank: "ব্যাংক", cheque: "চেক", other: "অন্যান্য" })[d.method] || d.method], ["ট্রানজেকশন", d.txn_ref || "—"], ["অবস্থা", d.status === "verified" ? "যাচাইকৃত" : "যাচাই হয়নি"]];
    const tb = el("table"); rows.forEach(([a, b]) => { const tr = el("tr"); tr.append(el("th", a), el("td", b)); tb.append(tr); });
    const s = el("div", null, "sign"); s.append(el("span", "দাতার স্বাক্ষর"), el("span", "গ্রহণকারীর স্বাক্ষর"));
    box.replaceChildren(el("h1", "হাঁড়ী-চৌধুরী জামে মসজিদ"), el("p", "দানের রসিদ — Donation Receipt", "center"), tb, s);
  } catch (e) { box.replaceChildren(el("div", e.message, "state err")); }
})();
