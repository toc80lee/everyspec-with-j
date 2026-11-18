import { useState, useRef, useCallback, useEffect } from 'react';
import {
  authorizedFetch,
  isAuthorizedFetchTimeoutError,
} from '../utils/authorizedFetch';

interface UseVoiceInputOptions {
  lang?: string;
  onResult?: (text: string) => void;
  onError?: (errorMessage: string) => void;
}

export function useVoiceInput(options: UseVoiceInputOptions = {}) {
  const { lang = 'ko-KR', onResult, onError } = options;
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isSupported, setIsSupported] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<any>(null);
  const speechRecognizedTextRef = useRef<string>('');
  const latestTranscriptRef = useRef<string>('');

  const isTouchMobileDevice = () => {
    if (typeof navigator === 'undefined') return false;
    return (
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    );
  };

  useEffect(() => {
    const hasMedia = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    const hasSpeech = !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
    if (!hasMedia && !hasSpeech) {
      setIsSupported(false);
    }
  }, []);

  const sendAudioToGeminiTranscribe = async (audioBlob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const base64Data = reader.result as string;
          const mimeType = audioBlob.type || 'audio/webm';

          const res = await authorizedFetch('/api/transcribe-audio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            timeoutMs: 30_000,
            body: JSON.stringify({
              audioData: base64Data,
              mimeType,
            }),
          });

          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            const rawErr = String(errData.error || `Server error (${res.status})`);
            if (res.status === 403 && errData.code === 'APPROVAL_REQUIRED') {
              throw new Error(
                errData.error ||
                  '관리자 승인 대기 중인 계정입니다. 관리자에게 승인을 요청한 뒤 다시 시도해 주세요.'
              );
            }
            if (res.status === 401) {
              throw new Error(
                errData.error || '인증이 만료되었습니다. 다시 로그인한 뒤 시도해 주세요.'
              );
            }
            if (res.status === 429) {
              throw new Error(
                errData.error || '음성 변환 요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.'
              );
            }
            if (
              errData.code === 'MISSING_GEMINI_API_KEY' ||
              rawErr.toLowerCase().includes('default credentials') ||
              rawErr.toLowerCase().includes('access_token_scope_insufficient')
            ) {
              throw new Error(
                '태블릿 등 모바일 환경에서는 서버 음성 변환(Gemini)이 사용됩니다. 배포 환경 또는 AI Studio Settings > Secrets에서 GEMINI_API_KEY가 설정되어 있는지 확인해 주세요.'
              );
            }
            throw new Error(rawErr);
          }

          const data = await res.json();
          resolve(data.text || '');
        } catch (err: any) {
          if (isAuthorizedFetchTimeoutError(err)) {
            reject(
              new Error(
                '음성 변환 요청 시간이 초과되었습니다(30초). 네트워크 상태를 확인하거나 직접 메모를 입력해 주세요.'
              )
            );
            return;
          }
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('Failed to read audio data.'));
      reader.readAsDataURL(audioBlob);
    });
  };

  const startListening = useCallback(async () => {
    setErrorMessage(null);
    setTranscript('');
    latestTranscriptRef.current = '';
    speechRecognizedTextRef.current = '';
    audioChunksRef.current = [];

    // 1. First, check if mediaDevices or SpeechRecognition is available
    let stream: MediaStream | null = null;
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
    } catch (err: any) {
      console.warn('Microphone permission or hardware access issue:', err);
      const isPermissionDenied = err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError';
      const errMsg = isPermissionDenied
        ? 'Microphone access is blocked. Allow microphone permission in your browser settings.'
        : 'Microphone device not found or inaccessible.';
      setErrorMessage(errMsg);
      if (onError) onError(errMsg);
      return;
    }

    setIsListening(true);

    // 2. Start MediaRecorder with the active audio stream
    let mediaRecorderStarted = false;
    if (stream && typeof MediaRecorder !== 'undefined') {
      try {
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : '';

        const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        recorder.start(250); // Slice data every 250ms
        mediaRecorderStarted = true;
      } catch (recErr) {
        console.warn('MediaRecorder init error:', recErr);
      }
    }

    // 3. On desktop browsers, simultaneously run Web Speech API for real-time live preview.
    // On mobile/tablet touch devices, avoid opening SpeechRecognition alongside an active MediaRecorder
    // stream because mobile OS audio drivers often deny or mute dual mic capture.
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognition && (!mediaRecorderStarted || !isTouchMobileDevice())) {
      try {
        const recognition = new SpeechRecognition();
        recognition.lang = lang;
        recognition.continuous = true;
        recognition.interimResults = true;

        recognition.onresult = (event: any) => {
          let currentInterim = '';
          let currentFinal = '';

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              currentFinal += event.results[i][0].transcript;
            } else {
              currentInterim += event.results[i][0].transcript;
            }
          }

          const combined = (currentFinal || currentInterim).trim();
          if (combined) {
            latestTranscriptRef.current = combined;
            setTranscript(combined);
          }
          if (currentFinal) {
            speechRecognizedTextRef.current = (
              speechRecognizedTextRef.current + ' ' + currentFinal.trim()
            ).trim();
          }
        };

        recognition.onerror = (event: any) => {
          console.warn('SpeechRecognition warning:', event.error);
          // If Web Speech API fails (e.g. inside iframe sandbox), we still have MediaRecorder recording!
        };

        recognition.onend = () => {
          // If ended prematurely while listening, keep MediaRecorder active
        };

        recognitionRef.current = recognition;
        recognition.start();
      } catch (srErr) {
        console.warn('SpeechRecognition start failed (will rely on Gemini transcription):', srErr);
      }
    }
  }, [lang, onError]);

  const stopListening = useCallback(async () => {
    setIsListening(false);

    // Stop Web Speech Recognition
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        // ignore
      }
      recognitionRef.current = null;
    }

    // Stop MediaRecorder and process audio
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      setIsTranscribing(true);
      recorder.onstop = async () => {
        try {
          // Stop all audio tracks to turn off the microphone hardware light
          if (recorder.stream) {
            recorder.stream.getTracks().forEach((track) => track.stop());
          }

          // If Web Speech API already gathered text, check if it's reliable
          const liveText =
            speechRecognizedTextRef.current.trim() || latestTranscriptRef.current.trim();

          // Prepare Audio Blob
          const mimeType = recorder.mimeType || 'audio/webm';
          const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });

          let finalText = liveText;

          // If liveText is empty or short, transcribe using Gemini 3.5 Transcribe
          if (!finalText && audioBlob.size > 200) {
            const aiText = await sendAudioToGeminiTranscribe(audioBlob);
            finalText = aiText.trim();
          }

          if (finalText) {
            latestTranscriptRef.current = finalText;
            setTranscript(finalText);
            if (onResult) {
              onResult(finalText);
            }
          } else {
            setErrorMessage('No speech detected. Speak clearly closer to the microphone.');
          }
        } catch (transcribeErr: any) {
          console.error('Audio processing failed:', transcribeErr);
          // If we had any partial liveText, fallback to that
          const fallback =
            speechRecognizedTextRef.current.trim() || latestTranscriptRef.current.trim();
          if (fallback) {
            if (onResult) onResult(fallback);
          } else {
            const msg = transcribeErr.message || 'Failed to transcribe audio.';
            setErrorMessage(msg);
            if (onError) onError(msg);
          }
        } finally {
          setIsTranscribing(false);
          mediaRecorderRef.current = null;
          audioChunksRef.current = [];
        }
      };

      try {
        recorder.stop();
      } catch (err) {
        setIsTranscribing(false);
      }
    } else {
      if (recorder?.stream) {
        recorder.stream.getTracks().forEach((track) => track.stop());
      }
      mediaRecorderRef.current = null;
      // Just Web Speech finished
      const text =
        speechRecognizedTextRef.current.trim() || latestTranscriptRef.current.trim();
      if (text && onResult) {
        onResult(text);
      }
      setIsTranscribing(false);
    }
  }, [onResult, onError]);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  // Direct simulation helper for environments where hardware mic is blocked
  const insertSimulatedVoiceText = useCallback(
    (text: string) => {
      setTranscript(text);
      setErrorMessage(null);
      if (onResult) {
        onResult(text);
      }
    },
    [onResult]
  );

  return {
    isListening,
    isTranscribing,
    isSupported,
    transcript,
    errorMessage,
    clearError: () => setErrorMessage(null),
    startListening,
    stopListening,
    toggleListening,
    insertSimulatedVoiceText,
  };
}
