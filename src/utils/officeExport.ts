import type { ProgramSpec, SapProject } from '../types/sap';

export async function exportSpecificationXlsx(spec: ProgramSpec): Promise<string> {
  const { exportSpecificationXlsx: runXlsx } = await import('./officeExportXlsx');
  return runXlsx(spec);
}

export async function exportSpecificationDocx(spec: ProgramSpec): Promise<string> {
  const { exportSpecificationDocx: runDocx } = await import('./officeExportDocx');
  return runDocx(spec);
}

export async function exportProjectWricefIndexXlsx(
  project: SapProject | undefined,
  specs: ProgramSpec[],
  unresolvedCommentCounts?: Record<string, number>
): Promise<string> {
  const { exportProjectWricefIndexXlsx: runWricef } = await import('./officeExportXlsx');
  return runWricef(project, specs, unresolvedCommentCounts);
}

export async function exportBatchSpecsDocuments(
  specs: ProgramSpec[],
  format: 'xlsx' | 'docx'
): Promise<string[]> {
  const filenames: string[] = [];
  for (const spec of specs) {
    if (format === 'xlsx') {
      filenames.push(await exportSpecificationXlsx(spec));
    } else {
      filenames.push(await exportSpecificationDocx(spec));
    }
    // Slight stagger to prevent browser multi-download throttling
    await new Promise((resolve) => setTimeout(resolve, 180));
  }
  return filenames;
}
