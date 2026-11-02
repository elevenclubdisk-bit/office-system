"use strict";
/* =====================================================================
   0. ค่าคงที่และฟังก์ชันช่วย
   ===================================================================== */
const KEY = "office_asset_and_material_v12";
const OLD_KEY = "office_asset_and_material_v11";
const REV_KEY = KEY + "_rev";
const SESSION_KEY = "office_system_session_v2";
const LOCK_KEY = "office_system_lock_v1";
const BACKUP_KEY = "office_system_last_backup";
const LEGACY_SALT = "office-system-salt-v1";
const SESSION_HOURS = 8, REMEMBER_DAYS = 7, IDLE_MIN = 30;
const MAX_FAILS = 5, LOCK_MIN = 5;
const PBKDF2_ITER = 150000, JS_ITER = 30000;
const MAX_AUDIT = 3000;
const ORG = { name: "สำนักงานเลขาธิการสภาผู้แทนราษฎร โทร: 02-242-5900", title: "ใบยืมพัสดุและวัสดุสำนักงาน" };
const ROLE_TH = { admin: "ผู้ดูแลระบบ", staff: "เจ้าหน้าที่", viewer: "ผู้ตรวจสอบ (อ่านอย่างเดียว)" };
const TH_MONTHS = ["", "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const MAT_STATUS = { available: ["ว่าง", "bg-success"], borrowed: ["ถูกยืมอยู่", "bg-warning text-dark"], repair: ["ส่งซ่อม", "bg-danger"], retired: ["จำหน่าย", "bg-secondary"] };
const ASSET_STATUS = { active: ["ปกติ", "bg-success"], repair: ["ส่งซ่อม", "bg-warning text-dark"], disposed: ["จำหน่าย", "bg-secondary"] };
const DEFAULT_MAT_CATS = ["อุปกรณ์คอมพิวเตอร์", "สายสัญญาณและอะแดปเตอร์", "อุปกรณ์โสตทัศนูปกรณ์", "เครื่องเขียนและสำนักงาน", "อื่นๆ"];
const WEAK_PW = ["admin123", "staff123", "12345678", "123456789", "password", "password1", "11111111", "qwerty123", "admin1234", "123456"];

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"'`]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" }[c]));
const S = (v, max = 300) => String(v ?? "").trim().slice(0, max);
const oneOf = (v, list, def) => list.includes(v) ? v : def;
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const D = v => ISO_RE.test(String(v || "")) ? String(v) : "";
const pad = n => String(n).padStart(2, "0");

function todayISO() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function addDays(iso, n) { const [y, m, d] = iso.split("-").map(Number); const x = new Date(y, m - 1, d + n); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; }
function dayNum(iso) { const [y, m, d] = iso.split("-").map(Number); return Date.UTC(y, m - 1, d) / 86400000; }
function daysLate(due) { return dayNum(todayISO()) - dayNum(due); }
function fmtDate(iso) { if (!iso) return "-"; const [y, m, d] = iso.split("-"); return `${d}/${m}/${Number(y) + 543}`; }
function toBE(y) { return Number(y) + 543; }
function fiscalStart() { const t = todayISO(); const y = Number(t.slice(0, 4)), m = Number(t.slice(5, 7)); return `${m >= 10 ? y : y - 1}-10-01`; }
function fiscalYearBE(iso) { if (!iso) return "-"; const y = Number(iso.slice(0, 4)), m = Number(iso.slice(5, 7)); return (m >= 10 ? y + 1 : y) + 543; }
function money(n) { return Number(n || 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function validSerial(s) { const t = String(s || "").trim(); return t !== "" && t !== "-"; }
function fmtDT(iso) { try { return new Date(iso).toLocaleString("th-TH"); } catch (e) { return iso; } }

function csvCell(v) {
  let s = String(v ?? "");
  if (typeof v !== "number" && /^[=+\-@\t\r]/.test(s)) s = "'" + s; // กัน CSV/Formula injection
  return '"' + s.replace(/"/g, '""') + '"';
}
function downloadCsv(name, rows) {
  const blob = new Blob(["\uFEFF" + rows.map(r => r.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}
function downloadBlob(name, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}
function setText(id, v) { $(id).textContent = v; }
function opt(v, label, selected) { return `<option value="${esc(v)}"${selected ? " selected" : ""}>${esc(label)}</option>`; }
function setOpts(id, html) { const s = $(id); const cur = s.value; s.innerHTML = html; if (cur && [...s.options].some(o => o.value === cur)) s.value = cur; }
function withCurrent(list, val) { return val && !list.includes(val) ? [...list, val] : list; }
function ib(act, id, icon, cls, label, x) {
  return `<button type="button" class="btn btn-sm ${cls}" data-act="${act}" data-id="${esc(id)}"${x !== undefined ? ` data-x="${esc(x)}"` : ""} title="${esc(label)}" aria-label="${esc(label)}"><i class="fa-solid ${icon}" aria-hidden="true"></i></button>`;
}

/* ----- toast / modal ----- */
function toast(msg, type = "dark") {
  if (typeof bootstrap === "undefined") { alert(msg); return; }
  const el = document.createElement("div");
  el.className = `toast align-items-center text-bg-${type} border-0`;
  el.setAttribute("role", "alert");
  el.innerHTML = `<div class="d-flex"><div class="toast-body">${esc(msg)}</div><button type="button" class="btn-close ${type === "warning" || type === "light" ? "" : "btn-close-white"} me-2 m-auto" data-bs-dismiss="toast" aria-label="ปิด"></button></div>`;
  $("toast-wrap").appendChild(el);
  el.addEventListener("hidden.bs.toast", () => el.remove());
  new bootstrap.Toast(el, { delay: type === "danger" || type === "warning" ? 7000 : 3500 }).show();
}
const ok = m => toast(m, "success");
const warn = m => toast(m, "warning");
const bad = m => toast(m, "danger");
function showInfo(title, html) { setText("info-title", title); $("info-body").innerHTML = html; bootstrap.Modal.getOrCreateInstance($("infoModal")).show(); }
function hideModal(id) { const m = bootstrap.Modal.getInstance($(id)); if (m) m.hide(); }
function showModal(id) { bootstrap.Modal.getOrCreateInstance($(id)).show(); }

/* =====================================================================
   1. การเข้ารหัสรหัสผ่าน (PBKDF2 + salt สุ่มรายผู้ใช้)
   ===================================================================== */
const enc = new TextEncoder();
const toHex = b => [...b].map(x => x.toString(16).padStart(2, "0")).join("");
const fromHex = h => Uint8Array.from(h.match(/../g) || [], x => parseInt(x, 16));
function randHex(n) { const a = new Uint8Array(n); crypto.getRandomValues(a); return toHex(a); }
function randPassword(len = 12) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const a = new Uint32Array(len); crypto.getRandomValues(a);
  let p = ""; for (let i = 0; i < len; i++) p += chars[a[i] % chars.length];
  return /[A-Za-z]/.test(p) && /\d/.test(p) ? p : randPassword(len);
}
function timingEq(a, b) { a = String(a); b = String(b); let r = a.length ^ b.length; for (let i = 0; i < Math.max(a.length, b.length); i++) r |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0); return r === 0; }

// SHA-256 / HMAC / PBKDF2 แบบ JS (ใช้เป็น fallback เมื่อไม่มี crypto.subtle เช่นเปิดผ่าน http บนเครือข่ายภายใน)
const _P = []; (function () { for (let c = 2; _P.length < 64; c++) { let p = true; for (const q of _P) { if (q * q > c) break; if (c % q === 0) { p = false; break; } } if (p) _P.push(c); } })();
const K256 = _P.map(p => (Math.pow(p, 1 / 3) * 4294967296) >>> 0);
const H256 = _P.slice(0, 8).map(p => (Math.sqrt(p) * 4294967296) >>> 0);
const rotr = (x, n) => (x >>> n) | (x << (32 - n));
function sha256Bytes(msg) {
  const H = H256.slice(), l = msg.length, total = ((l + 9 + 63) >> 6) << 6;
  const buf = new Uint8Array(total); buf.set(msg); buf[l] = 0x80;
  const dv = new DataView(buf.buffer);
  dv.setUint32(total - 8, Math.floor(l / 536870912)); dv.setUint32(total - 4, (l << 3) >>> 0);
  const w = new Uint32Array(64);
  for (let o = 0; o < total; o += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) { const a = w[i - 15], b = w[i - 2]; w[i] = (w[i - 16] + (rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3)) + w[i - 7] + (rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10))) >>> 0; }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K256[i] + w[i]) >>> 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }
  const out = new Uint8Array(32), ov = new DataView(out.buffer); H.forEach((v, i) => ov.setUint32(i * 4, v)); return out;
}
function hmacSha256(key, msg) {
  if (key.length > 64) key = sha256Bytes(key);
  const ik = new Uint8Array(64 + msg.length), ok = new Uint8Array(96);
  ik.fill(0x36, 0, 64); ok.fill(0x5c, 0, 64);
  for (let i = 0; i < key.length; i++) { ik[i] ^= key[i]; ok[i] ^= key[i]; }
  ik.set(msg, 64); ok.set(sha256Bytes(ik), 64);
  return sha256Bytes(ok);
}
function pbkdf2JS(pw, salt, iter) {
  const s1 = new Uint8Array(salt.length + 4); s1.set(salt); s1[salt.length + 3] = 1;
  let u = hmacSha256(pw, s1); const t = u.slice();
  for (let i = 1; i < iter; i++) { u = hmacSha256(pw, u); for (let j = 0; j < 32; j++) t[j] ^= u[j]; }
  return t;
}
const hasSubtle = () => !!(window.crypto && crypto.subtle);
async function derive(pw, saltHex, iter) {
  const salt = fromHex(saltHex), pwb = enc.encode(pw);
  if (hasSubtle()) {
    const k = await crypto.subtle.importKey("raw", pwb, "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iter }, k, 256);
    return toHex(new Uint8Array(bits));
  }
  await new Promise(r => setTimeout(r, 20));
  return toHex(pbkdf2JS(pwb, salt, iter));
}
async function makeHash(pw) { const salt = randHex(16), iter = hasSubtle() ? PBKDF2_ITER : JS_ITER; return `pbkdf2$${iter}$${salt}$${await derive(pw, salt, iter)}`; }
async function verifyPw(pw, stored) {
  if (!stored) return false;
  if (String(stored).startsWith("pbkdf2$")) { const [, it, salt, h] = stored.split("$"); return timingEq(await derive(pw, salt, Number(it)), h); }
  return timingEq(toHex(sha256Bytes(enc.encode(LEGACY_SALT + ":" + pw))), stored); // รองรับรหัสผ่านรุ่นเก่า แล้วอัปเกรดตอนล็อกอิน
}
function pwProblem(pw, username) {
  if (pw.length < 8) return "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร";
  if (!/[A-Za-z\u0E00-\u0E7F]/.test(pw) || !/\d/.test(pw)) return "รหัสผ่านต้องมีทั้งตัวอักษรและตัวเลข";
  if (WEAK_PW.includes(pw.toLowerCase()) || (username && pw.toLowerCase() === String(username).toLowerCase())) return "รหัสผ่านคาดเดาง่ายเกินไป";
  return "";
}

/* =====================================================================
   2. ชั้นข้อมูล: ทำความสะอาด/ตรวจสอบ, โหลด, บันทึก, ป้องกันเขียนทับกัน
   ===================================================================== */
function cleanDivision(d, i) { return { id: S(d.id, 40) || "DIV-" + (i + 1), name: S(d.name, 150), departments: Array.isArray(d.departments) ? [...new Set(d.departments.map(x => S(x, 150)).filter(Boolean))] : [] }; }
function cleanAsset(a) {
  return { id: S(a.id, 40), code: S(a.code, 60), serial: S(a.serial, 60) || "-", name: S(a.name, 150), brand: S(a.brand, 150), category: S(a.category, 100) || "ทั่วไป",
    division: S(a.division, 150), department: S(a.department, 150), holder: S(a.holder, 100) || "-", status: oneOf(a.status, ["active", "repair", "disposed"], "active"),
    acquireDate: D(a.acquireDate), price: Math.max(0, Number(a.price) || 0), location: S(a.location, 150), lastChecked: D(a.lastChecked), note: S(a.note, 300) };
}
function cleanMaterial(m) {
  return { id: S(m.id, 40), name: S(m.name, 150), code: S(m.code, 60), serial: S(m.serial, 60), category: S(m.category, 100) || "อื่นๆ",
    status: oneOf(m.status, ["available", "borrowed", "repair", "retired"], "available"), division: S(m.division, 150) };
}
function cleanTx(t) {
  return { transId: S(t.transId, 40), slipNo: S(t.slipNo, 40), assetId: S(t.assetId, 40), borrowerName: S(t.borrowerName, 100), division: S(t.division, 150), department: S(t.department, 150),
    phone: S(t.phone, 30), email: S(t.email, 120), purpose: S(t.purpose, 300), borrowDate: D(t.borrowDate), dueDate: D(t.dueDate), returnDate: D(t.returnDate),
    status: oneOf(t.status, ["borrowing", "returned", "cancelled"], "borrowing"), conditionNote: S(t.conditionNote, 200), anonymized: !!t.anonymized };
}
function cleanUser(u) {
  return { username: S(u.username, 30), name: S(u.name, 100), role: oneOf(u.role, ["admin", "staff", "viewer"], "staff"), scope: oneOf(u.scope, ["all", "division"], "division"),
    division: S(u.division, 150), passwordHash: S(u.passwordHash, 400), active: u.active !== false, mustChange: !!u.mustChange };
}
const isObj = x => x && typeof x === "object" && !Array.isArray(x);
const arr = x => Array.isArray(x) ? x.filter(isObj) : [];
function strList(x) { return Array.isArray(x) ? [...new Set(x.map(v => S(v, 150)).filter(Boolean))] : []; }

function normalizeData(p, opts = {}) {
  if (!isObj(p)) throw new Error("โครงสร้างไฟล์ไม่ถูกต้อง");
  if (opts.strict && (!Array.isArray(p.assets) || !Array.isArray(p.materials) || !Array.isArray(p.divisions) || !Array.isArray(p.transactions))) throw new Error("ไฟล์ต้องมี divisions, assets, materials และ transactions");
  const cfg = isObj(p.assetConfigs) ? p.assetConfigs : {};
  const d = {
    rev: Number(p.rev) || 0,
    users: opts.noUsers ? [] : arr(p.users).map(cleanUser).filter(u => /^[A-Za-z0-9._-]{3,30}$/.test(u.username) && !/^__/.test(u.username)),
    divisions: arr(p.divisions).map(cleanDivision).filter(x => x.name),
    assetConfigs: { categories: strList(cfg.categories), itemNames: strList(cfg.itemNames), brands: strList(cfg.brands) },
    assets: arr(p.assets).map(cleanAsset).filter(a => a.id && a.code && a.name),
    materials: arr(p.materials).map(cleanMaterial).filter(m => m.id && m.name),
    transactions: arr(p.transactions).map(cleanTx).filter(t => t.transId && t.assetId),
    audit: arr(p.audit).map(a => ({ t: S(a.t, 40), u: S(a.u, 40), a: S(a.a, 60), d: S(a.d, 400) })).slice(-MAX_AUDIT)
  };
  const seen = new Set();
  d.assets = d.assets.filter(a => !seen.has(a.id) && seen.add(a.id));
  const seenM = new Set(); d.materials = d.materials.filter(m => !seenM.has(m.id) && seenM.add(m.id));
  const seenT = new Set(); d.transactions = d.transactions.filter(t => !seenT.has(t.transId) && seenT.add(t.transId));
  d.transactions.forEach(t => { if (!t.slipNo) t.slipNo = t.transId; });
  return d;
}

function defaultData() {
  const t = todayISO();
  return {
    rev: 0, users: [], audit: [],
    divisions: [
      { id: "DIV-1", name: "สำนักสารสนเทศ", departments: ["กลุ่มงานระบบเครือข่าย", "กลุ่มงานพัฒนาโปรแกรม", "กลุ่มงานบริการคอมพิวเตอร์"] },
      { id: "DIV-2", name: "สำนักบริหารกลาง", departments: ["กลุ่มงานพัสดุ", "กลุ่มงานบุคคล", "กลุ่มงานการเงินและบัญชี"] }
    ],
    assetConfigs: { categories: ["คอมพิวเตอร์", "แท็บเล็ต", "จอภาพ", "เครื่องพิมพ์", "เฟอร์นิเจอร์"], itemNames: ["โน้ตบุ๊ก (Notebook)", "คอมพิวเตอร์ตั้งโต๊ะ (PC)", "จอ Monitor", "เครื่องพิมพ์ Laser"], brands: ["Dell Latitude 5440", "Lenovo ThinkBook", "Apple iPad Pro", "HP LaserJet Pro"] },
    assets: [
      cleanAsset({ id: "AST-001", code: "****-***-***/67", serial: "SN-DELL-8839", name: "โน้ตบุ๊ก (Notebook)", brand: "Dell Latitude 5440", category: "คอมพิวเตอร์", division: "สำนักสารสนเทศ", department: "กลุ่มงานระบบเครือข่าย", holder: "นายประสิทธิ์ มานะ", status: "active", price: 35000 }),
      cleanAsset({ id: "AST-002", code: "****-***-***/66", serial: "SN-LNVO-4412", name: "โน้ตบุ๊ก (Notebook)", brand: "Lenovo ThinkBook", category: "คอมพิวเตอร์", division: "สำนักบริหารกลาง", department: "กลุ่มงานพัสดุ", holder: "นางสาวสมร มีทรัพย์", status: "active", price: 28000 }),
      cleanAsset({ id: "AST-003", code: "****-***-***/65", serial: "SN-IPAD-0091", name: "Apple iPad Pro", brand: "Apple iPad Pro", category: "แท็บเล็ต", division: "สำนักสารสนเทศ", department: "กลุ่มงานพัฒนาโปรแกรม", holder: "นายชาญชัย ดียิ่ง", status: "repair", price: 32000 })
    ],
    materials: [
      cleanMaterial({ id: "MAT-001", name: "เมาส์ไร้สาย Logitech MX Master 3S", code: "MS-67/01", serial: "MS99812", category: "อุปกรณ์คอมพิวเตอร์", status: "borrowed", division: "สำนักสารสนเทศ" }),
      cleanMaterial({ id: "MAT-002", name: "สายแปลง USB-C to HDMI 4K", code: "ADP-67/05", serial: "SN-ADP-001", category: "สายสัญญาณและอะแดปเตอร์", status: "available", division: "" }),
      cleanMaterial({ id: "MAT-003", name: "ตัวชี้สไลด์ไร้สาย (Wireless Presenter)", code: "PRE-66/12", serial: "WP-8871", category: "อุปกรณ์โสตทัศนูปกรณ์", status: "available", division: "" })
    ],
    transactions: [
      cleanTx({ transId: "TX-0001", slipNo: "SL-0001", assetId: "MAT-001", borrowerName: "สมชาย ใจดี", division: "สำนักสารสนเทศ", department: "กลุ่มงานบริการคอมพิวเตอร์", phone: "000-000-0000", email: "", purpose: "ใช้จัดห้องประชุมคณะกรรมาธิการ", borrowDate: addDays(t, -8), dueDate: addDays(t, -2), returnDate: "", status: "borrowing", conditionNote: "" })
    ]
  };
}

let loadNotice = "";
function loadData() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch (e) { loadNotice = "ไม่สามารถเข้าถึงพื้นที่จัดเก็บของเบราว์เซอร์ได้ ข้อมูลจะไม่ถูกบันทึก (ตรวจสอบโหมดส่วนตัว/การตั้งค่าความเป็นส่วนตัว)"; return defaultData(); }
  if (!raw) {
    let old = null; try { old = localStorage.getItem(OLD_KEY); } catch (e) { }
    if (old) {
      try {
        const d = normalizeData(JSON.parse(old)); d.rev = 0;
        d.audit.push({ t: new Date().toISOString(), u: "system", a: "migrate", d: "ย้ายข้อมูลจากระบบรุ่น v11 (รหัสผ่านเก่าจะถูกอัปเกรดเมื่อล็อกอิน)" });
        return d;
      } catch (e) { loadNotice = "พบข้อมูลรุ่นเก่าแต่อ่านไม่ได้ จึงเริ่มระบบใหม่ (ข้อมูลเก่ายังอยู่ในเบราว์เซอร์)"; }
    }
    return defaultData();
  }
  try { return normalizeData(JSON.parse(raw)); }
  catch (e) {
    try { localStorage.setItem(KEY + "_corrupt_" + Date.now(), raw); } catch (_) { }
    loadNotice = "ข้อมูลในเบราว์เซอร์เสียหาย ระบบได้สำเนาข้อมูลเดิมไว้ภายใต้คีย์ *_corrupt_* แล้วเริ่มฐานข้อมูลใหม่ — โปรดติดต่อผู้ดูแลระบบ";
    return defaultData();
  }
}
let data = loadData();
let currentUser = null;
let currentTab = "dashboard";

