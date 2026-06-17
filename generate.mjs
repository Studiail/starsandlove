import { createClient } from '@base44/sdk';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const APP_ID      = process.env.BASE44_APP_ID || '89192500';
const SITE_DOMAIN = process.env.SITE_DOMAIN   || 'starsandlove.co.il';
const APP_URL     = (process.env.APP_URL      || 'https://starsandlove.com').replace(/\/$/, '');
const CTA_BASE    = `${APP_URL}/PersonalChart`;
const OUT         = 'public';

// GA4 (shared property with .com for cross-domain). Public Measurement ID — not a secret.
// Cross-domain is enabled in the GA4 UI ("Configure your domains": co.il + .com).
const GA4_ID = process.env.GA4_ID || 'G-5CDSZ6D135';
const ANALYTICS_HEAD = GA4_ID ? `
<!-- Google tag (gtag.js) — GA4 shared property, cross-domain co.il + .com -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${GA4_ID}"></script>
<script>
  window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
  gtag('js',new Date());
  gtag('config','${GA4_ID}');
  // Funnel CTA clicks (links to the .com catalog) → GA4 event with campaign + sign.
  document.addEventListener('click',function(e){
    var a=e.target.closest&&e.target.closest('a[href*="/PersonalChart"]');
    if(!a)return;
    try{var u=new URL(a.href);gtag('event','cta_click',{cta_campaign:u.searchParams.get('utm_campaign')||'',cta_sign:u.searchParams.get('utm_content')||''});}catch(_){}
  },true);
</script>` : '';

// Build the CTA URL with funnel attribution params. The destination (PersonalChart,
// the catalog) does NOT read the sign — per-sign attribution is carried in utm_content
// so GA4 can report which sign drove the click. The query string is HTML-escaped at each call site.
const ctaUrl = (params) => `${CTA_BASE}?${new URLSearchParams(params).toString()}`;
const ctaSign = (slug) => ctaUrl({ utm_source: 'coil', utm_medium: 'funnel', utm_campaign: 'horoscope_sign', utm_content: slug });
const ctaHome = () => ctaUrl({ utm_source: 'coil', utm_medium: 'funnel', utm_campaign: 'horoscope_home' });

const SIGNS = [
  { he: 'טלה',    slug: 'aries' },
  { he: 'שור',    slug: 'taurus' },
  { he: 'תאומים', slug: 'gemini' },
  { he: 'סרטן',   slug: 'cancer' },
  { he: 'אריה',   slug: 'leo' },
  { he: 'בתולה',  slug: 'virgo' },
  { he: 'מאזניים',slug: 'libra' },
  { he: 'עקרב',   slug: 'scorpio' },
  { he: 'קשת',    slug: 'sagittarius' },
  { he: 'גדי',    slug: 'capricorn' },
  { he: 'דלי',    slug: 'aquarius' },
  { he: 'דגים',   slug: 'pisces' },
];

const GLYPHS = {
  'טלה':'♈','שור':'♉','תאומים':'♊','סרטן':'♋','אריה':'♌','בתולה':'♍',
  'מאזניים':'♎','עקרב':'♏','קשת':'♐','גדי':'♑','דלי':'♒','דגים':'♓',
};

