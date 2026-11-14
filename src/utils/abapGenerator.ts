import { ProgramSpec } from '../types/sap';
import {
  AbapEngineOptions,
  assembleUnifiedAbapProgram,
  generateAllIncludes,
} from './abapCodeEngine';

export type { AbapEngineOptions };
export { assembleUnifiedAbapProgram, generateAllIncludes };

export function generateFullAbapSource(
  spec: ProgramSpec,
  options?: AbapEngineOptions
): string {
  return assembleUnifiedAbapProgram(spec, options);
}
