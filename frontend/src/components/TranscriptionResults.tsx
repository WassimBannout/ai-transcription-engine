import { FileText, Sparkles } from 'lucide-react';
import styles from './TranscriptionResults.module.css';
import type { TranscriptionResultsProps } from '../types';
import { TextBox } from './TextBox';
import { Box } from './Box';
import { ExportMenu } from './ExportMenu';

export function TranscriptionResults({
  rawText,
  cleanedText,
  useLLM,
  isCopied,
  isCleaningWithLLM,
  isProcessing,
  isOriginalExpanded,
  selectedPreset,
  onCopy,
  onToggleOriginalExpanded,
}: TranscriptionResultsProps) {
  if (!isProcessing && !rawText) {
    return (
      <div className={styles.emptyState}>
        <FileText className={styles.emptyIcon} />
        <p className={styles.emptyTitle}>No transcription yet</p>
        <p className={styles.emptySubtitle}>
          Record audio, upload a file, or paste text to get started.
        </p>
      </div>
    );
  }

  const displayText = useLLM && cleanedText ? cleanedText : rawText;
  const hasExportableContent = !isProcessing && !isCleaningWithLLM && !!rawText;

  // Show spinner only before the first streaming token arrives
  const isCleaningSpinner = isCleaningWithLLM && !cleanedText;

  return (
    <div className={styles.container}>
      <Box
        header="Original Transcription"
        icon={FileText}
        collapsible={true}
        isExpanded={isOriginalExpanded}
        onToggleExpanded={onToggleOriginalExpanded}
      >
        <TextBox
          mode="display"
          value={rawText || ''}
          isLoading={isProcessing && !rawText}
          maxHeight="300px"
        />
      </Box>

      {/* Cleaned transcription: shown when LLM is enabled and text exists or is streaming */}
      {useLLM && (cleanedText || isCleaningWithLLM) && (
        <Box header="Cleaned Transcription" icon={Sparkles}>
          <TextBox
            mode="display"
            value={cleanedText || ''}
            isLoading={isCleaningSpinner}
            showCopyButton={!!cleanedText && !isCleaningWithLLM}
            isCopied={isCopied}
            onCopy={() => cleanedText && onCopy(cleanedText)}
            maxHeight="300px"
          />
        </Box>
      )}

      {/* Copy button for non-LLM case */}
      {!useLLM && displayText && (
        <TextBox
          mode="display"
          value={displayText}
          showCopyButton={true}
          isCopied={isCopied}
          onCopy={() => onCopy(displayText)}
          maxHeight="300px"
        />
      )}

      {/* Export menu — visible after processing is complete */}
      {hasExportableContent && (
        <div className={styles.exportRow}>
          <ExportMenu
            rawText={rawText ?? ''}
            cleanedText={cleanedText}
            preset={selectedPreset}
          />
        </div>
      )}
    </div>
  );
}
