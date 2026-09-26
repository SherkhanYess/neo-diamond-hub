import { createContext, useContext, useState, useCallback, useRef } from 'react'
import './Toast.css'

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null)
  const timer = useRef(null)

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    setToast(null)
  }, [])

  // show({ message, actionLabel?, onAction?, duration? })
  const show = useCallback(
    ({ message, actionLabel, onAction, duration = 6000 }) => {
      if (timer.current) clearTimeout(timer.current)
      setToast({ message, actionLabel, onAction })
      timer.current = setTimeout(() => setToast(null), duration)
    },
    []
  )

  const handleAction = () => {
    if (toast?.onAction) toast.onAction()
    clear()
  }

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {toast && (
        <div className="toast" role="status">
          <span className="toast__msg">{toast.message}</span>
          {toast.actionLabel && (
            <button className="toast__action" onClick={handleAction}>
              {toast.actionLabel}
            </button>
          )}
        </div>
      )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
