import { useEffect, useMemo, useState } from "react";
import { isApiUnavailableError } from "../api/apiClient";
import { diaryApi } from "../api/diaryApi";
import { employeeApi } from "../api/employeeApi";
import {
  canAccessBranch,
  getDiaryEntryBranch,
  getRecordBranch,
  isAdmin,
  isManager,
} from "../auth/authorization";
import {
  DEFAULT_MAX_ATTACHMENT_SIZE_MB,
  getAttachmentConfig,
  listDiaryAttachments,
} from "../diary/attachmentStorage";
import {
  loadStoredDiaryEntries,
  saveStoredDiaryEntries,
} from "../diary/diaryModel";
import {
  loadStoredEmployees,
  saveStoredEmployees,
} from "../employees/employeeModel";
import {
  DEFAULT_SHIFT_RULES,
  loadStoredShiftRules,
} from "../rules/shiftRuleEngine";

function debugDataLoad(label, detail) {
  if (import.meta.env.DEV) {
    console.debug(`[TimeKeeping data] ${label}`, detail);
  }
}

function loadLocalEmployeesForDev() {
  return import.meta.env.DEV ? loadStoredEmployees() : [];
}

function loadLocalDiaryForDev() {
  return import.meta.env.DEV ? loadStoredDiaryEntries() : [];
}

function loadShiftRulesForRuntime() {
  return import.meta.env.DEV ? loadStoredShiftRules() : DEFAULT_SHIFT_RULES;
}

