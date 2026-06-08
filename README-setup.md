# Stars & Love — אתר שיווק + הורוסקופ (מדריך הקמה)

המערכת הזו בונה כל בוקר אתר סטטי מהיר שכולל:
- דף נחיתה (`/`)
- מדף הורוסקופ עם 12 המזלות (`/horoscope/`)
- 12 דפי מזל נפרדים עם כתובת URL משלהם (`/horoscope/aries/` וכו') — כל אחד עם התוכן בתוך ה-HTML, כדי שגוגל יקרא אותו.

כל לחיצה על "צרי מפת לידה" מובילה לאפליקציה ב-Base44 (`https://starsandlove.com/PersonalChart`).

---

## איך זה עובד (התמונה הכללית)

1. האוטומציות שלך ב-Base44 מייצרות 12 הורוסקופים כל בוקר (4:00–4:55).
2. ב-04:00 UTC, GitHub Actions מריץ את `generate.mjs`.
3. הסקריפט מושך את 12 ההורוסקופים מ-Base44 ובונה את הדפים הסטטיים.
4. התוצאה מתפרסמת אוטומטית ל-GitHub Pages, על הדומיין שלך.

אין שרת לתחזק, והכול בחינם.

---

## הקמה — שלב אחר שלב

### 1. העלאת הקוד ל-GitHub
צור repo חדש (לדוגמה `starsandlove-site`) והעלה אליו את כל הקבצים מהתיקייה הזו.

### 2. הגדרת המשתנים
ב-GitHub: Settings → Secrets and variables → Actions.
- תחת **Variables** הוסף:
  - `SITE_DOMAIN` = `starsandlove.co.il`  (או תת-דומיין כמו `try.starsandlove.com`)
  - `APP_URL` = `https://starsandlove.com`
- תחת **Secrets** הוסף:
  - `BASE44_APP_ID` = `89192500`  ← אמת את המספר בכתובת של עורך Base44 (`base44.app/apps/<APP_ID>`)

### 3. הפעלת GitHub Pages
Settings → Pages → Source: **GitHub Actions**.

### 4. חיבור הדומיין
ב-Settings → Pages → Custom domain, הזן את הדומיין (`starsandlove.co.il`).
אצל ספק הדומיין שלך, הוסף את רשומות ה-DNS ש-GitHub מציג (בדרך כלL רשומת CNAME או A records).
הקובץ `CNAME` נוצר אוטומטית על ידי הסקריפט עם הדומיין שהגדרת.

### 5. הפעלה ראשונה
Actions → "Build and deploy site" → Run workflow.
אחרי כמה דקות האתר באוויר. מכאן זה רץ לבד כל בוקר.

---

## אם לא מגיעים נתונים (0/12 signs had live data)

האפליקציה שלך מוגדרת Public, אבל ייתכן שה-entity של ההורוסקופ אינו קריא אנונימית. שתי דרכים לתקן:

### דרך א' — הרשאת קריאה ציבורית ל-entity (הכי פשוט)
ב-Base44: Data → WeeklyHoroscope → הגדרות הרשאות → קביעת הרשאת **קריאה** ל-public/anyone.
זהו. הסקריפט האנונימי יקרא את הנתונים.

### דרך ב' — פונקציית JSON ייעודית (חושף פחות)
הוסף ב-Base44 פונקציית בקאנד שמחזירה רק את ההורוסקופים של היום:

```js
import { createClientFromRequest } from "npm:@base44/sdk";

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const signs = ["טלה","שור","תאומים","סרטן","אריה","בתולה","מאזניים","עקרב","קשת","גדי","דלי","דגים"];
  const out = {};
  for (const s of signs) {
    const recs = await base44.asServiceRole.entities.WeeklyHoroscope
      .filter({ zodiac_sign: s }, "-week_start_date", 1);
    out[s] = recs?.[0] || null;
  }
  return Response.json(out);
});
```

ואז ב-`generate.mjs` מחליפים את לולאת ה-fetch בקריאת fetch אחת ל-URL של הפונקציה. תגיד לי אם בחרת בדרך הזו ואעדכן לך את הסקריפט.

---

## הערות
- העדויות בדף הנחיתה (`static/index.html`) הן דוגמה — החלף בציטוטים אמיתיים לפני פרסום.
- ה-build רץ ב-04:00 UTC כדי להיות אחרי יצירת ההורוסקופים. אפשר לשנות את ה-cron בקובץ `.github/workflows/build.yml`.