function storedRev() { try { return Number(localStorage.getItem(REV_KEY) || 0); } catch (e) { return 0; } }
function syncCurrentUser() {
  if (!currentUser) return true;
  const u = data.users.find(x => x.username === currentUser.username && x.active);
  if (!u) { logout("บัญชีถูกระงับหรือถูกลบ"); return false; }
  currentUser = u; return true;
}
function freshOK() {
  if (storedRev() === (data.rev || 0)) return true;
  data = loadData();
  if (syncCurrentUser()) { warn("ข้อมูลถูกแก้ไขจากแท็บ/หน้าต่างอื่น ระบบโหลดข้อมูลล่าสุดแล้ว กรุณาตรวจสอบและทำรายการซ้ำ"); renderActive(); }
  return false;
}
function audit(action, detail) {
  data.audit.push({ t: new Date().toISOString(), u: currentUser ? currentUser.username : "-", a: action, d: S(detail, 400) });
  if (data.audit.length > MAX_AUDIT) data.audit = data.audit.slice(-MAX_AUDIT);
}
function save(opts = {}) {
  if (!freshOK()) return false;
  data.rev = (data.rev || 0) + 1;
  try { localStorage.setItem(KEY, JSON.stringify(data)); localStorage.setItem(REV_KEY, String(data.rev)); }
  catch (e) { data.rev--; bad("บันทึกไม่สำเร็จ: พื้นที่จัดเก็บเต็มหรือถูกบล็อก กรุณาสำรองข้อมูลทันที"); return false; }
  if (opts.render !== false) renderActive();
  return true;
}
window.addEventListener("storage", e => {
  if (e.key !== REV_KEY || e.newValue === null) return;
  data = loadData();
  if (currentUser && syncCurrentUser()) renderActive();
});

/* =====================================================================
   3. สิทธิ์การใช้งาน
   ===================================================================== */
const isAdmin = () => !!currentUser && currentUser.role === "admin";
const canWrite = () => !!currentUser && currentUser.role !== "viewer";
function userDiv() { if (!currentUser || isAdmin() || currentUser.scope === "all") return ""; return currentUser.division || "__none__"; }
const seesDiv = div => { const u = userDiv(); return !u || div === u; };
const materialOf = id => data.materials.find(m => m.id === id);
const seesAsset = a => seesDiv(a.division);
const seesMat = m => { const u = userDiv(); return !u || !m.division || m.division === u; };
const seesTx = t => { const u = userDiv(); if (!u) return true; const m = materialOf(t.assetId); return t.division === u || !!(m && m.division === u); };
const visAssets = () => data.assets.filter(seesAsset);
const visMats = () => data.materials.filter(seesMat);
const visTx = () => data.transactions.filter(seesTx);
const visDivisions = () => { const u = userDiv(); return u ? data.divisions.filter(d => d.name === u) : data.divisions; };
function requireAdmin() { if (!isAdmin()) { warn("เฉพาะผู้ดูแลระบบ"); return false; } return freshOK(); }
function requireWrite() { if (!canWrite()) { warn("บัญชีนี้มีสิทธิ์อ่านอย่างเดียว"); return false; } return freshOK(); }
const isOverdue = t => t.status === "borrowing" && t.dueDate < todayISO();
const activeAdmins = () => data.users.filter(u => u.role === "admin" && u.active);

/* =====================================================================
   4. ยืนยันตัวตน / เซสชัน
   ===================================================================== */
function getLocks() { try { return JSON.parse(localStorage.getItem(LOCK_KEY) || "{}"); } catch (e) { return {}; } }
function setLocks(o) { try { localStorage.setItem(LOCK_KEY, JSON.stringify(o)); } catch (e) { } }
function setSession(u, rem) {
  const exp = Date.now() + (rem ? REMEMBER_DAYS * 864e5 : SESSION_HOURS * 36e5);
  const p = JSON.stringify({ username: u.username, exp });
  try { sessionStorage.setItem(SESSION_KEY, p); if (rem) localStorage.setItem(SESSION_KEY, p); else localStorage.removeItem(SESSION_KEY); } catch (e) { }
}
function getSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return s && typeof s.username === "string" && s.exp > Date.now() ? s : null;
  } catch (e) { return null; }
}
function clearSession() { try { sessionStorage.removeItem(SESSION_KEY); localStorage.removeItem(SESSION_KEY); } catch (e) { } }

function showLogin() {
  $("login-screen").classList.remove("d-none");
  $("app-shell").classList.add("d-none");
  const first = data.users.length === 0;
  $("login-form").classList.toggle("d-none", first);
  $("setup-form").classList.toggle("d-none", !first);
  $("login-notice").classList.toggle("d-none", !loadNotice);
  $("login-notice").textContent = loadNotice;
}
function loginErr(msg) { const e = $("login-error"); e.textContent = msg; e.classList.remove("d-none"); }

