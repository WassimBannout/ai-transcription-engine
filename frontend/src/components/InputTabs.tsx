import { Mic, Upload, FileText } from 'lucide-react';
import styles from './InputTabs.module.css';
import { RecordButton } from './RecordButton';
import { UploadZone } from './UploadZone';
import { TextInputZone } from './TextInputZone';
import type { UploadZoneProps } from '../types';

export type TabId = 'record' | 'upload' | 'text';

interface InputTabsProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  isRecording: boolean;
  isProcessing: boolean;
  onStartRecording: () => Promise<void>;
  onStopRecording: () => void;
  onTextSubmit: (text: string) => Promise<void>;
  // UploadZone props
  isDragging: UploadZoneProps['isDragging'];
  fileInputRef: UploadZoneProps['fileInputRef'];
  onFileSelect: UploadZoneProps['onFileSelect'];
  onDragEnter: UploadZoneProps['onDragEnter'];
  onDragLeave: UploadZoneProps['onDragLeave'];
  onDrop: UploadZoneProps['onDrop'];
}

const TABS = [
  { id: 'record' as TabId, label: 'Record', Icon: Mic },
  { id: 'upload' as TabId, label: 'Upload', Icon: Upload },
  { id: 'text' as TabId, label: 'Paste Text', Icon: FileText },
];

export function InputTabs({
  activeTab,
  onTabChange,
  isRecording,
  isProcessing,
  onStartRecording,
  onStopRecording,
  onTextSubmit,
  isDragging,
  fileInputRef,
  onFileSelect,
  onDragEnter,
  onDragLeave,
  onDrop,
}: InputTabsProps) {
  return (
    <div className={styles.container}>
      <div className={styles.tabBar} role="tablist">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={activeTab === id}
            className={`${styles.tab} ${activeTab === id ? styles.tabActive : ''}`}
            onClick={() => onTabChange(id)}
            type="button"
          >
            <Icon className={styles.tabIcon} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      <div className={styles.tabPanel} role="tabpanel">
        {activeTab === 'record' && (
          <RecordButton
            isRecording={isRecording}
            isProcessing={isProcessing}
            onStartRecording={onStartRecording}
            onStopRecording={onStopRecording}
          />
        )}
        {activeTab === 'upload' && (
          <UploadZone
            isProcessing={isProcessing}
            isDragging={isDragging}
            onFileSelect={onFileSelect}
            onDragEnter={onDragEnter}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            fileInputRef={fileInputRef}
          />
        )}
        {activeTab === 'text' && (
          <TextInputZone isProcessing={isProcessing} onTextSubmit={onTextSubmit} />
        )}
      </div>
    </div>
  );
}
