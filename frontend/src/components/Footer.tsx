import styles from './Footer.module.css';

export function Footer() {
  return (
    <footer className={styles.footer}>
      <p className={styles.text}>
        Built with Whisper · FastAPI · React · Ollama
      </p>
    </footer>
  );
}