/** Tải và đồng bộ các tập dữ liệu dùng chung của mọi page sau đăng nhập. */
export function useAppData(currentUser) {
  const [employees, setEmployees] = useState(loadLocalEmployeesForDev);
  const [diaryEntries, setDiaryEntries] = useState(loadLocalDiaryForDev);
  const [attachments, setAttachments] = useState([]);
  const [attachmentConfig, setAttachmentConfig] = useState({
    maxFileSizeMb: DEFAULT_MAX_ATTACHMENT_SIZE_MB,
  });
  const [attachmentError, setAttachmentError] = useState("");
  const [shiftRules] = useState(loadShiftRulesForRuntime);

  const persistEmployeesForUser = (nextEmployees, user = currentUser) => {
    if (!import.meta.env.DEV || !user) return;
    if (isAdmin(user)) {
      saveStoredEmployees(nextEmployees);
      return;
    }
    if (!isManager(user)) return;

    const storedEmployees = loadStoredEmployees();
    const otherBranches = storedEmployees.filter((employee) =>
      !canAccessBranch(user, getRecordBranch(employee)),
    );
    const scopedEmployees = nextEmployees.filter((employee) =>
      canAccessBranch(user, getRecordBranch(employee)),
    );
    saveStoredEmployees([...otherBranches, ...scopedEmployees]);
  };

  const persistDiaryEntriesForUser = (
    nextEntries,
    user = currentUser,
    employeeList = employees,
  ) => {
    if (!import.meta.env.DEV || !user) return;
    if (isAdmin(user)) {
      saveStoredDiaryEntries(nextEntries);
      return;
    }
    if (!isManager(user)) return;

    const storedEntries = loadStoredDiaryEntries();
    const branchEmployees = [...loadStoredEmployees(), ...employeeList];
    const otherBranches = storedEntries.filter((entry) =>
      !canAccessBranch(user, getDiaryEntryBranch(entry, branchEmployees)),
    );
    const scopedEntries = nextEntries.filter((entry) =>
      canAccessBranch(user, getDiaryEntryBranch(entry, branchEmployees)),
    );
    saveStoredDiaryEntries([...otherBranches, ...scopedEntries]);
  };

  const handleEmployeesChange = (nextEmployees) => {
    setEmployees(nextEmployees);
    persistEmployeesForUser(nextEmployees);
  };

  const handleDiaryEntriesChange = (nextEntries) => {
    setDiaryEntries(nextEntries);
    persistDiaryEntriesForUser(nextEntries);
  };

  useEffect(() => {
    if (!currentUser) {
      setAttachments([]);
      return undefined;
    }

    let active = true;
    Promise.all([listDiaryAttachments(), getAttachmentConfig()])
      .then(([storedAttachments, storedConfig]) => {
        if (!active) return;
        setAttachments(storedAttachments);
        setAttachmentConfig(storedConfig);
        setAttachmentError("");
      })
      .catch((error) => {
        if (!active) return;
        if (isApiUnavailableError(error)) {
          console.warn(
            "[TimeKeeping data] Attachment API unavailable, continuing without server attachments.",
            {
              endpoint: error.endpoint,
              status: error.status,
              message: error.message,
            },
          );
          setAttachments([]);
          setAttachmentConfig({ maxFileSizeMb: DEFAULT_MAX_ATTACHMENT_SIZE_MB });
          setAttachmentError("");
          return;
        }
        setAttachmentError(error.message);
      });
    return () => {
      active = false;
    };
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return undefined;

    let active = true;
    const localEmployees = loadLocalEmployeesForDev();
    const localDiaryEntries = loadLocalDiaryForDev();

    debugDataLoad("load:start", {
      currentUser,
      role: currentUser.role,
      branch: currentUser.branch,
      localEmployees: localEmployees.length,
      localDiary: localDiaryEntries.length,
      endpoints: ["/api/employees", "/api/diary"],
    });

    Promise.allSettled([employeeApi.list(), diaryApi.list()])
      .then(async ([employeeResult, diaryResult]) => {
        let nextEmployees = localEmployees;
        let nextDiaryEntries = localDiaryEntries;
        let employeeSource = "localStorage";
        let diarySource = "localStorage";

        if (employeeResult.status === "fulfilled") {
          const serverEmployees = employeeResult.value;
          employeeSource = "api";
          nextEmployees = serverEmployees;

          if (serverEmployees.length === 0 && localEmployees.length > 0) {
            if (isAdmin(currentUser)) {
              try {
                nextEmployees = await employeeApi.replaceAll(localEmployees);
                employeeSource = "api:migrated-from-localStorage";
              } catch (error) {
                if (!isApiUnavailableError(error)) throw error;
                employeeSource = "localStorage:bulk-api-unavailable";
                nextEmployees = localEmployees;
              }
            } else {
              employeeSource = "localStorage:empty-api";
              nextEmployees = localEmployees;
            }
          }
        } else if (!isApiUnavailableError(employeeResult.reason)) {
          throw employeeResult.reason;
        }

        if (diaryResult.status === "fulfilled") {
          const serverDiaryEntries = diaryResult.value;
          diarySource = "api";
          nextDiaryEntries = serverDiaryEntries;

          if (serverDiaryEntries.length === 0 && localDiaryEntries.length > 0) {
            if (isAdmin(currentUser)) {
              try {
                nextDiaryEntries = await diaryApi.replaceAll(localDiaryEntries);
                diarySource = "api:migrated-from-localStorage";
              } catch (error) {
                if (!isApiUnavailableError(error)) throw error;
                diarySource = "localStorage:bulk-api-unavailable";
                nextDiaryEntries = localDiaryEntries;
              }
            } else {
              diarySource = "localStorage:empty-api";
              nextDiaryEntries = localDiaryEntries;
            }
          }
        } else if (!isApiUnavailableError(diaryResult.reason)) {
          throw diaryResult.reason;
        }

        if (!active) return;
        setEmployees(nextEmployees);
        setDiaryEntries(nextDiaryEntries);
        if (import.meta.env.DEV && isAdmin(currentUser)) {
          saveStoredEmployees(nextEmployees);
          saveStoredDiaryEntries(nextDiaryEntries);
        }
        setAttachmentError("");
        debugDataLoad("load:done", {
          currentUser,
          role: currentUser.role,
          branch: currentUser.branch,
          rawEmployees: nextEmployees.length,
          rawDiary: nextDiaryEntries.length,
          employeeSource,
          diarySource,
        });
      })
      .catch((error) => {
        if (!active) return;
        if (isApiUnavailableError(error)) {
          setEmployees(localEmployees);
          setDiaryEntries(localDiaryEntries);
          setAttachmentError("");
          debugDataLoad("load:fallback", {
            currentUser,
            role: currentUser.role,
            branch: currentUser.branch,
            rawEmployees: localEmployees.length,
            rawDiary: localDiaryEntries.length,
            endpoint: error.endpoint,
            status: error.status,
            message: error.message,
          });
          return;
        }
        setAttachmentError(error.message);
      });

    return () => {
      active = false;
    };
  }, [currentUser]);

  const diaryEntriesWithAttachments = useMemo(
    () => diaryEntries.map((entry) => {
      const entryAttachments = attachments.filter(
        ({ diaryEntryId }) => diaryEntryId === entry.id,
      );
      return {
        ...entry,
        attachments: entryAttachments,
        attachedFiles: entryAttachments,
      };
    }),
    [attachments, diaryEntries],
  );

  return {
    attachmentConfig,
    attachmentError,
    attachments,
    diaryEntries,
    diaryEntriesWithAttachments,
    employees,
    handleDiaryEntriesChange,
    handleEmployeesChange,
    setAttachments,
    shiftRules,
  };
}
