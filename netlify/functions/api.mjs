import { getStore } from "@netlify/blobs";
import { ADMIN_CODE, DEFAULT_WA } from "./config.mjs";
const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const DEF = {
  settings: { name: "MASOUB STORE", tagline: "منتجات رقمية | اشتراكات مميزة | أسعار تنافسية", wa: DEFAULT_WA, currency: "ر.س", announce: "🔥 خصومات حصرية على الاشتراكات — استخدم كود MASOUB10", ig: "", sc: "", tt: "", x: "" },
  products: [
    { id: "demo1", name: "اشتراك تجريبي (مثال)", price: 50, old: 0, cat: "📺 اشتراكات", desc: "هذا منتج تجريبي بباقات متعددة، عدّله أو احذفه من لوحة التحكم.", img: "", badge: "الأكثر طلبًا", inStock: true,
      variants: [ { id: "v1", label: "شهر", price: 50, old: 0, inStock: true }, { id: "v3", label: "3 أشهر", price: 130, old: 0, inStock: true }, { id: "v6", label: "6 أشهر", price: 240, old: 0, inStock: true } ] },
    { id: "demo2", name: "اشتراك سنوي (مثال)", price: 400, old: 0, cat: "📺 اشتراكات", desc: "منتج تجريبي.", img: "", badge: "", inStock: true },
    { id: "demo3", name: "منتج رقمي (مثال)", price: 25, old: 0, cat: "💾 منتجات رقمية", desc: "منتج تجريبي.", img: "", badge: "جديد", inStock: true }
  ],
  coupons: [{ code: "MASOUB10", type: "percent", value: 10, min: 0, active: true }]
};
const s = (v, n) => String(v ?? "").slice(0, n);
const r2 = n => Math.round(n * 100) / 100;
const hasS = x => !!x && x.stock !== undefined && x.stock !== null && x.stock !== "";