$("login-form").addEventListener("submit", async e => {
  e.preventDefault();
  const uName = $("login-user").value.trim().toLowerCase(), pass = $("login-pass").value;
  const lockKey = "u:" + uName, locks = getLocks(), lk = locks[lockKey] || { n: 0, until: 0 };
  if (lk.until > Date.now()) return loginErr(`ลองผิดหลายครั้ง บัญชีถูกล็อกชั่วคราว กรุณารออีก ${Math.ceil((lk.until - Date.now()) / 60000)} นาที`);
  const btn = $("login-btn"); btn.disabled = true;
  try {
    const user = data.users.find(u => u.username.toLowerCase() === uName);
    const good = user ? await verifyPw(pass, user.passwordHash) : (await derive(pass, "00".repeat(16), 1000), false);
    if (!good) {
      lk.n++; if (lk.n >= MAX_FAILS) { lk.until = Date.now() + LOCK_MIN * 60000; lk.n = 0; }
      locks[lockKey] = lk; setLocks(locks);
      await new Promise(r => setTimeout(r, 600));
      return loginErr("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
    }
    if (!user.active) return loginErr("บัญชีนี้ถูกระงับการใช้งาน");
    delete locks[lockKey]; setLocks(locks);
    let upgraded = false;
    if (!String(user.passwordHash).startsWith("pbkdf2$")) {
      user.passwordHash = await makeHash(pass); upgraded = true;
      if (WEAK_PW.includes(pass.toLowerCase())) user.mustChange = true;
    }
    $("login-error").classList.add("d-none");
    currentUser = user;
    audit("login", "เข้าสู่ระบบ" + (upgraded ? " (อัปเกรดรหัสผ่าน)" : ""));
    save({ render: false });
    setSession(user, $("login-remember").checked);
    $("login-form").reset();
    enterApp(user);
  } catch (err) { loginErr("เกิดข้อผิดพลาด: " + err.message); }
  finally { btn.disabled = false; }
});

$("setup-form").addEventListener("submit", async e => {
  e.preventDefault();
  const err = $("setup-error"); err.classList.add("d-none");
  const username = $("setup-user").value.trim(), name = $("setup-name").value.trim(), p1 = $("setup-pass").value, p2 = $("setup-pass2").value;
  const prob = pwProblem(p1, username);
  const fail = m => { err.textContent = m; err.classList.remove("d-none"); };
  if (data.users.length) return fail("มีผู้ใช้ในระบบแล้ว");
  if (!/^[A-Za-z0-9._-]{3,30}$/.test(username)) return fail("ชื่อผู้ใช้ใช้ได้เฉพาะ A-Z a-z 0-9 . _ - (3-30 ตัว)");
  if (prob) return fail(prob);
  if (p1 !== p2) return fail("รหัสผ่านไม่ตรงกัน");
  const u = { username, name: name || username, role: "admin", scope: "all", division: "", passwordHash: await makeHash(p1), active: true, mustChange: false };
  data.users.push(u); currentUser = u;
  audit("setup", "สร้างผู้ดูแลระบบคนแรก");
  if (!save({ render: false })) { currentUser = null; data.users = []; return fail("บันทึกไม่สำเร็จ"); }
  $("setup-form").reset(); setSession(u, false); enterApp(u);
});

let idleTimer = null, lastActive = Date.now();
["click", "keydown", "mousemove", "touchstart"].forEach(ev => document.addEventListener(ev, () => { lastActive = Date.now(); }, { passive: true }));
function startIdleWatch() {
  clearInterval(idleTimer);
  idleTimer = setInterval(() => {
    if (!currentUser) return;
    if (Date.now() - lastActive > IDLE_MIN * 60000) logout("ออกจากระบบอัตโนมัติเนื่องจากไม่มีการใช้งานเกิน " + IDLE_MIN + " นาที");
    else if (!getSession()) logout("เซสชันหมดอายุ");
  }, 30000);
}

function enterApp(u) {
  currentUser = u; lastActive = Date.now();
  $("login-screen").classList.add("d-none");
  $("app-shell").classList.remove("d-none");
  setText("who-name", u.name); setText("who-role", ROLE_TH[u.role] || u.role);
  document.querySelectorAll(".admin-only").forEach(el => el.classList.toggle("d-none", !isAdmin()));
  document.querySelectorAll(".write-only").forEach(el => el.classList.toggle("d-none", !canWrite()));
  startIdleWatch();
  openTab("dashboard");
  if (u.mustChange) { $("force-password-form").reset(); showModal("forcePwModal"); }
}
function logout(msg) {
  if (currentUser) { audit("logout", msg || "ออกจากระบบ"); save({ render: false }); }
  clearSession(); currentUser = null; clearInterval(idleTimer);
  document.querySelectorAll(".modal.show").forEach(m => { const i = bootstrap.Modal.getInstance(m); if (i) i.hide(); });
  showLogin(); if (msg) warn(msg);
}

/* ---- เปลี่ยนรหัสผ่าน ---- */
function openPasswordModal() { $("password-form").reset(); showModal("passwordModal"); }
async function handlePasswordChange(form, ids) {
  const u = data.users.find(x => x.username === currentUser.username);
  const oldPw = $(ids[0]).value, newPw = $(ids[1]).value, newPw2 = $(ids[2]).value;
  if (!u || !(await verifyPw(oldPw, u.passwordHash))) return bad("รหัสผ่านปัจจุบันไม่ถูกต้อง");
  const prob = pwProblem(newPw, u.username); if (prob) return bad(prob);
  if (newPw !== newPw2) return bad("รหัสผ่านใหม่ไม่ตรงกัน");
  if (newPw === oldPw) return bad("รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสเดิม");
  if (!freshOK()) return;
  u.passwordHash = await makeHash(newPw); u.mustChange = false;
  audit("change-password", "เปลี่ยนรหัสผ่านของตนเอง");
  if (save({ render: false })) { hideModal(form.dataset.forced === "1" ? "forcePwModal" : "passwordModal"); ok("เปลี่ยนรหัสผ่านเรียบร้อย"); }
}
$("password-form").addEventListener("submit", e => { e.preventDefault(); handlePasswordChange(e.target, ["pw-old", "pw-new", "pw-new2"]); });
$("force-password-form").addEventListener("submit", e => { e.preventDefault(); handlePasswordChange(e.target, ["fpw-old", "fpw-new", "fpw-new2"]); });

/* =====================================================================
   5. การนำทาง / แสดงผล
   ===================================================================== */
const ADMIN_TABS = ["users", "audit"], WRITE_TABS = ["borrow", "return"];
function openTab(tab) {
  if (ADMIN_TABS.includes(tab) && !isAdmin()) return warn("เฉพาะผู้ดูแลระบบเท่านั้น");
  if (WRITE_TABS.includes(tab) && !canWrite()) return warn("บัญชีนี้มีสิทธิ์อ่านอย่างเดียว");
  currentTab = tab;
  document.querySelectorAll(".sidebar .nav-link").forEach(l => l.classList.toggle("active", l.dataset.tab === tab));
  document.querySelectorAll(".content-tab").forEach(t => t.classList.remove("show"));
  $("tab-" + tab).classList.add("show");
  if (tab === "assets") initAssetFilters();
  if (tab === "asset-report") initAssetReportFilters();
  if (tab === "borrow") { initBorrowDivisions(); $("borrow-date").value = todayISO(); $("due-date").value = addDays(todayISO(), 7); }
  if (tab === "return") $("return-date").value = todayISO();
  if (tab === "report") { fillPersonSelect(); clearPreview(); }
  if (tab === "period") fillPeriodFilters();
  if (tab === "org") fillOrgSelect();
  renderActive();
}
function renderActive() {
  if (!currentUser) return;
  switch (currentTab) {
    case "dashboard": return renderDashboard();
    case "assets": return renderAssets();
    case "asset-report": return renderAssetReportDoc();
    case "org": return renderOrgStructure();
    case "asset-config": return renderAssetConfigs();
    case "materials": return renderMaterials();
    case "borrow": return fillBorrowList();
    case "return": return fillReturnSelect();
    case "history": return renderHistory();
    case "report": fillPersonSelect(); return previewKeys.length ? showSlips(previewKeys) : undefined;
    case "period": return renderPeriodReport();
    case "users": return renderUsers();
    case "audit": return renderAudit();
  }
}
document.querySelectorAll(".sidebar .nav-link[data-tab]").forEach(link => link.addEventListener("click", e => { e.preventDefault(); openTab(link.dataset.tab); }));

// ตัวจัดการปุ่มแบบ delegation (ไม่ฝังข้อมูลผู้ใช้ใน onclick)
const ACTIONS = {
  editAsset: id => openAssetModal(id), delAsset: id => deleteAsset(id), checkAsset: id => markChecked(id),
  editMat: id => openMaterialModal(id), delMat: id => deleteMaterial(id),
  slip: id => openSlip(id), cancelTx: id => cancelTx(id), anonTx: id => anonymizeTx(id),
  delDiv: id => deleteDivision(id), delDept: (id, x) => deleteDepartment(id, x), delCfg: (id, x) => deleteConfig(id, Number(x)),
  editUser: id => openUserModal(id), resetPw: id => resetUserPassword(id), toggleUser: id => toggleUser(id)
};
document.addEventListener("click", e => {
  const b = e.target.closest("[data-act]"); if (!b) return;
  const fn = ACTIONS[b.dataset.act]; if (fn) fn(b.dataset.id, b.dataset.x);
});

/* =====================================================================
   6. Dashboard
   ===================================================================== */
function needsCheck(a) { return a.status !== "disposed" && (!a.lastChecked || a.lastChecked < fiscalStart()); }
function barList(entries, color) {
  const max = Math.max(1, ...entries.map(e => e[1]));
  return entries.map(([n, c]) => `<div class="mb-2"><div class="d-flex justify-content-between small mb-1"><span>${esc(n)}</span><strong>${c} รายการ</strong></div><div class="bar-wrap"><div class="bar-fill" style="width:${Math.round(c / max * 100)}%;${color ? "background:" + color : ""}"></div></div></div>`).join("");
}
function renderDashboard() {
  const A = visAssets(), M = visMats(), T = visTx();
  setText("stat-total-assets", A.length);
  setText("stat-asset-active", A.filter(a => a.status === "active").length);
  setText("stat-asset-repair", A.filter(a => a.status === "repair").length);
  setText("stat-unchecked", A.filter(needsCheck).length);
  setText("stat-total-materials", M.length);
  setText("stat-mat-available", M.filter(m => m.status === "available").length);
  setText("stat-mat-borrowed", M.filter(m => m.status === "borrowed").length);
  const overdue = T.filter(isOverdue);
  setText("stat-overdue", overdue.length);
  setText("last-updated", "อัปเดต " + new Date().toLocaleString("th-TH"));

  let lb = 0; try { lb = Number(localStorage.getItem(BACKUP_KEY) || 0); } catch (e) { }
  const days = lb ? Math.floor((Date.now() - lb) / 864e5) : null;
  $("backup-warning").innerHTML = isAdmin() && (days === null || days >= 7)
    ? `<div class="alert alert-warning py-2 small"><i class="fa-solid fa-triangle-exclamation me-1" aria-hidden="true"></i>ข้อมูลทั้งหมดเก็บอยู่ในเบราว์เซอร์เครื่องนี้เท่านั้น ${days === null ? "ยังไม่เคยสำรองข้อมูล" : "สำรองล่าสุดเมื่อ " + days + " วันก่อน"} — กด “สำรองข้อมูล” ที่เมนูด้านซ้ายเป็นประจำ</div>`
    : `<div class="text-muted small mb-2"><i class="fa-solid fa-circle-info me-1" aria-hidden="true"></i>ข้อมูลเก็บในเบราว์เซอร์เครื่องนี้ ไม่แชร์ข้ามเครื่อง</div>`;

  const dc = {}; visDivisions().forEach(d => { dc[d.name] = 0; });
  A.forEach(a => { dc[a.division] = (dc[a.division] || 0) + 1; });
  $("asset-chart-by-division").innerHTML = barList(Object.entries(dc)) || `<span class="text-muted">ไม่มีข้อมูล</span>`;
  const cc = {}; A.forEach(a => { cc[a.category || "อื่นๆ"] = (cc[a.category || "อื่นๆ"] || 0) + 1; });
  $("asset-chart-by-category").innerHTML = barList(Object.entries(cc), "#198754") || `<span class="text-muted">ไม่มีข้อมูล</span>`;

  // วัสดุ แยกสำนักเจ้าของ x ประเภท
  const stats = {}; M.forEach(m => { const dv = m.division || "ส่วนกลาง"; stats[dv] = stats[dv] || {}; const s = stats[dv][m.category] = stats[dv][m.category] || { n: 0, b: 0 }; s.n++; if (m.status === "borrowed") s.b++; });
  const maxN = Math.max(1, ...Object.values(stats).flatMap(c => Object.values(c).map(s => s.n)));
  const colors = ["#2563eb", "#198754", "#ffc107", "#dc3545", "#0dcaf0", "#6610f2"]; let ci = 0;
  $("material-bar-chart-by-div").innerHTML = Object.keys(stats).length ? Object.entries(stats).map(([dv, cats]) => `<div class="mb-3 border-bottom pb-2"><strong class="text-primary">${esc(dv)}</strong>${Object.entries(cats).map(([c, s]) => `<div class="ms-2 my-1"><div class="d-flex justify-content-between small text-muted mb-1"><span>- ${esc(c)}</span><span>${s.n} รายการ (ถูกยืม ${s.b})</span></div><div class="bar-wrap" style="height:8px"><div class="bar-fill" style="width:${Math.round(s.n / maxN * 100)}%;background:${colors[ci++ % colors.length]}"></div></div></div>`).join("")}</div>`).join("") : `<div class="text-center text-muted py-4">ไม่มีข้อมูลวัสดุ</div>`;

  renderMaterialPie(M);

  $("overdue-body").innerHTML = overdue.length ? overdue.map(t => { const m = materialOf(t.assetId); return `<tr class="overdue-row"><td><strong>${esc(t.transId)}</strong></td><td>${esc(t.assetId)}</td><td>${esc(m ? m.name : "-")}</td><td>${esc(t.borrowerName)}</td><td>${esc(t.division || "-")} / ${esc(t.department || "-")}</td><td>${esc(t.phone)}</td><td>${fmtDate(t.dueDate)}</td><td><span class="badge bg-danger">${daysLate(t.dueDate)} วัน</span></td><td>${ib("slip", t.transId, "fa-print", "btn-outline-primary", "ดูใบยืม")}</td></tr>`; }).join("") : `<tr><td colspan="9" class="text-center text-muted py-4">ไม่มีรายการเกินกำหนดคืน</td></tr>`;
  const soon = T.filter(t => t.status === "borrowing" && t.dueDate >= todayISO() && -daysLate(t.dueDate) <= 3);
  $("duesoon-body").innerHTML = soon.length ? soon.map(t => { const m = materialOf(t.assetId); const left = -daysLate(t.dueDate); return `<tr><td>${esc(t.transId)}</td><td>${esc(m ? m.name : t.assetId)}</td><td>${esc(t.borrowerName)}</td><td>${esc(t.phone)}</td><td>${fmtDate(t.dueDate)}</td><td><span class="badge bg-warning text-dark">${left === 0 ? "วันนี้" : left + " วัน"}</span></td></tr>`; }).join("") : `<tr><td colspan="6" class="text-center text-muted py-3">ไม่มีรายการใกล้ครบกำหนด</td></tr>`;
}
function renderMaterialPie(M) {
  const total = M.length, box = $("material-pie-chart-container"), list = $("material-summary-list");
  if (!total) { box.innerHTML = `<span class="text-muted">ไม่มีข้อมูลวัสดุ</span>`; list.innerHTML = ""; return; }
  const segs = [["ว่าง", "available", "#198754", "text-success"], ["ถูกยืม", "borrowed", "#ffc107", "text-warning"], ["ส่งซ่อม", "repair", "#dc3545", "text-danger"], ["จำหน่าย", "retired", "#6c757d", "text-secondary"]].map(([l, k, c, cls]) => ({ l, c, cls, n: M.filter(m => m.status === k).length }));
  let acc = 0;
  const stops = segs.filter(s => s.n).map(s => { const a = acc / total * 360; acc += s.n; return `${s.c} ${a}deg ${acc / total * 360}deg`; }).join(",");
  box.innerHTML = `<div role="img" aria-label="สัดส่วนสถานะวัสดุ" style="width:130px;height:130px;border-radius:50%;background:conic-gradient(${stops});box-shadow:0 4px 12px rgba(0,0,0,.15)"></div>`;
  list.innerHTML = segs.map(s => `<li class="list-group-item py-1 d-flex justify-content-between small"><span><i class="fa-solid fa-circle ${s.cls} me-1" aria-hidden="true"></i>${s.l}</span><strong>${s.n} (${(s.n / total * 100).toFixed(1)}%)</strong></li>`).join("");
}

/* =====================================================================
   7. ทะเบียนครุภัณฑ์
   ===================================================================== */
function initAssetFilters() {
  const sel = $("asset-filter-div"), divs = visDivisions();
  const cur = sel.value;
  sel.innerHTML = (userDiv() ? "" : `<option value="">ทุกสำนัก</option>`) + divs.map(d => opt(d.name, d.name)).join("");
  if (cur && [...sel.options].some(o => o.value === cur)) sel.value = cur;
  onAssetFilterDivChange();
}
function onAssetFilterDivChange() {
  const divName = $("asset-filter-div").value, deptSel = $("asset-filter-dept"), cur = deptSel.value;
  const list = divName ? (data.divisions.find(x => x.name === divName) || { departments: [] }).departments : [...new Set(visDivisions().flatMap(d => d.departments))];
  deptSel.innerHTML = `<option value="">ทุกกลุ่มงาน</option>` + list.map(dp => opt(dp, dp)).join("");
  if (cur && list.includes(cur)) deptSel.value = cur;
  renderAssets();
}
function renderAssets() {
  const divF = $("asset-filter-div").value, deptF = $("asset-filter-dept").value, stF = $("asset-filter-status").value, ckF = $("asset-filter-check").value;
  const q = $("asset-search").value.toLowerCase();
  const rows = visAssets().filter(a =>
    (!divF || a.division === divF) && (!deptF || a.department === deptF) && (!stF || a.status === stF) &&
    (!ckF || (ckF === "unchecked" ? needsCheck(a) : !needsCheck(a))) &&
    (!q || [a.id, a.code, a.serial, a.name, a.brand, a.holder, a.location].some(t => (t || "").toLowerCase().includes(q))));
  $("assets-body").innerHTML = rows.length ? rows.map(a => {
    const st = ASSET_STATUS[a.status] || ["-", "bg-secondary"];
    return `<tr><td>${esc(a.id)}</td><td><strong>${esc(a.code)}</strong></td><td><code>${esc(a.serial)}</code></td>
      <td>${esc(a.name)}<br><small class="text-muted">${esc(a.brand || "-")}</small></td><td>${esc(a.division)}</td><td>${esc(a.department)}</td>
      <td><i class="fa-solid fa-user me-1 text-muted" aria-hidden="true"></i>${esc(a.holder)}${a.location ? `<br><small class="text-muted"><i class="fa-solid fa-location-dot me-1" aria-hidden="true"></i>${esc(a.location)}</small>` : ""}</td>
      <td><span class="badge ${st[1]}">${st[0]}</span></td>
      <td>${a.lastChecked ? fmtDate(a.lastChecked) : "-"}${needsCheck(a) ? `<br><span class="badge bg-light text-dark border">รอตรวจนับ</span>` : ""}</td>
      <td class="text-end text-nowrap">${canWrite() ? ib("checkAsset", a.id, "fa-clipboard-check", "btn-outline-success", "บันทึกตรวจนับวันนี้") + " " + ib("editAsset", a.id, "fa-pen", "btn-outline-primary", "แก้ไข") : ""}${isAdmin() ? " " + ib("delAsset", a.id, "fa-trash", "btn-outline-danger", "ลบ") : ""}</td></tr>`;
  }).join("") : `<tr><td colspan="10" class="text-center text-muted py-4">ไม่พบข้อมูลครุภัณฑ์</td></tr>`;
}
function markChecked(id) {
  if (!requireWrite()) return;
  const a = data.assets.find(x => x.id === id); if (!a || !seesAsset(a)) return warn("ไม่มีสิทธิ์");
  a.lastChecked = todayISO(); audit("asset-check", `ตรวจนับ ${a.id} (${a.code})`);
  if (save()) ok("บันทึกการตรวจนับแล้ว");
}
function openAssetModal(id) {
  if (!canWrite()) return warn("บัญชีนี้มีสิทธิ์อ่านอย่างเดียว");
  const f = $("asset-form"); f.reset(); $("asset-edit-id").value = id || "";
  const a = id ? data.assets.find(x => x.id === id) : null;
  if (id && (!a || !seesAsset(a))) return warn("ไม่พบครุภัณฑ์หรือไม่มีสิทธิ์");
  const cfg = data.assetConfigs;
  $("form-asset-cat").innerHTML = withCurrent(cfg.categories, a && a.category).map(c => opt(c, c)).join("");
  $("form-asset-name").innerHTML = withCurrent(cfg.itemNames, a && a.name).map(c => opt(c, c)).join("");
  $("form-asset-brand").innerHTML = `<option value="">-</option>` + withCurrent(cfg.brands, a && a.brand).map(c => opt(c, c)).join("");
  const divs = visDivisions();
  $("form-asset-div").innerHTML = (divs.length === 1 ? "" : `<option value="">-- เลือกสำนัก --</option>`) + divs.map(d => opt(d.name, d.name)).join("");
  $("form-asset-acq").max = todayISO(); $("form-asset-checked").max = todayISO();
  if (a) {
    setText("asset-modal-title", "แก้ไขครุภัณฑ์");
    $("form-asset-code").value = a.code; $("form-asset-serial").value = a.serial; $("form-asset-name").value = a.name; $("form-asset-brand").value = a.brand || "";
    $("form-asset-cat").value = a.category; $("form-asset-div").value = a.division; onFormAssetDivChange();
    $("form-asset-dept").value = a.department; $("form-asset-holder").value = a.holder; $("form-asset-status").value = a.status;
    $("form-asset-location").value = a.location; $("form-asset-acq").value = a.acquireDate; $("form-asset-price").value = a.price || ""; $("form-asset-checked").value = a.lastChecked; $("form-asset-note").value = a.note;
  } else { setText("asset-modal-title", "เพิ่มครุภัณฑ์ใหม่"); onFormAssetDivChange(); }
  showModal("assetModal");
}
function onFormAssetDivChange() {
  const d = data.divisions.find(x => x.name === $("form-asset-div").value);
  $("form-asset-dept").innerHTML = d && d.departments.length ? d.departments.map(dp => opt(dp, dp)).join("") : `<option value="">-- เลือกสำนักก่อน / ไม่มีกลุ่มงาน --</option>`;
}
function dupAsset(code, serial, exceptId) {
  const c = code.toLowerCase(), s = serial.toLowerCase();
  return data.assets.find(a => a.id !== exceptId && (a.code.toLowerCase() === c || (validSerial(serial) && validSerial(a.serial) && a.serial.toLowerCase() === s)));
}
$("asset-form").addEventListener("submit", e => {
  e.preventDefault(); if (!requireWrite()) return;
  const editId = $("asset-edit-id").value, old = editId ? data.assets.find(x => x.id === editId) : null;
  if (editId && (!old || !seesAsset(old))) return warn("ไม่พบครุภัณฑ์หรือไม่มีสิทธิ์");
  const item = cleanAsset({
    id: editId || nextId("AST", data.assets, "id", 3), code: $("form-asset-code").value, serial: $("form-asset-serial").value, name: $("form-asset-name").value, brand: $("form-asset-brand").value,
    category: $("form-asset-cat").value, division: $("form-asset-div").value, department: $("form-asset-dept").value, holder: $("form-asset-holder").value, status: $("form-asset-status").value,
    acquireDate: $("form-asset-acq").value, price: $("form-asset-price").value, location: $("form-asset-location").value, lastChecked: $("form-asset-checked").value, note: $("form-asset-note").value
  });
  if (!item.code || !item.name || !item.division || !item.department) return warn("กรุณากรอกข้อมูลให้ครบ (รหัส ชื่อ สำนัก กลุ่มงาน)");
  if (!seesDiv(item.division)) return warn("ไม่มีสิทธิ์บันทึกครุภัณฑ์ในสำนักนี้");
  const dup = dupAsset(item.code, item.serial, editId);
  if (dup) return bad(`รหัสครุภัณฑ์หรือ Serial ซ้ำกับรายการ ${dup.id} (${dup.code})`);
  if (old) { const i = data.assets.indexOf(old); data.assets[i] = item; audit("asset-edit", `${item.id} ${item.code}`); } else { data.assets.push(item); audit("asset-add", `${item.id} ${item.code}`); }
  if (save()) { hideModal("assetModal"); ok("บันทึกครุภัณฑ์สำเร็จ"); }
});
function deleteAsset(id) {
  if (!requireAdmin()) return;
  const a = data.assets.find(x => x.id === id); if (!a) return;
  if (!confirm(`ต้องการลบครุภัณฑ์ ${a.id} (${a.code}) หรือไม่?\nหากเพียงจำหน่าย/ปลดระวาง แนะนำให้แก้สถานะเป็น "จำหน่าย" แทนการลบ`)) return;
  data.assets = data.assets.filter(x => x.id !== id); audit("asset-delete", `${a.id} ${a.code}`); save();
}
function nextId(prefix, list, key, width) {
  const re = new RegExp("^" + prefix + "-(\\d{1,7})$"); let max = 0;
  list.forEach(x => { const m = re.exec(x[key] || ""); if (m) max = Math.max(max, Number(m[1])); });
  return prefix + "-" + String(max + 1).padStart(width, "0");
}

/* =====================================================================
   8. รายงานครุภัณฑ์
   ===================================================================== */
function initAssetReportFilters() {
  const divs = visDivisions(), sel = $("rpt-asset-div"), cur = sel.value;
  sel.innerHTML = (userDiv() ? "" : `<option value="">ทุกสำนัก</option>`) + divs.map(d => opt(d.name, d.name)).join("");
  if (cur && [...sel.options].some(o => o.value === cur)) sel.value = cur;
  onRptAssetDivChange();
}
function onRptAssetDivChange() {
  const d = data.divisions.find(x => x.name === $("rpt-asset-div").value), deptSel = $("rpt-asset-dept");
  deptSel.innerHTML = `<option value="">ทุกกลุ่มงาน</option>` + (d ? d.departments.map(dp => opt(dp, dp)).join("") : "");
  renderAssetReportDoc();
}
function reportAssets() {
  const dv = $("rpt-asset-div").value, dp = $("rpt-asset-dept").value;
  return visAssets().filter(a => (!dv || a.division === dv) && (!dp || a.department === dp));
}
function renderAssetReportDoc() {
  const dv = $("rpt-asset-div").value, dp = $("rpt-asset-dept").value, rows = reportAssets();
  const cnt = s => rows.filter(a => a.status === s).length, sum = rows.reduce((s, a) => s + (a.price || 0), 0);
  const scope = dv ? `${dv}${dp ? " / " + dp : ""}` : "ภาพรวมทุกหน่วยงานในสำนักงาน";
  $("asset-report-preview").innerHTML = `<article class="period-sheet">
    <div class="d-flex justify-content-between align-items-start mb-3"><div><div class="muted">${esc(ORG.name)}</div><h1>รายงานบัญชีครุภัณฑ์สำนักงาน</h1><div><strong>สังกัด:</strong> ${esc(scope)}</div></div>
      <div class="text-end muted">พิมพ์เมื่อ ${new Date().toLocaleString("th-TH")}<br>ผู้พิมพ์: ${esc(currentUser ? currentUser.name : "-")}</div></div>
    <table class="mb-3"><thead><tr><th>ครุภัณฑ์ทั้งหมด</th><th>สภาพปกติ</th><th>ชำรุด/ส่งซ่อม</th><th>จำหน่าย/ปลดระวาง</th><th>มูลค่ารวม (บาท)</th></tr></thead>
      <tbody><tr class="c" style="font-weight:bold"><td>${rows.length} รายการ</td><td style="color:#16a34a">${cnt("active")}</td><td style="color:#d97706">${cnt("repair")}</td><td style="color:#dc2626">${cnt("disposed")}</td><td>${money(sum)}</td></tr></tbody></table>
    <h4 class="mt-3 mb-2">บัญชีรายละเอียดครุภัณฑ์</h4>
    <table><thead><tr><th style="width:4%">ที่</th><th style="width:14%">รหัสครุภัณฑ์</th><th style="width:12%">Serial</th><th>ชื่อ / ยี่ห้อ / รุ่น</th><th style="width:16%">สำนัก / กลุ่มงาน</th><th style="width:14%">ผู้ครอบครอง / ที่ตั้ง</th><th style="width:12%">ได้มา / ราคา</th><th style="width:9%">ตรวจนับ</th></tr></thead><tbody>
    ${rows.length ? rows.map((a, i) => `<tr><td class="c">${i + 1}</td><td><strong>${esc(a.code)}</strong></td><td>${esc(a.serial)}</td><td>${esc(a.name)}<br><small>${esc(a.brand || "")}</small></td><td>${esc(a.division)}<br><small>${esc(a.department)}</small></td><td>${esc(a.holder)}<br><small>${esc(a.location)}</small></td><td>${fmtDate(a.acquireDate)}<br><small>${a.acquireDate ? "ปีงบฯ " + fiscalYearBE(a.acquireDate) + " / " : ""}${a.price ? money(a.price) : "-"}</small></td><td>${fmtDate(a.lastChecked)}</td></tr>`).join("") : `<tr><td colspan="8" class="c">ไม่มีข้อมูลครุภัณฑ์</td></tr>`}</tbody></table>
    <table class="sign-table mt-4"><tr><td>ลงชื่อ ..................................................... ผู้รายงาน<br>( ${esc(currentUser ? currentUser.name : ".....................................................")} )<br>วันที่ ${fmtDate(todayISO())}</td><td>ลงชื่อ ..................................................... ผู้ตรวจสอบ<br>( ..................................................... )<br>วันที่ ......./......./.......</td></tr></table>
  </article>`;
}
function exportAssetCsv() {
  const rows = reportAssets();
  downloadCsv(`รายงานครุภัณฑ์_${$("rpt-asset-div").value || "รวม"}_${todayISO()}.csv`, [["ลำดับ", "รหัสระบบ", "รหัสครุภัณฑ์", "Serial Number", "ชื่อครุภัณฑ์", "ยี่ห้อ/รุ่น", "หมวดหมู่", "สำนัก", "กลุ่มงาน", "ผู้ครอบครอง", "สถานที่ตั้ง", "วันที่ได้มา", "ปีงบประมาณ", "ราคา", "ตรวจนับล่าสุด", "สถานะ"]]
    .concat(rows.map((a, i) => [i + 1, a.id, a.code, a.serial, a.name, a.brand, a.category, a.division, a.department, a.holder, a.location, a.acquireDate, fiscalYearBE(a.acquireDate), a.price, a.lastChecked, (ASSET_STATUS[a.status] || ["-"])[0]])));
}

/* =====================================================================
   9. สำนัก / กลุ่มงาน และการตั้งค่า
   ===================================================================== */
function renderOrgStructure() {
  $("div-list-group").innerHTML = visDivisions().map(d => `<li class="list-group-item d-flex justify-content-between align-items-center"><span>${esc(d.name)} <span class="badge bg-secondary rounded-pill">${d.departments.length}</span></span>${isAdmin() ? ib("delDiv", d.id, "fa-trash", "btn-outline-danger", "ลบสำนัก " + d.name) : ""}</li>`).join("") || `<li class="list-group-item text-center text-muted">ไม่มีข้อมูลสำนัก</li>`;
  fillOrgSelect(); renderDeptList();
}
function fillOrgSelect() { setOpts("manage-dept-div-select", visDivisions().map(d => opt(d.id, d.name)).join("")); }
function renderDeptList() {
  const t = data.divisions.find(d => d.id === $("manage-dept-div-select").value);
  $("dept-list-group").innerHTML = t && t.departments.length ? t.departments.map(dp => `<li class="list-group-item d-flex justify-content-between align-items-center"><span>${esc(dp)}</span>${isAdmin() ? ib("delDept", t.id, "fa-trash", "btn-outline-danger", "ลบกลุ่มงาน " + dp, dp) : ""}</li>`).join("") : `<li class="list-group-item text-center text-muted">ไม่มีกลุ่มงานในสังกัดนี้</li>`;
}
function addDivision() {
  if (!requireAdmin()) return;
  const name = S($("new-div-name").value, 150);
  if (!name) return warn("กรุณากรอกชื่อสำนัก");
  if (data.divisions.some(d => d.name === name)) return warn("มีชื่อสำนักนี้อยู่แล้ว");
  data.divisions.push({ id: nextId("DIV", data.divisions, "id", 1), name, departments: [] }); audit("division-add", name);
  if (save()) $("new-div-name").value = "";
}
function deleteDivision(id) {
  if (!requireAdmin()) return;
  const d = data.divisions.find(x => x.id === id); if (!d) return;
  if (data.assets.some(a => a.division === d.name) || data.transactions.some(t => t.division === d.name) || data.materials.some(m => m.division === d.name) || data.users.some(u => u.division === d.name))
    return warn("ไม่สามารถลบได้ เพราะมีครุภัณฑ์ วัสดุ รายการยืม หรือผู้ใช้ผูกกับสำนักนี้");
  if (!confirm("ยืนยันการลบสำนัก " + d.name + " ?")) return;
  data.divisions = data.divisions.filter(x => x.id !== id); audit("division-delete", d.name); save();
}
function addDepartment() {
  if (!requireAdmin()) return;
  const d = data.divisions.find(x => x.id === $("manage-dept-div-select").value), name = S($("new-dept-name").value, 150);
  if (!d) return warn("กรุณาเลือกสำนักก่อน"); if (!name) return warn("กรุณากรอกชื่อกลุ่มงาน");
  if (d.departments.includes(name)) return warn("มีกลุ่มงานนี้อยู่แล้ว");
  d.departments.push(name); audit("dept-add", `${d.name}/${name}`);
  if (save()) $("new-dept-name").value = "";
}
function deleteDepartment(divId, dept) {
  if (!requireAdmin()) return;
  const d = data.divisions.find(x => x.id === divId); if (!d) return;
  if (data.assets.some(a => a.division === d.name && a.department === dept) || data.transactions.some(t => t.division === d.name && t.department === dept)) return warn("ไม่สามารถลบได้ เพราะมีครุภัณฑ์หรือรายการยืมผูกกับกลุ่มงานนี้");
  if (!confirm("ยืนยันการลบกลุ่มงาน " + dept + " ?")) return;
  d.departments = d.departments.filter(x => x !== dept); audit("dept-delete", `${d.name}/${dept}`); save();
}
const CFG_FIELD = { categories: "category", itemNames: "name", brands: "brand" };
function renderAssetConfigs() {
  const mk = (type, el) => { $(el).innerHTML = data.assetConfigs[type].map((v, i) => `<li class="list-group-item d-flex justify-content-between align-items-center"><span>${esc(v)}</span>${isAdmin() ? ib("delCfg", type, "fa-trash", "btn-outline-danger", "ลบ " + v, i) : ""}</li>`).join("") || `<li class="list-group-item text-muted text-center">ไม่มีข้อมูล</li>`; };
  mk("categories", "cat-list-group"); mk("itemNames", "itemname-list-group"); mk("brands", "brand-list-group");
}
function addConfig(type, inputId) {
  if (!requireAdmin() || !CFG_FIELD[type]) return;
  const v = S($(inputId).value, 150); if (!v) return warn("กรุณากรอกข้อมูล");
  if (data.assetConfigs[type].includes(v)) return warn("มีรายการนี้อยู่แล้ว");
  data.assetConfigs[type].push(v); audit("config-add", `${type}: ${v}`);
  if (save()) $(inputId).value = "";
}
function deleteConfig(type, index) {
  if (!requireAdmin() || !CFG_FIELD[type]) return;
  const v = data.assetConfigs[type][index]; if (v === undefined) return;
  if (data.assets.some(a => a[CFG_FIELD[type]] === v)) return warn("ไม่สามารถลบได้ เพราะมีครุภัณฑ์ใช้ค่านี้อยู่");
  if (!confirm("ต้องการลบ \"" + v + "\" หรือไม่?")) return;
  data.assetConfigs[type].splice(index, 1); audit("config-delete", `${type}: ${v}`); save();
}

/* =====================================================================
   10. วัสดุ
   ===================================================================== */
const matCats = () => [...new Set([...DEFAULT_MAT_CATS, ...data.materials.map(m => m.category)])];
function renderMaterials() {
  const q = $("material-search").value.toLowerCase(), st = $("material-filter-status").value, cat = $("material-filter-cat").value;
  const M = visMats();
  setOpts("material-filter-cat", `<option value="">ทุกหมวดหมู่</option>` + [...new Set(M.map(m => m.category))].map(c => opt(c, c)).join(""));
  const rows = M.filter(m => (!q || [m.id, m.name, m.code, m.serial, m.category].join(" ").toLowerCase().includes(q)) && (!st || m.status === st) && (!cat || m.category === cat));
  $("materials-body").innerHTML = rows.length ? rows.map(m => { const s = MAT_STATUS[m.status]; return `<tr><td><strong>${esc(m.id)}</strong></td><td>${esc(m.name)}</td><td><code>${esc(m.code || "-")}</code></td><td><code>${esc(m.serial || "-")}</code></td><td>${esc(m.category)}</td><td>${esc(m.division || "ส่วนกลาง")}</td><td><span class="badge ${s[1]}">${s[0]}</span></td><td class="text-end text-nowrap">${canWrite() ? ib("editMat", m.id, "fa-pen", "btn-outline-primary", "แก้ไข") : ""}${isAdmin() ? " " + ib("delMat", m.id, "fa-trash", "btn-outline-danger", "ลบ") : ""}</td></tr>`; }).join("") : `<tr><td colspan="8" class="text-center text-muted py-4">ไม่พบข้อมูลวัสดุ</td></tr>`;
}
function openMaterialModal(id) {
  if (!canWrite()) return warn("บัญชีนี้มีสิทธิ์อ่านอย่างเดียว");
  $("material-form").reset(); $("material-edit-id").value = id || ""; $("mat-id").disabled = !!id;
  const m = id ? materialOf(id) : null; if (id && (!m || !seesMat(m))) return warn("ไม่พบวัสดุหรือไม่มีสิทธิ์");
  $("mat-cat").innerHTML = withCurrent(matCats(), m && m.category).map(c => opt(c, c)).join("");
  const u = userDiv();
  $("mat-div").innerHTML = (u ? "" : `<option value="">ส่วนกลาง (ทุกสำนักเห็น)</option>`) + visDivisions().map(d => opt(d.name, d.name)).join("");
  if (m) {
    setText("material-modal-title", "แก้ไขวัสดุ");
    $("mat-id").value = m.id; $("mat-name").value = m.name; $("mat-code").value = m.code; $("mat-serial").value = m.serial; $("mat-cat").value = m.category; $("mat-div").value = m.division; $("mat-status").value = m.status;
    $("mat-status").disabled = m.status === "borrowed";
  } else { setText("material-modal-title", "เพิ่มวัสดุใหม่"); $("mat-status").disabled = false; }
  showModal("materialModal");
}
function dupMaterial(id, serial, exceptId) { return data.materials.find(m => m.id !== exceptId && (m.id.toLowerCase() === id.toLowerCase() || (validSerial(serial) && validSerial(m.serial) && m.serial.toLowerCase() === serial.toLowerCase()))); }
$("material-form").addEventListener("submit", e => {
  e.preventDefault(); if (!requireWrite()) return;
  const editId = $("material-edit-id").value, old = editId ? materialOf(editId) : null;
  if (editId && (!old || !seesMat(old))) return warn("ไม่พบวัสดุหรือไม่มีสิทธิ์");
  const item = cleanMaterial({ id: editId || $("mat-id").value, name: $("mat-name").value, code: $("mat-code").value, serial: $("mat-serial").value, category: $("mat-cat").value, division: $("mat-div").value, status: old && old.status === "borrowed" ? "borrowed" : $("mat-status").value });
  if (!item.id || !item.name) return warn("กรุณากรอกรหัสและชื่อวัสดุ");
  if (userDiv() && item.division !== userDiv()) return warn("ไม่มีสิทธิ์บันทึกวัสดุของสำนักนี้");
  const dup = dupMaterial(item.id, item.serial, editId); if (dup) return bad(`รหัสวัสดุหรือ Serial ซ้ำกับ ${dup.id}`);
  if (old) { Object.assign(old, item); audit("material-edit", item.id); } else { data.materials.push(item); audit("material-add", item.id); }
  if (save()) { hideModal("materialModal"); ok("บันทึกวัสดุสำเร็จ"); }
});
function deleteMaterial(id) {
  if (!requireAdmin()) return;
  const m = materialOf(id); if (!m) return;
  if (m.status === "borrowed") return warn("ไม่สามารถลบได้ เพราะวัสดุกำลังถูกยืม");
  if (data.transactions.some(t => t.assetId === id)) return warn("วัสดุนี้มีประวัติการยืม-คืน ลบไม่ได้เพื่อรักษาประวัติ — ให้เปลี่ยนสถานะเป็น \"จำหน่าย\" แทน");
  if (!confirm(`ต้องการลบวัสดุรหัส ${id} หรือไม่?`)) return;
  data.materials = data.materials.filter(x => x.id !== id); audit("material-delete", id); save();
}

/* =====================================================================
   11. ยืม / คืน / ประวัติ
   ===================================================================== */
const borrowSel = new Set();
function initBorrowDivisions() {
  const sel = $("borrower-division"), u = userDiv();
  if (u) { sel.innerHTML = opt(u, u); sel.value = u; sel.disabled = true; }
  else { sel.disabled = false; sel.innerHTML = `<option value="">-- เลือกสำนัก --</option>` + data.divisions.map(d => opt(d.name, d.name)).join(""); }
  onBorrowDivChange(); borrowSel.clear(); $("borrow-search").value = ""; fillBorrowList();
}
function onBorrowDivChange() {
  const d = data.divisions.find(x => x.name === $("borrower-division").value);
  $("borrower-dept").innerHTML = d && d.departments.length ? d.departments.map(dp => opt(dp, dp)).join("") : `<option value="">-- เลือกสำนักก่อน --</option>`;
}
function fillBorrowList() {
  const q = $("borrow-search").value.toLowerCase();
  const avail = visMats().filter(m => m.status === "available").filter(m => !q || [m.id, m.name, m.code, m.serial].join(" ").toLowerCase().includes(q));
  [...borrowSel].forEach(id => { const m = materialOf(id); if (!m || m.status !== "available") borrowSel.delete(id); });
  $("borrow-list").innerHTML = avail.length ? avail.map(m => `<label class="list-group-item d-flex align-items-start gap-2"><input type="checkbox" class="form-check-input mt-1 borrow-chk" value="${esc(m.id)}"${borrowSel.has(m.id) ? " checked" : ""}><span><strong>${esc(m.id)}</strong> — ${esc(m.name)}<br><small class="text-muted">SN: ${esc(m.serial || "-")} · ${esc(m.category)}</small></span></label>`).join("") : `<div class="list-group-item text-muted">— ไม่มีวัสดุที่ว่างให้ยืม —</div>`;
  setText("borrow-selected-count", `เลือกแล้ว ${borrowSel.size} รายการ`);
}
$("borrow-search").addEventListener("input", fillBorrowList);
$("borrow-list").addEventListener("change", e => { if (!e.target.classList.contains("borrow-chk")) return; e.target.checked ? borrowSel.add(e.target.value) : borrowSel.delete(e.target.value); setText("borrow-selected-count", `เลือกแล้ว ${borrowSel.size} รายการ`); });

$("borrow-form").addEventListener("submit", e => {
  e.preventDefault(); if (!requireWrite()) return;
  const ids = [...borrowSel], mats = ids.map(materialOf).filter(m => m && m.status === "available" && seesMat(m));
  if (!mats.length) return warn("กรุณาเลือกวัสดุที่พร้อมให้ยืมอย่างน้อย 1 รายการ");
  const borrowDate = $("borrow-date").value, dueDate = $("due-date").value, division = $("borrower-division").value, dept = $("borrower-dept").value;
  if (!borrowDate || !dueDate) return warn("กรุณาระบุวันที่ยืมและกำหนดคืน");
  if (dueDate < borrowDate) return warn("กำหนดวันคืนต้องไม่ก่อนวันยืม");
  if (!division || !dept) return warn("กรุณาเลือกสำนักและกลุ่มงานของผู้ยืม");
  if (!seesDiv(division)) return warn("ไม่มีสิทธิ์บันทึกการยืมในนามสำนักนี้");
  if (!$("borrow-consent").checked) return warn("กรุณายืนยันการรับทราบการเก็บข้อมูลส่วนบุคคล");
  const slipNo = nextId("SL", data.transactions.map(t => ({ k: t.slipNo })), "k", 4);
  const created = [];
  mats.forEach(m => {
    const tx = cleanTx({ transId: nextId("TX", data.transactions, "transId", 4), slipNo, assetId: m.id, borrowerName: $("borrower-name").value, division, department: dept, phone: $("borrower-phone").value, email: $("borrower-email").value, purpose: $("borrow-purpose").value, borrowDate, dueDate, returnDate: "", status: "borrowing", conditionNote: "" });
    data.transactions.push(tx); m.status = "borrowed"; created.push(tx.transId);
  });
  audit("borrow", `${slipNo}: ${created.join(", ")} โดย ${S($("borrower-name").value, 60)}`);
  if (!save()) return;
  const show = $("print-after-borrow").checked;
  e.target.reset(); borrowSel.clear(); $("borrow-date").value = todayISO(); $("due-date").value = addDays(todayISO(), 7); initBorrowDivisions();
  ok(`บันทึกการยืมสำเร็จ ใบยืม ${slipNo} (${created.length} รายการ)`);
  if (show) openSlip(created[0]);
});

function fillReturnSelect() {
  const q = $("return-search").value.toLowerCase();
  const loans = visTx().filter(t => t.status === "borrowing").filter(t => { const m = materialOf(t.assetId); return !q || [t.transId, t.slipNo, t.assetId, t.borrowerName, m ? m.name : ""].join(" ").toLowerCase().includes(q); });
  setOpts("return-key", loans.length ? loans.map(t => { const m = materialOf(t.assetId); return opt(t.transId, `${t.transId} | ${t.assetId} ${m ? m.name : ""} | ${t.borrowerName} (${t.department})${isOverdue(t) ? " ⚠ เกินกำหนด" : ""}`); }).join("") : `<option value="">— ไม่มีรายการค้างคืน —</option>`);
}
$("return-search").addEventListener("input", fillReturnSelect);
function toggleConditionOther(v) { const o = $("condition-other-text"); o.classList.toggle("d-none", v !== "อื่นๆ"); o.required = v === "อื่นๆ"; }
$("return-form").addEventListener("submit", e => {
  e.preventDefault(); if (!requireWrite()) return;
  const tx = data.transactions.find(t => t.transId === $("return-key").value);
  if (!tx || tx.status !== "borrowing" || !seesTx(tx)) return warn("ไม่พบรายการยืมนี้");
  const rd = $("return-date").value;
  if (!rd) return warn("กรุณาระบุวันที่คืน");
  if (rd < tx.borrowDate) return warn("วันที่คืนต้องไม่ก่อนวันที่ยืม");
  if (rd > todayISO()) return warn("วันที่คืนต้องไม่เป็นวันในอนาคต");
  const cond = $("condition-status").value, other = S($("condition-other-text").value, 200);
  tx.conditionNote = cond === "อื่นๆ" ? other : cond; tx.returnDate = rd; tx.status = "returned";
  const m = materialOf(tx.assetId); if (m) m.status = cond === "ชำรุด" ? "repair" : "available";
  audit("return", `${tx.transId} ${tx.assetId} สภาพ: ${tx.conditionNote}`);
  if (save()) { e.target.reset(); $("return-date").value = todayISO(); toggleConditionOther("สภาพปกติ"); ok("บันทึกการส่งคืนสำเร็จ"); }
});

function txBadge(t) { return t.status === "returned" ? `<span class="badge bg-success">คืนแล้ว</span>` : t.status === "cancelled" ? `<span class="badge bg-secondary">ยกเลิก</span>` : isOverdue(t) ? `<span class="badge bg-danger">เกินกำหนด</span>` : `<span class="badge bg-warning text-dark">กำลังยืม</span>`; }
const txText = t => t.status === "returned" ? "คืนแล้ว" : t.status === "cancelled" ? "ยกเลิก" : isOverdue(t) ? "เกินกำหนด" : "กำลังยืม";
function renderHistory() {
  const q = $("history-search").value.toLowerCase();
  const rows = [...visTx()].reverse().filter(t => { const m = materialOf(t.assetId); return !q || [t.transId, t.slipNo, t.assetId, t.borrowerName, t.department, t.purpose, m ? m.name : ""].join(" ").toLowerCase().includes(q); });
  $("history-body").innerHTML = rows.length ? rows.map(t => { const m = materialOf(t.assetId);
    return `<tr class="${isOverdue(t) ? "overdue-row" : ""}"><td>${esc(t.transId)}</td><td>${esc(t.slipNo)}</td><td>${esc(t.assetId)}<br><small class="text-muted">${esc(m ? m.name : "")}</small></td><td>${esc(t.borrowerName)}<br><small class="text-muted">${esc(t.division)} / ${esc(t.department)}</small></td><td>${esc(t.purpose)}</td><td>${fmtDate(t.borrowDate)}</td><td>${fmtDate(t.dueDate)}</td><td>${fmtDate(t.returnDate)}</td><td>${txBadge(t)}</td>
    <td class="text-end text-nowrap">${ib("slip", t.transId, "fa-print", "btn-outline-primary", "ดู/พิมพ์ใบยืม")}${isAdmin() && t.status === "borrowing" ? " " + ib("cancelTx", t.transId, "fa-ban", "btn-outline-danger", "ยกเลิกรายการยืม") : ""}${isAdmin() && t.status !== "borrowing" && !t.anonymized ? " " + ib("anonTx", t.transId, "fa-user-slash", "btn-outline-secondary", "ลบข้อมูลติดต่อผู้ยืม (PDPA)") : ""}</td></tr>`; }).join("") : `<tr><td colspan="10" class="text-center text-muted py-4">ไม่มีประวัติการยืม-คืน</td></tr>`;
}
function cancelTx(id) {
  if (!requireAdmin()) return;
  const t = data.transactions.find(x => x.transId === id); if (!t || t.status !== "borrowing") return;
  if (!confirm(`ยกเลิกรายการยืม ${id} (บันทึกผิดพลาด)? วัสดุจะกลับเป็นสถานะว่าง`)) return;
  t.status = "cancelled"; const m = materialOf(t.assetId); if (m && m.status === "borrowed") m.status = "available";
  audit("tx-cancel", id); save();
}
function anonymizeTx(id) {
  if (!requireAdmin()) return;
  const t = data.transactions.find(x => x.transId === id); if (!t || t.status === "borrowing") return;
  if (!confirm(`ลบเบอร์โทรและอีเมลของผู้ยืมในรายการ ${id} อย่างถาวร? (เก็บชื่อและประวัติการยืมไว้)`)) return;
  t.phone = "-"; t.email = ""; t.anonymized = true; audit("tx-anonymize", id); save();
}

/* =====================================================================
   12. ใบยืม
   ===================================================================== */
const slipKey = t => t.slipNo || t.transId;
const personKey = t => `${t.borrowerName.trim()}|${(t.phone || "").trim()}`;
let previewKeys = [];
function fillPersonSelect() {
  const map = new Map(); visTx().forEach(t => { if (!map.has(personKey(t))) map.set(personKey(t), `${t.borrowerName}${t.phone && t.phone !== "-" ? " (" + t.phone + ")" : ""}`); });
  const items = [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], "th"));
  setOpts("report-person", items.length ? `<option value="">-- เลือกผู้ยืม --</option><option value="__all__">ทั้งหมด (ทุกคน)</option>` + items.map(([k, l]) => opt(k, l)).join("") : `<option value="">ไม่มีข้อมูลการยืม</option>`);
}
function renderSlip(group) {
  const h = group[0], anyOver = group.some(isOverdue), allReturned = group.every(t => t.status === "returned"), allCancel = group.every(t => t.status === "cancelled");
  const stamp = anyOver ? "เกินกำหนดคืน" : allCancel ? "ยกเลิก" : allReturned ? "คืนแล้ว" : "";
  const last = group.map(t => t.returnDate).filter(Boolean).sort().pop() || "";
  return `<article class="slip">${stamp ? `<div class="watermark">${stamp}</div>` : ""}<div class="slip-border">
    <div class="d-flex justify-content-between align-items-start mb-2"><div><div class="org-name">${esc(ORG.name)}</div><h1>${esc(ORG.title)}</h1><h2>ระบบยืม-คืนพัสดุและวัสดุสำนักงาน</h2><hr class="my-2"></div>
      <div class="text-end" style="font-size:13px"><div><strong>เลขที่ใบยืม</strong> ${esc(slipKey(h))}</div><div>พิมพ์เมื่อ ${new Date().toLocaleString("th-TH")}</div></div></div>
    <table class="mb-3">
      <tr><td class="label-cell">ชื่อผู้ยืม</td><td>${esc(h.borrowerName)}</td><td class="label-cell">สำนัก / กลุ่มงาน</td><td>${esc(h.division || "-")} / ${esc(h.department || "-")}</td></tr>
      <tr><td class="label-cell">เบอร์โทร</td><td>${esc(h.phone || "-")}</td><td class="label-cell">อีเมล</td><td>${esc(h.email || "-")}</td></tr>
      <tr><td class="label-cell">วันที่ยืม</td><td>${fmtDate(h.borrowDate)}</td><td class="label-cell">กำหนดวันคืน</td><td>${fmtDate(h.dueDate)}${anyOver ? ` <strong style="color:#dc2626">(เกินกำหนด)</strong>` : ""}</td></tr>
      <tr><td class="label-cell">วันที่คืนจริง</td><td>${fmtDate(allReturned ? last : "")}</td><td class="label-cell">สถานะ</td><td>${esc(group.map(txText).filter((v, i, a) => a.indexOf(v) === i).join(", "))}</td></tr>
      <tr><td class="label-cell">วัตถุประสงค์การยืม</td><td colspan="3">${esc(h.purpose)}</td></tr></table>
    <p class="mb-1"><strong>รายการวัสดุ/อุปกรณ์ที่ยืม (${group.length} รายการ)</strong></p>
    <table class="mb-3"><thead><tr><th style="width:5%">ที่</th><th style="width:14%">รหัสวัสดุ</th><th>ชื่อวัสดุ / รุ่น</th><th style="width:16%">รหัสอ้างอิง</th><th style="width:16%">Serial No.</th><th style="width:22%">สถานะ / วันคืน / สภาพ</th></tr></thead><tbody>
    ${group.map((t, i) => { const m = materialOf(t.assetId) || {}; return `<tr><td class="c">${i + 1}</td><td>${esc(t.assetId)}</td><td>${esc(m.name || "-")}</td><td>${esc(m.code || "-")}</td><td>${esc(m.serial || "-")}</td><td>${esc(txText(t))}${t.returnDate ? `<br>${fmtDate(t.returnDate)}` : ""}${t.conditionNote ? `<br><small>${esc(t.conditionNote)}</small>` : ""}</td></tr>`; }).join("")}</tbody></table>
    <p style="font-size:12px;margin-bottom:16px">ผู้ยืมขอรับรองว่าจะนำพัสดุ/อุปกรณ์ไปใช้ตามวัตถุประสงค์ที่ระบุไว้ จะดูแลรักษาเป็นอย่างดี และส่งคืนตามกำหนด หากพัสดุที่นำส่งคืนชำรุดเสีหายหรือสูญหาย ข้าพเจ้ายินยอมรับผิดชอบในการแก้ไข ซ่อมแซมให้คงสภาพเดิมโดยรับผิดชอบค่าใช้จ่ายของคนเอง หรือชดใช้ตามระเบียบของหน่วยงาน ตามหลักเกณฑ์ที่กฏหมายกำหนด</p>
    <table class="sign-table"><tr><td><div class="sign-box"></div>ลงชื่อ .............................................. ผู้ยืม<br>(${esc(h.borrowerName)})<br>วันที่ ${fmtDate(h.borrowDate)}</td><td><div class="sign-box"></div>ลงชื่อ .............................................. ผู้จ่ายวัสดุ<br>(..............................................)<br>วันที่ ......./......./.......</td></tr></table>
   <div class="cut-line"><span>ความเห็นผู้บังคับบัญชา</span></div>
    <table class="sign-table">
    <tr><td><div class="sign-box"></div>ลงชื่อ ...................................................... เจ้าหน้าที่ <br>(........................................................)<br></td><td><div class="sign-box"></div>ลงชื่อ ............................................................<br>(................................................)<br>ผู้บังคับบัญชากลุ่มงานบริการรระบบคอมพิวเตอร์</td></tr></table>
    
    <div class="cut-line"><span>ส่วนบันทึกการส่งคืน</span></div>
    <table class="sign-table"><tr><td><div class="sign-box"></div>ลงชื่อ .............................................. ผู้คืน<br>(${esc(h.borrowerName)})<br>วันที่ ${allReturned ? fmtDate(last) : "......./......./......."}</td><td><div class="sign-box"></div>ลงชื่อ .............................................. ผู้รับคืน<br>(..............................................)<br>วันที่ ......./......./.......</td></tr></table>
  </div></article>`;
}
function showSlips(keys) {
  const all = visTx(); previewKeys = keys;
  const groups = keys.map(k => all.filter(t => slipKey(t) === k)).filter(g => g.length);
  $("report-preview").innerHTML = groups.map(renderSlip).join("");
  $("report-toolbar").classList.toggle("d-none", !groups.length);
}
function previewPersonSlips() {
  const key = $("report-person").value, st = $("report-status").value;
  if (!key) { clearPreview(); return; }
  const list = visTx().filter(t => (key === "__all__" || personKey(t) === key) && (!st || (st === "borrowing" ? t.status === "borrowing" && !isOverdue(t) : st === "returned" ? t.status === "returned" : isOverdue(t))));
  showSlips([...new Set(list.map(slipKey))]);
}
function printPersonSlips() { previewPersonSlips(); if (!previewKeys.length) return warn("ไม่มีใบยืมที่ต้องการพิมพ์"); setTimeout(() => window.print(), 150); }
function openSlip(transId) {
  const tx = data.transactions.find(t => t.transId === transId || t.slipNo === transId);
  if (!tx || !seesTx(tx)) return warn("ไม่พบใบยืมหรือไม่มีสิทธิ์");
  openTab("report");
  $("report-person").value = personKey(tx); $("report-status").value = "";
  showSlips([slipKey(tx)]);
  $("report-preview").scrollIntoView({ behavior: "smooth", block: "start" });
}
function clearPreview() { previewKeys = []; $("report-preview").innerHTML = ""; $("report-toolbar").classList.add("d-none"); }

