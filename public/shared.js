'use strict';
// منطق مشترك بين المتجر ولوحة التحكم: فهم مدة الباقة، حساب التوفير تلقائيًا، المخزون، وانتهاء العروض
(function () {
  const nd = s => String(s || '')
    .replace(/[٠-٩]/g, c => '٠١٢٣٤٥٦٧٨٩'.indexOf(c))
    .replace(/[۰-۹]/g, c => '۰۱۲۳۴۵۶۷۸۹'.indexOf(c));
  const WORDS = { 'ثلاث': 3, 'ثلاثة': 3, 'ثلاثه': 3, 'اربع': 4, 'أربع': 4, 'اربعة': 4, 'أربعة': 4, 'خمس': 5, 'خمسة': 5, 'ست': 6, 'ستة': 6, 'سبع': 7, 'سبعة': 7, 'ثمان': 8, 'ثماني': 8, 'ثمانية': 8, 'تسع': 9, 'تسعة': 9, 'عشر': 10, 'عشرة': 10 };
  const MONTH = 365.25 / 12;
  // [نمط الوحدة، عدد الأيام، عدد ثابت للمثنّى]
  const UNITS = [
    [/(سنتين|عامين)/, 365.25, 2],
    [/شهرين/, MONTH, 2],
    [/(اسبوعين|أسبوعين)/, 7, 2],
    [/يومين/, 1, 2],
    [/(سنة|سنه|سنوي|سنوات|سنين|عام|اعوام|أعوام)/, 365.25],
    [/(شهر|اشهر|أشهر|شهور)/, MONTH],
    [/(اسبوع|أسبوع|اسابيع|أسابيع)/, 7],
    [/(يوم|ايام|أيام)/, 1]
  ];

  // يرجع عدد الأيام من اسم الباقة (مثل: "3 أشهر" = 91 يوم)، أو 0 إذا ما فهمها
  function dur(label) {
    const t = nd(label).toLowerCase().replace(/[\u064B-\u0652]/g, '');
    for (const [re, days, fixed] of UNITS) {
      if (!re.test(t)) continue;
      if (fixed) return days * fixed;
      const m = t.match(/\d+(\.\d+)?/);
      if (m) return days * parseFloat(m[0]);
      for (const w in WORDS) if (new RegExp('(^|\\s)' + w + '(\\s|$)').test(t)) return days * WORDS[w];
      return days;
    }
    return 0;
  }

  // يقارن كل باقة بأقصر باقة ويحسب كم توفّر
  // يرجع { m: {id: {save, pct, full, per, best}}, base, perMonth }
  function vsave(p) {
    const vs = Array.isArray(p.variants) ? p.variants : [];
    const r = { m: {}, base: '', perMonth: false };
    if (vs.length < 2) return r;
    const d = vs.map(v => ({ v, days: dur(v.label), pr: +v.price }));
    if (d.some(x => !x.days || !(x.pr > 0))) return r;
    const base = d.reduce((a, x) => (x.days < a.days || (x.days === a.days && x.pr < a.pr)) ? x : a, d[0]);
    r.base = base.v.label;
    r.perMonth = d.every(x => x.days >= 28);
    const unit = base.pr / base.days;
    let best = null;
    d.forEach(x => {
      const full = unit * x.days, save = full - x.pr;
      const e = { per: x.pr / x.days * MONTH, full: Math.round(full * 100) / 100 };
      if (x !== base && x.days > base.days && save >= 0.5) {
        e.save = Math.round(save * 100) / 100;
        e.pct = Math.round(save / full * 100);
        if (best === null || e.pct > r.m[best].pct) best = x.v.id;
      }
      r.m[x.v.id] = e;
    });
    if (best !== null) r.m[best].best = true;
    return r;
  }

  const hasS = x => !!x && x.stock !== undefined && x.stock !== null && x.stock !== '';
  const vout = (p, v) => p.inStock === false || v.inStock === false || (hasS(v) && +v.stock <= 0);
  const pout = p => p.inStock === false ||
    (Array.isArray(p.variants) && p.variants.length ? p.variants.every(v => vout(p, v)) : (hasS(p) && +p.stock <= 0));

  // إذا انتهى وقت العرض يرجع السعر القديم (للمتجر فقط، لا تستخدمها في لوحة التحكم)
  function norm(p) {
    if (p.saleEnd && +p.saleEnd <= Date.now()) {
      const f = x => { if (+x.old > +x.price) x.price = +x.old; x.old = 0; };
      f(p);
      const vs = Array.isArray(p.variants) ? p.variants : [];
      vs.forEach(f);
      if (vs.length) p.price = Math.min(...vs.map(v => +v.price));
      p.saleEnd = 0;
    }
    return p;
  }

  window.MS = { dur, vsave, hasS, vout, pout, norm };
})();