// ===== حماية: تحديد عدد المحاولات لكل IP =====
const ipOf = req => req.headers.get("x-nf-client-connection-ip") || (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
const rlKey = (p, ip) => "rl-" + p + "-" + ip.replace(/[^a-zA-Z0-9.:_-]/g, "_").slice(0, 60);
async function hit(st, key, max, win) {
  const now = Date.now();
  let r = await st.get(key, { type: "json" }).catch(() => null);
  if (!r || now - r.t > win) r = { c: 0, t: now };
  r.c++;
  await st.setJSON(key, r).catch(() => {});
  return r.c > max;
}
async function locked(st, key, max, win) {
  const r = await st.get(key, { type: "json" }).catch(() => null);
  return !!r && Date.now() - r.t <= win && r.c >= max;
}

// ===== الأسعار الفعلية (إذا انتهى العرض يرجع السعر القديم) =====
function eff(p) {
  const q = { ...p, variants: Array.isArray(p.variants) ? p.variants.map(v => ({ ...v })) : [] };
  if (q.saleEnd && +q.saleEnd <= Date.now()) {
    const f = x => { if (+x.old > +x.price) x.price = +x.old; x.old = 0; };
    f(q); q.variants.forEach(f);
  }
  return q;
}
function resolve(d, k) {
  const [i, w] = String(k).split("|");
  const p0 = (d.products || []).find(x => x.id === i);
  if (!p0) return null;
  const e = eff(p0);
  if (e.variants.length) {
    const v = e.variants.find(x => x.id === w);
    if (!v) return null;
    return { p0, v0: (p0.variants || []).find(x => x.id === w), name: e.name + " — " + v.label, price: +v.price };
  }
  return { p0, name: e.name, price: +e.price };
}

export default async (req) => {
  const p = new URL(req.url).pathname.replace(/^\/api\/?/, ""), st = getStore("masoub"), ip = ipOf(req);
  const load = async () => (await st.get("data", { type: "json" })) || DEF;
  if (req.method === "GET" && p === "data") { const d = await load(); return J({ settings: d.settings, products: d.products }); }
  if (req.method === "GET" && p.startsWith("img/")) {
    const r = await st.getWithMetadata("img-" + p.slice(4), { type: "arrayBuffer" });
    if (!r) return new Response("", { status: 404 });
    return new Response(r.data, { headers: { "content-type": "image/jpeg", "cache-control": "public,max-age=31536000,immutable" } });
  }
  if (req.method !== "POST") return J({ error: "not found" }, 404);

  if (p === "coupon") {
    if (await hit(st, rlKey("cpn", ip), 40, 10 * 60e3)) return J({ error: "محاولات كثيرة، حاول بعد شوي" }, 429);
    const b = await req.json().catch(() => ({})), c = String(b.code || "").trim().toUpperCase(), d = await load();
    const k = (d.coupons || []).find(x => x.active !== false && String(x.code).toUpperCase() === c);
    if (!k) return J({ error: "كود الخصم غير صحيح أو منتهي" }, 404);
    if ((+b.subtotal || 0) < (+k.min || 0)) return J({ error: "الحد الأدنى للطلب لهذا الكود " + k.min }, 400);
    return J({ code: k.code, type: k.type, value: +k.value, min: +k.min || 0 });
  }

  if (p === "order") {
    if (await hit(st, rlKey("ord", ip), 8, 10 * 60e3)) return J({ error: "طلبات كثيرة، حاول بعد شوي" }, 429);
    const t = await req.text(); if (t.length > 8000) return J({ error: "large" }, 413);
    let b; try { b = JSON.parse(t) } catch { return J({ error: "bad" }, 400) }
    const raw = (Array.isArray(b.items) ? b.items : []).slice(0, 50);
    let items, sub, disc, total, code = s(b.code, 30);
    if (raw.length && raw.every(i => i && i.k)) {
      // الحساب من أسعار المتجر الحقيقية، وإنقاص المخزون
      const d = await load(), its = []; let sb = 0, touched = false;
      for (const i of raw) {
        const q = Math.max(1, Math.min(99, parseInt(i.q) || 1)), r = resolve(d, i.k);
        if (!r) return J({ error: "منتج غير موجود" }, 400);
        its.push({ n: s(r.name, 120), q, p: r.price }); sb += r.price * q;
        const tg = r.v0 || r.p0;
        if (hasS(tg)) { tg.stock = Math.max(0, +tg.stock - q); touched = true; }
      }
      const cc = (d.coupons || []).find(x => x.active !== false && String(x.code).toUpperCase() === code.toUpperCase());
      let dc = 0;
      if (cc && sb >= (+cc.min || 0)) dc = r2(cc.type === "percent" ? sb * (+cc.value) / 100 : Math.min(+cc.value, sb)); else code = "";
      if (touched) await st.setJSON("data", { settings: d.settings, products: d.products, coupons: d.coupons || [] });
      items = its; sub = r2(sb); disc = dc; total = r2(sb - dc);
    } else {
      items = raw.map(i => ({ n: s(i.n, 120), q: +i.q || 1, p: +i.p || 0 }));
      sub = +b.sub || 0; disc = +b.disc || 0; total = +b.total || 0;
    }
    const o = { id: s(b.id, 20), name: s(b.name, 80), phone: s(b.phone, 20), city: s(b.city, 60), notes: s(b.notes, 400), code, sub, disc, total, done: false, ts: Date.now(), items };
    const l = (await st.get("orders", { type: "json" })) || []; l.unshift(o);
    await st.setJSON("orders", l.slice(0, 300)); return J({ ok: 1 });
  }

  // ===== من هنا فقط لوحة التحكم =====
  const ak = rlKey("adm", ip);
  if (await locked(st, ak, 8, 15 * 60e3)) return J({ error: "محاولات كثيرة، حاول بعد 15 دقيقة" }, 429);
  if (req.headers.get("x-admin-code") !== ADMIN_CODE) { await hit(st, ak, 8, 15 * 60e3); return J({ error: "الرمز غير صحيح" }, 401); }
  if (p === "login") return J({ ok: 1 });
  if (p === "admin") return J({ ...(await load()), orders: (await st.get("orders", { type: "json" })) || [] });
  if (p === "save") {
    const d = await req.json();
    if (!d || typeof d.settings !== "object" || !Array.isArray(d.products) || !Array.isArray(d.coupons)) return J({ error: "بيانات غير صالحة" }, 400);
    await st.setJSON("data", { settings: d.settings, products: d.products, coupons: d.coupons }); return J({ ok: 1 });
  }
  if (p === "order-op") {
    // عمليات على طلب واحد بدون ما نكتب فوق طلبات جديدة وصلت بنفس اللحظة
    const b = await req.json().catch(() => ({}));
    let l = (await st.get("orders", { type: "json" })) || [];
    if (b.op === "done") l = l.map(o => o.id === b.id ? { ...o, done: !!b.val } : o);
    else if (b.op === "del") l = l.filter(o => o.id !== b.id);
    else if (b.op === "clear") l = l.filter(o => !o.done);
    else return J({ error: "bad" }, 400);
    await st.setJSON("orders", l); return J({ orders: l });
  }
  if (p === "orders-save") { const l = await req.json(); if (!Array.isArray(l)) return J({ error: "bad" }, 400); await st.setJSON("orders", l.slice(0, 300)); return J({ ok: 1 }); }
  if (p === "upload") {
    const b = await req.arrayBuffer(); if (b.byteLength > 3e6) return J({ error: "الصورة كبيرة" }, 413);
    const k = crypto.randomUUID(); await st.set("img-" + k, b, { metadata: { type: "image/jpeg" } });
    return J({ url: "/api/img/" + k });
  }
  return J({ error: "not found" }, 404);
};
export const config = { path: "/api/*" };
