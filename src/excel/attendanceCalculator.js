/**
 * Tính các chỉ số chấm công cho một dòng sau khi clock đã được chuẩn hóa.
 * Module không đọc/ghi Excel, localStorage hoặc API.
 */
import { MINUTES_PER_DAY } from "../constants/attendanceConstants.js";
import {
  calculateLateEarlyMetrics,
  calculateLatePenalty,
} from "../services/attendance/lateEarlyService.js";
import { calculateOvertimeMinutes } from "../services/attendance/overtimeService.js";
import { parseRegisteredShiftMinutes } from "../services/attendance/q7RuleService.js";
import { getVPSaturdayShiftAssignment } from "../services/attendance/vpRuleService.js";
import {
  calculateTotalWorkedMinutes,
} from "../utils/timeUtils.js";
import {
  FULL_DAY_SHIFT_MATCH_THRESHOLD_MINUTES,
  getMorningToAfternoonFullDayStatus,
} from "./fullDayResolver.js";
import {
  determineAssignedShift,
  getShiftKeyFromName,
  normalizeActualOut,
  selectActualOut,
} from "./shiftResolver.js";

// Định dạng số phút thành HH:mm theo đồng hồ 24 giờ.
function formatMinutes(minutes) {
  if (minutes === null || minutes === undefined) return null;
  const roundedMinutes = Math.round(minutes) % MINUTES_PER_DAY;
  const normalizedMinutes = roundedMinutes < 0
    ? roundedMinutes + MINUTES_PER_DAY
    : roundedMinutes;
  return `${String(Math.floor(normalizedMinutes / 60)).padStart(2, "0")}:${String(
    normalizedMinutes % 60,
  ).padStart(2, "0")}`;
}

/**
 * Điều phối tính một dòng chấm công sau normalize clock và chọn ca.
 * Trả Đi sớm/Đi trễ/Về sớm/Tăng ca, Phạt, Tổng làm, ca xác định và ghi chú.
 */
