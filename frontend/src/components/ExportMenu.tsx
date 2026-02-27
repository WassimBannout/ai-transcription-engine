import { useState, useRef, useEffect } from 'react';
import { Download, ChevronDown } from 'lucide-react';
import styles from './ExportMenu.module.css';
import { exportAsMarkdown, exportAsText, exportAsJson } from '../utils/export';

interface ExportMenuProps {
  rawText: string;
  cleanedText: string | null;
  preset: string;
}

export function ExportMenu({ rawText, cleanedText, preset }: ExportMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const data = { rawText, cleanedText, preset, timestamp: new Date() };

  const options = [
    {
      label: 'Markdown (.md)',
      sublabel: 'Formatted with metadata and sections',
      action: () => exportAsMarkdown(data),
    },
    {
      label: 'Plain Text (.txt)',
      sublabel: 'Cleaned text only',
      action: () => exportAsText(data),
    },
    {
      label: 'JSON (.json)',
      sublabel: 'Structured data for APIs',
      action: () => exportAsJson(data),
    },
  ];

  return (
    <div className={styles.wrapper} ref={menuRef}>
      <button
        className={styles.trigger}
        onClick={() => setIsOpen(!isOpen)}
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <Download className={styles.icon} />
        Export
        <ChevronDown
          className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`}
        />
      </button>

      {isOpen && (
        <div className={styles.menu} role="menu">
          {options.map((opt) => (
            <button
              key={opt.label}
              className={styles.option}
              onClick={() => {
                opt.action();
                setIsOpen(false);
              }}
              role="menuitem"
              type="button"
            >
              <span className={styles.optionLabel}>{opt.label}</span>
              <span className={styles.optionSublabel}>{opt.sublabel}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
