import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

interface ToastItem {
  id: number;
  message: string;
  kind: 'success' | 'error';
}

type ShowToast = (message: string, kind?: 'success' | 'error') => void;

const ToastContext = createContext<ShowToast | null>(null);

export function useToast(): ShowToast {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback<ShowToast>((message, kind = 'success') => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, message, kind }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
  }, []);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div className="toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.kind}`}>{t.message}</div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
