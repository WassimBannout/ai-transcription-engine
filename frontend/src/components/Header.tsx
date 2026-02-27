import styles from './Header.module.css';
import type { HeaderProps } from '../types';

export function Header(_props: HeaderProps) {
  return (
    <header className={styles.header}>
      <h1 className={styles.title}>VoiceScript AI</h1>
      <p className={styles.subtitle}>
        Real-time transcription and AI-powered text analysis
      </p>
    </header>
  );
}
