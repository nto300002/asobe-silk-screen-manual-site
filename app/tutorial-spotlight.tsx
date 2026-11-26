'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

type Props = { target: string; instruction: string; onClose: () => void; title?: string; step?: number; totalSteps?: number; onNext?: () => void; onPrevious?: () => void; interactive?: boolean };
type Box = { top: number; left: number; right: number; bottom: number; width: number };

export default function TutorialSpotlight({ target, instruction, onClose, title = '操作権限の変更について', step, totalSteps, onNext, onPrevious, interactive = true }: Props) {
  const [box, setBox] = useState<Box | null>(null);

  useEffect(() => {
    const element = document.querySelector<HTMLElement>(target);
    if (!element) return;
    element.classList.add('tutorial-highlight');
    if (!interactive) element.classList.add('tutorial-highlight-guide');
    element.scrollIntoView({ block: 'center', behavior: 'instant' });
    const update = () => {
      const rect = element.getBoundingClientRect();
      setBox({ top: Math.max(0, rect.top - 5), left: Math.max(0, rect.left - 5), right: Math.min(innerWidth, rect.right + 5), bottom: Math.min(innerHeight, rect.bottom + 5), width: rect.width });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    const observer = new ResizeObserver(update);
    observer.observe(element);
    const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', keydown);
    return () => {
      element.classList.remove('tutorial-highlight');
      element.classList.remove('tutorial-highlight-guide');
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('keydown', keydown);
      observer.disconnect();
    };
  }, [target, onClose, interactive]);

  if (!box) return null;
  const mask = (style: React.CSSProperties, key: string) => <div key={key} className="tutorial-mask" style={style} onClick={onClose} />;
  const bubbleWidth = Math.min(320, innerWidth - 24);
  const bubbleLeft = Math.max(12, Math.min(box.left, innerWidth - bubbleWidth - 12));
  const bubbleTop = innerHeight - box.bottom >= 205 ? box.bottom + 12 : Math.max(12, box.top - 205);

  return createPortal(<>
    {mask({ top: 0, left: 0, width: '100vw', height: box.top }, 'top')}
    {mask({ top: box.bottom, left: 0, width: '100vw', bottom: 0 }, 'bottom')}
    {mask({ top: box.top, left: 0, width: box.left, height: box.bottom - box.top }, 'left')}
    {mask({ top: box.top, left: box.right, right: 0, height: box.bottom - box.top }, 'right')}
    <div className="tutorial-bubble" role="dialog" aria-label={title} style={{ top: bubbleTop, left: bubbleLeft, width: bubbleWidth }} onClick={onNext ? undefined : onClose}>
      <button type="button" className="tutorial-close" aria-label="チュートリアルを終了" onClick={onClose}>×</button>
      <strong>{step && totalSteps ? `${step} / ${totalSteps}　${title}` : title}</strong>
      <p>{instruction}</p>
      {onNext ? <div className="tutorial-actions">
        {onPrevious && <button type="button" className="tutorial-previous" onClick={onPrevious}>戻る</button>}
        <button type="button" className="tutorial-next" onClick={onNext}>{step === totalSteps ? "案内を終了" : "次へ"}</button>
      </div> : <small>指定された箇所以外を押すか、×で終了します。</small>}
    </div>
  </>, document.body);
}
