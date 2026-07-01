/**
 * Áp trạng thái Diary lên các phát sinh đã tính của một dòng chấm công.
 * Module chỉ cập nhật calculation/audit log, không đụng tới worksheet hay style.
 */
import {
  findDiaryForViolation,
  getDiaryReason,
  isDiaryPermitted,
} from "../services/attendance/diaryReasonService.js";
import { normalizeDiaryViolationTypes } from "../diary/diaryNormalizers.js";

const OTHER_DEDUCTION_TYPE = "Khác";
const OTHER_DEDUCTION_SOURCE_KEYS = new Set(["late", "early"]);

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

// Hai flag giữ nguyên rule cũ cho Đi sớm; riêng Tăng ca tuyệt đối không tự cộng tổng.
export const ENABLE_AUTO_COUNT_OVERTIME_OVER_60 = false;
export const ENABLE_AUTO_COUNT_EARLY_OVER_60 = false;

function shouldAutoCountOver60(violationKey, minutes) {
  if (minutes <= 60) return false;
  if (violationKey === "overtime") return false;
  if (violationKey === "earlyIn") return ENABLE_AUTO_COUNT_EARLY_OVER_60;
  return false;
}

function hasDiaryType(entry, type) {
  return normalizeDiaryViolationTypes(entry?.noteTypes ?? entry?.violationTypes).includes(type);
}

function findOtherDeductionDiaryMatch(diaryLookup, {
  date,
  employeeCode,
  employeeName,
} = {}) {
  const match = findDiaryForViolation(diaryLookup, {
    date,
    employeeCode,
    employeeName,
    violationType: OTHER_DEDUCTION_TYPE,
  });
  // findDiaryForViolation có fallback dòng không phân loại; Trừ khác chỉ được áp dụng
  // khi Diary thật sự tick Loại ghi chú = Khác.
  return match && hasDiaryType(match.entry, OTHER_DEDUCTION_TYPE) ? match : null;
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
  // Đi trễ phát sinh luôn vào Tổng đi trễ; riêng Diary loại Khác được chuyển sang Trừ khác.
  calculation.totalLateMinutes = Number(calculation.lateMinutes) > 0
    ? Number(calculation.lateMinutes)
    : 0;
  calculation.validEarlyInMinutes = 0;
  calculation.validEarlyMinutes = 0;
  calculation.validOvertimeMinutes = 0;
  calculation.otherDeductionMinutes = 0;
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
    const otherDeductionMatch = OTHER_DEDUCTION_SOURCE_KEYS.has(config.key)
      ? findOtherDeductionDiaryMatch(diaryLookup, {
          date: dateValue,
          employeeCode,
          employeeName: effectiveEmployeeName,
        })
      : null;
    const isOtherDeduction = Boolean(otherDeductionMatch);
    const effectiveDiaryMatch = diaryMatch ?? otherDeductionMatch;
    const previousPenalty = calculation.penalty;
    let status = "missingDiary";
    let hasTypedDiaryMatch = false;

    if (effectiveDiaryMatch) {
      diaryMatched = true;
      const permitted = isDiaryPermitted(effectiveDiaryMatch.entry);
      hasTypedDiaryMatch = isOtherDeduction
        ? true
        : hasDiaryType(effectiveDiaryMatch.entry, config.type);
      status = permitted ? "permitted" : "notPermitted";
      if (permitted && !isOfficeOvertime && !isOtherDeduction) diaryExempted = true;
      const diaryReason = getDiaryReason(effectiveDiaryMatch.entry);
      const diaryNotePrefix = isOtherDeduction
        ? `Trừ khác (${config.type})`
        : isOfficeOvertime
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
            : config.key === "overtime"
              ? "Tăng ca chưa có Diary phép - không cộng tổng"
              : isAutoTotalViolation
              ? `${config.type} trên 60 phút - tự tính tổng`
              : `${config.type} chưa có Diary`,
      );
    }

    calculation.violationStatuses[config.key] = isOtherDeduction
      ? "otherDeduction"
      : isFullDayOvertime && !diaryMatch
        ? "fullDay"
        : isAutoTotalViolation && !diaryMatch
          ? "autoTotal"
          : status;

    if (config.key === "late") {
      if (isOtherDeduction) {
        calculation.otherDeductionMinutes += minutes;
        // Đã chuyển sang Trừ khác thì không còn ghi ở cột Đi trễ và không cộng/phạt đi trễ.
        calculation.lateMinutes = 0;
        calculation.totalLateMinutes = 0;
        calculation.penalty = 0;
      } else if (status === "permitted") {
        calculation.penalty = 0;
      }
    } else if (config.key === "earlyIn") {
      // Đi sớm có phép phải được cộng vào Summary; không phép/chưa có Diary chỉ hiển thị audit.
      calculation.validEarlyInMinutes = status === "permitted" && hasTypedDiaryMatch ? minutes : 0;
    } else if (config.key === "early") {
      if (isOtherDeduction) {
        calculation.otherDeductionMinutes += minutes;
        // Đã chuyển sang Trừ khác thì không còn ghi ở cột Về sớm và không cộng tổng về sớm.
        calculation.earlyMinutes = 0;
        calculation.validEarlyMinutes = 0;
      } else {
        // Về sớm phát sinh luôn vào Tổng về sớm, không phụ thuộc trạng thái Diary.
        calculation.validEarlyMinutes = minutes;
      }
    } else if (isOfficeOvertime) {
      // VP vẫn hiển thị/tô màu Tăng ca theo ngày, nhưng tuyệt đối không cộng vào tổng.
      calculation.validOvertimeMinutes = 0;
    } else if (config.key === "overtime") {
      // Tắt toàn bộ cơ chế tự cộng tổng tăng ca. Chỉ Diary loại Tăng ca + Có phép mới được cộng.
      calculation.validOvertimeMinutes = status === "permitted" && hasTypedDiaryMatch ? minutes : 0;
    } else if (isAutoTotalViolation) {
      calculation[config.validField] = minutes;
    } else {
      calculation[config.validField] = status === "permitted" ? minutes : 0;
    }

    if (effectiveDiaryMatch) {
      diaryMatchLogs.push({
        rowNumber: row + 1,
        employeeCode,
        employeeName,
        date: effectiveDiaryMatch.entry.date,
        matchType: effectiveDiaryMatch.matchType,
        violationType: isOtherDeduction ? `Khác (${config.type})` : config.type,
        reason: effectiveDiaryMatch.entry.reason,
        permission: effectiveDiaryMatch.entry.permission,
        creatorCode: effectiveDiaryMatch.entry.creatorCode,
        creatorName: effectiveDiaryMatch.entry.creatorName,
        attachmentCount:
          (effectiveDiaryMatch.entry.attachedFiles ?? effectiveDiaryMatch.entry.attachments)?.length ?? 0,
        hasAttachments: Boolean(
          (effectiveDiaryMatch.entry.attachedFiles ?? effectiveDiaryMatch.entry.attachments)?.length,
        ),
        previousPenalty,
        finalPenalty: calculation.penalty,
        exempted: status === "permitted" && !isOfficeOvertime && !isOtherDeduction,
      });
    }
  });

  return { diaryMatched, diaryExempted };
}
