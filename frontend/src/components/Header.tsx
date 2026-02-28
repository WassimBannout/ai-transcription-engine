import styles from './Header.module.css';

export function Header() {
  return (
    <header className={styles.header}>
      <h1 className={styles.title}>VoiceScript AI</h1>
      <p className={styles.subtitle}>
        Real-time transcription and AI-powered text analysis
      </p>
    </header>
  );
}
