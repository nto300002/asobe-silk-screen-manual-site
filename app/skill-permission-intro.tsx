'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';

export default function SkillPermissionIntro({ onClose, onNext }: { onClose: () => void; onNext: () => void }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return createPortal(<div className="permission-intro-backdrop" onClick={onClose}>
    <section className="permission-intro" role="dialog" aria-modal="true" aria-labelledby="permission-intro-title" onClick={event => event.stopPropagation()}>
      <button type="button" className="permission-intro-close" aria-label="説明を閉じる" onClick={onClose}>×</button>
      <span className="permission-intro-eyebrow">USER ACCESS</span>
      <h2 id="permission-intro-title">操作権限の変更について</h2>
      <p>ChatGPTで初めてサインインした人は「承認待ち利用者」として登録されます。管理者が本人確認と利用者記録の紐付けを行うと、利用者として使えます。</p>
      <ul>
        <li><strong>利用者：</strong>自分に紐付いたスキルチェックの進捗を見て、チェックを記録できます。</li>
        <li><strong>職員：</strong>利用者の進捗を確認・記録し、利用者記録を作成できます。自分のパスキーで本人確認すると、工程・マニュアル・写真を15分間編集できます。</li>
        <li><strong>管理者：</strong>職員の操作に加えて、アカウントの区分・有効状態・利用者記録との紐付けを変更し、操作記録を確認できます。</li>
      </ul>
      <p className="permission-intro-note">承認待ちの利用者登録はアカウント管理で行います。職員・管理者の設定には、別画面で管理者パスキーによる確認が必要です。</p>
      <div className="permission-intro-actions"><button type="button" className="permission-secondary" onClick={onClose}>閉じる</button><button type="button" className="permission-primary" onClick={onNext}>次へ</button></div>
    </section>
  </div>, document.body);
}
