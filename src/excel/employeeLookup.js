import {
  normalizeEmployeeCode,
  normalizeLookup,
} from "../employees/employeeModel.js";

export function createEmployeeLookup(employees) {
  const byCode = new Map();
  const byName = new Map();
  employees.forEach((employee) => {
    const code = normalizeEmployeeCode(employee.employeeCode);
    const name = normalizeLookup(employee.employeeName);
    if (code && !byCode.has(code)) byCode.set(code, employee);
    if (name && !byName.has(name)) byName.set(name, employee);
  });
  return { byCode, byName };
}

export function findRegisteredEmployee(lookup, employeeCode, employeeName) {
  const code = normalizeEmployeeCode(employeeCode);
  if (code) return lookup.byCode.get(code) ?? null;
  const name = normalizeLookup(employeeName);
  return name ? lookup.byName.get(name) ?? null : null;
}
