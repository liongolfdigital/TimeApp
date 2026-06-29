import { CLOCK_SLOT_LABELS, MINUTES_PER_DAY } from "../constants/attendanceConstants.js";
import { normalizeText } from "../employees/employeeModel.js";
import { clockDistance, timeValueToMinutes } from "../utils/timeUtils.js";

function formatClockValue(value) {
  const minutes = timeValueToMinutes(value);
  if (minutes === null) return normalizeText(value);
  const roundedMinutes = Math.round(minutes) % MINUTES_PER_DAY;
  return `${String(Math.floor(roundedMinutes / 60)).padStart(2, "0")}:${String(
    roundedMinutes % 60,
  ).padStart(2, "0")}`;
}

function getShiftStartValue(employee, shift) {
  return shift.startValue ?? employee[shift.startField];
}

function getShiftEndValue(employee, shift) {
  return shift.endValue ?? employee[shift.endField];
}

function getRegisteredMarkers(employee, shiftAssignment, shiftCandidates = []) {
  const markerValues = shiftAssignment
    ? {
        in: [[`Vào ${shiftAssignment.shift.name}`, getShiftStartValue(employee, shiftAssignment.shift)]],
        out: [[`Ra ${shiftAssignment.shift.name}`, getShiftEndValue(employee, shiftAssignment.shift)]],
      }
    : shiftCandidates.length > 0
      ? {
          in: shiftCandidates.map((shift) => [`Vào ${shift.name}`, getShiftStartValue(employee, shift)]),
          out: shiftCandidates.map((shift) => [`Ra ${shift.name}`, getShiftEndValue(employee, shift)]),
        }
      : {
          in: [
            ["Vào sáng", employee.morningIn],
            ["Vào chiều", employee.afternoonIn],
            ["Vào tối", employee.eveningIn],
          ],
          out: [
            ["Ra sáng", employee.morningOut],
            ["Ra chiều", employee.afternoonOut],
            ["Ra tối", employee.eveningOut],
          ],
        };
  return Object.fromEntries(
    Object.entries(markerValues).map(([type, markers]) => [
      type,
      markers
        .map(([label, value]) => ({ label, minutes: timeValueToMinutes(value) }))
        .filter(({ minutes }) => minutes !== null),
    ]),
  );
}

function findNearestMarker(actualMinutes, markers) {
  if (markers.length === 0) return null;
  return markers.reduce((nearest, marker) =>
    clockDistance(actualMinutes, marker.minutes)
      < clockDistance(actualMinutes, nearest.minutes)
      ? marker
      : nearest,
  );
}

function classifyClockValue(value, originalType, registeredMarkers) {
  const actualMinutes = timeValueToMinutes(value);
  if (actualMinutes === null) return null;
  const nearestIn = findNearestMarker(actualMinutes, registeredMarkers.in);
  const nearestOut = findNearestMarker(actualMinutes, registeredMarkers.out);
  if (!nearestIn && !nearestOut) return null;
  if (!nearestIn) return { type: "out", marker: nearestOut };
  if (!nearestOut) return { type: "in", marker: nearestIn };
  const inDistance = clockDistance(actualMinutes, nearestIn.minutes);
  const outDistance = clockDistance(actualMinutes, nearestOut.minutes);
  if (inDistance === outDistance) {
    return {
      type: originalType,
      marker: originalType === "in" ? nearestIn : nearestOut,
    };
  }
  return inDistance < outDistance
    ? { type: "in", marker: nearestIn }
    : { type: "out", marker: nearestOut };
}

function makeMoveNote(value, sourceSlot, targetSlot) {
  return `Đã chuyển ${formatClockValue(value)} từ ${CLOCK_SLOT_LABELS[sourceSlot]} sang ${CLOCK_SLOT_LABELS[targetSlot]}`;
}

export function adjustClockColumns(
  employee,
  clockValues,
  shiftAssignment = null,
  shiftCandidates = [],
) {
  const original = { ...clockValues };
  const adjusted = { in1: null, out1: null, in2: null, out2: null };
  const sourceSlots = { in1: null, out1: null, in2: null, out2: null };
  const notes = [];
  const registeredMarkers = getRegisteredMarkers(employee, shiftAssignment, shiftCandidates);
  const slots = ["in1", "out1", "in2", "out2"];
  const targetSlots = { in: ["in1", "in2"], out: ["out1", "out2"] };
  const punches = slots
    .filter((slot) => original[slot] !== null
      && original[slot] !== undefined
      && original[slot] !== "")
    .map((sourceSlot) => {
      const originalType = sourceSlot.startsWith("in") ? "in" : "out";
      const classification = classifyClockValue(
        original[sourceSlot],
        originalType,
        registeredMarkers,
      );
      return {
        sourceSlot,
        originalType,
        targetType: classification?.type ?? originalType,
        value: original[sourceSlot],
      };
    });
  let changed = false;

  punches
    .filter(({ originalType, targetType }) => originalType === targetType)
    .forEach(({ sourceSlot, value }) => {
      adjusted[sourceSlot] = value;
      sourceSlots[sourceSlot] = sourceSlot;
    });

  punches
    .filter(({ originalType, targetType }) => originalType !== targetType)
    .forEach(({ sourceSlot, targetType, value }) => {
      const pairNumber = sourceSlot.endsWith("1") ? "1" : "2";
      const preferredTarget = `${targetType}${pairNumber}`;
      const availableTarget = (adjusted[preferredTarget] === null && preferredTarget)
        || targetSlots[targetType].find((slot) => adjusted[slot] === null);
      if (availableTarget) {
        adjusted[availableTarget] = value;
        sourceSlots[availableTarget] = sourceSlot;
        notes.push(makeMoveNote(value, sourceSlot, availableTarget));
        changed = true;
        return;
      }
      adjusted[sourceSlot] = value;
      sourceSlots[sourceSlot] = sourceSlot;
      const targetLabel = targetType === "in" ? "Vào" : "Ra";
      notes.push(
        `Không thể chuyển ${formatClockValue(value)} từ ${CLOCK_SLOT_LABELS[sourceSlot]} vì cả hai cột ${targetLabel} đã có dữ liệu; giữ nguyên giá trị`,
      );
    });

  return {
    original,
    adjusted,
    sourceSlots,
    notes,
    changed,
    hasLog: notes.length > 0,
  };
}
