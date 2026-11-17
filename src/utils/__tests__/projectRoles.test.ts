import { describe, it, expect } from 'vitest';
import {
  PROJECT_ASSIGNABLE_ROLES,
  ALL_PROJECT_ROLES,
  isValidProjectRole,
  normalizeProjectRole,
  getProjectRoleOption,
  getProjectRoleLabel,
  getEffectiveMemberRole,
} from '../projectRoles';
import { SapProject } from '../../types/sap';

describe('projectRoles utilities', () => {
  it('defines the 5 assignable member roles (ABAP, PM, FUNC, QA, PI)', () => {
    const codes = PROJECT_ASSIGNABLE_ROLES.map((r) => r.code);
    expect(codes).toEqual(['ABAP', 'PM', 'FUNC', 'QA', 'PI']);
    expect(ALL_PROJECT_ROLES.map((r) => r.code)).toContain('ADMIN');
  });

  it('validates project role codes accurately', () => {
    expect(isValidProjectRole('ABAP')).toBe(true);
    expect(isValidProjectRole('PM')).toBe(true);
    expect(isValidProjectRole('FUNC')).toBe(true);
    expect(isValidProjectRole('QA')).toBe(true);
    expect(isValidProjectRole('PI')).toBe(true);
    expect(isValidProjectRole('ADMIN')).toBe(true);

    expect(isValidProjectRole('UNKNOWN')).toBe(false);
    expect(isValidProjectRole('')).toBe(false);
    expect(isValidProjectRole(null)).toBe(false);
    expect(isValidProjectRole(undefined)).toBe(false);
  });

  it('normalizes Korean and English role descriptors to canonical UserProjectRole codes', () => {
    expect(normalizeProjectRole('개발자')).toBe('ABAP');
    expect(normalizeProjectRole('Developer')).toBe('ABAP');
    expect(normalizeProjectRole('프로젝트 매니저')).toBe('PM');
    expect(normalizeProjectRole('컨설턴트')).toBe('FUNC');
    expect(normalizeProjectRole('Consultant')).toBe('FUNC');
    expect(normalizeProjectRole('품질 테스트')).toBe('QA');
    expect(normalizeProjectRole('프로세스 혁신')).toBe('PI');
    expect(normalizeProjectRole('시스템 관리자')).toBe('ADMIN');
    expect(normalizeProjectRole('unrecognized', 'QA')).toBe('QA');
  });

  it('returns localized full and short role labels and options', () => {
    expect(getProjectRoleOption('ABAP').shortKo).toBe('개발자');
    expect(getProjectRoleLabel('ABAP', 'ko', 'short')).toBe('개발자');
    expect(getProjectRoleLabel('ABAP', 'ko', 'full')).toBe('개발자 (ABAP)');
    expect(getProjectRoleLabel('PI', 'en', 'short')).toBe('PI');
    expect(getProjectRoleLabel('PI', 'en', 'full')).toBe('PI (Process Innovation)');
  });

  it('resolves project-specific memberRoles with fallback to user default role', () => {
    const project: SapProject = {
      code: '2601',
      name: 'ERP Rollout',
      description: 'Test project',
      visibility: 'project',
      target_sap_release: 'SAP S/4HANA 2023',
      owner: 'Josh Lee',
      members: ['Josh Lee', 'Alice'],
      memberUids: ['uid-alice'],
      memberRoles: {
        'uid-alice': 'PI',
      },
      modules: ['SD', 'MM'],
      created_date: '2026-11-17',
    };

    expect(getEffectiveMemberRole(project, 'uid-alice', 'FUNC')).toBe('PI');
    expect(getEffectiveMemberRole(project, 'uid-bob', 'ABAP')).toBe('ABAP');
    expect(getEffectiveMemberRole(undefined, 'uid-alice', 'QA')).toBe('QA');
  });
});
