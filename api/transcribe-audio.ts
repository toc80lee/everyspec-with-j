import { GoogleGenAI } from '@google/genai';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '25mb',
    },
  },
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { audioData, mimeType } = req.body || {};

    if (!audioData) {
      return res.status(400).json({ error: '오디오 데이터가 전달되지 않았습니다.' });
    }

    const apiKey = (process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      return res.status(503).json({
        code: 'MISSING_GEMINI_API_KEY',
        error:
          '음성 인식 API 키(GEMINI_API_KEY)가 설정되어 있지 않습니다. AI Studio의 Settings > Secrets 패널에서 GEMINI_API_KEY를 등록한 뒤 다시 시도해 주세요.',
      });
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const base64Data = audioData.includes(',') ? audioData.split(',')[1] : audioData;
    const rawMime = typeof mimeType === 'string' && mimeType.trim() ? mimeType.trim() : 'audio/webm';
    const resolvedMimeType = rawMime.split(';')[0].trim() || 'audio/webm';

    const audioPart = {
      inlineData: {
        mimeType: resolvedMimeType,
        data: base64Data,
      },
    };

    const SAP_AUDIO_GLOSSARY_HINT =
      'ABAP, ALV, CL_GUI_ALV_GRID, BAPI, T-Code, PARAMETERS, SELECT-OPTIONS, FIELD CATALOG, LVC_T_FCAT, LVC_S_LAYO, LVC_T_SORT, AUTHORITY-CHECK, SE91, SE11, SE38, SE80, CDS View, BSEG, BKPF, ACDOCA, VBAK, VBAP, KNA1, LIKP, LIPS, VBRK, VBRP, MARA, MAKT, EKKO, EKPO, EKBE, LFA1, CSKS, COEP, COSP, SETNODE, SETLEAF, S/4HANA, ECC, FI, CO, SD, MM, PP, HR, QM, PM';

    const glossaryHint = typeof req.body?.glossaryHint === 'string' && req.body.glossaryHint.trim()
      ? `${SAP_AUDIO_GLOSSARY_HINT}, ${req.body.glossaryHint.trim()}`
      : SAP_AUDIO_GLOSSARY_HINT;

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-transcribe',
      contents: {
        parts: [
          audioPart,
          {
            text: `사용자가 말한 음성을 한국어로 정확하게 받아적어주세요. SAP ERP 도메인 용어(${glossaryHint})는 정확한 영문/약어(예: ALV, BSEG, ACDOCA, VA03, T-Code)로 표기하세요. 인사말이나 부연 설명 없이 오직 받아적은 텍스트 내용만 출력하세요.`,
          },
        ],
      },
    });

    const transcribedText = response.text?.trim() || '';
    return res.status(200).json({ text: transcribedText });
  } catch (error: any) {
    console.error('Audio transcription error in Vercel function:', error);
    const msg = String(error?.message || '').toLowerCase();
    if (
      msg.includes('default credentials') ||
      msg.includes('access_token_scope_insufficient') ||
      msg.includes('api key should be set')
    ) {
      return res.status(503).json({
        code: 'MISSING_GEMINI_API_KEY',
        error:
          '음성 인식 API 키(GEMINI_API_KEY)가 설정되어 있지 않습니다. AI Studio의 Settings > Secrets 패널에서 GEMINI_API_KEY를 등록한 뒤 다시 시도해 주세요.',
      });
    }
    return res.status(500).json({
      error: error?.message || '음성 인식 중 오류가 발생했습니다.',
    });
  }
}