/* =====================================================================
   13. รายงานรายงวด
   ===================================================================== */
function fillPeriodFilters() {
  const years = new Set([new Date().getFullYear()]); data.transactions.forEach(t => { if (t.borrowDate) years.add(Number(t.borrowDate.slice(0, 4))); });
  setOpts("rpt-year", [...years].sort((a, b) => b - a).map(y => opt(y, toBE(y))).join(""));
  setOpts("rpt-month", `<option value="">ทั้งปี</option>` + TH_MONTHS.slice(1).map((m, i) => opt(i + 1, m)).join(""));
}
function getPeriodTx() {
  const y = Number($("rpt-year").value), m = $("rpt-month").value;
  return visTx().filter(t => t.status !== "cancelled" && t.borrowDate && Number(t.borrowDate.slice(0, 4)) === y && (!m || Number(t.borrowDate.slice(5, 7)) === Number(m)));
}
function renderPeriodReport() {
  const list = getPeriodTx(), y = Number($("rpt-year").value), m = $("rpt-month").value;
  if (!y) { $("period-report").innerHTML = ""; return; }
  const label = m ? `เดือน${TH_MONTHS[Number(m)]} พ.ศ. ${toBE(y)}` : `ปี พ.ศ. ${toBE(y)}`;
  $("period-report").innerHTML = `<article class="period-sheet">
    <div class="d-flex justify-content-between align-items-start mb-3"><div><div class="muted">${esc(ORG.name)}</div><h1>รายงานสรุปการยืม-คืนวัสดุสำนักงาน</h1><div><strong>งวด:</strong> ${esc(label)}</div></div><div class="text-end muted">พิมพ์เมื่อ ${new Date().toLocaleString("th-TH")}</div></div>
    <table class="mb-3"><thead><tr><th>ยืมทั้งหมด</th><th>คืนแล้ว</th><th>กำลังยืม</th><th>เกินกำหนดคืน</th></tr></thead><tbody><tr class="c" style="font-weight:bold"><td>${list.length} ครั้ง</td><td style="color:#16a34a">${list.filter(t => t.status === "returned").length}</td><td style="color:#d97706">${list.filter(t => t.status === "borrowing" && !isOverdue(t)).length}</td><td style="color:#dc2626">${list.filter(isOverdue).length}</td></tr></tbody></table>
    <h4 class="mt-3 mb-2">รายการยืมในงวด</h4>
    <table><thead><tr><th>เลขที่</th><th>วันยืม</th><th>ผู้ยืม</th><th>สำนัก/กลุ่มงาน</th><th>วัสดุ</th><th>วัตถุประสงค์</th><th>สถานะ</th></tr></thead><tbody>
    ${list.length ? list.map(t => { const mt = materialOf(t.assetId); return `<tr><td>${esc(t.transId)}</td><td>${fmtDate(t.borrowDate)}</td><td>${esc(t.borrowerName)}</td><td>${esc(t.division)} / ${esc(t.department)}</td><td>${esc(mt ? mt.name : t.assetId)}</td><td>${esc(t.purpose)}</td><td>${txText(t)}</td></tr>`; }).join("") : `<tr><td colspan="7" class="c">ไม่มีรายการยืมในงวดนี้</td></tr>`}</tbody></table></article>`;
}
function printPeriodReport() { renderPeriodReport(); setTimeout(() => window.print(), 150); }
function exportPeriodCsv() {
  downloadCsv(`รายงานการยืมวัสดุ_${todayISO()}.csv`, [["เลขที่", "ใบยืม", "รหัสวัสดุ", "รายการ", "ผู้ยืม", "สำนัก", "กลุ่มงาน", "โทร", "วันยืม", "กำหนดคืน", "วันคืน", "สถานะ"]]
    .concat(getPeriodTx().map(t => { const m = materialOf(t.assetId); return [t.transId, t.slipNo, t.assetId, m ? m.name : "", t.borrowerName, t.division, t.department, t.phone, t.borrowDate, t.dueDate, t.returnDate, txText(t)]; })));
}

