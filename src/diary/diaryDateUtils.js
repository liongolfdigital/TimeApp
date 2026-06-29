import { normalizeText } from "../employees/employeeModel.js";

function makeIsoDate(year, month, day) {
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year
    || candidate.getUTCMonth() + 1 !== month
    || candidate.getUTCDate() !== day
  ) {
    return "";
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function normalizeDiaryDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return makeIsoDate(
      value.getUTCFullYear(),
      value.getUTCMonth() + 1,
      value.getUTCDate(),
    );
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000);
    return makeIsoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }
  const text = normalizeText(value);
  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) return makeIsoDate(Number(match[1]), Number(match[2]), Number(match[3]));
  match = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  return match ? makeIsoDate(Number(match[3]), Number(match[2]), Number(match[1])) : "";
}

export function formatDiaryDate(value) {
  const normalized = normalizeDiaryDate(value);
  if (!normalized) return normalizeText(value);
  const [year, month, day] = normalized.split("-");
  return `${day}/${month}/${year}`;
}

export function parseDiaryDisplayDate(dateValue) {
  if (!dateValue) return 0;
  if (dateValue instanceof Date && !Number.isNaN(dateValue.getTime())) {
    return dateValue.getTime();
  }
  const text = String(dateValue).trim();
  let match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    const normalized = makeIsoDate(Number(match[3]), Number(match[2]), Number(match[1]));
    return normalized ? Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1])) : 0;
  }
  match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) {
    const normalized = makeIsoDate(Number(match[1]), Number(match[2]), Number(match[3]));
    return normalized ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : 0;
  }
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function normalizeDiaryTimestamp(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

export function formatDiaryDateTime(value) {
  const normalized = normalizeDiaryTimestamp(value);
  if (!normalized) return "—";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(normalized));
}

export function getDiaryWeekday(value) {
  const normalized = normalizeDiaryDate(value);
  if (!normalized) return "";
  const [year, month, day] = normalized.split("-").map(Number);
  return ["CN", "T2", "T3", "T4", "T5", "T6", "T7"][
    new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  ];
}

function getDiaryTieBreakTimestamp(entry) {
  const updatedAt = normalizeDiaryTimestamp(entry?.updatedAt ?? entry?.updatedDate);
  const createdAt = normalizeDiaryTimestamp(entry?.createdAt ?? entry?.createdDate);
  return new Date(updatedAt || createdAt || 0).getTime() || 0;
}

export function sortDiaryEntries(entries) {
  return entries
    .map((entry, originalIndex) => ({ entry, originalIndex }))
    .sort((first, second) => {
      const dateDifference = parseDiaryDisplayDate(second.entry?.date)
        - parseDiaryDisplayDate(first.entry?.date);
      if (dateDifference) return dateDifference;
      const timestampDifference = getDiaryTieBreakTimestamp(second.entry)
        - getDiaryTieBreakTimestamp(first.entry);
      return timestampDifference || first.originalIndex - second.originalIndex;
    })
    .map(({ entry }) => entry);
}
