// Offline tests. Run:  node tests/run.js   (Node 18+)
const X = require("../web/assets/xlsx.js"), fs = require("fs"), assert = require("assert"); let pass = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log("PASS", name); } catch (e) { console.log("FAIL", name, e.message); process.exitCode = 1; } };
(async () => {
  await t("xlsx round-trip keeps Bengali, symbols, numbers, booleans", async () => {
    const s = { "দাতা": [["id", "নাম", "অঙ্ক", "ok"], ["1", "রহিম & <সন্তান> \"x\"", 1234.5, true], ["2", "", 0, false]] };
    const r = await X.read(Buffer.from(X.write(s))); assert.deepStrictEqual(r["দাতা"][1], ["1", "রহিম & <সন্তান> \"x\"", 1234.5, true]); assert.strictEqual(r["দাতা"][2][2], 0); });
  await t("xlsx handles 3000 rows x 12 cols", async () => {
    const rows = [Array.from({ length: 12 }, (_, i) => "c" + i)]; for (let i = 0; i < 3000; i++) rows.push(Array.from({ length: 12 }, (_, j) => (j % 2 ? i * j : "v" + i + j)));
    const r = await X.read(Buffer.from(X.write({ Big: rows }))); assert.strictEqual(r.Big.length, 3001); assert.strictEqual(r.Big[3000][11], 2999 * 11); });
  await t("xlsx rejects non-xlsx input", async () => { await assert.rejects(() => X.read(Buffer.from("not a zip file at all, definitely not"))); });
  await t("sheet names sanitised (31 chars, no []:*?/\\)", async () => { const r = await X.read(Buffer.from(X.write({ ["a/b:c*d?[e]f\\" + "x".repeat(40)]: [["h"]] }))); assert.ok(Object.keys(r)[0].length <= 31 && !/[\[\]:*?\/\\]/.test(Object.keys(r)[0])); });
  if (fs.existsSync("/tmp/op.xlsx")) await t("reads a file written by openpyxl (deflate + shared strings)", async () => { const r = await X.read(fs.readFileSync("/tmp/op.xlsx")); assert.strictEqual(r.Donors[1][0], "করিম"); });
  console.log(pass + " passed"); })();