/* =====================================================================
   14. ผู้ใช้
   ===================================================================== */
function syncUserForm() {
  const role = $("user-role").value, scope = $("user-scope").value;
  $("user-scope-wrap").style.display = role === "admin" ? "none" : "block";
  $("user-division-wrap").style.display = role !== "admin" && scope === "division" ? "block" : "none";
}
function openUserModal(username) {
  if (!requireAdmin()) return;
  $("user-form").reset(); $("user-edit-name").value = username || "";
  $("user-division-select").innerHTML = data.divisions.map(d => opt(d.name, d.name)).join("");
  const u = username ? data.users.find(x => x.username === username) : null;
  $("user-username").disabled = !!u; $("user-pass").required = !u;
  setText("user-modal-title", u ? "แก้ไขผู้ใช้" : "เพิ่มผู้ใช้ระบบ");
  setText("user-pass-label", u ? "รหัสผ่านใหม่ (เว้นว่างถ้าไม่เปลี่ยน — ใช้ปุ่ม “รีเซ็ตรหัส” เพื่อออกรหัสชั่วคราว)" : "รหัสผ่านเริ่มต้น (อย่างน้อย 8 ตัว มีตัวอักษรและตัวเลข)");
  if (u) { $("user-username").value = u.username; $("user-name").value = u.name; $("user-role").value = u.role; $("user-scope").value = u.scope; if (u.division) $("user-division-select").value = u.division; $("user-pass").disabled = true; }
  else $("user-pass").disabled = false;
  syncUserForm(); showModal("userModal");
}
$("user-form").addEventListener("submit", async e => {
  e.preventDefault(); if (!requireAdmin()) return;
  const edit = $("user-edit-name").value, username = $("user-username").value.trim(), name = S($("user-name").value, 100), role = $("user-role").value;
  const scope = role === "admin" ? "all" : $("user-scope").value, division = scope === "all" ? "" : $("user-division-select").value;
  if (scope === "division" && !division) return warn("กรุณาเลือกสำนักที่รับผิดชอบ");
  if (edit) {
    const u = data.users.find(x => x.username === edit); if (!u) return;
    if (u.role === "admin" && role !== "admin" && activeAdmins().length <= 1 && u.active) return warn("ต้องมีผู้ดูแลระบบที่ใช้งานได้อย่างน้อย 1 คน");
    Object.assign(u, { name, role, scope, division }); audit("user-edit", `${u.username} → ${role}/${scope}${division ? "/" + division : ""}`);
    if (save()) { hideModal("userModal"); ok("แก้ไขผู้ใช้สำเร็จ"); }
    return;
  }
  if (!/^[A-Za-z0-9._-]{3,30}$/.test(username)) return warn("ชื่อผู้ใช้ใช้ได้เฉพาะ A-Z a-z 0-9 . _ - (3-30 ตัว)");
  if (data.users.some(u => u.username.toLowerCase() === username.toLowerCase())) return warn("มีชื่อผู้ใช้นี้อยู่แล้ว");
  const pw = $("user-pass").value, prob = pwProblem(pw, username); if (prob) return bad(prob);
  const hash = await makeHash(pw); if (!freshOK()) return;
  data.users.push({ username, name, role, scope, division, passwordHash: hash, active: true, mustChange: true });
  audit("user-add", `${username} (${role})`);
  if (save()) { hideModal("userModal"); ok("เพิ่มผู้ใช้สำเร็จ ผู้ใช้ต้องเปลี่ยนรหัสผ่านเมื่อเข้าสู่ระบบครั้งแรก"); }
});
function renderUsers() {
  if (!isAdmin()) return;
  $("users-body").innerHTML = data.users.map(u => {
    const scopeText = u.role === "admin" || u.scope === "all" ? `<span class="badge bg-info text-dark">เห็นข้อมูลทั้งหมด</span>` : `<span class="badge bg-secondary">สำนัก: ${esc(u.division || "ไม่ระบุ")}</span>`;
    return `<tr><td><strong>${esc(u.username)}</strong></td><td>${esc(u.name)}</td><td><span class="badge ${u.role === "admin" ? "bg-primary" : u.role === "viewer" ? "bg-dark" : "bg-secondary"}">${esc(ROLE_TH[u.role])}</span><br>${scopeText}</td>
      <td>${u.active ? `<span class="badge bg-success">ใช้งาน</span>` : `<span class="badge bg-danger">ระงับ</span>`}${u.mustChange ? `<br><span class="badge bg-warning text-dark">ต้องเปลี่ยนรหัส</span>` : ""}</td>
      <td class="text-end text-nowrap">${ib("editUser", u.username, "fa-pen", "btn-outline-primary", "แก้ไขผู้ใช้")} ${ib("resetPw", u.username, "fa-key", "btn-outline-warning", "รีเซ็ตรหัสผ่าน")} ${ib("toggleUser", u.username, u.active ? "fa-user-lock" : "fa-user-check", "btn-outline-secondary", u.active ? "ระงับผู้ใช้" : "เปิดใช้ผู้ใช้")}</td></tr>`;
  }).join("");
}
async function resetUserPassword(uName) {
  if (!requireAdmin()) return;
  const u = data.users.find(x => x.username === uName); if (!u) return;
  if (!confirm(`ออกรหัสผ่านชั่วคราวใหม่ให้ ${uName}?`)) return;
  const temp = randPassword(12), hash = await makeHash(temp); if (!freshOK()) return;
  u.passwordHash = hash; u.mustChange = true; audit("user-reset-password", uName);
  if (save()) showInfo("รหัสผ่านชั่วคราว", `<p>ผู้ใช้ <strong>${esc(uName)}</strong></p><p class="fs-4"><code>${esc(temp)}</code></p><p class="text-muted small mb-0">แจ้งผู้ใช้ด้วยช่องทางที่ปลอดภัย รหัสนี้จะไม่แสดงอีก และผู้ใช้ต้องตั้งรหัสใหม่เมื่อเข้าสู่ระบบ</p>`);
}
function toggleUser(uName) {
  if (!requireAdmin()) return;
  const u = data.users.find(x => x.username === uName); if (!u) return warn("ไม่พบผู้ใช้");
  if (u.username === currentUser.username) return warn("ไม่สามารถระงับบัญชีของตนเองได้");
  if (u.active && u.role === "admin" && activeAdmins().length <= 1) return warn("ต้องมีผู้ดูแลระบบที่ใช้งานได้อย่างน้อย 1 คน");
  u.active = !u.active; audit("user-toggle", `${uName} → ${u.active ? "เปิด" : "ระงับ"}`); save();
}