// Evergreen per-sign content — durable SEO body that stays on each /horoscope/<slug>/ page
// alongside the weekly (overwritten) horoscope. Authored content; refine the voice freely.
const EVERGREEN = {
  aries:       { dates:'21 במרץ – 19 באפריל', element:'אש',   ruler:'מאדים',  personality:'מזל טלה, הראשון בגלגל המזלות, מתאפיין באנרגיה, יוזמה ואומץ. בני טלה הם חלוצים מטבעם — נלהבים, ישירים ובעלי דחף עז לפעולה ולהובלה.', love:'באהבה טלה לוהט וספונטני, אוהב לחזר ולהוביל. הוא זקוק לבן או בת זוג שישמרו על העצמאות שלו ויצעדו לצידו בקצב גבוה.', career:'בעבודה טלה מצטיין כיוזם ומנהיג, פורח באתגרים ובמשימות חדשות, אך לומד עם הזמן את כוחן של סבלנות והתמדה.' },
  taurus:      { dates:'20 באפריל – 20 במאי', element:'אדמה', ruler:'נוגה',   personality:'מזל שור, מיסוד האדמה, מתאפיין ביציבות, נחישות ואהבה ליופי ולנוחות. בני שור מעשיים, נאמנים וסבלניים, ומעריכים ביטחון ושגרה מבוססת.', love:'באהבה שור חושני ומסור, בונה קשר לאט אך לעומק. הוא מחפש יציבות, נאמנות וביטחון רגשי, ופחות אוהב שינויים פתאומיים.', career:'בעבודה שור חרוץ ועקבי, מצוין במשימות הדורשות התמדה ואמינות, ומוביל לתוצאות מוחשיות לאורך זמן.' },
  gemini:      { dates:'21 במאי – 20 ביוני', element:'אוויר', ruler:'מרקורי', personality:'מזל תאומים, מיסוד האוויר, מתאפיין בסקרנות, חדות מחשבה ותקשורת. בני תאומים רב-תחומיים, שנונים וחברותיים, ונהנים מגיוון ומלמידה מתמדת.', love:'באהבה תאומים זקוק לגירוי אינטלקטואלי ולשיחה זורמת. הוא קליל ומשעשע, ומחפש בן או בת זוג שיעמדו בקצב המנטלי שלו.', career:'בעבודה תאומים מבריק בתפקידים הדורשים תקשורת, כתיבה ורעיונות, ולומד למקד את האנרגיה הרבה שלו במשימה אחת.' },
  cancer:      { dates:'21 ביוני – 22 ביולי', element:'מים',  ruler:'הירח',   personality:'מזל סרטן, מיסוד המים, מתאפיין ברגישות, אינטואיציה ומסירות למשפחה. בני סרטן אכפתיים, מגוננים ובעלי עולם רגשי עמוק.', love:'באהבה סרטן מסור ורומנטי, מחפש קרבה, ביטחון וקן חם. הוא נותן הרבה ומצפה לנאמנות ולחום בחזרה.', career:'בעבודה סרטן אחראי ומסור, מצטיין בתפקידים שדורשים אמפתיה וטיפול, ומעריך סביבה יציבה ותומכת.' },
  leo:         { dates:'23 ביולי – 22 באוגוסט', element:'אש',  ruler:'השמש',  personality:'מזל אריה, מיסוד האש, מתאפיין בכריזמה, ביטחון ונדיבות. בני אריה מלכותיים, יצירתיים ואוהבי במה, ומובילים בטבעיות.', love:'באהבה אריה נדיב, נלהב ורומנטי, אוהב לפנק ולהיות מוערך. הוא זקוק להערכה ולתשומת לב כדי לפרוח.', career:'בעבודה אריה מנהיג טבעי, זוהר בתפקידים שמאפשרים ביטוי ויצירתיות, ומעורר השראה בסובבים אותו.' },
  virgo:       { dates:'23 באוגוסט – 22 בספטמבר', element:'אדמה', ruler:'מרקורי', personality:'מזל בתולה, מיסוד האדמה, מתאפיין בדייקנות, חריצות ותשומת לב לפרטים. בני בתולה אנליטיים, מעשיים ושואפים לשלמות.', love:'באהבה בתולה נאמן ומסור, מבטא אהבה דרך מעשים וטיפול. הוא זהיר בתחילה אך עמוק ויציב לאורך זמן.', career:'בעבודה בתולה יסודי ואמין, מצטיין במשימות הדורשות סדר, ניתוח ודיוק, והוא נכס בכל צוות.' },
  libra:       { dates:'23 בספטמבר – 22 באוקטובר', element:'אוויר', ruler:'נוגה', personality:'מזל מאזניים, מיסוד האוויר, מתאפיין בשאיפה להרמוניה, צדק ויופי. בני מאזניים דיפלומטיים, חברותיים ובעלי חוש אסתטי מפותח.', love:'באהבה מאזניים רומנטי ושותפי, מחפש איזון וקשר הדדי. הוא פורח בזוגיות ומשקיע רבות בהרמוניה.', career:'בעבודה מאזניים מצטיין בתיווך, עיצוב ויחסי אנוש, ומביא איזון ושיתוף פעולה לסביבתו.' },
  scorpio:     { dates:'23 באוקטובר – 21 בנובמבר', element:'מים', ruler:'מאדים ופלוטו', personality:'מזל עקרב, מיסוד המים, מתאפיין בעוצמה, עומק ותשוקה. בני עקרב נחושים, אינטואיטיביים ובעלי עולם פנימי עז.', love:'באהבה עקרב עז, נאמן וכל-מסור, מחפש קרבה אמיתית ואינטימיות עמוקה. הוא משקיע הכול ומצפה לנאמנות מלאה.', career:'בעבודה עקרב ממוקד ונחוש, מצטיין במשימות הדורשות חקירה, אסטרטגיה ושליטה, ולא נרתע מאתגרים.' },
  sagittarius: { dates:'22 בנובמבר – 21 בדצמבר', element:'אש', ruler:'צדק',    personality:'מזל קשת, מיסוד האש, מתאפיין באופטימיות, חירות ואהבת הרפתקאות. בני קשת סקרנים, ישירים ושואפים תמיד למשמעות ולמרחבים חדשים.', love:'באהבה קשת חופשי ונלהב, מחפש בן או בת זוג להרפתקה משותפת. הוא זקוק למרחב ולכנות בקשר.', career:'בעבודה קשת מצטיין בתפקידים שמשלבים למידה, מסעות ורעיונות גדולים, ופורח כשיש לו חופש פעולה.' },
  capricorn:   { dates:'22 בדצמבר – 19 בינואר', element:'אדמה', ruler:'שבתאי', personality:'מזל גדי, מיסוד האדמה, מתאפיין בשאפתנות, משמעת ואחריות. בני גדי מציאותיים, מתמידים ובונים את הצלחתם בסבלנות.', love:'באהבה גדי נאמן ורציני, בונה קשר יציב לטווח ארוך. הוא זהיר בהבעת רגשות אך מסור ועקבי.', career:'בעבודה גדי שאפתן וממושמע, מטפס בהתמדה ומצטיין בתפקידי ניהול ואחריות.' },
  aquarius:    { dates:'20 בינואר – 18 בפברואר', element:'אוויר', ruler:'שבתאי ואורנוס', personality:'מזל דלי, מיסוד האוויר, מתאפיין במקוריות, חדשנות וחשיבה עצמאית. בני דלי הומניטריים, חופשיים ובעלי ראייה קדימה.', love:'באהבה דלי זקוק לחברות ולחופש לצד הקשר. הוא מחפש בן או בת זוג שהם גם חברים וגם שותפים לרעיונות.', career:'בעבודה דלי חדשן ויצירתי, מצטיין בתחומים טכנולוגיים וחברתיים, ומביא פתרונות מקוריים.' },
  pisces:      { dates:'19 בפברואר – 20 במרץ', element:'מים',  ruler:'צדק ונפטון', personality:'מזל דגים, מיסוד המים, מתאפיין ברגישות, דמיון ואמפתיה. בני דגים חולמניים, אמנותיים ובעלי אינטואיציה עמוקה.', love:'באהבה דגים רומנטי ומסור, מחפש חיבור נשמה ורגש עמוק. הוא נותן הרבה ומחפש קשר רך ומבין.', career:'בעבודה דגים יצירתי ואמפתי, מצטיין בתחומים אמנותיים, טיפוליים ורוחניים.' },
};

