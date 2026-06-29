/**
 * Facade tương thích cho model Diary.
 * Các consumer cũ tiếp tục import từ file này trong khi từng trách nhiệm nằm ở module riêng.
 */
export {
  DIARY_DATA_FIELDS,
  DIARY_EXPORT_FIELDS,
  DIARY_EXPORT_FILE_NAME,
  DIARY_FIELDS,
  DIARY_SHEET_NAME,
  DIARY_STORAGE_KEY,
  DIARY_VIOLATION_OPTIONS,
  EMPTY_DIARY_ENTRY,
} from "./diaryConstants.js";

export {
  formatDiaryDate,
  formatDiaryDateTime,
  getDiaryWeekday,
  normalizeDiaryDate,
  normalizeDiaryTimestamp,
  parseDiaryDisplayDate,
  sortDiaryEntries,
} from "./diaryDateUtils.js";

export {
  createDiaryId,
  formatDiaryViolationTypes,
  normalizeDiaryEmployeeCode,
  normalizeDiaryPermission,
  normalizeDiaryViolationType,
  normalizeDiaryViolationTypes,
  sanitizeDiaryEntry,
} from "./diaryNormalizers.js";

export { getDiaryIdentity, mergeDiaryEntries } from "./diaryMerge.js";
export { loadStoredDiaryEntries, saveStoredDiaryEntries } from "./diaryStorage.js";
export {
  buildDiaryNote,
  createDiaryLookup,
  findDiaryEntry,
  findDiaryForViolation,
  hasDiaryAttachments,
  isDiaryPermitted,
} from "./diaryLookup.js";
