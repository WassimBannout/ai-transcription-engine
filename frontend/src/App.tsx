import { useState, useRef, useEffect, useCallback } from 'react';
import styles from './App.module.css';
import { Header } from './components/Header';
import { RecordButton } from './components/RecordButton';
import { UploadZone } from './components/UploadZone';
import { TextInputZone } from './components/TextInputZone';
import { SettingsPanel } from './components/SettingsPanel';
import { TranscriptionResults } from './components/TranscriptionResults';
import { ErrorMessage } from './components/ErrorMessage';
import { Footer } from './components/Footer';
import { DOMAIN_PRESETS, DEFAULT_PRESET_ID } from './data/presets';

interface TranscriptionResponse {
  success: boolean;
  text?: string;
  error?: string;
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

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const isKeyDownRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loadSystemPrompt = async () => {
      try {
        const response = await fetch('/api/system-prompt');
        const data = (await response.json()) as SystemPromptResponse;
        setSystemPrompt(data.default_prompt);
      } catch (err) {
        console.error('Failed to load system prompt:', err);
        setError('Failed to load system prompt');
      } finally {
        setIsLoadingPrompt(false);
      }
    };

    void loadSystemPrompt();
  }, []);

  /** Stream LLM cleaning token-by-token via SSE. Updates cleanedText incrementally. */
  const streamClean = useCallback(
    async (text: string) => {
      setIsCleaningWithLLM(true);
      setCleanedText('');

      try {
        const response = await fetch('/api/clean/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            ...(systemPrompt && { system_prompt: systemPrompt }),
          }),
        });

        if (!response.ok || !response.body) {
          throw new Error(`Streaming failed: ${response.statusText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6);
            if (data === '[DONE]') break;

            try {
              const parsed = JSON.parse(data) as {
                token?: string;
                error?: string;
              };
              if (parsed.token) {
                setCleanedText((prev) => (prev ?? '') + parsed.token);
              }
            } catch {
              // ignore individual chunk parse errors
            }
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        setError('Streaming failed: ' + msg);
      } finally {
        setIsCleaningWithLLM(false);
      }
    },
    [systemPrompt],
  );

  const uploadAudio = useCallback(
    async (audioBlob: Blob) => {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');

      try {
        const transcribeResponse = await fetch('/api/transcribe', {
          method: 'POST',
          body: formData,
        });

        if (!transcribeResponse.ok) {
          throw new Error(
            `Transcription failed: ${transcribeResponse.statusText}`,
          );
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
        await uploadAudio(blob);

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

  const processAudioFile = (file: File) => {
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
    void uploadAudio(blob);
  };

  const handleDragEnter = () => {
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (file: File) => {
    if (isProcessing || isRecording) return;
    processAudioFile(file);
  };

  const handleFileSelect = (file: File) => {
    processAudioFile(file);

    // Reset file input so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

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

  const copyToClipboard = (text: string) => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      })
      .catch((err: Error) => setError('Copy failed: ' + err.message));
  };

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
    // startRecording and stopRecording are stable callbacks, safe to omit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording, isProcessing]);

  return (
    <div className={styles.app}>
      <div className={styles.container}>
        <Header />

        <RecordButton
          isRecording={isRecording}
          isProcessing={isProcessing}
          onStartRecording={startRecording}
          onStopRecording={stopRecording}
        />

        <UploadZone
          isProcessing={isProcessing}
          isDragging={isDragging}
          onFileSelect={handleFileSelect}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          fileInputRef={fileInputRef}
        />

        <TextInputZone
          isProcessing={isProcessing}
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
        <Footer />
      </div>
    </div>
  );
}

export default App;