const evergreenHtml = (sign) => {
  const ev = EVERGREEN[sign.slug];
  if (!ev) return '';
  return `
  <h2 style="font-family:var(--serif);text-align:right;color:var(--cream);margin:28px 0 16px">על מזל ${sign.he}</h2>
  <div class="card">
    <p style="color:var(--gold-soft);font-size:.92rem;margin-bottom:10px">תאריכים: ${ev.dates} <span style="color:var(--cream-dim)">·</span> יסוד: ${ev.element} <span style="color:var(--cream-dim)">·</span> כוכב שולט: ${ev.ruler}</p>
    <p>${ev.personality}</p>
  </div>
  <div class="card"><h2>מזל ${sign.he} באהבה</h2><p>${ev.love}</p></div>
  <div class="card"><h2>מזל ${sign.he} בקריירה</h2><p>${ev.career}</p></div>`;
};

// If a zodiac icon SVG is missing or fails to load, swap the broken <img> for the
// gold unicode glyph so a cell never renders blank. Injected once per page.
const ZFAIL_JS = `<script>function zfail(el,g){var s=document.createElement('span');s.className=el.className||'';var w=el.getAttribute('width'),h=el.getAttribute('height');s.style.cssText='display:inline-flex;align-items:center;justify-content:center;color:var(--gold);font-family:var(--serif);font-size:1.8em;line-height:1'+(w?';width:'+w+'px':'')+(h?';height:'+h+'px':'');s.setAttribute('aria-hidden','true');s.textContent=g;el.replaceWith(s);}</script>`;

// Icons are hosted locally in static/icons/<slug>.svg (single source, no external dependency).
// Set USE_IMAGE_ICONS=0 to fall back to the gold unicode glyphs.
const USE_IMAGE_ICONS = process.env.USE_IMAGE_ICONS !== '0';

const esc = (s = '') => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const todayIsrael = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());

// Sunday (YYYY-MM-DD) of the CURRENT week, computed in Israel time.
// This matches how the Base44 app and the generator define the week, so the
// static site always displays the same week as the app — never a stray record.
function currentWeekSundayIL() {
  const todayIL = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
  const d = new Date(todayIL + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - d.getUTCDay()); // getUTCDay: 0 = Sunday
  return d.toISOString().split('T')[0];
}

