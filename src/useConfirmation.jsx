import { useEffect, useId, useRef, useState } from "react";

// A native modal dialog keeps keyboard focus inside the confirmation and restores
// it on close. Callers await the answer before touching persisted data.
export function useConfirmation() {
  const [message, setMessage] = useState(null);
  const pending = useRef(null), dialog = useRef(null);
  const id = useId();
  useEffect(() => {
    if (message !== null && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [message]);
  useEffect(() => () => { pending.current?.(false); pending.current = null; }, []);
  const request = (text) => new Promise((resolve) => {
    if (pending.current) { resolve(false); return; }
    pending.current = resolve;
    setMessage(text);
  });
  const answer = (confirmed) => {
    dialog.current?.close();
    const resolve = pending.current;
    pending.current = null;
    setMessage(null);
    resolve?.(confirmed);
  };
  const modal = message === null ? null : <dialog className="confirmation-dialog clay-panel" ref={dialog} aria-labelledby={`${id}-title`} aria-describedby={`${id}-message`} onCancel={(event) => { event.preventDefault(); answer(false); }}>
    <h3 id={`${id}-title`}>请确认操作</h3>
    <p id={`${id}-message`}>{message}</p>
    <div className="reference-toolbar"><button type="button" className="soft-button" autoFocus onClick={() => answer(false)}>取消</button><button type="button" className="soft-button pink" onClick={() => answer(true)}>确认继续</button></div>
  </dialog>;
  return [request, modal];
}
