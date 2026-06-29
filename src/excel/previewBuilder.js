import { OUTPUT_COLUMNS, PREVIEW_ROW_LIMIT } from "../constants/excelConstants.js";
import { HIGHLIGHT_TYPES } from "./attendanceHighlights.js";

export function makePreview(
  XLSX,
  worksheet,
  headerRow,
  bounds,
  highlights,
  diaryRows,
  dataRowCount,
) {
  const rows = [];
  const previewHighlights = [];
  const previewDiaryMatches = [];
  const lastRow = Math.min(
    bounds.e.r,
    headerRow + PREVIEW_ROW_LIMIT,
    headerRow + dataRowCount,
  );
  const highlightByRow = new Map(highlights.map((highlight) => [highlight.row, highlight]));
  const diaryByRow = new Map(diaryRows.map((item) => [item.row, item]));
  const makeViolationPreviewClass = (type, status) =>
    status ? `${type} preview-status-${status}` : type;

  for (let row = headerRow + 1; row <= lastRow; row += 1) {
    const highlight = highlightByRow.get(row);
    const previewRow = OUTPUT_COLUMNS.map((_, columnIndex) => {
      const address = XLSX.utils.encode_cell({ r: row, c: bounds.s.c + columnIndex });
      const cell = worksheet[address];
      if (!cell) return "";
      if (OUTPUT_COLUMNS[columnIndex] === "Phạt" && typeof cell.v === "number") {
        return cell.v.toLocaleString("vi-VN");
      }
      return XLSX.utils.format_cell(cell);
    });
    if (!previewRow.some(Boolean)) continue;
    rows.push(previewRow);
    previewHighlights.push(OUTPUT_COLUMNS.map((header) => {
      if (highlight?.missingClock) return HIGHLIGHT_TYPES.missingClock;
      if (
        ["Vào 1", "Ra 1", "Vào 2", "Ra 2"].includes(header)
        && highlight?.multiplePunches?.slots?.includes(
          header === "Vào 1" ? "in1"
            : header === "Ra 1" ? "out1"
              : header === "Vào 2" ? "in2" : "out2",
        )
      ) return HIGHLIGHT_TYPES.multiplePunches;
      if (header === "Ghi chú" && highlight?.longOff) {
        return makeViolationPreviewClass(HIGHLIGHT_TYPES.off, highlight.longOffStatus);
      }
      if (header === "Đi sớm" && highlight?.earlyIn) {
        return makeViolationPreviewClass(
          HIGHLIGHT_TYPES.earlyIn,
          highlight.violationStatuses?.earlyIn,
        );
      }
      if (header === "Đi trễ" && highlight?.late) {
        return makeViolationPreviewClass(
          HIGHLIGHT_TYPES.late,
          highlight.violationStatuses?.late,
        );
      }
      if (header === "Về sớm" && highlight?.early) {
        return makeViolationPreviewClass(
          HIGHLIGHT_TYPES.early,
          highlight.violationStatuses?.early,
        );
      }
      if (header === "Tăng ca" && highlight?.overtime) {
        return makeViolationPreviewClass(
          HIGHLIGHT_TYPES.overtime,
          highlight.violationStatuses?.overtime,
        );
      }
      return null;
    }));
    previewDiaryMatches.push(diaryByRow.get(row)?.diaryMatched ?? false);
  }
  return { rows, highlights: previewHighlights, diaryMatches: previewDiaryMatches };
}
