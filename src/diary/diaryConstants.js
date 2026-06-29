export const DIARY_STORAGE_KEY = "timekeeping.employeeDiary.v1";
export const DIARY_SHEET_NAME = "Xin đi trễ về sớm";
export const DIARY_EXPORT_FILE_NAME = "Dairy.xlsx";

export const DIARY_VIOLATION_OPTIONS = Object.freeze([
  "Đi sớm",
  "Đi trễ",
  "Về sớm",
  "Tăng ca",
  "OFF",
]);

const DIARY_CORE_FIELDS = [
  { key: "weekday", label: "Thứ" },
  { key: "date", label: "Ngày", type: "date" },
  { key: "employeeCode", label: "Mã N.Viên" },
  { key: "employeeName", label: "Tên N.Viên" },
  { key: "reason", label: "Lý do" },
  { key: "permission", label: "Có / Không phép" },
];

export const DIARY_DATA_FIELDS = [
  ...DIARY_CORE_FIELDS,
  { key: "violationTypes", label: "Loại ghi chú", type: "violationTypes", optional: true },
  { key: "bienBan", label: "Biên bản", optional: true },
  { key: "branch", label: "Chi nhánh", optional: true },
  { key: "creatorCode", label: "Mã người lập", optional: true },
  { key: "creatorName", label: "Người lập biên bản", optional: true },
  { key: "createdAt", label: "Ngày tạo", type: "datetime", optional: true },
  { key: "updatedAt", label: "Ngày cập nhật", type: "datetime", optional: true },
];

export const DIARY_EXPORT_FIELDS = [
  ...DIARY_DATA_FIELDS,
  { key: "hasAttachments", label: "Có hồ sơ", type: "attachmentStatus", optional: true },
];

export const DIARY_FIELDS = [
  ...DIARY_CORE_FIELDS,
  { key: "violationTypes", label: "Loại ghi chú", type: "violationTypes" },
  { key: "creatorName", label: "Người lập biên bản" },
  { key: "attachments", label: "File đính kèm", type: "attachments" },
  { key: "hasAttachments", label: "Có hồ sơ", type: "attachmentStatus" },
];

export const EMPTY_DIARY_ENTRY = Object.freeze({
  ...Object.fromEntries(DIARY_DATA_FIELDS.map(({ key }) => [key, ""])),
  violationTypes: [],
});