const fmtDate = (s) => {
  if (!s) return '';
  try { return new Date(s).toLocaleDateString('he-IL', { day: 'numeric', month: 'long' }); }
  catch { return s; }
};

// Design system aligned 1:1 with the homepage (index.html): same palette,
// same gold, same Teom/Heebo fonts, same 48px/14px gold button, same starfield.
const CSS = `
@font-face{font-family:"Teom";src:url("/teom.woff2") format("woff2"),url("/teom.otf") format("opentype");font-weight:400 900;font-display:swap}
:root{
  --bg:#1e2255;--bg-alt:#181c44;--card:#2A2C5C;
  --gold:#E19F41;--gold-soft:#edc17b;--cream:#f4ead7;--cream-90:rgba(244,234,215,.9);--cream-dim:rgba(244,234,215,.6);
  --maxw:760px;
  --serif:"Teom","Frank Ruhl Libre",Georgia,serif;
  --sans:"Heebo",system-ui,sans-serif;
}
*{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth}
body{font-family:var(--sans);color:var(--cream);background:var(--bg);line-height:1.7;-webkit-font-smoothing:antialiased;overflow-x:hidden}
.stars{position:fixed;inset:0;z-index:0;pointer-events:none;opacity:.8;background-image:
  radial-gradient(1px 1px at 20% 30%,rgba(244,234,215,.7),transparent),
  radial-gradient(1px 1px at 70% 20%,rgba(244,234,215,.5),transparent),
  radial-gradient(1.5px 1.5px at 40% 70%,rgba(225,159,65,.6),transparent),
  radial-gradient(1px 1px at 85% 60%,rgba(244,234,215,.5),transparent),
  radial-gradient(1px 1px at 15% 85%,rgba(244,234,215,.4),transparent),
  radial-gradient(1.5px 1.5px at 60% 90%,rgba(225,159,65,.5),transparent)}
.wrap{max-width:var(--maxw);margin:0 auto;padding:0 22px;position:relative;z-index:1}
a{color:inherit;text-decoration:none}

.btn{display:inline-flex;align-items:center;justify-content:center;height:48px;background:var(--gold);color:#2a1a04;
  font-family:var(--serif);font-weight:700;font-size:1.05rem;padding:0 34px;border-radius:14px;border:none;cursor:pointer;
  transition:transform .18s,box-shadow .18s,background .18s}
.btn:hover{transform:translateY(-2px);background:var(--gold-soft)}
.btn-block{display:flex;width:100%;max-width:560px;margin:0 auto}

header{padding:22px 0 4px;text-align:center;position:relative;z-index:1}
header img{height:46px}
h1{font-family:var(--serif);font-weight:700;text-align:center;font-size:clamp(1.7rem,7.5vw,3rem);margin:14px 0 6px;color:var(--cream);white-space:nowrap}
.zh-week{color:var(--gold)}
.sub{text-align:center;color:var(--cream-dim);font-weight:300;margin-bottom:26px}
.eyebrow{color:var(--gold-soft);font-weight:500;letter-spacing:3px;font-size:.82rem;text-align:center;margin:18px 0 2px}

/* zodiac matrix — identical to the homepage floating grid */
.zgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;max-width:440px;margin:0 auto 8px}
.zbtn{display:flex;flex-direction:column;align-items:center;gap:3px;background:none;border:none;cursor:pointer;padding:3px 2px;border-radius:14px;animation:zfloat 4s ease-in-out infinite}
.zico{width:100%;max-width:78px;aspect-ratio:1;object-fit:contain;display:block}
.zbtn:nth-child(2){animation-delay:.3s}
.zbtn:nth-child(3){animation-delay:.6s}
.zbtn:nth-child(4){animation-delay:.9s}
.zbtn:nth-child(5){animation-delay:1.2s}
.zbtn:nth-child(6){animation-delay:.2s}
.zbtn:nth-child(7){animation-delay:.8s}
.zbtn:nth-child(8){animation-delay:1.1s}
.zbtn:nth-child(9){animation-delay:.5s}
.zbtn:nth-child(10){animation-delay:1.4s}
.zbtn:nth-child(11){animation-delay:.4s}
.zbtn:nth-child(12){animation-delay:1s}
.zname{font-size:.82rem;color:var(--gold);font-weight:700;font-family:var(--sans)}
@keyframes zfloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
@media(min-width:680px){.zgrid{grid-template-columns:repeat(6,1fr);max-width:none}}

/* CTA band — like the homepage */
.ctaband{text-align:center;padding:14px 0 6px}
.ctaband .btn{margin:0 auto;width:100%;max-width:360px}
.cta-note{margin-top:10px;font-size:.92rem;color:var(--cream-dim)}
.cta-note span{color:var(--gold-soft);margin:0 6px}

/* sign-page CTA card, on the homepage palette */
.cta{background:var(--card);border-radius:16px;padding:28px 22px;text-align:center;margin:26px auto;max-width:560px}
.cta h3{font-family:var(--serif);font-weight:700;font-size:1.4rem;color:var(--cream);margin-bottom:8px;line-height:1.2}
.cta p{color:var(--cream-90);font-weight:300;margin-bottom:18px}

/* sign-page content blocks, recoloured to the homepage palette */
.card{background:var(--card);border-radius:16px;padding:22px;margin:0 auto 14px;max-width:560px}
.card h2{font-family:var(--serif);font-weight:700;color:var(--gold-soft);font-size:1.3rem;margin-bottom:8px}
.card p{color:var(--cream-90);font-weight:300}
.day{background:var(--card);border-radius:14px;padding:18px 20px;margin:0 auto 12px;max-width:560px}
.day .top{display:flex;justify-content:flex-start;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:6px}
.day .name{font-family:var(--serif);font-weight:700;color:var(--cream)}
.day .focus{font-size:.85rem;color:var(--gold-soft);margin-inline-start:auto}
.day .date{font-size:.85rem;color:var(--cream-dim)}
.day p{font-size:.97rem;color:var(--cream-90);font-weight:300}
.energy{margin-top:10px;font-size:.82rem;color:var(--cream-dim)}
.energy b{color:var(--gold-soft);font-weight:500}

.back{display:block;text-align:center;color:var(--gold);margin:24px 0;font-size:.92rem;font-family:var(--serif)}

footer{background:var(--bg-alt);padding:34px 0 30px;text-align:center;margin-top:30px;position:relative;z-index:1}
footer .links{display:flex;gap:18px;justify-content:center;flex-wrap:wrap;margin-bottom:10px}
footer a{color:var(--cream-dim);font-size:.88rem}
footer .copy{color:rgba(244,234,215,.4);font-size:.8rem}

@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}.zbtn{animation:none}}
`;

