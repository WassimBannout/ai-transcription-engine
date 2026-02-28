import { useState, useRef, useEffect, useCallback } from 'react';
import styles from './App.module.css';
import { Header } from './components/Header';
import { InputTabs } from './components/InputTabs';
import type { TabId } from './components/InputTabs';
import { SettingsPanel } from './components/SettingsPanel';
import { TranscriptionResults } from './components/TranscriptionResults';
import { ErrorMessage } from './components/ErrorMessage';
import { Footer } from './components/Footer';
import { DOMAIN_PRESETS, DEFAULT_PRESET_ID } from './data/presets';

interface TranscriptionResponse {
  success: boolean;
  text?: string;
  error?: string;
  detail?: string;
}

interface SystemPromptResponse {
  default_prompt: string;
}

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [rawText, setRawText] = useState<string | null>(null);
  const [cleanedText, setCleanedText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [useLLM, setUseLLM] = useState(true);
  const [isCopied, setIsCopied] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [isLoadingPrompt, setIsLoadingPrompt] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [isCleaningWithLLM, setIsCleaningWithLLM] = useState(false);
  const [isOriginalExpanded, setIsOriginalExpanded] = useState(true);
  const [selectedPreset, setSelectedPreset] = useState(DEFAULT_PRESET_ID);
  const [activeTab, setActiveTab] = useState<TabId>('record');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const isKeyDownRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamAbortRef = useRef<AbortController | null>(null);

  // Cancel any in-flight stream on unmount.
  useEffect(() => {
    return () => {
      streamAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const loadSystemPrompt = async () => {
      try {
        const response = await fetch('/api/system-prompt');
        if (!response.ok) {
          const errorBody = (await response.json().catch(() => null)) as
            | { detail?: string }
            | null;
          const detail = errorBody?.detail ?? response.statusText;
          throw new Error(detail);
        }
        const data = (await response.json()) as SystemPromptResponse;
        setSystemPrompt(data.default_prompt);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('Failed to load system prompt:', err);
        setError('Failed to load system prompt: ' + message);
      } finally {
        setIsLoadingPrompt(false);
      }
    };

    void loadSystemPrompt();
  }, []);

  /** Stream LLM cleaning token-by-token via SSE. Updates cleanedText incrementally. */
  const streamClean = useCallback(
    async (text: string) => {
      // Cancel any in-flight stream before starting a new one.
      streamAbortRef.current?.abort();
      const controller = new AbortController();
      streamAbortRef.current = controller;

      setIsCleaningWithLLM(true);
      setCleanedText('');
      setError(null);

      try {
        const response = await fetch('/api/clean/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            ...(systemPrompt && { system_prompt: systemPrompt }),
          }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          const errorBody = (await response.json().catch(() => null)) as
            | { detail?: string }
            | null;
          const detail = errorBody?.detail ?? response.statusText;
          throw new Error(`Streaming failed: ${detail}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let doneReceived = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split('\n\n');
          buffer = events.pop() ?? '';

          for (const event of events) {
            const line = event
              .split('\n')
              .find((part) => part.startsWith('data: '));
            if (!line) continue;

            const data = line.slice(6).trim();
            if (data === '[DONE]') {
              doneReceived = true;
              break;
            }

            try {
              const parsed = JSON.parse(data) as {
                token?: string;
                error?: string;
              };
              if (parsed.token) {
                setCleanedText((prev) => (prev ?? '') + parsed.token);
              }
              if (parsed.error) {
                setError(parsed.error);
                doneReceived = true;
                break;
              }
            } catch {
              // ignore individual chunk parse errors
            }
          }

          if (doneReceived) {
            break;
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return; // Intentional cancellation — suppress error UI
        }
        const msg = err instanceof Error ? err.message : 'Unknown error';
        setError('Streaming failed: ' + msg);
      } finally {
        setIsCleaningWithLLM(false);
      }
    },
    [systemPrompt],
  );

  const uploadAudio = useCallback(
    async (audioBlob: Blob, filename = 'recording.webm') => {
      const formData = new FormData();
      formData.append('audio', audioBlob, filename);

      try {
        const transcribeResponse = await fetch('/api/transcribe', {
          method: 'POST',
          body: formData,
        });

        if (!transcribeResponse.ok) {
          const errorBody = (await transcribeResponse.json().catch(() => null)) as
            | { detail?: string }
            | null;
          const detail = errorBody?.detail ?? transcribeResponse.statusText;
          throw new Error(`Transcription failed: ${detail}`);
        }

        const transcribeData =
          (await transcribeResponse.json()) as TranscriptionResponse;

        if (!transcribeData.success) {
          throw new Error(transcribeData.error || 'Transcription failed');
        }

        setRawText(transcribeData.text || '');
        setIsProcessing(false);
        setError(null);

        if (useLLM && transcribeData.text) {
          await streamClean(transcribeData.text);
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Unknown error';
        setError('Processing failed: ' + errorMessage);
        setIsProcessing(false);
      }
    },
    [useLLM, streamClean],
  );

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      mediaRecorderRef.current = new MediaRecorder(stream);
      chunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (e: BlobEvent) => {
        chunksRef.current.push(e.data);
      };

      mediaRecorderRef.current.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        await uploadAudio(blob, 'recording.webm');

        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setError(null);
      setRawText(null);
      setCleanedText(null);
      setIsCleaningWithLLM(false);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError('Microphone access denied: ' + errorMessage);
    }
  }, [uploadAudio]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsProcessing(true);
    }
  }, [isRecording]);

  const processAudioFile = useCallback(
    (file: File) => {
      if (!file) return;

      if (!file.type.startsWith('audio/')) {
        setError('Please select an audio file');
        return;
      }

      setError(null);
      setRawText(null);
      setCleanedText(null);
      setIsProcessing(true);
      setIsCleaningWithLLM(false);

      const blob = new Blob([file], { type: file.type });
      void uploadAudio(blob, file.name || 'upload.webm');
    },
    [uploadAudio],
  );

  const handleDragEnter = useCallback(() => {
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (file: File) => {
      if (isProcessing || isRecording) return;
      processAudioFile(file);
    },
    [isProcessing, isRecording, processAudioFile],
  );

  const handleFileSelect = useCallback(
    (file: File) => {
      processAudioFile(file);

      // Reset file input so the same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [processAudioFile],
  );

  const handleTextSubmit = useCallback(
    async (text: string) => {
      if (!text.trim()) return;

      try {
        setError(null);
        setRawText(null);
        setCleanedText(null);
        setIsProcessing(true);
        setIsCleaningWithLLM(false);

        setRawText(text);
        setIsProcessing(false);

        if (useLLM) {
          await streamClean(text);
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Unknown error';
        setError('Processing failed: ' + errorMessage);
        setIsProcessing(false);
        setIsCleaningWithLLM(false);
      }
    },
    [useLLM, streamClean],
  );

  const handlePresetSelect = useCallback((presetId: string) => {
    setSelectedPreset(presetId);
    const preset = DOMAIN_PRESETS.find((p) => p.id === presetId);
    if (preset) {
      setSystemPrompt(preset.systemPrompt);
    }
  }, []);

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      })
      .catch((err: Error) => setError('Copy failed: ' + err.message));
  }, []);

  // Keyboard shortcut: Hold V to record
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isProcessing || e.repeat || isKeyDownRef.current) return;

      const target = e.target as HTMLElement;
      if (
        e.key.toLowerCase() === 'v' &&
        !['INPUT', 'TEXTAREA'].includes(target.tagName)
      ) {
        e.preventDefault();
        isKeyDownRef.current = true;

        if (!isRecording) {
          setActiveTab('record');
          void startRecording();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'v') {
        isKeyDownRef.current = false;

        if (isRecording) {
          stopRecording();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isRecording, isProcessing, startRecording, stopRecording]);

  return (
    <div className={styles.app}>
      <div className={styles.container}>
        <Header />

        <div className={styles.layout}>
          <div className={styles.inputPanel}>
            <InputTabs
              activeTab={activeTab}
              onTabChange={setActiveTab}
              isRecording={isRecording}
              isProcessing={isProcessing}
              isDragging={isDragging}
              fileInputRef={fileInputRef}
              onStartRecording={startRecording}
              onStopRecording={stopRecording}
              onFileSelect={handleFileSelect}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onTextSubmit={handleTextSubmit}
            />

            <SettingsPanel
              useLLM={useLLM}
              systemPrompt={systemPrompt}
              isLoadingPrompt={isLoadingPrompt}
              selectedPreset={selectedPreset}
              onToggleLLM={setUseLLM}
              onPromptChange={setSystemPrompt}
              onPresetSelect={handlePresetSelect}
            />

            {error && (
              <ErrorMessage message={error} onDismiss={() => setError(null)} />
            )}
          </div>

          <div className={styles.resultsPanel}>
            <TranscriptionResults
              rawText={rawText}
              cleanedText={cleanedText}
              useLLM={useLLM}
              isCopied={isCopied}
              isCleaningWithLLM={isCleaningWithLLM}
              isProcessing={isProcessing}
              isOriginalExpanded={isOriginalExpanded}
              selectedPreset={selectedPreset}
              onCopy={copyToClipboard}
              onToggleOriginalExpanded={() =>
                setIsOriginalExpanded(!isOriginalExpanded)
              }
            />
          </div>
        </div>

        <Footer />
      </div>
    </div>
  );
}

export default App;
