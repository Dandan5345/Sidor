const fields = ['authUid', 'code', 'firstName', 'lastName', 'type', 'student'];
const sameEmployee = (a, b) => (!a && !b) || (!!a && !!b && fields.every(key => a[key] === b[key]));
const duplicateCode = (state, o) => o.employee && Object.entries(state.employees || {}).some(([id, value]) => id !== o.id && String(value.code).trim() === String(o.employee.code).trim());
export function ownsEmployeeLease(state, o, now) {
  return state?.employeeOperations?.[o.id]?.operationId === o.operationId && state.employeeOperations[o.id].expiresAt > now && (!o.codeChanged || (state.employeeCodeClaims?.[o.codeKey]?.operationId === o.operationId && state.employeeCodeClaims[o.codeKey].expiresAt > now));
}
export function reserveEmployeeChange(state, o, now, leaseMs = 120000) {
  if (!state || !sameEmployee(state.employees?.[o.id], o.previous) || duplicateCode(state, o)) return;
  if (state.employeeOperations?.[o.id]?.expiresAt > now) return;
  if (o.codeChanged && state.employeeCodeClaims?.[o.codeKey]?.expiresAt > now) return;
  const lease = { operationId: o.operationId, expiresAt: now + leaseMs };
  (state.employeeOperations ||= {})[o.id] = lease;
  if (o.codeChanged) (state.employeeCodeClaims ||= {})[o.codeKey] = { ...lease, employeeId: o.id };
  return state;
}
export function commitEmployeeChange(state, o, authUid, now) {
  if (!ownsEmployeeLease(state, o, now) || !sameEmployee(state.employees?.[o.id], o.previous) || duplicateCode(state, o)) return;
  if (o.employee) {
    const { firstName, lastName, type, student } = o.employee;
    (state.employees ||= {})[o.id] = { ...o.employee, authUid };
    (state.employeeProfiles ||= {})[o.id] = { firstName, lastName, type, student };
    ((state.access ||= {}).employees ||= {})[authUid] = o.id;
    for (const schedule of Object.values(state.schedules || {})) if (schedule.employeeId === o.id) {
      schedule.name = `${firstName} ${lastName}`;
      schedule.role = type;
    }
  } else {
    delete state.employees?.[o.id];
    delete state.employeeProfiles?.[o.id];
    delete state.employeeRules?.[o.id];
  }
  if (o.previous?.authUid && o.previous.authUid !== authUid) delete state.access?.employees?.[o.previous.authUid];
  delete state.employeeOperations[o.id];
  if (o.codeChanged) delete state.employeeCodeClaims[o.codeKey];
  return state;
}
export function releaseEmployeeChange(state, o) {
  if (!state) return;
  let changed = false;
  if (state.employeeOperations?.[o.id]?.operationId === o.operationId) { delete state.employeeOperations[o.id]; changed = true; }
  if (o.codeChanged && state.employeeCodeClaims?.[o.codeKey]?.operationId === o.operationId) { delete state.employeeCodeClaims[o.codeKey]; changed = true; }
  return changed ? state : undefined;
}