// ── Structured data (JSON-LD) ──
const jsonLd = (obj) => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;
const SITE_SCHEMA = jsonLd({
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'Organization', '@id': `https://${SITE_DOMAIN}/#org`, name: 'Stars & Love', url: `https://${SITE_DOMAIN}/`, logo: `https://${SITE_DOMAIN}/logo.svg`, description: 'הורוסקופ שבועי לכל המזלות ומפת לידה אישית מבוססת AI.' },
    { '@type': 'WebSite', '@id': `https://${SITE_DOMAIN}/#website`, name: 'Stars & Love', url: `https://${SITE_DOMAIN}/`, inLanguage: 'he-IL', publisher: { '@id': `https://${SITE_DOMAIN}/#org` } },
  ],
});

const head = (title, desc, canonical, extraHead = '') => `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">${ANALYTICS_HEAD}
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${canonical}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:locale" content="he_IL">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;700&display=swap" rel="stylesheet">
<style>${CSS}</style>
${SITE_SCHEMA}${extraHead}
</head>
<body>
<div class="stars" aria-hidden="true"></div>`;

const COOKIE_BANNER = `
<div id="ck-banner" style="display:none;position:fixed;left:0;right:0;bottom:0;z-index:60;background:var(--bg-alt);border-top:1px solid rgba(244,234,215,.15);padding:14px 18px">
  <div style="max-width:760px;margin:0 auto;display:flex;align-items:center;gap:14px;flex-wrap:wrap;justify-content:center">
    <span style="color:var(--cream-90);font-size:.9rem">אנו משתמשים בעוגיות לשיפור החוויה ולמדידת שימוש. <a href="${APP_URL}/Privacy" style="color:var(--gold-soft);text-decoration:underline">מדיניות הפרטיות</a></span>
    <button type="button" onclick="ckOk()" style="background:var(--gold);color:#2a1a04;border:none;border-radius:12px;padding:8px 22px;font-family:var(--serif);font-weight:700;cursor:pointer">הבנתי</button>
  </div>
</div>
<script>
  function ckOk(){try{localStorage.setItem('ck_ok','1')}catch(e){}var b=document.getElementById('ck-banner');if(b)b.style.display='none';}
  (function(){try{if(localStorage.getItem('ck_ok'))return;}catch(e){}var b=document.getElementById('ck-banner');if(b)b.style.display='block';})();
</script>`;

