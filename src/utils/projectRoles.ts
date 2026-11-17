import { SapProject, UserProjectRole } from '../types/sap';

export interface ProjectRoleOption {
  code: UserProjectRole;
  labelKo: string;
  labelEn: string;
  shortKo: string;
  shortEn: string;
  badgeClass: string;
}

export const PROJECT_ASSIGNABLE_ROLES: ProjectRoleOption[] = [
  {
    code: 'ABAP',
    labelKo: '개발자 (ABAP)',
    labelEn: 'Developer (ABAP)',
    shortKo: '개발자',
    shortEn: 'Developer',
    badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  },
  {
    code: 'PM',
    labelKo: 'PM (프로젝트 매니저)',
    labelEn: 'PM (Project Manager)',
    shortKo: 'PM',
    shortEn: 'PM',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  {
    code: 'FUNC',
    labelKo: '컨설턴트 (기능/모듈)',
    labelEn: 'Consultant (Functional)',
    shortKo: '컨설턴트',
    shortEn: 'Consultant',
    badgeClass: 'bg-blue-50 text-blue-800 border-blue-200',
  },
  {
    code: 'QA',
    labelKo: 'QA (품질/테스트)',
    labelEn: 'QA (Quality Assurance)',
    shortKo: 'QA',
    shortEn: 'QA',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
  {
    code: 'PI',
    labelKo: 'PI (프로세스 혁신)',
    labelEn: 'PI (Process Innovation)',
    shortKo: 'PI',
    shortEn: 'PI',
    badgeClass: 'bg-violet-50 text-violet-800 border-violet-200',
  },
];

export const ADMIN_ROLE_OPTION: ProjectRoleOption = {
  code: 'ADMIN',
  labelKo: '시스템 관리자 (ADMIN)',
  labelEn: 'System Admin (ADMIN)',
  shortKo: '관리자',
  shortEn: 'ADMIN',
  badgeClass: 'bg-slate-900 text-white border-slate-900',
};

export const ALL_PROJECT_ROLES: ProjectRoleOption[] = [
  ...PROJECT_ASSIGNABLE_ROLES,
  ADMIN_ROLE_OPTION,
];

const VALID_PROJECT_ROLES: UserProjectRole[] = ['PM', 'FUNC', 'ABAP', 'QA', 'PI', 'ADMIN'];

export function isValidProjectRole(val: unknown): val is UserProjectRole {
  return typeof val === 'string' && VALID_PROJECT_ROLES.includes(val as UserProjectRole);
}

export function normalizeProjectRole(
  val: unknown,
  fallback: UserProjectRole = 'FUNC'
): UserProjectRole {
  if (isValidProjectRole(val)) return val;
  if (typeof val === 'string') {
    const upper = val.trim().toUpperCase();
    if (upper.includes('ABAP') || upper.includes('DEV') || val.includes('개발')) return 'ABAP';
    if (upper.includes('PM') || upper.includes('PROJECT MANAGER') || val.includes('매니저')) return 'PM';
    if (upper.includes('QA') || val.includes('품질') || val.includes('테스트')) return 'QA';
    if (upper.includes('PI') || val.includes('혁신')) return 'PI';
    if (upper.includes('ADMIN') || val.includes('관리자')) return 'ADMIN';
    if (upper.includes('FUNC') || upper.includes('CONSULT') || val.includes('컨설턴트')) return 'FUNC';
  }
  return fallback;
}

export function getProjectRoleOption(role: UserProjectRole): ProjectRoleOption {
  return ALL_PROJECT_ROLES.find((r) => r.code === role) || PROJECT_ASSIGNABLE_ROLES[2];
}

export function getProjectRoleLabel(
  role: UserProjectRole | string | undefined,
  lang: 'ko' | 'en',
  mode: 'full' | 'short' = 'full'
): string {
  const normalized = normalizeProjectRole(role, 'FUNC');
  const opt = getProjectRoleOption(normalized);
  if (mode === 'short') {
    return lang === 'ko' ? opt.shortKo : opt.shortEn;
  }
  return lang === 'ko' ? opt.labelKo : opt.labelEn;
}

export function getEffectiveMemberRole(
  project: SapProject | undefined,
  uid: string | undefined,
  fallbackRole: UserProjectRole = 'FUNC'
): UserProjectRole {
  if (project?.memberRoles && uid && isValidProjectRole(project.memberRoles[uid])) {
    return project.memberRoles[uid];
  }
  return fallbackRole;
}
