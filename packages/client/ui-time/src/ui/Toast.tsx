interface ToastProps {
  readonly message: string
}

/** 底部操作反馈；空字符串时隐藏。 */
export function Toast({ message }: ToastProps) {
  return <div className={`tb-toast${message === '' ? '' : ' on'}`}>{message}</div>
}