/* =====================================================================
   15. Audit log
   ===================================================================== */
function renderAudit() {
  if (!isAdmin()) return;
  const q = $("audit-search").value.toLowerCase();
  const rows = [...data.audit].reverse().filter(a => !q || [a.u, a.a, a.d].join(" ").toLowerCase().includes(q)).slice(0, 300);
  $("audit-body").innerHTML = rows.length ? rows.map(a => `<tr><td class="text-nowrap">${esc(fmtDT(a.t))}</td><td>${esc(a.u)}</td><td><span class="badge bg-light text-dark border">${esc(a.a)}</span></td><td>${esc(a.d)}</td></tr>`).join("") : `<tr><td colspan="4" class="text-center text-muted py-3">ไม่มีบันทึก</td></tr>`;
}
function exportAuditCsv() { if (!isAdmin()) return; downloadCsv(`audit_log_${todayISO()}.csv`, [["เวลา", "ผู้ใช้", "การกระทำ", "รายละเอียด"]].concat(data.audit.map(a => [a.t, a.u, a.a, a.d]))); }

/* =====================================================================
   16. Import Excel (มีตัวอย่างก่อนนำเข้า / ตรวจซ้ำ / รายงานแถวที่ข้าม)
   ===================================================================== */
const normKey = k => String(k).trim().toLowerCase().replace(/[\s_\-\/\.]/g, "");
function normRow(row) { const o = {}; Object.keys(row).forEach(k => { o[normKey(k)] = row[k]; }); return o; }
function g(o, ...names) { for (const n of names) { const v = o[normKey(n)]; if (v !== undefined && String(v).trim() !== "") return v; } return ""; }
function fromParts(y, m, d) { if (y > 2400) y -= 543; if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900) return ""; return `${y}-${pad(m)}-${pad(d)}`; }
function parseDateCell(v) {
  if (!v) return ""; if (v instanceof Date && !isNaN(v)) return fromParts(v.getFullYear(), v.getMonth() + 1, v.getDate());
  const s = String(v).trim(); let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s); if (m) return fromParts(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s); return m ? fromParts(+m[3], +m[2], +m[1]) : "";
}
const STATUS_ALIAS = { "ปกติ": "active", "ใช้งาน": "active", "active": "active", "ส่งซ่อม": "repair", "ชำรุด": "repair", "repair": "repair", "จำหน่าย": "disposed", "ปลดระวาง": "disposed", "disposed": "disposed" };
let pendingImport = null;

