import { getStore } from "@netlify/blobs";
import { ADMIN_CODE, DEFAULT_WA } from "./config.mjs";
const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const DEF = {
  settings: { name: "MASOUB STORE", tagline: "منتجات رقمية | اشتراكات مميزة | أسعار تنافسية", wa: DEFAULT_WA, currency: "ر.س", announce: "🔥 خصومات حصرية على الاشتراكات — استخدم كود MASOUB10", ig: "", sc: "", tt: "", x: "" },
  products: [
    { id: "demo1", name: "اشتراك شهري (مثال)", price: 50, old: 70, cat: "📺 اشتراكات", desc: "هذا منتج تجريبي، عدّله أو احذفه من لوحة التحكم.", img: "", badge: "الأكثر طلبًا", inStock: true },
    { id: "demo2", name: "اشتراك سنوي (مثال)", price: 400, old: 0, cat: "📺 اشتراكات", desc: "منتج تجريبي.", img: "", badge: "", inStock: true },
    { id: "demo3", name: "منتج رقمي (مثال)", price: 25, old: 0, cat: "💾 منتجات رقمية", desc: "منتج تجريبي.", img: "", badge: "جديد", inStock: true }
  ],
  coupons: [{ code: "MASOUB10", type: "percent", value: 10, min: 0, active: true }]
};
const s = (v, n) => String(v ?? "").slice(0, n);
export default async (req) => {
  const p = new URL(req.url).pathname.replace(/^\/api\/?/, ""), st = getStore("masoub");
  const load = async () => (await st.get("data", { type: "json" })) || DEF;
  if (req.method === "GET" && p === "data") { const d = await load(); return J({ settings: d.settings, products: d.products }); }
  if (req.method === "GET" && p.startsWith("img/")) {
    const r = await st.getWithMetadata("img-" + p.slice(4), { type: "arrayBuffer" });
    if (!r) return new Response("", { status: 404 });
    return new Response(r.data, { headers: { "content-type": "image/jpeg", "cache-control": "public,max-age=31536000,immutable" } });
  }
  if (req.method !== "POST") return J({ error: "not found" }, 404);
  if (p === "coupon") {
    const b = await req.json().catch(() => ({})), c = String(b.code || "").trim().toUpperCase(), d = await load();
    const k = (d.coupons || []).find(x => x.active !== false && String(x.code).toUpperCase() === c);
    if (!k) return J({ error: "كود الخصم غير صحيح أو منتهي" }, 404);
    if ((+b.subtotal || 0) < (+k.min || 0)) return J({ error: "الحد الأدنى للطلب لهذا الكود " + k.min }, 400);
    return J({ code: k.code, type: k.type, value: +k.value, min: +k.min || 0 });
  }
  if (p === "order") {
    const t = await req.text(); if (t.length > 8000) return J({ error: "large" }, 413);
    let b; try { b = JSON.parse(t) } catch { return J({ error: "bad" }, 400) }
    const o = { id: s(b.id, 20), name: s(b.name, 80), phone: s(b.phone, 20), city: s(b.city, 60), notes: s(b.notes, 400), code: s(b.code, 30), sub: +b.sub || 0, disc: +b.disc || 0, total: +b.total || 0, done: false, ts: Date.now(),
      items: (Array.isArray(b.items) ? b.items : []).slice(0, 50).map(i => ({ n: s(i.n, 120), q: +i.q || 1, p: +i.p || 0 })) };
    const l = (await st.get("orders", { type: "json" })) || []; l.unshift(o);
    await st.setJSON("orders", l.slice(0, 300)); return J({ ok: 1 });
  }
  if (req.headers.get("x-admin-code") !== ADMIN_CODE) return J({ error: "الرمز غير صحيح" }, 401);
  if (p === "login") return J({ ok: 1 });
  if (p === "admin") return J({ ...(await load()), orders: (await st.get("orders", { type: "json" })) || [] });
  if (p === "save") {
    const d = await req.json();
    if (!d || typeof d.settings !== "object" || !Array.isArray(d.products) || !Array.isArray(d.coupons)) return J({ error: "بيانات غير صالحة" }, 400);
    await st.setJSON("data", { settings: d.settings, products: d.products, coupons: d.coupons }); return J({ ok: 1 });
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
