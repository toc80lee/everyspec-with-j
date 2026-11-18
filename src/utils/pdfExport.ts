import type { ProgramSpec } from '../types/sap';

export interface PdfExportProgress {
  percent: number;
  step: string;
}

export interface PdfExportOptions {
  mode?: 'high_fidelity' | 'vector';
  includeApproval?: boolean;
  includeRevision?: boolean;
  includeDataFlow?: boolean;
  onProgress?: (progress: PdfExportProgress) => void;
}

export async function exportSpecificationPdf(
  spec: ProgramSpec,
  options?: PdfExportOptions
): Promise<void> {
  const { exportSpecificationPdf: runExport } = await import('./pdfExportEngine');
  return runExport(spec, options);
}
