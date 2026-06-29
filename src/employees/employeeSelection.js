/** Toggle một employee id trong selection mà không mutate state hiện tại. */
export function toggleEmployeeSelection(selectedIds, id) {
  if (!id) return [...selectedIds];
  return selectedIds.includes(id)
    ? selectedIds.filter((item) => item !== id)
    : [...selectedIds, id];
}

/** Tính checked/indeterminate cho checkbox tổng theo các dòng đang hiển thị. */
export function getVisibleEmployeeSelectionState(selectedIds, visibleIds) {
  const selectedSet = new Set(selectedIds);
  const normalizedVisibleIds = [...new Set(visibleIds.filter(Boolean))];
  const selectedVisibleCount = normalizedVisibleIds.filter((id) => selectedSet.has(id)).length;
  const allSelected = normalizedVisibleIds.length > 0
    && selectedVisibleCount === normalizedVisibleIds.length;
  return {
    allSelected,
    someSelected: selectedVisibleCount > 0 && !allSelected,
    selectedVisibleCount,
  };
}

/** Chọn/bỏ chọn các employee đang hiển thị, giữ nguyên selection đang bị filter ẩn. */
export function toggleAllVisibleEmployeeSelection(selectedIds, visibleIds) {
  const normalizedVisibleIds = [...new Set(visibleIds.filter(Boolean))];
  const { allSelected } = getVisibleEmployeeSelectionState(selectedIds, normalizedVisibleIds);
  const visibleSet = new Set(normalizedVisibleIds);
  if (allSelected) return selectedIds.filter((id) => !visibleSet.has(id));
  return [...new Set([...selectedIds, ...normalizedVisibleIds])];
}

/** Label nút bulk delete theo số lượng và trạng thái request. */
export function getEmployeeBulkDeleteLabel(selectedCount, isDeleting = false) {
  if (isDeleting) return "Đang xóa...";
  return `Xóa đã chọn${selectedCount > 0 ? ` (${selectedCount})` : ""}`;
}
