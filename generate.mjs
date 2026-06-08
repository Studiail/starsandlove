import { createClient } from '@base44/sdk';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const APP_ID      = process.env.BASE44_APP_ID || '89192500';
const SITE_DOMAIN = process.env.SITE_DOMAIN   || 'starsandlove.co.il';
const APP_URL     = (process.env.APP_URL      || 'https://starsandlove.com').replace(/\/$/, '');
const CTA_URL     = `${APP_URL}/PersonalChart`;
const OUT         = 'public';

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

// Icons are hosted locally in static/icons/<slug>.png (single source, no external dependency).
// Set USE_IMAGE_ICONS=0 to fall back to the gold unicode glyphs.
const USE_IMAGE_ICONS = process.env.USE_IMAGE_ICONS !== '0';

const esc = (s = '') => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const todayIsrael = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());

const fmtDate = (s) => {
  if (!s) return '';
  try { return new Date(s).toLocaleDateString('he-IL', { day: 'numeric', month: 'long' }); }
  catch { return s; }
};

const CSS = `
@font-face{font-family:"Teom";src:url("/teom.woff2") format("woff2"),url("/teom.otf") format("opentype");font-weight:400 900;font-display:swap}
:root{--navy:#0a1733;--navy-2:#0d1d40;--navy-3:#122651;--gold:#e0a83a;--gold-soft:#eac26f;--cream:#f4ead7;--cream-dim:#cbbfa6;--serif:"Teom","Frank Ruhl Libre",Georgia,serif;--sans:"Heebo",system-ui,sans-serif}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:var(--sans);background:var(--navy);color:var(--cream);line-height:1.75;-webkit-font-smoothing:antialiased}
.wrap{max-width:880px;margin:0 auto;padding:0 22px}
a{color:inherit;text-decoration:none}
header{padding:22px 0;text-align:center}
header img{height:46px}
h1{font-family:var(--serif);font-weight:900;font-size:clamp(1.9rem,5vw,3rem);text-align:center;margin:18px 0 6px}
.sub{text-align:center;color:var(--cream-dim);font-weight:300;margin-bottom:30px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:14px;margin-bottom:40px}
.sign{display:block;background:var(--navy-3);border:1px solid rgba(224,168,58,.18);border-radius:16px;padding:18px 10px;text-align:center;transition:transform .15s,border-color .15s}
.sign:hover{transform:translateY(-3px);border-color:var(--gold)}
.sign img{width:56px;height:56px;border-radius:50%;margin-bottom:8px}
.sign .name{font-family:var(--serif);font-weight:700;font-size:1.15rem;color:var(--cream)}
.card{background:var(--navy-3);border:1px solid rgba(224,168,58,.2);border-radius:18px;padding:26px;margin-bottom:18px}
.card h2{font-family:var(--serif);font-weight:700;color:var(--gold-soft);font-size:1.2rem;margin-bottom:10px}
.card p{color:var(--cream);font-weight:300}
.day{background:var(--navy-2);border-radius:14px;padding:18px 20px;margin-bottom:12px;border-right:3px solid rgba(224,168,58,.4)}
.day .top{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:6px}
.day .name{font-family:var(--serif);font-weight:700;color:var(--cream)}
.day .focus{font-size:.85rem;color:var(--gold-soft)}
.day .date{font-size:.85rem;color:var(--cream-dim)}
.day p{font-size:.97rem;color:var(--cream)}
.energy{margin-top:10px;font-size:.82rem;color:var(--cream-dim)}
.energy b{color:var(--gold-soft);font-weight:500}
.cta{background:var(--navy-2);border-radius:20px;padding:36px 26px;text-align:center;margin:34px 0}
.cta h3{font-family:var(--serif);font-weight:700;font-size:1.5rem;color:var(--cream);margin-bottom:8px}
.cta p{color:var(--cream-dim);font-weight:300;margin-bottom:22px}
.btn{display:inline-block;background:var(--gold);color:#3a2606;font-weight:700;font-size:1.1rem;padding:16px 38px;border-radius:999px;transition:transform .15s,background .15s}
.btn:hover{transform:translateY(-2px);background:var(--gold-soft)}
.back{display:block;text-align:center;color:var(--cream-dim);margin:24px 0;font-size:.92rem}
footer{background:var(--navy-2);padding:30px 0;text-align:center;margin-top:30px}
footer .links{display:flex;gap:18px;justify-content:center;flex-wrap:wrap;margin-bottom:10px}
footer a{color:var(--cream-dim);font-size:.88rem}
footer .copy{color:rgba(203,191,166,.5);font-size:.8rem}
`;

const head = (title, desc, canonical) => `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${canonical}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:locale" content="he_IL">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@500;700;900&family=Heebo:wght@300;400;500;700&display=swap" rel="stylesheet">
<style>${CSS}</style>
</head>
<body>`;

const footer = () => `
<footer><div class="wrap">
  <div class="links">
    <a href="/">דף הבית</a>
    <a href="/horoscope/">הורוסקופ שבועי</a>
    <a href="${APP_URL}/About">אודות</a>
    <a href="${APP_URL}/Privacy">פרטיות</a>
  </div>
  <p class="copy">© Stars &amp; Love · כל הזכויות שמורות</p>
</div></footer>
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

  return head(title, desc, canonical) + `
