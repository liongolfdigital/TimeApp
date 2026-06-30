/**
 * Compatibility facade cho API tính công cũ.
 * Logic chọn ca và tính một dòng đã được tách sang các module chuyên trách.
 */
export { calculateTimekeeping } from "./attendanceCalculator.js";
export {
  determineAssignedShift,
  determineNearestShift,
  selectActualOut,
} from "./shiftResolver.js";
export { adjustClockColumns } from "./clockClassifier.js";
export {
  FULL_DAY_SHIFT_MATCH_THRESHOLD_MINUTES,
  getMorningToAfternoonFullDayStatus,
} from "./fullDayResolver.js";
export {
  createEmployeeLookup,
  findRegisteredEmployee,
} from "./employeeLookup.js";
export {
  calculateLatePenalty,
} from "../services/attendance/lateEarlyService.js";
export {
  getVPSaturdayShift,
  getVPSaturdayShiftAssignment,
  isSaturday,
  isVPEmployee,
  isVpEmployee,
} from "../services/attendance/vpRuleService.js";
export {
  calculateTotalWorkedMinutes,
  formatDurationMinutes,
  timeValueToMinutes,
  totalHoursValueToMinutes,
} from "../utils/timeUtils.js";
