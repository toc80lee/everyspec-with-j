import { GoogleGenAI } from '@google/genai';

export const GEMINI_TEXT_MODEL = 'gemini-4-hydrogen';
export const GEMINI_TRANSCRIBE_MODEL = 'gemini-3.5-transcribe';

export const SAP_AUDIO_GLOSSARY_HINT =
  'ABAP, ALV, CL_GUI_ALV_GRID, BAPI, T-Code, PARAMETERS, SELECT-OPTIONS, FIELD CATALOG, LVC_T_FCAT, LVC_S_LAYO, LVC_T_SORT, AUTHORITY-CHECK, SE91, SE11, SE38, SE80, CDS View, BSEG, BKPF, ACDOCA, VBAK, VBAP, KNA1, LIKP, LIPS, VBRK, VBRP, MARA, MAKT, EKKO, EKPO, EKBE, LFA1, CSKS, COEP, COSP, SETNODE, SETLEAF, S/4HANA, ECC, FI, CO, SD, MM, PP, HR, QM, PM';

let cachedAi: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
  if (!cachedAi) {
    cachedAi = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return cachedAi;
}

export interface CustomDdicTablePromptItem {
  tabname: string;
  ddtext?: string;
  module?: string;
  fields?: Array<{
    fieldname: string;
    datatype?: string;
    leng?: number;
    scrtext_l?: string;
    keyflag?: boolean;
  }>;
}

export function formatCustomTablesContext(customTables: CustomDdicTablePromptItem[] = []): string {
  if (!Array.isArray(customTables) || customTables.length === 0) {
    return '';
  }
  const lines = customTables.slice(0, 15).map((t) => {
    const fieldStr = (t.fields || [])
      .slice(0, 20)
      .map(
        (f) =>
          `${f.fieldname}(${f.datatype || 'CHAR'}${f.leng ? `(${f.leng})` : ''}${f.keyflag ? ',PK' : ''}${f.scrtext_l ? `:${f.scrtext_l}` : ''})`
      )
      .join(', ');
    return `- Table ${t.tabname} [${t.module || 'CUSTOM'}] (${t.ddtext || ''}): ${fieldStr || 'fields omitted'}`;
  });
  return `\n[Custom / Project Z/Y DDIC Tables Registered in Repository]\n${lines.join('\n')}`;
}
