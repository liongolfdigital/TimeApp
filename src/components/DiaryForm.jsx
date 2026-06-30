import { useEffect, useMemo, useState } from "react";
import {
  createDiaryId,
  DIARY_NOTE_TYPES,
  EMPTY_DIARY_ENTRY,
  isDiaryNoteTypeDisabled,
  normalizeDiaryNoteTypes,
  sanitizeDiaryEntry,
  toggleDiaryNoteType,
} from "../diary/diaryModel";
import {
  findDiaryEmployeeByCode,
  findDiaryEmployeeByName,
  getDiaryCurrentIdentity,
} from "../diary/diaryEmployeeUtils";
import { DEFAULT_MAX_ATTACHMENT_SIZE_MB } from "../diary/attachmentStorage";
import { useDiaryAttachmentDraft } from "../hooks/useDiaryAttachmentDraft";
import DiaryAttachmentField from "./diary/DiaryAttachmentField";
import { CloseIcon } from "./Icons";

/** Modal tạo/sửa Diary; attachment draft được quản lý trong hook/component riêng. */
export default function DiaryForm({
  entry,
  employees = [],
  attachments = [],
  currentUser = null,
  fixedBranch = "",
  canRemoveAttachment = () => true,
  maxFileSizeMb = DEFAULT_MAX_ATTACHMENT_SIZE_MB,
  onCancel,
  onSave,
}) {
  const [formData, setFormData] = useState(EMPTY_DIARY_ENTRY);
  const [isSaving, setIsSaving] = useState(false);
  const currentIdentity = useMemo(
    () => getDiaryCurrentIdentity(employees, currentUser),
    [currentUser, employees],
  );
  const attachmentDraft = useDiaryAttachmentDraft({
    attachments,
    canRemoveAttachment,
    isSaving,
    maxFileSizeMb,
    resetToken: [
      entry?.id || "new",
      fixedBranch,
      currentIdentity.code,
      currentIdentity.name,
    ].join("|"),
  });

  useEffect(() => {
    const nextFormData = entry
      ? {
          ...EMPTY_DIARY_ENTRY,
          ...sanitizeDiaryEntry(entry),
          ...(fixedBranch ? { branch: fixedBranch } : {}),
        }
      : {
          ...EMPTY_DIARY_ENTRY,
          branch: fixedBranch,
          creatorCode: currentIdentity.code,
          recordMaker: currentIdentity.name,
          creatorName: currentIdentity.name,
        };
    setFormData(nextFormData);
  }, [currentIdentity.code, currentIdentity.name, entry, fixedBranch]);

  const changeField = (key, value) => {
    setFormData((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const toggleNoteType = (type) => {
    setFormData((current) => ({
      ...current,
      noteTypes: toggleDiaryNoteType(current.noteTypes, type),
    }));
  };

  const changeEmployeeCode = (value) => {
    const employee = findDiaryEmployeeByCode(employees, value);
    setFormData((current) => ({
      ...current,
      employeeCode: value,
      ...(employee ? { employeeName: employee.employeeName } : {}),
    }));
  };

  const changeEmployeeName = (value) => {
    const employee = findDiaryEmployeeByName(employees, value);
    setFormData((current) => ({
      ...current,
      employeeName: value,
      ...(employee ? { employeeCode: employee.employeeCode } : {}),
    }));
  };

  const changeCreator = (value) => {
    const employee = findDiaryEmployeeByName(employees, value) ??
      findDiaryEmployeeByCode(employees, value);
    setFormData((current) => ({
      ...current,
      recordMaker: employee?.employeeName ?? value,
      creatorCode: employee?.employeeCode ?? "",
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!formData.date) {
      attachmentDraft.setError("Vui lòng chọn ngày phát sinh.");
      return;
    }
    if (!formData.employeeCode.trim() && !formData.employeeName.trim()) {
      attachmentDraft.setError("Cần nhập ít nhất Mã N.Viên hoặc Tên N.Viên.");
      return;
    }
    if (!formData.note.trim()) {
      attachmentDraft.setError("Vui lòng nhập ghi chú.");
      return;
    }

    attachmentDraft.setError("");
    setIsSaving(true);
    try {
      await onSave(
        sanitizeDiaryEntry({
          ...formData,
          noteTypes: normalizeDiaryNoteTypes(formData.noteTypes),
          ...(fixedBranch ? { branch: fixedBranch } : {}),
          id: entry?.id || createDiaryId(),
        }),
        {
          newFiles: attachmentDraft.pendingFiles.map(({ file }) => file),
          removedAttachmentIds: attachmentDraft.removedAttachmentIds,
        },
      );
    } catch (saveError) {
      attachmentDraft.setError(
        saveError.message || "Không thể lưu dòng Diary.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const matchedEmployee =
    findDiaryEmployeeByCode(employees, formData.employeeCode) ??
    findDiaryEmployeeByName(employees, formData.employeeName);
  const creatorOptions =
    currentIdentity.name &&
    !findDiaryEmployeeByName(employees, currentIdentity.name)
      ? [
          ...employees,
          {
            id: "current-system-user",
            employeeCode: currentIdentity.code,
            employeeName: currentIdentity.name,
          },
        ]
      : employees;
  const selectedNoteTypes = normalizeDiaryNoteTypes(formData.noteTypes);
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={isSaving ? undefined : onCancel}>
      <div className="employee-modal diary-modal" role="dialog" aria-modal="true" aria-labelledby="diary-form-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-heading">
          <div>
            <div className="eyebrow">Ghi chú nhân viên</div>
            <h2 id="diary-form-title">{entry ? "Cập nhật Diary" : "Thêm dòng Diary"}</h2>
          </div>
          <button className="icon-button" type="button" disabled={isSaving} onClick={onCancel} aria-label="Đóng"><CloseIcon /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="diary-form-grid">
            <label className="form-field"><span>Ngày</span><input type="date" value={formData.date} onChange={(event) => changeField("date", event.target.value)} /></label>
            <label className="form-field"><span>Mã N.Viên</span><input list="diary-employee-code-options" value={formData.employeeCode} onChange={(event) => changeEmployeeCode(event.target.value)} placeholder="Nhập mã để tìm kiếm" autoComplete="off" /><datalist id="diary-employee-code-options">{employees.map((employee) => <option key={employee.id} value={employee.employeeCode}>{employee.employeeName}</option>)}</datalist></label>
            <label className="form-field"><span>Tên N.Viên</span><input list="diary-employee-name-options" value={formData.employeeName} onChange={(event) => changeEmployeeName(event.target.value)} placeholder="Nhập tên để tìm kiếm" autoComplete="off" /><datalist id="diary-employee-name-options">{employees.map((employee) => <option key={employee.id} value={employee.employeeName}>{employee.employeeCode}</option>)}</datalist></label>
            {matchedEmployee && (matchedEmployee.branch || matchedEmployee.registeredShift) && (
              <div className="employee-lookup-summary form-field-wide">
                <div><span>Chi nhánh</span><strong>{matchedEmployee.branch || "—"}</strong></div>
                <div><span>Giờ ĐK</span><strong>{matchedEmployee.registeredShift || "—"}</strong></div>
              </div>
            )}
            <label className="form-field"><span>Vào 1</span><input type="time" value={formData.checkIn1} onChange={(event) => changeField("checkIn1", event.target.value)} /></label>
            <label className="form-field"><span>Ra 1</span><input type="time" value={formData.checkOut1} onChange={(event) => changeField("checkOut1", event.target.value)} /></label>
            <label className="form-field"><span>Vào 2</span><input type="time" value={formData.checkIn2} onChange={(event) => changeField("checkIn2", event.target.value)} /></label>
            <label className="form-field"><span>Ra 2</span><input type="time" value={formData.checkOut2} onChange={(event) => changeField("checkOut2", event.target.value)} /></label>
            <label className="form-field form-field-wide"><span>Ghi chú</span><textarea value={formData.note} onChange={(event) => changeField("note", event.target.value)} placeholder="Nhập ghi chú chấm công" /></label>
            <label className="form-field"><span>Có/Không phép</span><select value={formData.permissionStatus} onChange={(event) => changeField("permissionStatus", event.target.value)}><option value="">Để trống / chưa xác định</option><option value="Có phép">Có phép</option><option value="Không phép">Không phép</option></select></label>
            <fieldset className="form-field form-field-wide diary-violation-field">
              <legend>Loại ghi chú</legend>
              <div className="diary-checkbox-grid">
                {DIARY_NOTE_TYPES.map((type) => {
                  const checked = selectedNoteTypes.includes(type);
                  const disabled = isDiaryNoteTypeDisabled(selectedNoteTypes, type);
                  return (
                    <label className={`diary-checkbox-card ${checked ? "selected" : ""} ${disabled ? "disabled" : ""}`} key={type}>
                      <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggleNoteType(type)} />
                      <span>{type}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <label className="form-field form-field-wide creator-field">
              <span>Người lập biên bản</span>
              <input list="diary-creator-options" value={formData.recordMaker} onChange={(event) => changeCreator(event.target.value)} placeholder="Chọn hoặc nhập người lập" autoComplete="off" />
              <datalist id="diary-creator-options">{creatorOptions.map((employee) => <option key={employee.id || `${employee.employeeCode}-${employee.employeeName}`} value={employee.employeeName}>{employee.employeeCode}</option>)}</datalist>
              <small>{formData.creatorCode ? `Mã người lập: ${formData.creatorCode}` : "Có thể chọn từ danh sách nhân viên hoặc nhập tài khoản hệ thống."}</small>
            </label>

            <DiaryAttachmentField
              canRemoveAttachment={canRemoveAttachment}
              draft={attachmentDraft}
              isSaving={isSaving}
              maxFileSizeMb={maxFileSizeMb}
            />
          </div>
          {attachmentDraft.error && <p className="form-error">{attachmentDraft.error}</p>}
          <div className="modal-actions">
            <button className="button button-secondary" type="button" disabled={isSaving} onClick={onCancel}>Hủy</button>
            <button className="button button-primary" type="submit" disabled={isSaving}>
              {isSaving ? "Đang lưu..." : "Lưu"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