export function calculateTimekeeping({
  employee,
  employeeName = "",
  clockValues,
  fallbackTotal,
  additionalNotes = [],
  shiftAssignment = null,
  shiftCandidates = [],
  attendanceDate = null,
}) {
  const selectedActualOut = selectActualOut(clockValues);

  if (!employee) {
    const totalWorkedMinutes = calculateTotalWorkedMinutes(fallbackTotal);
    return {
      lateMinutes: null,
      earlyInMinutes: null,
      penalty: null,
      earlyMinutes: null,
      overtimeMinutes: null,
      note: [...additionalNotes, "Chưa có giờ đăng ký"].join("; "),
      totalWorkedMinutes,
      matched: false,
      determinedShift: null,
      standardOutMinutes: null,
      standardOutTime: null,
      actualOutMinutes: selectedActualOut.minutes,
      actualOutTime: formatMinutes(selectedActualOut.minutes),
      actualOutSource: selectedActualOut.source,
    };
  }

  const vpSaturdayShiftAssignment = getVPSaturdayShiftAssignment({
    employeeCode: employee?.employeeCode ?? employee?.code,
    employeeName: employeeName || employee.employeeName,
    attendanceDate,
    clockValues,
  });
  const totalWorkedMinutes = calculateTotalWorkedMinutes(fallbackTotal, {
    // VP Thứ 7 là ca 4 tiếng nên không trừ thêm một giờ nghỉ trưa khỏi Tổng làm.
    deductLunchBreak: !vpSaturdayShiftAssignment,
  });
  const effectiveShiftAssignment = vpSaturdayShiftAssignment ?? shiftAssignment;

  const determinedShift = determineAssignedShift(
    employee,
    clockValues,
    effectiveShiftAssignment,
    shiftCandidates,
    {
      employeeName: employeeName || employee.employeeName,
      attendanceDate,
    },
  );
  if (!determinedShift) {
    return {
      lateMinutes: null,
      earlyInMinutes: null,
      penalty: null,
      earlyMinutes: null,
      overtimeMinutes: null,
      note: [
        ...additionalNotes,
        "Chưa xác định ca làm",
        "Không xác định được giờ ra chuẩn",
        employee.note,
      ]
        .filter(Boolean)
        .join("; "),
      totalWorkedMinutes,
      matched: true,
      determinedShift: null,
      standardOutMinutes: null,
      standardOutTime: null,
      actualOutMinutes: selectedActualOut.minutes,
      actualOutTime: formatMinutes(selectedActualOut.minutes),
      actualOutSource: selectedActualOut.source,
    };
  }

  const actualOut = normalizeActualOut(
    determinedShift.actualIn,
    selectedActualOut.minutes,
  );
  const fullDayStatus = getMorningToAfternoonFullDayStatus(
    employee,
    clockValues,
    determinedShift,
    FULL_DAY_SHIFT_MATCH_THRESHOLD_MINUTES,
    employeeName || employee.employeeName,
  );
  const q7MondayShopShortageMinutes =
    Number(determinedShift.q7MondayShopShortageMinutes) > 0
      ? Number(determinedShift.q7MondayShopShortageMinutes)
      : 0;
  const { lateMinutes, earlyInMinutes, earlyMinutes } = calculateLateEarlyMetrics({
    actualIn: determinedShift.actualIn,
    shiftStart: determinedShift.start,
    actualOut,
    shiftEnd: determinedShift.end,
    q7ShortageMinutes: q7MondayShopShortageMinutes,
  });
  const penalty = calculateLatePenalty(lateMinutes, employeeName);
  const notes = [...additionalNotes];
  const hasStandardOut = determinedShift.end !== null;
  const registeredMinutes = parseRegisteredShiftMinutes(
    employee.registeredShift ?? employee.regisHours ?? employee.regisHour,
  );
  const expectedEndByRegisteredHours =
    determinedShift.start !== null && registeredMinutes !== null && registeredMinutes > 0
      ? determinedShift.start + registeredMinutes
      : determinedShift.end;
  const overtimeStandardOut = expectedEndByRegisteredHours;
  const overtimeActualOut = fullDayStatus.isFullDay
    ? Math.min(
        fullDayStatus.preferredActualOutMinutes,
        fullDayStatus.afternoonEndMinutes,
      )
    : actualOut;
  const overtimeMinutes = fullDayStatus.isFullDay
    ? Math.max(0, Math.round(overtimeActualOut - overtimeStandardOut))
    : calculateOvertimeMinutes({
        actualOut: overtimeActualOut,
        standardOut: overtimeStandardOut,
        totalWorkedMinutes,
        employee,
        employeeName: employeeName || employee.employeeName,
        shiftStart: determinedShift.start,
      });

  if (determinedShift.actualIn === null) notes.push("Thiếu giờ vào");
  if (!hasStandardOut) {
    notes.push("Không xác định được giờ ra chuẩn");
  }
  if (actualOut === null) notes.push("Thiếu giờ ra");
  if (earlyInMinutes > 0) notes.push(`Đi sớm ${earlyInMinutes} phút`);
  if (lateMinutes > 0) notes.push(`Đi trễ ${lateMinutes} phút`);
  if (earlyMinutes > 0) notes.push(`Về sớm ${earlyMinutes} phút`);
  if (q7MondayShopShortageMinutes > 0) {
    notes.push(
      `Về sớm do Giờ ĐK vượt giờ hoạt động Q7 Thứ 2: ${q7MondayShopShortageMinutes} phút`,
    );
  }
  if (overtimeMinutes > 0) {
    if (fullDayStatus.isFullDay) {
      notes.push(
        `Tăng ca full ngày: tính từ ${formatMinutes(overtimeStandardOut)} đến ${formatMinutes(overtimeActualOut)}`,
      );
    } else {
      notes.push(`Tăng ca ${overtimeMinutes} phút`);
    }
  }

  if (notes.length === 0) notes.push("Đúng giờ");
  if (employee.note) notes.push(employee.note);

  return {
    lateMinutes,
    earlyInMinutes,
    penalty,
    earlyMinutes,
    note: notes.join("; "),
    totalWorkedMinutes,
    matched: true,
    determinedShift: determinedShift.name,
    determinedShiftKey: determinedShift.key ?? getShiftKeyFromName(determinedShift.name),
    shiftSource: determinedShift.source ?? "nearest",
    appliedRuleId: determinedShift.ruleId ?? null,
    appliedRuleName: determinedShift.ruleName ?? null,
    standardOutMinutes: determinedShift.end,
    standardOutTime: formatMinutes(determinedShift.end),
    overtimeStandardOutMinutes: overtimeStandardOut,
    overtimeStandardOutTime: formatMinutes(overtimeStandardOut),
    expectedEndByRegisteredHoursMinutes: expectedEndByRegisteredHours,
    expectedEndByRegisteredHoursTime: formatMinutes(expectedEndByRegisteredHours),
    overtimeActualOutMinutes: overtimeActualOut,
    overtimeActualOutTime: formatMinutes(overtimeActualOut),
    isFullDayByMorningToAfternoon: fullDayStatus.isFullDay,
    q7MondayAdjusted: Boolean(determinedShift.q7MondayAdjusted),
    q7MondayShopShortageMinutes,
    actualOutMinutes: actualOut,
    actualOutTime: formatMinutes(actualOut),
    actualOutSource: selectedActualOut.source,
    overtimeMinutes,
  };
}
