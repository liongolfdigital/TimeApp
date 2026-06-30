let xlsxModulePromise;
let xlsxStyleModulePromise;

/**
 * Lazy-load hai runtime SheetJS một lần cho toàn bộ phiên xử lý.
 * Tách riêng để processor, builder và merger dùng cùng một nguồn module.
 */
export async function loadXlsxRuntime() {
  xlsxModulePromise ??= import("xlsx");
  xlsxStyleModulePromise ??= import("xlsx-js-style");
  const [XLSX, xlsxStyleModule] = await Promise.all([
    xlsxModulePromise,
    xlsxStyleModulePromise,
  ]);
  return {
    XLSX,
    XLSX_STYLE: xlsxStyleModule.default ?? xlsxStyleModule,
  };
}
