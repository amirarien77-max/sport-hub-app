/** Hebrew UI copy for Basketball Hub. Invite code MAC-U16-2026 stays untranslated. */

export const he = {
  tabs: {
    schedule: 'לו״ז',
    attendance: 'נוכחות',
    health: 'בריאות',
    plays: 'תרגילים',
    profile: 'פרופיל',
  },

  roles: {
    admin: 'מנהל',
    head_coach: 'מאמן ראשי',
    assistant_coach: 'עוזר מאמן',
    fitness_coach: 'מאמן כושר',
    physio: 'פיזיותרפיסט',
    player: 'שחקן',
    parent: 'הורה',
  },

  consent: {
    active: 'פעיל',
    pending_parental_consent: 'ממתין לאישור הורה',
  },

  mode: {
    demo: 'דמו',
    supabase: 'supabase',
  },

  rsvp: {
    attending: 'מגיע',
    not_attending: 'לא מגיע',
  },

  attendanceMark: {
    present: 'נוכח',
    excused: 'מוצדק',
    no_show: 'לא הגיע',
    unmarked: 'לא סומן',
  },

  painSeverity: {
    soreness: 'כאב קל / נוקשות',
    disabling: 'כאב מגביל',
  },

  suggestionStatus: {
    pending: 'ממתין',
    approved: 'אושר',
    rejected: 'נדחה',
  },

  bodyRegions: {
    foot: 'כף רגל',
    lower_leg: 'שוק',
    knee: 'ברך',
    thigh: 'ירך',
    hip: 'מפרק ירך',
    back: 'גב',
    shoulder: 'כתף',
    arm: 'זרוע',
  },

  bodySubRegions: {
    Heel: 'עקב',
    Arch: 'קשת',
    Toes: 'אצבעות',
    Achilles: 'אכילס',
    'Shin (anterior)': 'שוק (קדמי)',
    Calf: 'תאומים',
    Patella: 'פיקה',
    Medial: 'פנימי',
    Lateral: 'חיצוני',
    Quad: 'ארבע ראשי',
    Hamstring: 'המסטרינג',
    Adductor: 'מקרבים',
    Flexor: 'כופף',
    Glute: 'עכוז',
    'Lower back': 'גב תחתון',
    'Upper back': 'גב עליון',
    Anterior: 'קדמי',
    Posterior: 'אחורי',
    Elbow: 'מרפק',
    Wrist: 'שורש כף יד',
  },

  absenceReasons: {
    Sick: 'מחלה',
    'School exam': 'מבחן בבית ספר',
    Injury: 'פציעה',
    'Family event': 'אירוע משפחתי',
    Travel: 'נסיעה',
    Other: 'אחר',
  },

  auth: {
    title: 'התחברות',
    subtitle:
      'השתמשו באימייל של המועדון כדי להתחבר לפרויקט Supabase החי. אחרי ההתחברות, הזינו את קוד ההזמנה.',
    email: 'אימייל',
    password: 'סיסמה',
    emailPlaceholder: 'you@club.com',
    signIn: 'התחברות',
    createAccount: 'יצירת חשבון',
  },

  invite: {
    subtitle: 'הזינו את קוד ההזמנה של המועדון כדי להצטרף. הצבעים יוחלו ברגע שהקוד תקין.',
    continue: 'המשך',
    demoCode: 'קוד דמו: {code}',
    afterSeed: 'אחרי seed.sql, נסו את הקוד {code}.',
  },

  profileSetup: {
    title: 'הצטרפות ל־{name}',
    subtitle: 'שחקנים מתחת לגיל 13 צריכים טלפון של הורה ונשארים מחוץ לפיד הקבוצה עד אישור ב-SMS.',
    fullName: 'שם מלא',
    role: 'תפקיד',
    dob: 'תאריך לידה (YYYY-MM-DD)',
    parentPhone: 'טלפון הורה (חובה מתחת לגיל 13)',
    parentPhonePlaceholder: '+972...',
    enterHub: 'כניסה למרכז',
    quickPersonas: 'דמויות דמו מהירות',
  },

  schedule: {
    title: 'לו״ז',
    subtitle: 'אישור כפול: RSVP של שחקן והורה. התנגשויות מסומנות בצהוב.',
    urgent: 'דחוף',
    acknowledge: 'אני מאשר/ת',
    attending: 'מגיע',
    notAttending: 'לא מגיע',
    conflict: 'התנגשות',
    player: 'שחקן',
    parent: 'הורה',
    carpool: 'טרמפים',
    seatsTaken: '{taken}/{available} מקומות תפוסים',
    claimSeat: 'שמירת מקום',
    whyAbsent: 'למה לא תוכלו להגיע?',
    emptyEvents: 'אין אירועים עדיין. אחרי seed + migration 006 יופיעו אימון ומשחק לדוגמה.',
    emptyCarpool: 'אין הצעות טרמפ כרגע.',
  },

  attendance: {
    title: 'נוכחות',
    playersOnly:
      'רק מאמנים מסמנים נוכחות במגרש. עברו לדמות מאמן ממסך הפרופיל.',
    courtGrid: 'רשת מגרש',
    subtitle: 'לחיצה מחליפה: נוכח ← מוצדק ← לא הגיע. נעילה שולחת הודעה להורים על אי-הגעה.',
    lockNotify: 'נעילה ושליחה',
    lockedTitle: 'הנוכחות ננעלה',
    lockedNoShows: 'הנוכחות ננעלה. אין אי-הגעות.',
    lockedWithNames: 'ננעל. נשלחה הודעה להורים של: {names}',
  },

  health: {
    title: 'מוכנות וכאב',
    subtitle: 'RPE עם כפתורים גדולים 1–10 (בלי סליידרים). לחצו על אזור בגוף כדי להתקרב לתת-אזורים.',
    coachBoard: 'לוח סיכון למאמן',
    access: 'גישה: {access}',
    inheritedWrite: ' · המאמן הראשי קיבל הרשאת כתיבה (אין כושר/פיזיו בצוות)',
    todaysRpe: 'RPE להיום',
    sleep: 'שינה (שעות)',
    water: 'מים (ליטרים)',
    saveReadiness: 'שמירת מוכנות',
    painMap: 'מפת כאב',
    backToBody: 'חזרה לגוף',
    logPain: 'רישום כאב',
    lastReady: 'RPE אחרון {rpe} · שינה {sleep}ש׳ · מים {water}ל׳',
    accessWrite: 'כתיבה',
    accessRead: 'קריאה',
    accessNone: 'אין',
  },

  plays: {
    title: 'לוח טקטי',
    subtitle: 'שיבוצי עמדות, שאלות פעולה, ומתג הצעות לכל תרגיל.',
    feedLocked: 'פיד הקבוצה נעול עד לאישור SMS של ההורה.',
    feedOpen: 'הפיד פתוח · קטינים יכולים רק להגיב באימוג׳י (נאכף בבלוק הפיד).',
    pinned: 'מוצמד: {message}',
    courtSketch: 'סקיצת מגרש (מקום שמור)',
    suggestionsOn: 'הצעות פעילות',
    suggestionsOff: 'הצעות כבויות',
    assignments: 'שיבוצים',
    pos: 'עמדה {pos} · {name}',
    answerPlaceholder: 'הסבירו את הפעולה שלכם...',
    saveAnswer: 'שמירת תשובה',
    answer: 'תשובה: {answer}',
    waiting: '— ממתין —',
    suggestChange: 'הצעת שינוי',
    suggestionPlaceholder: 'רעיון לחיתוך / מרווח חלופי',
    sendSuggestion: 'שליחת הצעה',
    suggestionsDisabled: 'המאמן השבית הצעות לתרגיל הזה.',
    suggestionInbox: 'תיבת הצעות',
    approve: 'אישור',
    reject: 'דחייה',
  },

  profile: {
    title: 'פרופיל',
    clubTeam: 'מועדון: {club} · קבוצה: {team}',
    consentMode: 'הסכמה: {consent} · מצב: {mode}',
    switchDemoRole: 'החלפת תפקיד דמו',
    signOut: 'התנתקות',
  },

  errors: {
    demoAuthDisabled: 'התחברות חיה כבויה במצב דמו.',
    emailPasswordRequired: 'נדרשים אימייל וסיסמה.',
    weakPassword: 'השתמשו באימייל תקין ובסיסמה של לפחות 6 תווים.',
    invalidInviteDemo: 'קוד הזמנה לא תקין. נסו MAC-U16-2026 במצב דמו.',
    signInBeforeInvite: 'התחברו לפני הזנת קוד הזמנה.',
    invalidInviteLive:
      'קוד הזמנה לא תקין. הריצו את seed.sql כדי ש־MAC-U16-2026 יהיה קיים, או השתמשו בקוד המועדון שלכם.',
    redeemInviteFirst: 'הזינו קוד הזמנה קודם.',
    nameRequired: 'שם הוא שדה חובה.',
    under13Phone: 'שחקנים מתחת לגיל 13 חייבים לספק טלפון של הורה.',
    signInBeforeProfile: 'התחברו לפני השלמת הפרופיל.',
    useSessionOutsideProvider: 'useSession חייב להיות בתוך SessionProvider',
    useThemeOutsideProvider: 'useTheme חייב להיות בתוך ThemeProvider',
  },

  demo: {
    brandDefault: 'מרכז הכדורסל',
    clubName: 'מכבי נוער',
    teamName: 'נערים U16',
    eventPractice: 'אימון — פיק אנד רול',
    eventGame: 'משחק מול הרצליה',
    locationHallA: 'אולם א׳',
    locationAway: 'אולם חוץ',
    playTitle: 'סט הורן — חיתוך מצד חלש',
    assignQ1: 'מה אתם עושים אחרי שהמסך מוצב?',
    assignQ2: 'לאן אתם חותכים אם המגן עובר מתחת?',
    banner: 'האימון הועבר לאולם ב׳ מחר — להגיע 15 דקות מוקדם.',
    demoRoleName: 'דמו {role}',
  },
} as const;

export type HeStrings = typeof he;
