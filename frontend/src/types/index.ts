export type RecordingState = 'idle' | 'recording' | 'processing';

export interface RecordButtonProps {
  isRecording: boolean;
  isProcessing: boolean;
  onStartRecording: () => Promise<void>;
  onStopRecording: () => void;
}

export interface UploadZoneProps {
  isProcessing: boolean;
  isDragging: boolean;
  onFileSelect: (file: File) => void;
  onDragEnter: () => void;
  onDragLeave: () => void;
  onDrop: (file: File) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}

export interface TextInputZoneProps {
  isProcessing: boolean;
  onTextSubmit: (text: string) => Promise<void>;
}

export interface SettingsPanelProps {
  useLLM: boolean;
  systemPrompt: string;
  isLoadingPrompt: boolean;
  selectedPreset: string;
  onToggleLLM: (value: boolean) => void;
  onPromptChange: (value: string) => void;
  onPresetSelect: (presetId: string) => void;
}

export interface TranscriptionResultsProps {
  rawText: string | null;
  cleanedText: string | null;
  useLLM: boolean;
  isCopied: boolean;
  isCleaningWithLLM: boolean;
  isProcessing: boolean;
  isOriginalExpanded: boolean;
  selectedPreset: string;
  onCopy: (text: string) => void;
  onToggleOriginalExpanded: () => void;
}

export interface ErrorMessageProps {
  message: string;
  onDismiss: () => void;
}

export interface TextBoxProps {
  value: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  mode: 'input' | 'display';
  isLoading?: boolean;
  isDisabled?: boolean;
  showCopyButton?: boolean;
  isCopied?: boolean;
  onCopy?: () => void;
  rows?: number;
  maxHeight?: string;
  ariaLabel?: string;
  id?: string;
}

export interface BoxProps {
  children: React.ReactNode;
  header?: string;
  icon?: React.ComponentType<{ className?: string }>;
  collapsible?: boolean;
  isExpanded?: boolean;
  onToggleExpanded?: () => void;
  className?: string;
}