const footer = () => `
<footer><div class="wrap">
  <div class="links">
    <a href="/">דף הבית</a>
    <a href="/horoscope/">הורוסקופ שבועי</a>
    <a href="${APP_URL}/About">אודות</a>
    <a href="${APP_URL}/Privacy">פרטיות</a>
    <a href="${APP_URL}/Terms">תנאי שימוש</a>
    <a href="${APP_URL}/Accessibility">נגישות</a>
  </div>
  <p class="copy">© Stars &amp; Love · כל הזכויות שמורות</p>
</div></footer>
${COOKIE_BANNER}
${ZFAIL_JS}
</body></html>`;

function signPage(sign, rec) {
  const title = `הורוסקופ שבועי ${sign.he} | Stars & Love`;
  const summary = rec?.weekly_summary || `ההורוסקופ השבועי למזל ${sign.he} — מתעדכן כל יום.`;
  const desc = summary.slice(0, 155);
  const canonical = `https://${SITE_DOMAIN}/horoscope/${sign.slug}/`;
  const days = Array.isArray(rec?.daily_horoscopes) ? rec.daily_horoscopes : [];

  const daysHtml = days.map(d => `
    <div class="day">
      <div class="top">
        <span class="name">יום ${esc(d.day_name || '')}</span>
        <span class="date">${esc(fmtDate(d.date))}</span>
        ${d.focus_area ? `<span class="focus">${esc(d.focus_area)}</span>` : ''}
      </div>
      <p>${esc(d.content || '')}</p>
      ${d.energy_level ? `<div class="energy">אנרגיה: <b>${esc(d.energy_level)}/10</b></div>` : ''}
    </div>`).join('');

  const ev = EVERGREEN[sign.slug];
  const faqs = [
    { q: `כל כמה זמן מתעדכן ההורוסקופ של מזל ${sign.he}?`, a: `ההורוסקופ השבועי של מזל ${sign.he} מתעדכן כל שבוע, עם תחזית לכל יום מימות השבוע.` },
    { q: `האם ההורוסקופ של מזל ${sign.he} מבוסס על מפת הלידה שלי?`, a: `ההורוסקופ השבועי הוא כללי למזל ${sign.he}. לניתוח אישי מלא לפי מפת הלידה שלך אפשר ליצור מפת לידה בחינם ב-Stars & Love.` },
  ];
  if (ev) faqs.push({ q: `מהם המאפיינים של מזל ${sign.he}?`, a: ev.personality });

  const faqHtml = `
  <h2 style="font-family:var(--serif);text-align:right;color:var(--cream);margin:28px 0 16px">שאלות נפוצות</h2>
  ${faqs.map(f => `<div class="card"><h2>${esc(f.q)}</h2><p>${esc(f.a)}</p></div>`).join('')}`;

  const breadcrumbSchema = jsonLd({
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'דף הבית', item: `https://${SITE_DOMAIN}/` },
      { '@type': 'ListItem', position: 2, name: 'הורוסקופ שבועי', item: `https://${SITE_DOMAIN}/horoscope/` },
      { '@type': 'ListItem', position: 3, name: `מזל ${sign.he}`, item: canonical },
    ],
  });
  const faqSchema = jsonLd({
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: faqs.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  });

  return head(title, desc, canonical, breadcrumbSchema + faqSchema) + `
<main class="wrap">
  <p class="eyebrow">אסטרולוגיה · פסיכולוגיה · AI</p>
  <img src="/icons/${sign.slug}.svg" alt="מזל ${esc(sign.he)}" width="84" height="84" style="display:block;width:84px;height:84px;margin:8px auto 4px" onerror="zfail(this,'${GLYPHS[sign.he] || '✦'}')">
  <h1>מזל ${esc(sign.he)} · <span class="zh-week">השבוע</span></h1>
  <p class="sub">${rec?.week_start_date ? `${esc(fmtDate(rec.week_start_date))} – ${esc(fmtDate(rec.week_end_date))}` : 'השבוע'}</p>

  <div class="card"><h2>סיכום השבוע</h2><p>${esc(summary)}</p></div>
  ${rec?.planetary_highlights ? `<div class="card"><h2>הדגשים הפלנטריים</h2><p>${esc(rec.planetary_highlights)}</p></div>` : ''}
  ${rec?.lucky_day ? `<div class="card"><h2>היום המוצלח</h2><p>${esc(rec.lucky_day)}</p></div>` : ''}

  ${daysHtml ? `<h2 style="font-family:var(--serif);text-align:right;color:var(--cream);margin:28px 0 16px">הורוסקופ יומי</h2>${daysHtml}` : ''}

  ${evergreenHtml(sign)}

  ${faqHtml}

  <div class="cta">
    <h3>רוצה להבין לעומק את ההורוסקופ שלך?</h3>
    <p>לא רק לפי המזל - לפי מפת הלידה שלך. ניתוח מפת האישיות בחינם.</p>
    <a class="btn" href="${esc(ctaSign(sign.slug))}">צרי מפת לידה - עכשיו</a>
  </div>

  <a class="back" href="/">לכל המזלות</a>
</main>` + footer();
}

