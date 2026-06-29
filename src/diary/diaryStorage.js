import { DIARY_STORAGE_KEY } from "./diaryConstants.js";
import { sanitizeDiaryEntry } from "./diaryNormalizers.js";

export function loadStoredDiaryEntries() {
  try {
    const storedValue = localStorage.getItem(DIARY_STORAGE_KEY);
    if (!storedValue) return [];
    const parsed = JSON.parse(storedValue);
    if (!Array.isArray(parsed)) return [];
    const migratedAt = new Date().toISOString();
    return parsed.map((entry) => {
      const sanitized = sanitizeDiaryEntry(entry);
      const createdAt = sanitized.createdAt || migratedAt;
      return {
        ...sanitized,
        createdAt,
        updatedAt: sanitized.updatedAt || createdAt,
      };
    });
  } catch {
    return [];
  }
}

export function saveStoredDiaryEntries(entries) {
  try {
    localStorage.setItem(DIARY_STORAGE_KEY, JSON.stringify(entries));
    return true;
  } catch {
    return false;
  }
}
