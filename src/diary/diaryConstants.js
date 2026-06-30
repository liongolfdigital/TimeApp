export const DIARY_STORAGE_KEY = "timekeeping.employeeDiary.v1";
export const DIARY_SHEET_NAME = "Diary";
export const DIARY_EXPORT_FILE_NAME = "Diary.xlsx";

// Giữ lại để dữ liệu Diary cũ và bộ máy đối chiếu chấm công tiếp tục hoạt động.
export const DIARY_NOTE_TYPES = Object.freeze([
  "Đi sớm",
  "Đi trễ",
  "Về sớm",
  "Tăng ca",
  "OFF",
  "Khác",
  "Hỗ trợ CN",
]);
export const DIARY_NOTE_TYPE_OPTIONS = DIARY_NOTE_TYPES;
export const DIARY_VIOLATION_OPTIONS = DIARY_NOTE_TYPES;

export const DIARY_IMPORT_FIELDS = Object.freeze([
  { key: "employeeCode", label: "Mã N.Viên", aliases: ["Mã nhân viên"] },
  { key: "employeeName", label: "Tên N.Viên", aliases: ["Tên nhân viên"] },
  { key: "date", label: "Ngày", type: "date" },
  { key: "checkIn1", label: "Vào 1", type: "time" },
  { key: "checkOut1", label: "Ra 1", type: "time" },
  { key: "checkIn2", label: "Vào 2", type: "time", optional: true },
  { key: "checkOut2", label: "Ra 2", type: "time", optional: true },
  {
    key: "note",
    label: "Ghi chú",
    aliases: ["Ghi chú (KHÔNG VIẾT TẮT)", "Lý do"],
  },
  {
    key: "permissionStatus",
    label: "Có/Không phép",
    aliases: ["Có / Không phép", "Trạng thái phép"],
    optional: true,
  },
  {
    key: "noteTypes",
    label: "Loại ghi chú",
    type: "noteTypes",
    aliases: ["Loại", "Note types", "Note type"],
    optional: true,
  },
  {
    key: "recordMaker",
    label: "Người lập biên bản",
    aliases: ["Người lập"],
    optional: true,
  },
]);

export const DIARY_REQUIRED_IMPORT_KEYS = Object.freeze(
  DIARY_IMPORT_FIELDS.filter(({ optional }) => !optional).map(({ key }) => key),
);

export const DIARY_DATA_FIELDS = Object.freeze([
  ...DIARY_IMPORT_FIELDS,
  { key: "branch", label: "Chi nhánh", optional: true },
  { key: "creatorCode", label: "Mã người lập", optional: true },
  { key: "createdAt", label: "Ngày tạo", type: "datetime", optional: true },
  { key: "updatedAt", label: "Ngày cập nhật", type: "datetime", optional: true },
]);

export const DIARY_EXPORT_FIELDS = Object.freeze([
  ...DIARY_IMPORT_FIELDS,
  { key: "attachments", label: "File đính kèm", type: "attachments", optional: true },
]);

export const DIARY_FIELDS = Object.freeze([
  ...DIARY_IMPORT_FIELDS,
  { key: "attachments", label: "File đính kèm", type: "attachments" },
]);

export const EMPTY_DIARY_ENTRY = Object.freeze({
  ...Object.fromEntries(DIARY_DATA_FIELDS.map(({ key }) => [key, ""])),
  noteTypes: [],
  violationTypes: [],
});