function indexPage() {
  const title = 'הורוסקופ שבועי לכל המזלות | Stars & Love';
  const desc = 'הורוסקופ שבועי מעודכן לכל 12 המזלות — אהבה, קריירה ויחסים. מבוסס AI ו-20 שנות ידע אסטרולוגי.';
  const canonical = `https://${SITE_DOMAIN}/horoscope/`;
  const matrix = SIGNS.map(s => `
        <a class="zbtn" href="/horoscope/${s.slug}/">
          <img class="zico" src="/icons/${s.slug}.svg" alt="מזל ${esc(s.he)}" loading="lazy" width="74" height="74" onerror="zfail(this,'${GLYPHS[s.he] || '✦'}')">
          <span class="zname">${esc(s.he)}</span>
        </a>`).join('');
  return head(title, desc, canonical) + `
<header><div class="wrap"><a href="/"><img src="/logo.svg" alt="Stars & Love"></a></div></header>
<main class="wrap">
  <h1>הורוסקופ שבועי</h1>
  <p class="sub">בחרי מזל וגלי מה מחכה לך השבוע</p>
  <div class="zgrid">${matrix}
      </div>
  <div class="ctaband">
    <a class="btn btn-block" href="${esc(ctaHome())}">צרי מפת לידה - עכשיו</a>
    <p class="cta-note">מעבר להורוסקופ — מפת לידה אישית מלאה <span>·</span> בחינם</p>
  </div>
</main>` + footer();
}

async function copyStatic() {
  await fs.mkdir(OUT, { recursive: true });
  for (const f of ['logo.svg', 'astro_gold.svg', 'teom.woff2', 'teom.otf', 'story.png']) {
    try { await fs.copyFile(path.join('static', f), path.join(OUT, f)); }
    catch (e) { console.warn(`could not copy static/${f}: ${e.message}`); }
  }
  await fs.writeFile(path.join(OUT, 'CNAME'), SITE_DOMAIN + '\n');
  // copy local zodiac icons
  try {
    await fs.mkdir(path.join(OUT, 'icons'), { recursive: true });
    const icons = await fs.readdir(path.join('static', 'icons'));
    for (const f of icons) {
      await fs.copyFile(path.join('static', 'icons', f), path.join(OUT, 'icons', f));
    }
    const present = new Set(icons.map(f => f.toLowerCase()));
    const missing = SIGNS.filter(s => !present.has(`${s.slug}.svg`));
    if (missing.length) {
      console.warn(`  ! missing icon files in static/icons/ for: ${missing.map(s => `${s.he} (${s.slug}.svg)`).join(', ')}`);
      console.warn(`    these cells will fall back to the gold glyph until the SVGs are added (lowercase filenames).`);
    }
  } catch (e) { console.warn(`could not copy icons: ${e.message}`); }
}

async function buildLanding(recsBySign) {
  const fallback = (he) => `ההורוסקופ השבועי למזל ${he} מתעדכן כל בוקר. הצצה קצרה למה שמחכה לך השבוע — והגרסה האישית המלאה במפת הלידה שלך.`;

  const iconHtml = (s) => USE_IMAGE_ICONS
    ? `<img class="zico" src="icons/${s.slug}.svg" alt="מזל ${esc(s.he)}" loading="lazy" width="74" height="74" onerror="zfail(this,'${GLYPHS[s.he] || '✦'}')">`
    : `<span class="zbadge" aria-hidden="true">${GLYPHS[s.he] || '✦'}</span>`;

  const buttons = SIGNS.map(s => `
        <button class="zbtn" id="zb-${s.slug}" type="button" onclick="showZ('${s.slug}')" aria-haspopup="dialog">
          ${iconHtml(s)}
          <span class="zname">${esc(s.he)}</span>
        </button>`).join('');

  const data = SIGNS.map(s => {
    const rec = recsBySign[s.he];
    const summary = (rec && rec.weekly_summary) ? rec.weekly_summary : fallback(s.he);
    return `
        <div class="zdata" id="zd-${s.slug}" hidden>
          <h4>מזל ${esc(s.he)} · <span class="zh-week">השבוע</span></h4>
          <p>${esc(summary)} <a class="zmore" href="/horoscope/${s.slug}/">עוד...</a></p>
          <a class="btn btn-block" href="${esc(ctaSign(s.slug))}">צרי מפת לידה - עכשיו</a>
        </div>`;
  }).join('');

  const accordion = `<div class="zgrid">${buttons}\n      </div>\n      <div class="zdata-store" hidden>${data}\n      </div>\n      ${ZFAIL_JS}`;

  let tpl = await fs.readFile(path.join('static', 'index.html'), 'utf8');
  tpl = tpl.replace('<!--ZODIAC_ACCORDION-->', accordion);
  tpl = tpl.replace('<!--ANALYTICS-->', ANALYTICS_HEAD);
  tpl = tpl.replace('<!--COOKIE_BANNER-->', COOKIE_BANNER);
  await fs.writeFile(path.join(OUT, 'index.html'), tpl);
}