function startImport(kind, ev) {
  const input = ev.target, file = input.files[0]; input.value = "";
  if (!file) return;
  if (!requireAdmin()) return;
  if (typeof XLSX === "undefined") return bad("ไม่สามารถโหลดไลบรารีอ่าน Excel ได้ (ตรวจสอบการเชื่อมต่ออินเทอร์เน็ต/ดาวน์โหลดไลบรารีมาไว้ในเครื่อง)");
  if (file.size > 5 * 1024 * 1024) return bad("ไฟล์ใหญ่เกิน 5 MB");
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const wb = XLSX.read(new Uint8Array(reader.result), { type: "array", cellDates: true });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
      if (!rows.length) return warn("ไม่พบข้อมูลภายในไฟล์");
      if (rows.length > 5000) return bad("จำนวนแถวเกิน 5,000 แถว กรุณาแบ่งไฟล์");
      pendingImport = { kind, rows, fileName: file.name };
      setText("imp-title", `ตรวจสอบข้อมูลก่อนนำเข้า${kind === "asset" ? "ครุภัณฑ์" : "วัสดุ"} — ${file.name}`);
      $("imp-allow-wrap").classList.toggle("d-none", kind !== "asset"); $("imp-allow-new").checked = false;
      renderImportPreview(); showModal("importModal");
    } catch (err) { bad("อ่านไฟล์ไม่สำเร็จ: " + err.message); }
  };
  reader.readAsArrayBuffer(file);
}
function parseAssetRows(rows, allowNew) {
  const codes = new Set(data.assets.map(a => a.code.toLowerCase())), serials = new Set(data.assets.filter(a => validSerial(a.serial)).map(a => a.serial.toLowerCase()));
  const out = { ok: [], dup: [], bad: [], newDivs: new Set(), newDepts: new Set() };
  rows.forEach((raw, i) => {
    const r = normRow(raw), n = i + 2;
    const rec = cleanAsset({ code: g(r, "รหัสครุภัณฑ์", "Asset Code", "code"), serial: g(r, "Serial Number", "serial", "S/N") || "-", name: g(r, "ชื่อครุภัณฑ์", "ชื่อรายการ", "name"), brand: g(r, "ยี่ห้อ/รุ่น", "ยี่ห้อ", "brand"), category: g(r, "หมวดหมู่", "category") || "ทั่วไป",
      division: g(r, "สำนัก", "division"), department: g(r, "กลุ่มงาน", "department"), holder: g(r, "ผู้ครอบครอง", "holder"), status: STATUS_ALIAS[String(g(r, "สถานะ", "status")).trim().toLowerCase()] || "active",
      acquireDate: parseDateCell(g(r, "วันที่ได้มา", "acquireDate")), price: String(g(r, "ราคา", "price")).replace(/,/g, ""), location: g(r, "สถานที่ตั้ง", "location"), note: g(r, "หมายเหตุ", "note") });
    if (!rec.code || !rec.name) return out.bad.push({ n, why: "ไม่มีรหัสครุภัณฑ์หรือชื่อครุภัณฑ์" });
    if (!rec.division) return out.bad.push({ n, why: "ไม่ระบุสำนัก" });
    if (!rec.department) rec.department = "-";
    const dv = data.divisions.find(d => d.name === rec.division);
    if (!dv) { if (!allowNew) return out.bad.push({ n, why: `ไม่พบสำนัก "${rec.division}" ในระบบ` }); out.newDivs.add(rec.division); }
    else if (rec.department !== "-" && !dv.departments.includes(rec.department)) { if (!allowNew) return out.bad.push({ n, why: `ไม่พบกลุ่มงาน "${rec.department}" ในสำนัก ${rec.division}` }); out.newDepts.add(`${rec.division} / ${rec.department}`); }
    if (codes.has(rec.code.toLowerCase())) return out.dup.push({ n, why: `รหัสครุภัณฑ์ซ้ำ: ${rec.code}` });
    if (validSerial(rec.serial) && serials.has(rec.serial.toLowerCase())) return out.dup.push({ n, why: `Serial ซ้ำ: ${rec.serial}` });
    codes.add(rec.code.toLowerCase()); if (validSerial(rec.serial)) serials.add(rec.serial.toLowerCase());
    out.ok.push(rec);
  });
  return out;
}
function parseMaterialRows(rows) {
  const ids = new Set(data.materials.map(m => m.id.toLowerCase())), serials = new Set(data.materials.filter(m => validSerial(m.serial)).map(m => m.serial.toLowerCase()));
  const out = { ok: [], dup: [], bad: [], newDivs: new Set(), newDepts: new Set() };
  rows.forEach((raw, i) => {
    const r = normRow(raw), n = i + 2;
    const rec = cleanMaterial({ id: g(r, "รหัสวัสดุ", "Material ID", "id"), name: g(r, "ชื่อวัสดุ", "ชื่ออุปกรณ์", "name"), code: g(r, "รหัสอ้างอิง", "code"), serial: g(r, "Serial Number", "serial"), category: g(r, "หมวดหมู่", "category") || "อุปกรณ์ทั่วไป", division: g(r, "สำนัก", "สำนักเจ้าของ", "division"), status: "available" });
    if (!rec.id || !rec.name) return out.bad.push({ n, why: "ไม่มีรหัสวัสดุหรือชื่อวัสดุ" });
    if (rec.division && !data.divisions.some(d => d.name === rec.division)) return out.bad.push({ n, why: `ไม่พบสำนัก "${rec.division}" ในระบบ` });
    if (ids.has(rec.id.toLowerCase())) return out.dup.push({ n, why: `รหัสวัสดุซ้ำ: ${rec.id}` });
    if (validSerial(rec.serial) && serials.has(rec.serial.toLowerCase())) return out.dup.push({ n, why: `Serial ซ้ำ: ${rec.serial}` });
    ids.add(rec.id.toLowerCase()); if (validSerial(rec.serial)) serials.add(rec.serial.toLowerCase());
    out.ok.push(rec);
  });
  return out;
}
function renderImportPreview() {
  const p = pendingImport; if (!p) return;
  const res = p.res = p.kind === "asset" ? parseAssetRows(p.rows, $("imp-allow-new").checked) : parseMaterialRows(p.rows);
  const lst = (title, items, cls) => items.length ? `<div class="alert alert-${cls} py-2 small"><strong>${title} (${items.length})</strong><ul class="mb-0">${items.slice(0, 8).map(x => `<li>แถว ${x.n}: ${esc(x.why)}</li>`).join("")}${items.length > 8 ? `<li>… และอีก ${items.length - 8} แถว</li>` : ""}</ul></div>` : "";
  $("imp-summary").innerHTML = `<div class="row text-center g-2 mb-3"><div class="col"><div class="border rounded p-2"><div class="text-success fs-4">${res.ok.length}</div><small>นำเข้าได้</small></div></div><div class="col"><div class="border rounded p-2"><div class="text-warning fs-4">${res.dup.length}</div><small>ซ้ำ (ข้าม)</small></div></div><div class="col"><div class="border rounded p-2"><div class="text-danger fs-4">${res.bad.length}</div><small>ข้อมูลไม่ครบ/ไม่ถูกต้อง (ข้าม)</small></div></div></div>
    ${res.newDivs.size || res.newDepts.size ? `<div class="alert alert-info py-2 small"><strong>จะสร้างโครงสร้างใหม่:</strong> ${[...res.newDivs].map(x => "สำนัก " + esc(x)).concat([...res.newDepts].map(x => "กลุ่มงาน " + esc(x))).join(", ")}</div>` : ""}
    ${lst("แถวที่ซ้ำกับข้อมูลเดิม/ในไฟล์", res.dup, "warning")}${lst("แถวที่ข้อมูลไม่ถูกต้อง", res.bad, "danger")}
    ${res.ok.length ? `<div class="small text-muted">ตัวอย่าง: ${res.ok.slice(0, 3).map(x => esc((x.code || x.id) + " " + x.name)).join(" | ")}</div>` : ""}`;
  $("imp-confirm").disabled = !res.ok.length;
}
function confirmImport() {
  if (!requireAdmin() || !pendingImport) return;
  renderImportPreview(); const p = pendingImport, res = p.res;
  if (!res.ok.length) return;
  if (p.kind === "asset") {
    res.ok.forEach(rec => {
      let dv = data.divisions.find(d => d.name === rec.division);
      if (!dv) { dv = { id: nextId("DIV", data.divisions, "id", 1), name: rec.division, departments: [] }; data.divisions.push(dv); }
      if (rec.department !== "-" && !dv.departments.includes(rec.department)) dv.departments.push(rec.department);
      const c = data.assetConfigs;
      if (!c.categories.includes(rec.category)) c.categories.push(rec.category);
      if (!c.itemNames.includes(rec.name)) c.itemNames.push(rec.name);
      if (rec.brand && !c.brands.includes(rec.brand)) c.brands.push(rec.brand);
      rec.id = nextId("AST", data.assets, "id", 3); data.assets.push(rec);
    });
  } else res.ok.forEach(rec => data.materials.push(rec));
  audit("import-" + p.kind, `${p.fileName}: นำเข้า ${res.ok.length}, ซ้ำ ${res.dup.length}, ข้าม ${res.bad.length}`);
  if (save()) { hideModal("importModal"); ok(`นำเข้าสำเร็จ ${res.ok.length} รายการ (ซ้ำ ${res.dup.length}, ข้าม ${res.bad.length})`); pendingImport = null; }
}