<header><div class="wrap"><a href="/"><img src="/logo.png" alt="Stars & Love"></a></div></header>
<main class="wrap">
  <img src="/icons/${sign.slug}.png" alt="מזל ${esc(sign.he)}" width="96" height="96" style="display:block;width:96px;height:96px;border-radius:50%;margin:8px auto 4px">
  <h1>הורוסקופ שבועי · מזל ${esc(sign.he)}</h1>
  <p class="sub">${rec?.week_start_date ? `${esc(fmtDate(rec.week_start_date))} – ${esc(fmtDate(rec.week_end_date))}` : 'השבוע'}</p>

  <div class="card"><h2>סיכום השבוע</h2><p>${esc(summary)}</p></div>
  ${rec?.planetary_highlights ? `<div class="card"><h2>הדגשים הפלנטריים</h2><p>${esc(rec.planetary_highlights)}</p></div>` : ''}
  ${rec?.lucky_day ? `<div class="card"><h2>היום המוצלח</h2><p>${esc(rec.lucky_day)}</p></div>` : ''}

  ${daysHtml ? `<h2 style="font-family:var(--serif);text-align:center;color:var(--cream);margin:28px 0 16px">הורוסקופ יומי</h2>${daysHtml}` : ''}

  <div class="cta">
    <h3>רוצה את ההורוסקופ האישי שלך?</h3>
    <p>לא רק לפי מזל — לפי מפת הלידה המלאה שלך. בחינם.</p>
    <a class="btn" href="${CTA_URL}">צרי את מפת הלידה שלך — חינם</a>
  </div>

  <a class="back" href="/horoscope/">← לכל המזלות</a>
</main>` + footer();
}

function indexPage() {
  const title = 'הורוסקופ שבועי לכל המזלות | Stars & Love';
  const desc = 'הורוסקופ שבועי מעודכן לכל 12 המזלות — אהבה, קריירה ויחסים. מבוסס AI ו-20 שנות ידע אסטרולוגי.';
  const canonical = `https://${SITE_DOMAIN}/horoscope/`;
  const grid = SIGNS.map(s =>
    `<a class="sign" href="/horoscope/${s.slug}/"><img src="/icons/${s.slug}.png" alt="מזל ${esc(s.he)}" loading="lazy" width="56" height="56"><span class="name">${esc(s.he)}</span></a>`).join('');
  return head(title, desc, canonical) + `
<header><div class="wrap"><a href="/"><img src="/logo.png" alt="Stars & Love"></a></div></header>
<main class="wrap">
  <h1>הורוסקופ שבועי</h1>
  <p class="sub">בחרי מזל וגלי מה מחכה לך השבוע</p>
  <div class="grid">${grid}</div>
  <div class="cta">
    <h3>מעבר להורוסקופ — גלי מי את באמת</h3>
    <p>מפת לידה אישית מלאה, בחינם.</p>
    <a class="btn" href="${CTA_URL}">צרי את מפת הלידה שלך — חינם</a>
  </div>
</main>` + footer();
}

async function copyStatic() {
  await fs.mkdir(OUT, { recursive: true });
  for (const f of ['logo.png', 'teom.woff2', 'teom.otf']) {
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
  } catch (e) { console.warn(`could not copy icons: ${e.message}`); }
}

async function buildLanding(recsBySign) {
  const fallback = (he) => `ההורוסקופ השבועי למזל ${he} מתעדכן כל בוקר. הצצה קצרה למה שמחכה לך השבוע — והגרסה האישית המלאה במפת הלידה שלך.`;

  const iconHtml = (s) => USE_IMAGE_ICONS
    ? `<img class="zico" src="icons/${s.slug}.png" alt="מזל ${esc(s.he)}" loading="lazy" width="74" height="74">`
    : `<span class="zbadge" aria-hidden="true">${GLYPHS[s.he] || '✦'}</span>`;

  const buttons = SIGNS.map(s => `
        <button class="zbtn" id="zb-${s.slug}" type="button" onclick="showZ('${s.slug}')" aria-controls="z-${s.slug}">
          ${iconHtml(s)}
          <span class="zname">${esc(s.he)}</span>
        </button>`).join('');

  const panels = SIGNS.map(s => {
    const rec = recsBySign[s.he];
    const summary = (rec && rec.weekly_summary) ? rec.weekly_summary : fallback(s.he);
    return `
        <div class="zpanel" id="z-${s.slug}" hidden>
          <h4>מזל ${esc(s.he)} · השבוע</h4>
          <p>${esc(summary)}</p>
          <div class="zactions">
            <a class="zmore" href="/horoscope/${s.slug}/">עוד...</a>
            <a class="btn btn-sm" href="${CTA_URL}">צרי מפת לידה — עכשיו</a>
          </div>
        </div>`;
  }).join('');

  const accordion = `<div class="zgrid">${buttons}\n      </div>\n      <div class="zpanels">${panels}\n      </div>`;

  let tpl = await fs.readFile(path.join('static', 'index.html'), 'utf8');
  tpl = tpl.replace('<!--ZODIAC_ACCORDION-->', accordion);
  await fs.writeFile(path.join(OUT, 'index.html'), tpl);
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

  await fs.mkdir(path.join(OUT, 'horoscope'), { recursive: true });
  const recsBySign = {};
  let ok = 0;
  for (const sign of SIGNS) {
    let rec = null;
    if (!skip) {
      try {
        const recs = await base44.entities.WeeklyHoroscope.filter(
          { zodiac_sign: sign.he }, '-week_start_date', 1);
        rec = (recs && recs[0]) || null;
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

  console.log(`Done. ${ok}/12 signs had live data.`);
  if (ok === 0) {
    console.warn('\nNo live data was fetched. The pages were still built with fallback text.');
    console.warn('Most likely the WeeklyHoroscope entity is not readable anonymously.');
    console.warn('See README-setup.md → "If no data comes through".');
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
