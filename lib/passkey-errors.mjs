const hasJapanese = text => /[\u3040-\u30ff\u3400-\u9fff]/u.test(text);

export function passkeyErrorMessage(error, operation = 'authenticate') {
  const name = typeof error?.name === 'string' ? error.name : '';
  const code = typeof error?.code === 'string' ? error.code : '';
  const causeName = typeof error?.cause?.name === 'string' ? error.cause.name : '';
  const message = typeof error?.message === 'string' ? error.message : '';
  const action = operation === 'register' ? '登録' : operation === 'status' ? '状態確認' : '本人確認';

  if (code === 'ERROR_INVALID_DOMAIN' || code === 'ERROR_INVALID_RP_ID' || name === 'SecurityError') {
    return 'このサイトのパスキー設定を確認できませんでした。ページを再読み込みしても続く場合は、管理者に連絡してください。';
  }
  if (code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED' || name === 'InvalidStateError') {
    return 'このパスキーはすでに登録されています。別のパスキーを選ぶか、管理者に確認してください。';
  }
  if (name === 'NotAllowedError' || causeName === 'NotAllowedError') {
    return `パスキーの${action}が完了しませんでした。確認画面を閉じた、時間切れになった、またはブラウザーで許可されなかった可能性があります。もう一度お試しください。アプリ内ブラウザーで続く場合は、SafariやChromeで開いてください。`;
  }
  if (name === 'AbortError' || code === 'ERROR_CEREMONY_ABORTED') {
    return `パスキーの${action}が中断されました。もう一度お試しください。`;
  }
  if (name === 'NotSupportedError' || name === 'ConstraintError' ||
      code.startsWith('ERROR_AUTHENTICATOR_MISSING_') ||
      code === 'ERROR_AUTHENTICATOR_NO_SUPPORTED_PUBKEYCREDPARAMS_ALG' ||
      message.includes('WebAuthn is not supported')) {
    return 'このブラウザーまたは端末では、必要なパスキー認証を利用できません。SafariやChromeなどの通常のブラウザーで開き、端末の画面ロックを有効にしてください。';
  }
  if (name === 'TypeError' || name === 'NetworkError') {
    return '通信またはブラウザーの処理に失敗しました。接続を確認し、ページを再読み込みしてからもう一度お試しください。';
  }
  if (name === 'UnknownError' || code === 'ERROR_AUTHENTICATOR_GENERAL_ERROR') {
    return '端末でパスキーを確認できませんでした。もう一度お試しください。続く場合は別のブラウザーや端末でお試しください。';
  }
  if (hasJapanese(message)) return message;
  return `${action}に失敗しました。ページを再読み込みしてから、もう一度お試しください。`;
}
