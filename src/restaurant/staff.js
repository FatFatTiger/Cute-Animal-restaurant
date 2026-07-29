'use strict';

/**
 * 员工三岗排班与岗位加成（纯逻辑，零引擎依赖）。
 *
 * 员工 = 玩家拥有的动物（role_affinity 来自程序化拼装参数，家族/属性决定主适配岗）。
 * 排班到 chef / waiter / host 三岗之一；在岗员工按 §3.3 贡献该岗 mult。
 *
 * 适配判定：员工 affinityRole === 当前上岗 role → 该岗 mult 额外 × AFFINITY_BONUS（整乘）。
 */

const ieff = require('../economy/ieff');

const ROLES = ['chef', 'waiter', 'host'];

function createStaff({ id, affinityRole, level }) {
  if (!affinityRole || !ROLES.includes(affinityRole)) {
    throw new Error('BAD_AFFINITY_ROLE:' + affinityRole);
  }
  return { id, affinityRole, level: level || 1, role: null };
}

/** 排班器：维护员工→岗位分配，计算三岗总 mult 与在岗岗位集合。 */
class StaffSchedule {
  constructor(staffList) {
    this._staff = (staffList || []).map((s) => Object.assign({}, s));
    this._byId = new Map();
    for (const s of this._staff) this._byId.set(s.id, s);
  }

  assign(staffId, role) {
    const s = this._byId.get(staffId);
    if (!s) throw new Error('UNKNOWN_STAFF:' + staffId);
    if (!ROLES.includes(role)) throw new Error('BAD_ROLE:' + role);
    s.role = role;
    return s;
  }

  unassign(staffId) {
    const s = this._byId.get(staffId);
    if (s) s.role = null;
  }

  staffInRole(role) {
    return this._staff.filter((s) => s.role === role);
  }

  onDutyRoles() {
    const set = new Set();
    for (const s of this._staff) if (s.role) set.add(s.role);
    return set;
  }

  /** 某岗总 mult（乘区叠加）。 */
  roleMult(role) {
    return ieff.roleMult(this._staff, role);
  }

  /** 三岗 mult 拆解 + 在岗岗位集合，便于 I_eff 组装与匹配判定。 */
  breakdown() {
    return {
      chef_mult: this.roleMult('chef'),
      waiter_mult: this.roleMult('waiter'),
      host_mult: this.roleMult('host'),
      onDutyRoles: this.onDutyRoles(),
    };
  }
}

module.exports = { createStaff, StaffSchedule, ROLES };
