import {
  normalizeDiaryEmployeeCode,
} from "./diaryModel";
import {
  normalizeLookup,
  normalizeText,
} from "../employees/employeeModel";

export function findDiaryEmployeeByCode(employees, value) {
  const code = normalizeDiaryEmployeeCode(value);
  return code
    ? employees.find((employee) =>
        normalizeDiaryEmployeeCode(employee.employeeCode) === code)
    : undefined;
}

export function findDiaryEmployeeByName(employees, value) {
  const name = normalizeLookup(value);
  return name
    ? employees.find((employee) =>
        normalizeLookup(employee.employeeName) === name)
    : undefined;
}

/** Xác định người lập mặc định từ account, cache cũ hoặc danh sách nhân viên. */
export function getDiaryCurrentIdentity(employees, account) {
  if (account) {
    return {
      code: account.username || "",
      name: account.fullName || account.username || "Người dùng nội bộ",
    };
  }

  let storedUser = null;
  try {
    const rawUser = localStorage.getItem("timekeeping.currentUser.v1");
    if (rawUser) storedUser = JSON.parse(rawUser);
  } catch {
    storedUser = null;
  }

  const storedName = normalizeText(
    storedUser?.name ??
    storedUser?.fullName ??
    localStorage.getItem("timekeeping.attachmentUploader.v1") ??
    "Người dùng nội bộ",
  );
  const storedCode = normalizeText(
    storedUser?.code ?? storedUser?.employeeCode,
  );
  const employee = findDiaryEmployeeByCode(employees, storedCode) ??
    findDiaryEmployeeByName(employees, storedName);
  return employee
    ? { code: employee.employeeCode, name: employee.employeeName }
    : { code: storedCode, name: storedName };
}
