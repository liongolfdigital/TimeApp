import {
  findDiaryForViolation,
  getDiaryReason,
  isDiaryPermitted,
} from "../services/attendance/diaryReasonService.js";

const LONG_OFF_VIOLATION_TYPE = "OFF > 2 ngày";

function getDayNumber(dayKey) {
  const [year, month, day] = String(dayKey ?? "").split("-").map(Number);
  if (!year || !month || !day) return null;
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

function findLongOffSequences(rowResults) {
  const rowsByEmployee = new Map();
  rowResults.forEach((rowResult) => {
    if (!rowResult.isOff || !rowResult.employeeKey || !rowResult.dayKey) return;
    const dayNumber = getDayNumber(rowResult.dayKey);
    if (dayNumber === null) return;
    rowsByEmployee.set(rowResult.employeeKey, [
      ...(rowsByEmployee.get(rowResult.employeeKey) ?? []),
      { ...rowResult, dayNumber },
    ]);
  });
  const longOffRows = new Map();
  const markSequence = (sequence) => {
    if (sequence.length < 2) return;
    sequence.forEach((item) => {
      longOffRows.set(item.row, { sequenceLength: sequence.length });
    });
  };
  rowsByEmployee.forEach((items) => {
    const sortedItems = [...items].sort((first, second) =>
      first.dayNumber === second.dayNumber
        ? first.row - second.row
        : first.dayNumber - second.dayNumber,
    );
    let sequence = [];
    let previousDay = null;
    sortedItems.forEach((item) => {
      if (!sequence.length || item.dayNumber === previousDay + 1) {
        sequence.push(item);
      } else if (item.dayNumber !== previousDay) {
        markSequence(sequence);
        sequence = [item];
      } else {
        sequence.push(item);
      }
      previousDay = item.dayNumber;
    });
    markSequence(sequence);
  });
  return longOffRows;
}

function getLongOffDiaryNote(diaryMatch) {
  if (!diaryMatch) {
    return {
      status: "missingDiary",
      note: `${LONG_OFF_VIOLATION_TYPE} chưa có Diary`,
    };
  }
  const permitted = isDiaryPermitted(diaryMatch.entry);
  return {
    status: permitted ? "permitted" : "notPermitted",
    note: `${LONG_OFF_VIOLATION_TYPE} ${permitted ? "có phép" : "không phép"}: ${getDiaryReason(diaryMatch.entry)}`,
  };
}

export function applyLongOffWarnings(
  rowResults,
  diaryLookup,
  diaryMatchLogs,
  appendNote,
) {
  const longOffRows = findLongOffSequences(rowResults);
  rowResults.forEach((rowResult) => {
    const longOffMeta = longOffRows.get(rowResult.row);
    if (!longOffMeta) return;
    const diaryMatch = findDiaryForViolation(diaryLookup, {
      date: rowResult.dateValue,
      employeeCode: rowResult.employeeCode,
      employeeName: rowResult.effectiveEmployeeName,
      violationType: LONG_OFF_VIOLATION_TYPE,
    });
    const warning = getLongOffDiaryNote(diaryMatch);
    rowResult.longOff = true;
    rowResult.longOffStatus = warning.status;
    rowResult.offSequenceLength = longOffMeta.sequenceLength;
    rowResult.calculation.note = appendNote(rowResult.calculation.note, warning.note);
    if (!diaryMatch) return;
    rowResult.diaryMatched = true;
    if (warning.status === "permitted") rowResult.diaryExempted = true;
    diaryMatchLogs.push({
      rowNumber: rowResult.row + 1,
      employeeCode: rowResult.employeeCode,
      employeeName: rowResult.employeeName,
      date: diaryMatch.entry.date,
      matchType: diaryMatch.matchType,
      violationType: LONG_OFF_VIOLATION_TYPE,
      reason: diaryMatch.entry.reason,
      permission: diaryMatch.entry.permission,
      creatorCode: diaryMatch.entry.creatorCode,
      creatorName: diaryMatch.entry.creatorName,
      attachmentCount: (diaryMatch.entry.attachedFiles ?? diaryMatch.entry.attachments)?.length ?? 0,
      hasAttachments: Boolean(
        (diaryMatch.entry.attachedFiles ?? diaryMatch.entry.attachments)?.length,
      ),
      previousPenalty: rowResult.calculation.penalty,
      finalPenalty: rowResult.calculation.penalty,
      exempted: warning.status === "permitted",
    });
  });
}
