import { BookIcon, ClockIcon, FilterIcon, UsersIcon } from "../Icons";

// Nhãn/icon điều hướng; quyền từng page vẫn được kiểm tra trong authorization.
export const PAGE_CONFIG = Object.freeze({
  // attendance: { label: "Xử lý chấm công", icon: ClockIcon },
  process: { label: "Xử lý", icon: FilterIcon },
  employees: { label: "Nhân viên / Giờ ĐK", icon: UsersIcon },
  diary: { label: "Diary / Ghi chú", icon: BookIcon },
  accounts: { label: "Account", icon: UsersIcon },
});
