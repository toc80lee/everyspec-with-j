import { GoogleGenAI } from '@google/genai';

export const GEMINI_TEXT_MODEL = 'gemini-4-hydrogen';
export const GEMINI_TRANSCRIBE_MODEL = 'gemini-3.5-transcribe';

export const SAP_AUDIO_GLOSSARY_HINT =
  'ABAP, ALV, CL_GUI_ALV_GRID, BAPI, T-Code, PARAMETERS, SELECT-OPTIONS, FIELD CATALOG, LVC_T_FCAT, LVC_S_LAYO, LVC_T_SORT, AUTHORITY-CHECK, SE91, SE11, SE38, SE80, CDS View, BSEG, BKPF, ACDOCA, VBAK, VBAP, KNA1, LIKP, LIPS, VBRK, VBRP, MARA, MAKT, EKKO, EKPO, EKBE, LFA1, CSKS, COEP, COSP, SETNODE, SETLEAF, S/4HANA, ECC, FI, CO, SD, MM, PP, HR, QM, PM';

export class GeminiMissingKeyError extends Error {
  statusCode = 503;
  constructor() {
    super(
      'GEMINI_API_KEY is not configured. Please add GEMINI_API_KEY in AI Studio Settings > Secrets.'
    );
    this.name = 'GeminiMissingKeyError';
  }
}

export function getConfiguredGeminiApiKey(): string | null {
  const key = (process.env.GEMINI_API_KEY || '').trim();
  if (!key || key === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return key;
}

export function isCredentialOrMissingKeyError(err: unknown): boolean {
  if (err instanceof GeminiMissingKeyError) return true;
  const msg = String((err as any)?.message || err || '').toLowerCase();
  return (
    msg.includes('default credentials') ||
    msg.includes('could not load the default credentials') ||
    msg.includes('access_token_scope_insufficient') ||
    msg.includes('api key should be set') ||
    msg.includes('api_key_invalid')
  );
}

let cachedAi: GoogleGenAI | null = null;
let cachedApiKey: string | null = null;

export function getGeminiClient(): GoogleGenAI {
  const apiKey = getConfiguredGeminiApiKey();
  if (!apiKey) {
    throw new GeminiMissingKeyError();
  }
  if (!cachedAi || cachedApiKey !== apiKey) {
    cachedAi = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
    cachedApiKey = apiKey;
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
