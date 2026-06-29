import { apiRequest } from "./apiClient.js";

// Adapter REST cho CRUD, export, import/upsert và bulk delete Diary.
export const diaryApi = {
  list: () => apiRequest("/api/diary"),
  listForExport: () => apiRequest("/api/diary/export"),
  create: (entry) => apiRequest("/api/diary", { method: "POST", body: entry }),
  update: (entry) => apiRequest(`/api/diary/${encodeURIComponent(entry.id)}`, { method: "PUT", body: entry }),
  remove: (id) => apiRequest(`/api/diary/${encodeURIComponent(id)}`, { method: "DELETE" }),
  removeMany: (ids) => apiRequest("/api/diary/bulk", { method: "DELETE", body: { ids } }),
  importEntries: (entries) => apiRequest("/api/diary/import", { method: "POST", body: { entries } }),
  // Tương thích luồng migrate cache cũ: import/upsert rồi đọc lại, không replace database.
  replaceAll: async (entries) => {
    await apiRequest("/api/diary/bulk", { method: "POST", body: { entries } });
    return apiRequest("/api/diary");
  },
};
