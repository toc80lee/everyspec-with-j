import { ProgramSpec } from '../types/sap';
import {
  generateC01Include,
  generateF01Include,
  generateModInclude,
  generateProgramInclude,
  generateS01Include,
  generateTopInclude,
  mergeUserLogicRegions,
} from './abapCodeEngine';

export function getTodayFormatted(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}.${month}.${day}`;
}

export function generateDefaultProgramSource(spec: Partial<ProgramSpec>): string {
  return mergeUserLogicRegions(generateProgramInclude(spec), spec.source_code?.program);
}

export function generateDefaultTopSource(spec: Partial<ProgramSpec>): string {
  return mergeUserLogicRegions(generateTopInclude(spec), spec.source_code?.top);
}

export function generateDefaultS01Source(spec: Partial<ProgramSpec>): string {
  return mergeUserLogicRegions(generateS01Include(spec), spec.source_code?.s01);
}

export function generateDefaultC01Source(spec?: Partial<ProgramSpec>): string {
  return mergeUserLogicRegions(generateC01Include(spec || {}), spec?.source_code?.c01);
}

export function generateDefaultModSource(
  sampleType: string = '01',
  spec?: Partial<ProgramSpec>
): string {
  return mergeUserLogicRegions(
    generateModInclude({ ...(spec || {}), sample_type: sampleType }),
    spec?.source_code?.mod
  );
}

export function generateDefaultF01Source(spec: Partial<ProgramSpec>): string {
  return mergeUserLogicRegions(generateF01Include(spec), spec.source_code?.f01);
}
