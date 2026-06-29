import { normalizeLookup } from "../employees/employeeModel.js";
import { isThuDucEmployee } from "../services/attendance/thuDucRuleService.js";
import { clockDistance, timeValueToMinutes } from "../utils/timeUtils.js";

export const FULL_DAY_SHIFT_MATCH_THRESHOLD_MINUTES = 90;

function normalizeShiftKey(value) {
  return normalizeLookup(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

function getShiftKeyFromName(value) {
  const normalizedName = normalizeShiftKey(value);
  if (normalizedName.includes("sang") || normalizedName.includes("morning")) return "morning";
  if (normalizedName.includes("chieu") || normalizedName.includes("afternoon")) return "afternoon";
  if (normalizedName.includes("toi") || normalizedName.includes("evening")) return "evening";
  return null;
}

function selectPreferredClock(clockValues, primarySlot, fallbackSlot) {
  const primary = timeValueToMinutes(clockValues?.[primarySlot]);
  return primary !== null ? primary : timeValueToMinutes(clockValues?.[fallbackSlot]);
}

function findNearestEmployeeShiftKey(actualMinutes, employee, markerSuffix) {
  if (actualMinutes === null) return null;
  const markers = ["morning", "afternoon", "evening"]
    .map((key) => ({
      key,
      minutes: timeValueToMinutes(employee?.[`${key}${markerSuffix}`]),
    }))
    .filter(({ minutes }) => minutes !== null);
  if (!markers.length) return null;
  return markers.reduce((nearest, marker) =>
    clockDistance(actualMinutes, marker.minutes)
      < clockDistance(actualMinutes, nearest.minutes)
      ? marker
      : nearest,
  ).key;
}

function normalizeActualOut(actualIn, actualOut) {
  if (actualIn === null || actualOut === null) return actualOut;
  return actualOut < actualIn ? actualOut + 24 * 60 : actualOut;
}

export function getMorningToAfternoonFullDayStatus(
  employee,
  clockValues,
  determinedShift,
  thresholdMinutes = FULL_DAY_SHIFT_MATCH_THRESHOLD_MINUTES,
  employeeName = "",
) {
  if (isThuDucEmployee(employee, employeeName)) {
    return {
      isFullDay: false,
      afternoonEndMinutes: null,
      preferredActualOutMinutes: null,
    };
  }
  const actualIn = selectPreferredClock(clockValues, "in1", "in2");
  const rawActualOut = selectPreferredClock(clockValues, "out1", "out2");
  const morningStart = timeValueToMinutes(employee?.morningIn);
  const afternoonEnd = timeValueToMinutes(employee?.afternoonOut);
  if (
    actualIn === null
    || rawActualOut === null
    || morningStart === null
    || afternoonEnd === null
  ) {
    return {
      isFullDay: false,
      afternoonEndMinutes: null,
      preferredActualOutMinutes: null,
    };
  }
  const selectedShiftKey = determinedShift?.key ?? getShiftKeyFromName(determinedShift?.name);
  const nearestInShiftKey = findNearestEmployeeShiftKey(actualIn, employee, "In");
  const afternoonOutDistance = clockDistance(rawActualOut, afternoonEnd);
  const isCheckInMorningShift = selectedShiftKey
    ? selectedShiftKey === "morning"
    : nearestInShiftKey === "morning";
  let normalizedAfternoonEnd = afternoonEnd;
  if (normalizedAfternoonEnd < actualIn) normalizedAfternoonEnd += 24 * 60;
  return {
    isFullDay: isCheckInMorningShift && afternoonOutDistance <= thresholdMinutes,
    afternoonEndMinutes: normalizedAfternoonEnd,
    preferredActualOutMinutes: normalizeActualOut(actualIn, rawActualOut),
  };
}
