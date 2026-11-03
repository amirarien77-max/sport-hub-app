/**
 * דוחות נוכחות ל־PDF — HTML בעברית RTL; ב־web נפתח חלון הדפסה (שמירה כ־PDF).
 * במצב native/דמו בלי window.print — מחזירים HTML לצפייה / העתקה.
 */
import { Platform } from 'react-native';
import { t, translateAttendanceMark } from '@/i18n';
import type { AttendanceMark, AttendanceRow, SessionEvent } from '@/types';

const MARK_HEX: Record<Exclude<AttendanceMark, null>, string> = {
  present: '#22c55e',
  excused: '#eab308',
  no_show: '#ef4444',
};

export type AttendancePdfRow = {
  playerName: string;
  mark: AttendanceMark;
  eventTitle: string;
  startsAt: string;
};

function formatDateHe(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('he-IL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function buildRows(
  attendance: AttendanceRow[],
  events: SessionEvent[],
  filter: { eventId?: string; fromIso?: string; toIso?: string },
): AttendancePdfRow[] {
  const eventById = new Map(events.map((e) => [e.id, e]));
  const fromMs = filter.fromIso ? Date.parse(filter.fromIso) : NaN;
  const toMs = filter.toIso ? Date.parse(filter.toIso) : NaN;

  return attendance
    .filter((row) => {
      if (filter.eventId && row.eventId !== filter.eventId) return false;
      const ev = eventById.get(row.eventId);
      if (!ev) return false;
      const t0 = Date.parse(ev.startsAt);
      if (Number.isFinite(fromMs) && t0 < fromMs) return false;
      if (Number.isFinite(toMs) && t0 > toMs + 24 * 60 * 60 * 1000 - 1) return false;
      return true;
    })
    .map((row) => {
      const ev = eventById.get(row.eventId)!;
      return {
        playerName: row.playerName,
        mark: row.mark,
        eventTitle: ev.title,
        startsAt: ev.startsAt,
      };
    })
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.playerName.localeCompare(b.playerName, 'he'));
}

export function buildAttendanceReportHtml(
  title: string,
  rows: AttendancePdfRow[],
): string {
  const bodyRows =
    rows.length === 0
      ? `<tr><td colspan="4">${t('attendance.pdfEmpty')}</td></tr>`
      : rows
          .map((r) => {
            const color = r.mark ? MARK_HEX[r.mark] : '#94a3b8';
            return `<tr>
  <td>${escapeHtml(r.eventTitle)}</td>
  <td>${escapeHtml(formatDateHe(r.startsAt))}</td>
  <td>${escapeHtml(r.playerName)}</td>
  <td style="color:${color};font-weight:700">${escapeHtml(translateAttendanceMark(r.mark))}</td>
</tr>`;
          })
          .join('\n');

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; direction: rtl; text-align: right; color: #0f172a; margin: 24px; }
  h1 { font-size: 22px; margin-bottom: 8px; }
  .meta { color: #64748b; margin-bottom: 16px; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: right; }
  th { background: #f1f5f9; font-weight: 800; }
  .legend span { display: inline-block; margin-left: 12px; font-weight: 700; }
</style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <div class="meta">${escapeHtml(new Date().toLocaleString('he-IL'))}</div>
  <div class="legend">
    <span style="color:#22c55e">${t('attendance.legendPresent')}</span>
    <span style="color:#eab308">${t('attendance.legendExcused')}</span>
    <span style="color:#ef4444">${t('attendance.legendNoShow')}</span>
  </div>
  <table>
    <thead>
      <tr>
        <th>אימון</th>
        <th>תאריך</th>
        <th>שחקן</th>
        <th>סטטוס</th>
      </tr>
    </thead>
    <tbody>
${bodyRows}
    </tbody>
  </table>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export type AttendancePdfResult =
  | { ok: true; html: string; printed: boolean; rowCount: number }
  | { ok: false; error: 'empty' | 'invalid_range' };

/** PDF for a single training session / event. */
export function exportAttendancePdfForSession(
  attendance: AttendanceRow[],
  events: SessionEvent[],
  eventId: string,
): AttendancePdfResult {
  const ev = events.find((e) => e.id === eventId);
  const rows = buildRows(attendance, events, { eventId });
  if (rows.length === 0) return { ok: false, error: 'empty' };
  const title = `${t('attendance.pdfSession')} — ${ev?.title ?? eventId}`;
  const html = buildAttendanceReportHtml(title, rows);
  return { ok: true, html, printed: openPrintWindow(html), rowCount: rows.length };
}

/** PDF for a date range (inclusive calendar days, local parse of YYYY-MM-DD). */
export function exportAttendancePdfForRange(
  attendance: AttendanceRow[],
  events: SessionEvent[],
  fromYmd: string,
  toYmd: string,
): AttendancePdfResult {
  const fromIso = `${fromYmd.trim()}T00:00:00`;
  const toIso = `${toYmd.trim()}T00:00:00`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromYmd.trim()) || !/^\d{4}-\d{2}-\d{2}$/.test(toYmd.trim())) {
    return { ok: false, error: 'invalid_range' };
  }
  if (Date.parse(fromIso) > Date.parse(toIso)) {
    return { ok: false, error: 'invalid_range' };
  }
  const rows = buildRows(attendance, events, { fromIso, toIso });
  if (rows.length === 0) return { ok: false, error: 'empty' };
  const title = `${t('attendance.pdfRange')} (${fromYmd} – ${toYmd})`;
  const html = buildAttendanceReportHtml(title, rows);
  return { ok: true, html, printed: openPrintWindow(html), rowCount: rows.length };
}

function openPrintWindow(html: string): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  try {
    const w = window.open('', '_blank', 'noopener,noreferrer');
    if (!w) return false;
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    // Defer print so layout paints.
    setTimeout(() => {
      try {
        w.print();
      } catch {
        /* ignore */
      }
    }, 250);
    return true;
  } catch {
    return false;
  }
}
