import { useEffect, useState } from 'react'
import styles from './Toast.module.scss'

export interface ToastMessage {
  key: number
  text: string
  fromClaude: boolean
}

/** Aviso abajo a la derecha. Se va solo a los 4 segundos. */
export function Toast({ message }: { message: ToastMessage | null }) {
  const [visible, setVisible] = useState<ToastMessage | null>(null)
  useEffect(() => {
    if (!message) return
    setVisible(message)
    const timer = setTimeout(() => setVisible(null), 4000)
    return () => clearTimeout(timer)
  }, [message])
  if (!visible) return null
  return (
    <div key={visible.key} className={styles.toast} role="status">
      {visible.fromClaude && <span className={styles.dot} />}
      {visible.text}
    </div>
  )
}