async function build404() {
  const html = head('הדף לא נמצא | Stars & Love', 'הדף שחיפשת לא נמצא.', `https://${SITE_DOMAIN}/404.html`) + `
<main class="wrap" style="text-align:center;padding:60px 0">
  <p class="eyebrow">Stars &amp; Love</p>
  <h1 style="font-size:clamp(3rem,12vw,5rem);color:var(--gold)">404</h1>
  <p class="sub">הדף שחיפשת לא נמצא — אבל הכוכבים עדיין כאן.</p>
  <div class="ctaband"><a class="btn" href="/">חזרה לדף הבית</a></div>
  <a class="back" href="/horoscope/">להורוסקופ השבועי</a>
</main>` + footer();
  await fs.writeFile(path.join(OUT, '404.html'), html);
}

async function buildSitemap() {
  const urls = [
    `https://${SITE_DOMAIN}/`,
    `https://${SITE_DOMAIN}/horoscope/`,
    ...SIGNS.map(s => `https://${SITE_DOMAIN}/horoscope/${s.slug}/`),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map(u => `  <url><loc>${u}</loc></url>`).join('\n') + `\n</urlset>\n`;
  await fs.writeFile(path.join(OUT, 'sitemap.xml'), xml);
  await fs.writeFile(path.join(OUT, 'robots.txt'),
    `User-agent: *\nAllow: /\nSitemap: https://${SITE_DOMAIN}/sitemap.xml\n`);
}

async function main() {
  console.log(`Building site for ${SITE_DOMAIN} (appId ${APP_ID}) — date ${todayIsrael()}`);
  await copyStatic();

  const skip = process.env.SKIP_FETCH === '1';
  const base44 = skip ? null : createClient({ appId: APP_ID });

  const weekSunday = currentWeekSundayIL();
  console.log(`Target week (Sunday, Israel time): ${weekSunday}`);

  await fs.mkdir(path.join(OUT, 'horoscope'), { recursive: true });
  const recsBySign = {};
  let ok = 0;
  let usedFallbackWeek = 0;
  for (const sign of SIGNS) {
    let rec = null;
    if (!skip) {
      try {
        // Prefer the record for the CURRENT week (Sunday) — matches the Base44 app,
        // so the static site shows the same week and ignores stray/older records.
        let recs = await base44.entities.WeeklyHoroscope.filter(
          { zodiac_sign: sign.he, week_start_date: weekSunday }, '-week_start_date', 1);
        rec = (recs && recs[0]) || null;

        if (!rec) {
          // Fallback: newest available record, but flag that it's not the current week.
          recs = await base44.entities.WeeklyHoroscope.filter(
            { zodiac_sign: sign.he }, '-week_start_date', 1);
          rec = (recs && recs[0]) || null;
          if (rec) {
            usedFallbackWeek++;
            console.warn(`  ~ ${sign.he}: no record for current week ${weekSunday}; falling back to ${rec.week_start_date}`);
          }
        }
      } catch (e) {
        console.error(`  ! fetch failed for ${sign.he}: ${e.message}`);
      }
    }
    recsBySign[sign.he] = rec;
    if (rec) ok++;
    else console.warn(`  ~ no record for ${sign.he} — built with fallback text`);

    const dir = path.join(OUT, 'horoscope', sign.slug);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'index.html'), signPage(sign, rec));
  }

  await fs.writeFile(path.join(OUT, 'horoscope', 'index.html'), indexPage());
  await buildLanding(recsBySign);
  await buildSitemap();
  await build404();

  console.log(`Done. ${ok}/12 signs had data (current week ${weekSunday}).`);
  if (usedFallbackWeek > 0) {
    console.warn(`${usedFallbackWeek}/12 signs had NO record for the current week and used an older week as fallback.`);
    console.warn('If this is unexpected, check that the Sunday automations ran and created this week\'s records.');
  }
  if (ok === 0) {
    console.warn('\nNo live data was fetched. The pages were still built with fallback text.');
    console.warn('Most likely the WeeklyHoroscope entity is not readable anonymously.');
    console.warn('See README-setup.md → "If no data comes through".');
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
