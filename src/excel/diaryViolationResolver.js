/**
 * Áp trạng thái Diary lên các phát sinh đã tính của một dòng chấm công.
 * Module chỉ cập nhật calculation/audit log, không đụng tới worksheet hay style.
 */
import {
  findDiaryForViolation,
  getDiaryReason,
  isDiaryPermitted,
} from "../services/attendance/diaryReasonService.js";

const VIOLATION_TYPES = [
  {
    key: "earlyIn",
    type: "Đi sớm",
    minutesField: "earlyInMinutes",
    validField: "validEarlyInMinutes",
  },
  {
    key: "late",
    type: "Đi trễ",
    minutesField: "lateMinutes",
  },
  {
    key: "early",
    type: "Về sớm",
    minutesField: "earlyMinutes",
    validField: "validEarlyMinutes",
  },
  {
    key: "overtime",
    type: "Tăng ca",
    minutesField: "overtimeMinutes",
    validField: "validOvertimeMinutes",
  },
];

// Hai flag giữ nguyên rule cũ để có thể bật lại mà không phục hồi code.
export const ENABLE_AUTO_COUNT_OVERTIME_OVER_60 = false;
export const ENABLE_AUTO_COUNT_EARLY_OVER_60 = false;

function shouldAutoCountOver60(violationKey, minutes) {
  if (minutes <= 60) return false;
  if (violationKey === "overtime") return ENABLE_AUTO_COUNT_OVERTIME_OVER_60;
  if (violationKey === "earlyIn") return ENABLE_AUTO_COUNT_EARLY_OVER_60;
  return false;
}

/** Nối ghi chú mới bằng `; ` mà không ghi đè hoặc tạo nội dung trùng. */
export function appendNote(currentNote, appendedNote) {
  if (!appendedNote) return currentNote || "";
  const normalizedAppendedNote = String(appendedNote).trim();
  const existingNotes = String(currentNote ?? "")
    .split(";")
    .map((note) => note.trim())
    .filter(Boolean);
  return existingNotes.includes(normalizedAppendedNote)
    ? existingNotes.join("; ")
    : [...existingNotes, normalizedAppendedNote].join("; ");
}

/**
 * Đối chiếu bốn loại phát sinh với Diary và cập nhật field tổng hợp, penalty, note.
 * Trả cờ tổng hợp để row processor đưa vào metadata preview/audit.
 */
export function applyDiaryViolations({
  calculation,
  dateValue,
  diaryLookup,
  diaryMatchLogs,
  effectiveEmployeeName,
  employeeCode,
  employeeGroup,
  employeeName,
  row,
}) {
  calculation.violationStatuses = {};
  // Đi trễ phát sinh luôn vào Tổng đi trễ; Diary Có phép chỉ có thể xóa tiền Phạt.
  calculation.totalLateMinutes = Number(calculation.lateMinutes) > 0
    ? Number(calculation.lateMinutes)
    : 0;
  calculation.validEarlyInMinutes = 0;
  calculation.validEarlyMinutes = 0;
  calculation.validOvertimeMinutes = 0;
  let diaryMatched = false;
  let diaryExempted = false;

  VIOLATION_TYPES.forEach((config) => {
    const minutes = Number(calculation[config.minutesField]) || 0;
    if (minutes <= 0) return;
    const isOfficeOvertime = employeeGroup === "VP" && config.key === "overtime";
    const isAutoTotalViolation = shouldAutoCountOver60(config.key, minutes);
    const isFullDayOvertime = config.key === "overtime" &&
      Boolean(calculation.isFullDayByMorningToAfternoon);

    const diaryMatch = findDiaryForViolation(diaryLookup, {
      date: dateValue,
      employeeCode,
      employeeName: effectiveEmployeeName,
      violationType: config.type,
    });
    const previousPenalty = calculation.penalty;
    let status = "missingDiary";

    if (diaryMatch) {
      diaryMatched = true;
      const permitted = isDiaryPermitted(diaryMatch.entry);
      status = permitted ? "permitted" : "notPermitted";
      if (permitted && !isOfficeOvertime) diaryExempted = true;
      const diaryReason = getDiaryReason(diaryMatch.entry);
      const diaryNotePrefix = isOfficeOvertime
        ? "Tăng ca VP không tính tổng"
        : isFullDayOvertime && !permitted
          ? "Tăng ca làm full ngày sáng - chiều"
          : `${config.type} ${permitted ? "có phép" : "không phép"}`;
      calculation.note = appendNote(
        calculation.note,
        diaryReason ? `${diaryNotePrefix}: ${diaryReason}` : diaryNotePrefix,
      );
    } else {
      calculation.note = appendNote(
        calculation.note,
        isOfficeOvertime
          ? "Tăng ca VP không tính tổng"
          : isFullDayOvertime
            ? "Tăng ca làm full ngày sáng - chiều"
            : isAutoTotalViolation
              ? `${config.type} trên 60 phút - tự tính tổng`
              : `${config.type} chưa có Diary`,
      );
    }

    calculation.violationStatuses[config.key] =
      isFullDayOvertime && !diaryMatch
        ? "fullDay"
        : isAutoTotalViolation && !diaryMatch
          ? "autoTotal"
          : status;
    if (config.key === "late") {
      if (status === "permitted") {
        calculation.penalty = 0;
      }
    } else if (config.key === "earlyIn") {
      // Đi sớm chỉ hiển thị/audit và lấy lý do Diary, không cộng Tổng đi sớm.
      calculation.validEarlyInMinutes = 0;
    } else if (config.key === "early") {
      // Về sớm phát sinh luôn vào Tổng về sớm, không phụ thuộc trạng thái Diary.
      calculation.validEarlyMinutes = minutes;
    } else if (isOfficeOvertime) {
      // VP vẫn hiển thị/tô màu Tăng ca theo ngày, nhưng tuyệt đối không cộng vào tổng.
      calculation.validOvertimeMinutes = 0;
    } else if (isAutoTotalViolation || isFullDayOvertime) {
      calculation[config.validField] = minutes;
    } else {
      calculation[config.validField] = status === "permitted" ? minutes : 0;
    }

    if (diaryMatch) {
      diaryMatchLogs.push({
        rowNumber: row + 1,
        employeeCode,
        employeeName,
        date: diaryMatch.entry.date,
        matchType: diaryMatch.matchType,
        violationType: config.type,
        reason: diaryMatch.entry.reason,
        permission: diaryMatch.entry.permission,
        creatorCode: diaryMatch.entry.creatorCode,
        creatorName: diaryMatch.entry.creatorName,
        attachmentCount:
          (diaryMatch.entry.attachedFiles ?? diaryMatch.entry.attachments)?.length ?? 0,
        hasAttachments: Boolean(
          (diaryMatch.entry.attachedFiles ?? diaryMatch.entry.attachments)?.length,
        ),
        previousPenalty,
        finalPenalty: calculation.penalty,
        exempted: status === "permitted" && !isOfficeOvertime,
      });
    }
  });

  return { diaryMatched, diaryExempted };
}