/* =====================================================================
   17. สำรอง / กู้คืน
   ===================================================================== */
$("btn-export").addEventListener("click", () => {
  if (!requireAdmin()) return;
  const out = Object.assign({}, data); delete out.users; // ไม่ส่งออกบัญชีผู้ใช้/แฮชรหัสผ่าน
  out._meta = { app: "office-system", version: 12, exportedAt: new Date().toISOString(), exportedBy: currentUser.username };
  downloadBlob(`backup_office_system_${todayISO()}.json`, JSON.stringify(out, null, 2), "application/json");
  try { localStorage.setItem(BACKUP_KEY, String(Date.now())); } catch (e) { }
  audit("backup", "สำรองข้อมูล (ไม่รวมผู้ใช้)"); save(); ok("สำรองข้อมูลแล้ว (ไฟล์ไม่รวมบัญชีผู้ใช้และรหัสผ่าน)");
});
$("btn-import").addEventListener("change", e => {
  const input = e.target, file = input.files[0]; input.value = "";
  if (!file) return;
  if (!requireAdmin()) return;
  if (file.size > 10 * 1024 * 1024) return bad("ไฟล์ใหญ่เกิน 10 MB");
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const clean = normalizeData(JSON.parse(reader.result), { strict: true, noUsers: true });
      if (!confirm(`กู้คืนข้อมูลจากไฟล์ ${file.name}\nครุภัณฑ์ ${clean.assets.length} · วัสดุ ${clean.materials.length} · รายการยืม ${clean.transactions.length} · สำนัก ${clean.divisions.length}\n\nข้อมูลปัจจุบันจะถูกเขียนทับ (บัญชีผู้ใช้ปัจจุบันจะไม่ถูกแตะต้อง) ต้องการดำเนินการต่อหรือไม่?`)) return;
      if (!freshOK()) return;
      const keep = { users: data.users, rev: data.rev, audit: data.audit };
      data = Object.assign(clean, keep);
      audit("restore", `กู้คืนจาก ${file.name}`);
      if (save()) ok("กู้คืนข้อมูลเรียบร้อย");
    } catch (err) { bad("ไม่สามารถกู้คืนได้: " + err.message); }
  };
  reader.readAsText(file);
});

/* =====================================================================
   18. เริ่มระบบ
   ===================================================================== */
if (typeof bootstrap === "undefined") document.body.insertAdjacentHTML("afterbegin", `<div class="alert alert-danger m-0 rounded-0" style="position:relative;z-index:4000">โหลดไลบรารี Bootstrap ไม่สำเร็จ (ตรวจสอบอินเทอร์เน็ต/ไฟร์วอลล์ หรือดาวน์โหลดไลบรารีมาไว้ในเครื่อง) บางส่วนของระบบอาจใช้งานไม่ได้</div>`);
(function boot() {
  showLogin();
  const s = getSession();
  if (s) { const u = data.users.find(x => x.username === s.username && x.active); if (u) enterApp(u); else clearSession(); }
})();
