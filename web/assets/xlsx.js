"use strict";
// Zero-dependency .xlsx reader/writer (browser + Node 18+). Writer: stored ZIP. Reader: ZIP + DecompressionStream('deflate-raw').
(function (root) {
  const enc = new TextEncoder(), dec = new TextDecoder();
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const esc = (s) => String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const unesc = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, "&");
  const colName = (i) => { let s = ""; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; };
  const colIndex = (ref) => { let n = 0; for (const ch of ref.replace(/\d+/g, "")) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };

  function zip(files) { // files: [{name, data:Uint8Array}] -> Uint8Array (method 0 = stored)
    const parts = [], central = []; let off = 0;
    for (const f of files) {
      const name = enc.encode(f.name), crc = crc32(f.data), h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true); h.setUint16(10, 0, true); h.setUint16(12, 0x21, true);
      h.setUint32(14, crc, true); h.setUint32(18, f.data.length, true); h.setUint32(22, f.data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
      parts.push(new Uint8Array(h.buffer), name, f.data);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true); c.setUint16(12, 0, true); c.setUint16(14, 0x21, true);
      c.setUint32(16, crc, true); c.setUint32(20, f.data.length, true); c.setUint32(24, f.data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
      central.push(new Uint8Array(c.buffer), name); off += 30 + name.length + f.data.length;
    }
    const csz = central.reduce((s, x) => s + x.length, 0), e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, csz, true); e.setUint32(16, off, true);
    const all = [...parts, ...central, new Uint8Array(e.buffer)], out = new Uint8Array(all.reduce((s, x) => s + x.length, 0)); let p = 0;
    for (const x of all) { out.set(x, p); p += x.length; } return out;
  }
  const cell = (v, r, c, hdr) => {
    const ref = colName(c) + (r + 1);
    if (v === null || v === undefined || v === "") return "";
    if (typeof v === "number" && isFinite(v)) return `<c r="${ref}"><v>${v}</v></c>`;
    if (typeof v === "boolean") return `<c r="${ref}" t="b"><v>${v ? 1 : 0}</v></c>`;
    let s = typeof v === "object" ? JSON.stringify(v) : String(v); if (s.length > 32000) s = s.slice(0, 32000);
    return `<c r="${ref}" t="inlineStr"${hdr ? ' s="1"' : ""}><is><t xml:space="preserve">${esc(s)}</t></is></c>`;
  };
  // sheets: { "Sheet name": [[row0 (header)], [row1], ...] }
  function write(sheets) {
    const names = Object.keys(sheets).map((n) => n.replace(/[\[\]:*?\/\\]/g, "_").slice(0, 31)), F = [], X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
    const ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"', rn = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
    F.push(["[Content_Types].xml", X + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' + names.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") + "</Types>"]);
    F.push(["_rels/.rels", X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>']);
    F.push(["xl/workbook.xml", X + `<workbook ${ns} ${rn}><sheets>` + names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") + "</sheets></workbook>"]);
    F.push(["xl/_rels/workbook.xml.rels", X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + names.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") + `<Relationship Id="rId${names.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`]);
    F.push(["xl/styles.xml", X + `<styleSheet ${ns}><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`]);
    Object.values(sheets).forEach((rows, i) => F.push([`xl/worksheets/sheet${i + 1}.xml`, X + `<worksheet ${ns}><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="40" width="18" customWidth="1"/></cols><sheetData>` +
      rows.map((row, r) => `<row r="${r + 1}">` + row.map((v, c) => cell(v, r, c, r === 0)).join("") + "</row>").join("") + "</sheetData></worksheet>"]));
    return zip(F.map(([name, text]) => ({ name, data: enc.encode(text) })));
  }
  async function inflate(bytes) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer()); }
  async function unzip(buf) {
    const b = new Uint8Array(buf), v = new DataView(b.buffer, b.byteOffset, b.byteLength); let e = -1;
    for (let i = b.length - 22; i >= Math.max(0, b.length - 65600); i--) if (v.getUint32(i, true) === 0x06054b50) { e = i; break; }
    if (e < 0) throw new Error("এটি সঠিক .xlsx ফাইল নয়।");
    const n = v.getUint16(e + 10, true); let p = v.getUint32(e + 16, true); const out = {};
    for (let k = 0; k < n; k++) {
      if (v.getUint32(p, true) !== 0x02014b50) throw new Error("ফাইল নষ্ট।");
      const method = v.getUint16(p + 10, true), csz = v.getUint32(p + 20, true), nl = v.getUint16(p + 28, true), xl = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true), lo = v.getUint32(p + 42, true);
      const name = dec.decode(b.subarray(p + 46, p + 46 + nl)), ds = lo + 30 + v.getUint16(lo + 26, true) + v.getUint16(lo + 28, true), raw = b.subarray(ds, ds + csz);
      if (/\.(xml|rels)$/.test(name)) out[name] = dec.decode(method === 0 ? raw : method === 8 ? await inflate(raw) : (() => { throw new Error("অসমর্থিত ZIP পদ্ধতি"); })());
      p += 46 + nl + xl + cl;
    }
    return out;
  }
  async function read(buf) { // -> { sheetName: [[...],[...]] }
    const f = await unzip(buf), wb = f["xl/workbook.xml"]; if (!wb) throw new Error("ওয়ার্কবুক পাওয়া যায়নি।");
    const rels = {}; for (const m of (f["xl/_rels/workbook.xml.rels"] || "").matchAll(/<Relationship\b[^>]*>/g)) { const id = /Id="([^"]+)"/.exec(m[0]), t = /Target="([^"]+)"/.exec(m[0]); if (id && t) rels[id[1]] = t[1]; }
    const sst = []; if (f["xl/sharedStrings.xml"]) for (const m of f["xl/sharedStrings.xml"].matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) sst.push(unesc([...m[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join("")));
    const out = {};
    for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
      const nm = /name="([^"]*)"/.exec(m[0]), rid = /r:id="([^"]+)"/.exec(m[0]); if (!nm || !rid || !rels[rid[1]]) continue;
      let t = rels[rid[1]]; t = t.startsWith("/") ? t.slice(1) : "xl/" + t; const xml = f[t]; if (!xml) continue;
      const rows = [];
      for (const rm of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
        const rr = /r="(\d+)"/.exec(rm[1]), ri = rr ? +rr[1] - 1 : rows.length, row = [];
        for (const cm of rm[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
          const ref = /r="([A-Z]+\d+)"/.exec(cm[1]); if (!ref || cm[2] === undefined) continue; const ty = (/t="([^"]+)"/.exec(cm[1]) || [])[1], inner = cm[2];
          let val; const vm = /<v>([\s\S]*?)<\/v>/.exec(inner);
          if (ty === "s") val = vm ? sst[+vm[1]] : ""; else if (ty === "inlineStr") val = unesc([...inner.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join(""));
          else if (ty === "b") val = vm && vm[1] === "1"; else if (ty === "str" || ty === "e") val = vm ? unesc(vm[1]) : ""; else val = vm ? Number(vm[1]) : "";
          row[colIndex(ref[1])] = val;
        }
        rows[ri] = row;
      }
      out[unesc(nm[1])] = Array.from(rows, (r) => r || []);
    }
    return out;
  }
  const api = { write, read, crc32, download(sheets, filename) { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([write(sheets)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })); a.download = filename; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); } };
  root.MXL = api; if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
