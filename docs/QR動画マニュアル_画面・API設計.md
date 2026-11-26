# QR動画マニュアル：画面・API設計

作成日: 2026-11-17  
対象: シルクスクリーン スキルチェック Sites版  
状態: 第1段階のYouTube版をローカル実装済み。R2・ARは設計案。

関連図: [QR動画マニュアル_画面遷移・状態遷移.md](./QR動画マニュアル_画面遷移・状態遷移.md)

## 第1段階の実装済みAPI

下記が2026-11-17時点で実装したYouTube版の経路。後続の「API案」にはR2導入時の案も含む。

| 経路 | 用途 |
| --- | --- |
| `GET /api/manual/videos` | 承認済み利用者に公開版だけを返す。職員・管理者には編集許可の状態も返す。 |
| `GET /api/manual/videos/public/{entryId}?by=entry`、`?by=step` | 公開版のみ取得。工程IDを使う場合は `by=step`。 |
| `GET /api/manual/videos/manage` | 職員・管理者かつパスキー許可で全状態のカードを取得。30日超の保管版は管理者のみ。 |
| `POST /api/manual/videos` | 職員がタイトル、YouTube URL、任意の工程IDで下書きを作成。 |
| `GET /api/manual/videos/{videoId}` | 職員の下書き・プレビュー用取得。 |
| `PATCH /api/manual/videos/{videoId}` | `action=save/draft-copy/confirm-preview/publish/archive/restore/purge`。編集操作は同じ職員権限とパスキー許可を確認。 |

`confirm-preview` はiPhone SafariまたはAndroid Chromeの利用者エージェントを確認し、下書きID・版・端末種別・確認者・時刻を記録する。YouTube iframe APIで再生開始を検知してから、職員が一時停止・シーク・音声の確認欄を選ぶ。両端末の記録がそろわない公開操作はD1トリガーでも拒否する。利用者エージェントは端末の真正性を証明するものではないため、運用上の実機確認は職員が行う。

## 目的と前提

初期UIでは、既存工程の「詳しいマニュアル」ダイアログにYouTubeの埋め込み動画と「YouTubeで開く」リンクを置く。作業場所に貼ったQRコードからは、**同じYouTube動画を埋め込んだ工程専用ページ**をスマートフォンで直接開く。さらに左メニューから「動画マニュアル一覧」を開き、工程付き動画と工程に属さない独立動画を探して再生できるようにする。工程付き動画は工程ID、独立動画は公開用の固定IDに紐付ける。R2動画は将来の保存方法の選択肢、ARは再生ページを使い始めた後に別段階で評価・実装する。

現行サイトの工程には `plate-expose`、`print-pass` などの一意な `step.id` がある。トップページは `/skill` をiframeに表示し、工程と説明は `GET /api/manual`、画像はR2、進捗とマニュアルはD1を使う。サイト自体は公開設定だが、アプリの閲覧にはChatGPT認証と60分の無操作セッションが必要。仮登録の利用者には画像が伏せられる。

テスト動画の原本コピーは `media/source/TEST!!.mp4` に保存済み（3,107,768 bytes、SHA-256: `eebe98158d8f9e658f4f4d6bb85b65953c58411fc4063d73a174160fbeabc000`）。どの工程の動画かは未指定なので、データ上の工程への紐付けは行わない。独立動画として登録することは可能だが、職員による内容確認と公開手順を経る。このファイルはサイトの公開用 `public/` には置かず、現時点ではR2にもアップロードしない。

## 利用者の画面構成

### 左メニューからの入口と `/manual/videos`：動画マニュアル一覧

添付画像の「LEARNING PATH」に並ぶ工程リンクの**下**に区切りを入れ、番号を付けない固定リンク「動画マニュアル一覧」を置く。現行 `public/app.js` の `renderNav()` は工程からリンクを動的生成するため、この固定リンクは工程配列に追加せず、PCの左メニューとスマートフォンの上部ナビの両方に表示する。遷移先はトップレベルの `/manual/videos` とし、既存の `/skill` iframe内には表示しない。`/skill` 内のリンクは `target="_top"` 相当で親画面を遷移させる。リンクの選択状態は現在のURLで判定する。未ログイン・セッション切れは `/session?return_to=/manual/videos` に送り、認証後に一覧へ戻す。

一覧は**工程付きも独立動画も同じカード形式**で表示する。一般利用者には承認済みアカウント向けの公開動画だけを表示し、見出し、タイトル検索、**「すべて」「工程の動画」「その他の動画」**の絞り込みを設ける。各カードはタイトルを必ず表示し、目的があれば短く表示する。工程付きなら大工程名・工程名、工程なしなら「その他の動画」、取得できた場合は再生時間を表示する。サムネイルは登録済みポスターまたは工程写真が使える場合だけ表示し、なければ共通の動画アイコンを使う。カードの主領域を押すと再生ページへ進む。カードにYouTube iframeを大量に埋め込まず、選択した動画の再生ページで初めてプレーヤーを読み込む。0件、検索結果0件、読み込み失敗、権限なしを区別する。

職員・管理者は**同じ `/manual/videos` のカード一覧から動画を管理**する。一覧上部に「＋ 動画を追加」を置き、各公開カードに再生とは別の「編集」操作を置く。職員には一覧上部に状態タブ「公開」「下書き」「保管済み」を表示する。「下書き」では下書きカードと状態・プレビュー導線、「保管済み」では保管済みカードを表示し、一般利用者には両タブも非公開レコードも見せない。保管済みカードはタイトル、元の工程または「その他の動画」、保管日、復元できる期限を表示する。**保管開始から30日以内のカードの操作メニューに「下書きに復元」を置き**、成功後は `/manual/videos?view=drafts&edit={videoId}` に移る。同じ `entryId` の下書きがある場合は復元APIの `409` と既存下書きへの導線を表示する。30日を過ぎた行は管理者の「保管済み」に残し、復元ボタンを出さず「完全削除」を管理者だけに表示する。公開カードの「編集」は公開中の内容を書き換えず、同じ `entryId` の下書きがなければ編集用コピーを作成し、あれば既存の下書きカードを開く。下書きカードの「編集」はそのカード内でタイトル・URLなどを変更する。編集・非公開・QR発行はカードの操作メニューにまとめ、誤って再生ページへ移動しない独立ボタンにする。変更操作の直前に既存の職員権限とパスキー編集許可を確認する。

将来の「保存方法をMP4に変更」で `draft-copy` が `409 draft_source_conflict` を返した場合は、公開カードに「この動画には別方式の下書きがあります」と表示し、`existingDraftId` を使った**「既存の下書きを開く」**と**「下書きを取り下げる」**の2つの操作を示す。前者は `/manual/videos?view=drafts&edit={existingDraftId}` を開き、元の方式のまま編集できる。後者は既存下書きカードへ移って職員が明示的に取り下げ操作を行う。APIエラーを契機に自動で下書きを保管したり、MP4方式の下書きを作り直したりしない。取り下げが完了した後、職員が公開カードの「保存方法をMP4に変更」を再度押すと、同じ `entryId` のR2下書きを作成できる。

工程付きカードは既存の `/manual/video/{stepId}`、独立動画カードは `/manual/videos/{entryId}` へ進む。`entryId` は動画の公開用固定IDで、下書き・差し替え後も引き継ぐ。公開状態が変わっても印刷済みQRや共有リンクを保てる。独立動画にも必要ならこのURLのQRを発行できる。一覧からの「戻る」は一覧へ、工程付き動画の再生ページでは工程一覧へ戻る導線も設ける。

### `/manual/videos/[entryId]`：独立動画の再生ページ

既存の工程専用再生ページと同じプレーヤー・タイトル・目的・任意の日付・再生時間・字幕・「YouTubeで開く」を使用する。工程名、工程の確認ポイント、「この工程のスキルチェックへ」は表示しない。代わりに職員が入力した任意の `description`（補足・注意点）と「動画マニュアル一覧へ戻る」を表示する。公開動画がない場合は「現在公開されていません」と一覧へのリンクを表示し、下書きや保管済みレコードの内容は返さない。独立動画の視聴だけではスキルチェックの進捗は変わらない。

### QRからの入口

QRには固定の絶対URLを入れる。工程付きの例: `https://asobe-silk-screen-skill-check.hherocl278.chatgpt.site/manual/video/plate-expose`。工程の表示名ではなく `step.id` をURLに使い、改名後も印刷済みQRを利用できるようにする。独立動画のQRは `/manual/videos/{entryId}` を指し、動画の差し替え後も同じ `entryId` を使う。工程を削除した場合は専用の「動画が見つかりません」画面と工程一覧へのリンクを出す。

未ログイン・セッション切れの場合は既存の `/session?return_to=...` へ送り、認証後に同じ動画ページへ戻す。仮登録・無効化された利用者への動画配信は拒否し、現在のマニュアルの権限設計と合わせる。

### `/manual/video/[stepId]`：動画再生ページ

スマートフォンの縦画面を優先し、トップレベルのページとして表示する。既存のiframe内には埋め込まない。

1. 上部: サイト名、戻る、所属する大工程名と工程名。
2. 主領域: 初期版はYouTubeの公式埋め込みプレーヤーを表示し、「YouTubeで開く」リンクを併設する。自動再生はしない。将来R2方式を追加する場合は任意登録のポスター（なければ既存の工程写真、どちらもなければ共通画像）とHTML動画プレーヤーを表示する。R2プレーヤーは `controls`、`playsinline`、`preload="metadata"` とし、字幕が登録されている場合だけ選べる。
3. 動画直下: 一文の目的、取得できた場合の再生時間、撮影日・公開内容の更新日、字幕の有無。撮影日または再生時間が未登録なら該当項目を表示しない。更新日は動画レコードの `updated_at` から表示する。
4. 「作業のポイント」: 現行の工程説明・詳細マニュアルの要点。動画を見られない場合も文章で確認できる。
5. 下部: 「この工程のスキルチェックへ」は `/skill?step=plate-expose` のように対象の `step.id` を渡す。「工程一覧へ」は `/skill`。進捗は動画を再生しただけでは変更しない。
6. 状態表示: 動画未登録・非公開中、読み込み失敗、通信が遅い、アクセス権なし、セッション切れを区別する。工程が存在するが公開動画がない場合も同じ工程URLを維持し、「動画は現在公開されていません」と文章の手順・スキルチェックへのリンクを表示する。

ローカルで現行画面をPC幅・スマートフォン幅で確認した結果、工程カードは一覧用のコンパクトな行で、PCでは2列、スマートフォンでは1列に並ぶ。カード本体を押すとスキルチェック、右端の「?」を押すと「詳しいマニュアル」が開く。動画を各カード内に常時表示すると一覧が大きく伸びるため、**埋め込み位置の基本案は既存の「詳しいマニュアル」ダイアログ内、工程名・短い説明の直後、「作業の確認ポイント」の前**とする。動画がある工程のカードには「動画を見る」ボタンを加え、押すと同じ詳細ダイアログを開いて動画位置へ移動する。既存の「?」から開いた場合も同じ動画を見られる。ダイアログ内のプレーヤー直下に「YouTubeで開く」と「動画を別ページで見る」を置き、後者はQRの遷移先 `/manual/video/{stepId}` を開く。動画がない工程ではプレーヤーと動画ボタンを表示しない。公開動画の有無とIDは公開用APIから取得し、埋め込みはダイアログを開いたときだけ読み込み、閉じたら再生を止める。工程内の埋め込みとQR先のページは同一の公開動画IDを参照し、差し替え時に両方が更新される。なお、2026-11-17のローカル試作では「枠の真ん中を測る」のスキルチェック画面にも動画を仮配置し、PCとスマートフォンで表示・再生を確認した。どちらを最終配置にするかはこの試作画面への評価を受けて決める。

`/skill?step={stepId}` の受け取り処理を `public/app.js` に追加する。マニュアルとアカウント状態を読み込み、利用者の自動選択を終えた後に、`stepMeta` で工程IDを確認して `openCheckDialog` を呼ぶ。既存関数はデスクトップ時に押下元要素の位置を使うため、該当工程カードのボタンを渡し、要素がない場合も中央表示できるようにする。利用者未選択なら `state.pendingStep` に工程IDを保持して既存の利用者選択画面を開き、選択後に対象工程を開く。仮登録者は現行と同じ閲覧のみの表示とし、紐付いた利用者記録がないアカウントには利用者登録を依頼する。IDが存在しない場合は工程一覧を表示して案内を出す。工程カードをクリックした場合も同じ入口処理を使い、動作を揃える。

### 職員向け管理画面

`/manual/videos` の「＋ 動画を追加」は一覧の先頭に新規登録用の空カードを開く。初期版は **タイトルとYouTube URLの2項目だけを必須**とし、入力して「下書きを作成」を押すと新しい動画マニュアルを作成する。「紐付け先」は初期値を「その他の動画（工程なし）」とし、「工程に紐付ける」を選んだ場合だけ既存工程の選択を必須にする。目的、補足・注意点、撮影日、再生時間は任意で後から下書き編集できる。URLの形式とタイトルの空欄・長さを検証し、保存後は新しい下書きカードに切り替える。**保存前の空カードで「キャンセル」を押した場合は入力を捨て、レコードを作らず閉じる。**URLの形式が正しくても埋め込み再生できない場合があるため、プレビュー確認なしで公開しない。

初期版はYouTube方式とし、R2方式を追加する段階でMP4ファイルの選択と、任意のポスター画像・字幕ファイルの追加・削除を表示する。**公開済み行の内容は編集できない**。公開カードの「編集」は `POST /api/admin/manual/videos/{videoId}/draft-copy` を呼び、新規作成または再利用された下書きカードの編集フォームを開く。下書きなら同じカード内でタイトル、YouTube URL、目的などを変更できる。R2方式の公開カードから開いた下書きカードには「動画ファイルを差し替える」を追加し、新しいMP4をその下書きにアップロードする。将来YouTube方式からR2方式へ移す場合も、公開カードの「保存方法をMP4に変更」から `targetSourceType=r2` の下書きを作り、同じアップロード操作を使う。`entryId` と `stepId` はコピーから引き継ぎ、QRの固定URLは変えない。カード内には「保存」「キャンセル」「プレビュー」を設け、保存後も一覧の位置を保つ。**保存済み下書きの「キャンセル」は未保存の入力だけを捨てて編集フォームを閉じ、下書きレコードは残す。**公開カードからコピーを作った直後でも同じ扱いとする。下書きをなくす場合は別の「下書きを取り下げる」を選び、`DELETE /api/manual/videos/{videoId}` で `archived` にする。下書き保存・プレビュー・公開・差し替え・非公開は工程付きと独立動画で共通の操作にする。下書きのプレビューでは職員専用APIを使い、一般向けURLでは下書きや保管済み動画を表示しない。QRコードは工程付きなら工程URL、独立動画なら `entryId` の固定URLから生成し、印刷用にダウンロードできるようにする。動画が未公開の間はQR印刷を促さない。下書きの閲覧と動画の編集操作には、既存の職員権限と有効なパスキー編集許可を要求する。

カード編集中の認証復帰先は、保存済み下書きなら `/manual/videos?view=drafts&edit={videoId}`、保管済みカードなら `/manual/videos?view=archived&archive={videoId}`、公開カードの編集開始前なら `/manual/videos?focus={entryId}`、新規の空カードなら `/manual/videos?new=1` とする。職員用一覧の取得・カード編集・保存・コピー作成・復元の前にセッションまたはパスキー編集許可が切れていたら、現在の復帰先を `return_to` に入れて `/session` または `/passkey` へ進む。認証後は同じ一覧へ戻り、保存済み下書きや保管済みカードを再取得する。未保存入力は認証をまたいで保持せず、再入力を案内する。コピー作成と復元が失敗した場合は自動で再実行せず、元カードに焦点を戻して職員が再度操作する。`edit`・`archive` が存在しない・別権限の動画IDなら一覧に戻して案内する。`return_to` は安全なサイト内相対URLだけを許可し、一般利用者は職員カードや下書きを閲覧できない。既存の `/passkey` は現在 `return_to` に未対応のため、実装時にプレビューURLとこれらの一覧URLへ復帰できるよう拡張する。

初期版の公開確認対象は **iPhoneのSafariとAndroidのChrome**。職員はそれぞれの実機で下書きページを開き、再生開始・一時停止・シーク・音声（あれば）・ポスターと字幕（登録時）を確認して「この端末で再生を確認」を記録する。R2動画はHTML動画の `playing` イベント、YouTube動画は公式iframe APIの再生状態を受けた後に確認ボタンを有効にする。OS・ブラウザ名と確認者・時刻・下書きの版番号を記録する。これは職員による実機確認の記録であり、端末の真正性を自動証明するものではない。**両端末で現行版の確認が揃うまで公開ボタンは使えず、公開APIも拒否する**。確認後に下書きの内容を変更した場合は版番号を更新し、以前の確認を無効にする。

### 職員専用の下書きプレビューへの到達

下書き画面の固定URLは `/staff/manual/videos/{videoId}/preview` とする。例: `https://asobe-silk-screen-skill-check.hherocl278.chatgpt.site/staff/manual/videos/{videoId}/preview`。動画一覧の下書きカードに「プレビューを開く」「リンクをコピー」「別端末用QRを表示」を置く。このQRは職員が端末を切り替えるためのもので、作業場所に貼る一般向けQRとは区別し、下書き画面が一般公開される意味にはならない。プレビューページはトップレベルで開き、職員向けメタデータAPIと職員専用の再生URLを使う。下書きが存在しない・保管済みの場合は案内画面にする。

1. 職員が管理画面で下書きを保存し、表示されたプレビューURLをiPhoneとAndroidに送るか、各端末で職員用QRを読む。
2. 端末でURLを開いた時点で未ログインなら `/session?return_to={プレビューの相対URL}` に進み、ChatGPTログインとサイトの利用開始後に元のプレビューURLへ戻る。
3. 職員権限はあるが、この端末に有効なパスキー編集許可がなければ `/passkey?return_to={プレビューの相対URL}` に進む。既存のパスキー画面は現在 `return_to` を扱わないため、実装時に安全なサイト内相対URLだけを受け付け、認証成功後にそこへ戻す処理を追加する。職員以外は403画面を出す。
4. 同じ手順をもう一方の端末でも行う。各端末で使える職員パスキーが必要。動画と任意のポスター・字幕を確認し、それぞれの端末で確認ボタンを押す。確認結果は下書きIDと内容版番号に紐付く。

プレビューURLに秘密の認証情報は含めない。ページとそのメタデータ・動画・ポスター・字幕APIは毎回職員権限とパスキー編集許可を検査し、`Cache-Control: private, no-store` を返す。セッションや編集許可が期限切れになった場合も、同じ `return_to` を使ってプレビューに復帰できるようにする。

YouTubeからR2への移行用下書きで `object_key` が `NULL` の間も、職員はプレビューURLを開ける。ページはタイトル・工程名・説明を表示し、プレーヤーの位置に「MP4が未登録です。下書きカードから動画ファイルを追加してください」と表示する。`/manual/videos?view=drafts&edit={videoId}` への「動画ファイルを追加」リンクを置く。動画要素とポスター・字幕のプレビューURLは出さず、**「この端末で再生を確認」ボタンと「公開」ボタンは無効**にする。MP4を登録して新版番号になった後に両端末で改めて再生確認する。未登録状態で確認APIを呼んでも `409 media_missing`、公開APIを呼んでも `409` を返す。

## データと保存先

- D1に `manual_videos` を追加する。初期版は1工程につき公開動画1本、独立動画は本数制限なし。共通項目は `id`（下書き・公開版ごとのレコードID）、`entry_id`（同じ動画を差し替えても変わらない公開用ID）、`step_id`（独立動画は `NULL`）、`source_type`（`r2` / `youtube`）、`title`（必須）、`purpose`（任意）、`description`（独立動画の補足・注意点、任意）、`filmed_at`（撮影日、任意）、`duration_seconds`（任意）、`status`（`draft` / `published` / `archived`）、`archived_at`（保管開始日、任意）、`base_published_id`（下書き作成時に対象工程または独立動画で公開中だったレコードID。公開なしは `NULL`）、`version`、`created_at`、`updated_at`、`created_by`。R2専用の `object_key`、`mime_type`、`byte_size`、`poster_key`、`caption_key` とYouTube専用の `youtube_video_id` はそれぞれ該当方式だけ値を持つ。別テーブル `manual_video_preview_checks` に `video_id`、`platform`（`ios_safari` / `android_chrome`）、`confirmed_version`、`confirmed_at`、`confirmed_by`、`user_agent` を記録する。`title` は動画固有の必須情報、`purpose` は任意の説明として職員が入力する。`filmed_at` は不明なら `NULL`。工程付きの場合の工程IDは現行マニュアルのJSON内にあるため、登録・公開時に存在を検証する。
- 大工程名と工程名は `step_id` がある場合だけ現行マニュアルを引いて表示し、動画レコードに重複保存しない。独立動画の分類表示は固定の「その他の動画」とする。公開内容の更新日は `updated_at` を使う。R2動画の再生時間は職員ブラウザが選択したMP4の `loadedmetadata.duration` から取得し、有限・正値・上限内であることをサーバーでも検査して記録する。取得できなければ下書きに留め、職員のプレビューで再生可能になった後に公開する。YouTube動画の再生時間は任意の職員入力値を保存し、未入力なら表示しない。YouTube Data APIへの接続やAPIキーは初期版では使わない。APIは表示に必要な工程名と動画固有項目を組み合わせて返す。
- R2方式の動画本体と任意のポスター（JPEG・PNG・WebP）・字幕（UTF-8 WebVTT）は既存のR2 `BUCKET` に保存する。ポスターと字幕の自動生成は初期版では行わない。D1にはファイルのキーとメタデータのみ保存する。公開用の静的アセットとして動画本体を配信しない。YouTube方式はR2ファイルを持たない。
- 新しい動画は方式にかかわらずまず `draft` にし、指定端末でプレビュー確認後に `published` へ変更する。**新規動画の登録だけ** `POST /api/manual/videos` で新しい `entry_id` を発行し、既存動画の差し替えでは編集用コピーが元の `entry_id` と `step_id` を引き継ぐ。**同じ `entry_id` の有効な下書きは1件だけ**とし、D1の `UNIQUE(entry_id) WHERE status = 'draft'` に相当する部分ユニーク索引で同時操作も防ぐ。公開済み行の内容は不変とし、編集用コピーまたは新しい動画を下書き行にする。`step_id` と `entry_id` は下書き編集でも変更不可とし、工程付きと独立動画を切り替えたい場合は別の新規登録にする。編集用コピーはR2の既存オブジェクトキーを共有し、MP4・ポスター・字幕の差し替えはコピー側の参照だけを変更する。YouTubeからR2への移行用コピーは `source_type=r2`、`object_key=NULL` で作り、ファイル登録まで下書きに留める。完全削除時には他の行からの参照を確認する。
- 下書き作成時の公開対象IDを `base_published_id` に記録する。工程付きならその時点で同じ `step_id` に公開中の行、独立動画なら同じ `entry_id` に公開中の行を基準とする。**公開処理はトランザクション内で現在の公開対象IDと `base_published_id` の一致を確認**し、異なれば `409` を返して旧公開版を維持する。新規公開時の `NULL` も「公開版なし」として比較する。確認が通った場合だけ同じ `entry_id` の旧 `published` を `archived` にし、工程付きでは同じ工程の別 `entry_id` の旧 `published` も `archived` にして新行を `published` にする。同一工程または同一 `entry_id` の公開動画は各1本という制約を部分ユニーク索引でも守る。古い下書きの `409` はカードに「公開版が変わりました。下書きを取り下げて最新の公開カードから編集し直してください」と表示する。独立動画は互いを上書きしない。
- 「非公開」操作は対象の `published` を `archived` にする。`DELETE` も即時の物理削除ではなく `archived` への移行とし、一般向けAPIは `draft` と `archived` を返さない。職員は `/manual/videos?view=archived` のカード一覧に保管開始から30日間の行を表示し、その間は「下書きに復元」を使える。復元時にも同じ `entry_id` の下書きがあれば `409` とし、なければその時点の公開対象IDを `base_published_id` に入れ直し、`version` を更新して以前の実機確認を無効化する。管理者の同じ「保管済み」表示には30日を過ぎた行も残し、期限後は「完全削除」だけを表示する。保管開始30日後に管理者が明示的な完全削除を実行できる。R2の動画・ポスター・字幕は、その時点で他のレコードから参照されていないことを確認して削除し、最後にD1行を削除する。削除途中の失敗時は `archived` 行を残して再試行する。YouTube方式ではD1行だけを削除し、YouTube上の動画は削除しない。
- R2方式を追加する際の受付形式はMP4で、H.264映像・AAC音声（無音動画なら音声トラックなし）を制作時の指定形式とする。ファイルの拡張子と申告されたMIMEだけで判定せず、内容とサイズを検査する。サーバー側のコーデック解析・変換を設けず、指定したiPhone SafariとAndroid Chromeの**実機再生確認を公開条件**とする。片方で再生できなければ下書きのまま保持し、職員が元動画をH.264/AACへ変換して**同じ下書きのMP4差し替えAPI**で登録し直す。容量上限はR2方式の実装前にサイトのアップロード経路と現場の動画長から決める。

## API案

| メソッド・パス | 用途 | 認可・主な応答 |
| --- | --- | --- |
| `GET /api/manual/video-library?group=all\|steps\|other&q={text}&cursor={cursor}&limit={n}` | 公開動画一覧 | 有効な承認済みアカウント。`published` のみ、標準20件・最大50件を `updated_at DESC, entry_id` 順で返す。`q` はタイトル・目的の検索、`group` は工程付き／独立の絞り込み。`{ items: [{ entryId, stepId: string \| null, title, purpose, sectionTitle: string \| null, stepTitle: string \| null, durationSeconds, posterUrl?, pageUrl }], nextCursor }`。0件は空配列。非公開行を検索結果や件数に含めない。 |
| `GET /api/manual/video-library/{entryId}` | 独立動画の公開メタデータ取得 | 有効な承認済みアカウント。`step_id IS NULL` かつ `published` の現行版のみ返す。`description`、再生用URLなどを含め、未公開・工程付きIDは`404`。 |
| `GET /api/manual/videos?stepId={stepId}` | 公開動画のメタデータ取得 | 有効な承認済みアカウント。`sourceType: "r2"` なら `streamUrl` と任意の `posterUrl`・`captionUrl`、`sourceType: "youtube"` なら `embedUrl` を返す。共通項目は `id`、`entryId`、`stepId`、`sectionTitle`、`stepTitle`、`title`、`purpose`、`filmedAt`、`durationSeconds`、`updatedAt`。公開動画なしは`404`。 |
| `GET /api/manual/videos/{videoId}/stream` | 公開動画の再生 | 有効な承認済みアカウント。`status=published` のみ。`Range`を受け、全体は`200`、部分取得は`206`、不正な範囲は`416`。`Content-Type`、`Accept-Ranges`、`Content-Range`等を正しく返す。`HEAD`も対応する。 |
| `GET /api/manual/videos/{videoId}/poster` | 公開動画のポスター画像 | 再生と同じ認可・公開状態確認。 |
| `GET /api/manual/videos/{videoId}/captions` | 公開動画の字幕（VTT） | 再生と同じ認可・公開状態確認。未登録は`404`。 |
| `GET /api/admin/manual/videos?stepId={stepId}&status={status}` | 職員向け動画一覧・下書き・保管済みメタデータ | 職員・管理者かつ有効なパスキー編集許可。`stepId` 省略時は工程付き・独立動画の全件、`status` 省略時は全状態、指定時は `published`・`draft`・`archived` から選んで返す。職員の `archived` は保管開始から30日以内だけ、管理者には30日超も返す。保管行には `archivedAt`、`restorableUntil`、`canRestore`、`canPurge` を含める。下書き行には `previewPageUrl: "/staff/manual/videos/{videoId}/preview"` を含める。各行に `id`、`entryId`、`stepId: string \| null`、`sourceType`、`status`、`version`、`basePublishedId`、現行版の `previewChecks` と共通表示項目を含める。R2行は `mediaReady` と職員専用 `previewStreamUrl`（MP4未登録なら `null`）、任意の `previewPosterUrl`・`previewCaptionUrl`、YouTube行は正規化した `previewEmbedUrl` を返す。 |
| `GET /api/admin/manual/videos/{videoId}` | 職員のカード編集・プレビュー用メタデータ | 職員・管理者かつ有効なパスキー編集許可。指定IDの `draft`・`published`・保管期間内の `archived` を返し、`id`、`entryId`、`stepId`、`sourceType`、`youtubeUrl`（YouTube方式は保存IDから再構成）、`title`、任意の `purpose`・`description`・`filmedAt`・`durationSeconds`、`status`、`version`、`basePublishedId`、`previewChecks` を含める。R2行は `mediaReady: false`（`object_key=NULL`）なら `previewStreamUrl: null` とし、ファイル登録後に `mediaReady: true` と再生URLを返す。公開行はカードで直接編集できない。 |
| `GET /api/admin/manual/videos/{videoId}/stream` | R2動画の職員プレビュー | 同じ編集許可。`GET`・`HEAD`・`Range`に対応。`draft`、`published`、保管中の `archived` を再生可能。`object_key=NULL` の移行用下書きは `404 { code: "media_missing" }`。 |
| `GET /api/admin/manual/videos/{videoId}/poster`、`GET /api/admin/manual/videos/{videoId}/captions` | 下書きのポスター・字幕プレビュー | 同じ編集許可。ファイルがない場合は`404`。 |
| `POST /api/manual/videos`（R2） | MP4を下書き登録 | 職員・管理者かつ有効なパスキー編集許可。`multipart/form-data` で `sourceType=r2`、`stepId`（工程付きは有効なID、独立動画は省略または空値）、`title`、任意の `purpose`・`description`・`filmedAt`・`durationSeconds`、`video` ファイルを受ける。形式・サイズ・工程・指定された時間の妥当性を確認し、`201 { id, entryId, stepId: string \| null, sourceType: "r2", status: "draft", version: 1 }`。時間を取得できない場合も下書き保存は可能だが、公開前に取得・プレビューを要する。 |
| `POST /api/manual/videos`（YouTube） | タイトルとURLで下書き登録 | 同じ編集許可。JSONで `{ sourceType: "youtube", title, youtubeUrl, stepId?: string \| null, purpose?, description?, filmedAt?, durationSeconds? }` を受ける。`title` は前後の空白を除去して1〜100文字を必須とし、`youtubeUrl` は後述の形式検証を必須とする。`stepId` 省略・`null` は独立動画、文字列は有効な工程IDだけを受ける。正規化した動画IDのみ保存し、`201 { id, entryId, stepId: string \| null, sourceType: "youtube", status: "draft", version: 1, previewEmbedUrl }`。動画ファイルは受け取らない。 |
| `POST /api/admin/manual/videos/{videoId}/draft-copy` | 公開カードの編集用下書きを取得 | 同じ編集許可。指定行は現在の `published` に限る。JSONの任意 `targetSourceType` は省略時に元方式を使い、将来 `r2` を指定したYouTube行は `sourceType=r2`・`objectKey=null` の下書きへ移行できる。同じ `entryId` に同じ方式の `draft` があればコピーを増やさず `200 { id, entryId, status: "draft", reused: true }` で返し、別方式の下書きがあれば `409 { code: "draft_source_conflict", existingDraftId }`。なければ `entryId`・`stepId` を維持し、現行公開行を `basePublishedId` に記録してコピーする。`201 { id, entryId, status: "draft", version: 1, reused: false }`。プレビュー確認は引き継がない。競合時も部分ユニーク索引に従い既存下書きを確認し、古い公開行へのリクエストは`409`。 |
| `PUT /api/admin/manual/videos/{videoId}/file` | R2下書きのMP4差し替え | 同じ編集許可。`draft` かつ `sourceType=r2` の行だけを受け付ける。`multipart/form-data` の `video` と現在の `version`、取得できた場合の `durationSeconds` を受け、内容・サイズ・指定時間を検証する。時間を取得できなければ `NULL` として下書きに留め、公開条件で再検査する。新しいR2オブジェクトを保存し、下書き行の `object_key`・`mime_type`・`byte_size`・`duration_seconds` を更新して版番号を上げ、旧実機確認を無効化する。`entry_id`・`step_id`・`base_published_id` は維持する。公開行・YouTube行は`409`。D1更新に失敗した新オブジェクトは整理し、旧オブジェクトは他行の参照を確認してから削除する。 |
| `PUT /api/admin/manual/videos/{videoId}/poster`、`DELETE /api/admin/manual/videos/{videoId}/poster` | R2下書きの任意ポスターを追加・差し替え・解除 | 同じ編集許可。`draft` のR2行のみ受け付ける。`PUT` は `multipart/form-data` の `image`（JPEG・PNG・WebP）を検証し、R2保存後に `poster_key` を更新。`DELETE` は参照を外し、未参照ファイルだけを整理する。内容版番号を更新し旧プレビュー確認を無効化。公開済み行やYouTube方式は`409`。 |
| `PUT /api/admin/manual/videos/{videoId}/captions`、`DELETE /api/admin/manual/videos/{videoId}/captions` | R2下書きの任意字幕を追加・差し替え・解除 | 同じ編集許可。`draft` のR2行のみ受け付ける。`PUT` は `multipart/form-data` の `captions`（UTF-8 WebVTT、`WEBVTT` ヘッダー必須）を検証し、R2保存後に `caption_key` を更新。`DELETE` は参照を外し、未参照ファイルだけを整理する。内容版番号を更新し旧プレビュー確認を無効化。公開済み行やYouTube方式は`409`。 |
| `PATCH /api/manual/videos/{videoId}` | 下書きの表示項目・YouTube URL更新、下書きの公開 | 同じ編集許可。内容更新は `draft` のみ受け付け、JSONで `version` と更新対象の `title`、`purpose`、独立動画の `description`、`filmedAt`、`durationSeconds`、YouTube行なら `youtubeUrl` を受ける。`sourceType`、`stepId`、`entryId`、`basePublishedId` は変更不可。内容版番号を更新して旧プレビュー確認を無効化する。公開操作は**別リクエスト**の `{ version, status: "published" }` のみ受け、同時の内容変更を拒否する。公開時は現行版についてiPhone Safari・Android Chrome両方の確認記録、R2方式なら `objectKey` と `durationSeconds`、さらに現行公開対象IDと `basePublishedId` の一致をトランザクション内で必須とする。不一致は`409`で公開版を変更しない。公開済み行の内容変更も`409`。R2動画ファイルの差し替えは、公開カードから `draft-copy` で下書きを得て、その下書きの `PUT /file` を使う。 |
| `POST /api/admin/manual/videos/{videoId}/preview-checks` | 実機プレビュー結果を記録 | 同じ編集許可。`draft` のみ。JSONで `{ version, platform: "ios_safari" \| "android_chrome" }` を受ける。R2行で `object_key=NULL` なら `409 { code: "media_missing" }` とし、確認記録を作らない。対応端末のプレビュー画面で再生開始イベントが起きた後だけ確認操作を表示し、サーバーは確認者・時刻・User-Agent・版番号を記録する。内容変更後の旧版記録は公開条件に数えない。 |
| `DELETE /api/manual/videos/{videoId}` | 動画を非公開・保管 | 同じ編集許可。`draft` または `published` を `archived` にし、`archivedAt` を返す。R2ファイルは残す。 |
| `PATCH /api/admin/manual/videos/{videoId}/restore` | 保管済み動画を下書きへ戻す | 同じ編集許可。保管開始から30日以内の `archived` のみ対象。期限超過は`409`。同じ `entryId` に下書きがあれば `409 { code: "draft_exists", existingDraftId }`。なければ現在の公開対象IDを `basePublishedId` に設定し、版番号を上げて旧実機確認を無効化して `draft` に戻す。`200 { id, status: "draft", version }`。公開は別操作。 |
| `DELETE /api/admin/manual/videos/{videoId}?permanent=1` | 保管済み動画を完全削除 | 管理者かつ有効なパスキー編集許可。`archived` で保管開始から30日経過した行だけを対象とし、未参照のR2オブジェクトを削除してからD1行を削除する。失敗時は行を残して再試行する。 |

YouTube URLはHTTPSのみ受け付け、ホストを `youtube.com`、`www.youtube.com`、`m.youtube.com`、`youtu.be` に限定する。前者3つは `/watch?v=...`、後者は `/{id}` の形だけ受け付ける。ユーザー情報や独自ポートを持つURLは拒否する。動画IDはASCIIの11文字 `[A-Za-z0-9_-]{11}` で検証する。余分な共有用クエリは保存せず、サーバー側で `https://www.youtube.com/embed/{id}` を組み立てる。任意のURLをそのままiframeの `src` に入れない。URLの形式検証だけでは公開状態・埋め込み可否は保証できないため、職員が下書きプレビューで再生を確認してから公開する。全変更APIには現行の同一オリジン書き込み検査も適用する。

一般向けメタデータには `entryId`、`stepId`、`sectionTitle`、`stepTitle`（工程付きのみ現行マニュアル由来、独立動画では `null`）、`title`、`purpose`、`description`（独立動画のみ）、`filmedAt`、`durationSeconds`、`updatedAt`（動画レコード由来）を含める。`purpose`、`filmedAt` または `durationSeconds` が `null` なら該当項目は非表示にする。職員向け一覧も同じ表示項目と `status` を返す。APIのエラーは `400`（必須項目・URL形式）、`401`（認証・セッション）、`403`（権限）、`404`（工程・動画なし）、`409`（更新競合・方式違い）、`413`（容量超過）、`415`（形式違い）を使い分ける。

R2方式は動画のURLだけを知っていても閲覧権限を回避できないよう、**メタデータと動画本体の両方**で毎回認可する。一般向けエンドポイントは `draft` と `archived` に対して `404` を返し、職員向けエンドポイントでは毎回パスキー編集許可を検証する。プレビューURLは秘密の共有リンクではなく認可付きAPIとし、R2のキーをAPIで公開しない。動画・ポスター・字幕の応答は `Cache-Control: private, no-store` を基本とする。配信中のシークはHTTPのRangeリクエストで行い、R2の範囲取得を利用する。長時間再生後にセッションが切れた場合は、再開画面を経て同じ工程へ戻れるようにする。YouTube方式の動画本体はYouTube側の公開設定に従う。

## 容量と費用の前提

このサイトは **ChatGPT Sites** 上にある。OpenAIの案内では、Sitesのデータベースは1サイト最大10 GB、ファイル保存にはサイト単位の固定上限がない。ただし、Sites全体の利用・保存上限は適用される。SitesのホスティングはPlus/Proでは現時点でプランに含まれる。したがって、このサイトの費用・容量をCloudflare個人アカウントの無料枠で直接見積もらない。参照: [OpenAI「Creating and using ChatGPT Sites」](https://help.openai.com/en/articles/20001339-creating-and-using-chatgpt-sites)。

Cloudflareを**別途直接利用する場合**の参考値として、R2 Standardには月10 GB-monthの保存、月100万回のClass A操作、月1000万回のClass B操作の無料枠があり、外向き転送量に課金はない。D1のWorkers Free枠は合計5 GBの保存、1日500万行の読み取り、1日10万行の書き込み。Workers Freeには1日10万リクエストの上限がある。動画の再生・シークではR2読み取りとWorkerリクエストが発生し得る。これらはSitesにそのまま適用される上限ではない。参照: [R2料金](https://developers.cloudflare.com/r2/pricing/)、[D1料金](https://developers.cloudflare.com/d1/platform/pricing/)、[Workers料金](https://developers.cloudflare.com/workers/platform/pricing/)。

初期版のYouTube方式では動画本体をR2に置かず、D1に動画IDと小さなメタデータだけを置く。将来R2方式を追加する場合は動画本体をR2に保存し、保存容量と再生トラフィックを分けて観測する。

## 初期版のYouTube方式

既存工程の「詳しいマニュアル」とQRの遷移先 `/manual/video/{stepId}` に、同じYouTube動画の公式プレーヤーを埋め込む。例: 動画ID `djwp3DyxSOw` は `https://www.youtube.com/embed/djwp3DyxSOw` として埋め込む。両画面に「YouTubeで開く」リンクを置く。再生にはYouTube側で埋め込みが許可され、動画が公開または限定公開である必要がある。個別の動画が実際に埋め込み再生できるかは実機で確認する。

YouTube方式は共通データ設計の `source_type=youtube` と `youtube_video_id` を使う。動画のタイトル、目的、撮影日、公開状態はサイト側のD1に保持し、一般向けメタデータAPIは公開済みレコードに限って `sourceType: "youtube"` と `embedUrl` を返す。YouTube動画にはサイト内の `/stream`、`/poster`、`/captions` APIを使わず、再生・字幕・サムネイルはYouTubeプレーヤーに任せる。管理画面では職員がYouTube URLをJSON登録APIへ送信し、抽出された動画IDとプレビューURLを確認する。下書きプレビューは職員画面内で同じ埋め込みプレーヤーを表示し、サイト内の公開ページには表示しない。

この場合、動画ファイルはR2を消費しない。ただし**サイト側のログインや下書き設定はYouTube上の動画へのアクセス制御にならない**。限定公開動画もURLを知る人はサイト外で視聴・再共有でき、非公開動画は通常のサイト埋め込みには使えない。公開前の下書きを厳密に秘匿する必要がある動画はR2方式を使う。YouTubeの埋め込み設定が無効、動画が削除・非公開化、再生環境がYouTubeを遮断する場合に備え、動画ページには「YouTubeで開く」リンクとテキスト手順を残す。

将来のARでは、YouTubeの公式プレーヤーをそのまま説明用動画として使うことはできるが、プレーヤーの上にAR要素を重ねたり、YouTubeの映像データを取り出してAR素材として使う設計にはしない。AR素材が必要な工程は、別途許可された動画・画像・3D素材を用意する。

## 段階的な実装

1. **QR＋YouTube動画一覧**: 工程付き動画と独立動画を登録し、左メニューから公開動画一覧を開けるようにする。工程付き動画は既存工程の「詳しいマニュアル」と工程専用ページ、独立動画は専用ページにYouTubeプレーヤーを表示する。認証復帰、固定URLのQR生成、両端末での実機確認を完成させる。R2方式は保存・アクセス制御が必要になった段階で追加する。ローカルのテストMP4はこの段階ではサイトに登録しない。
2. **カメラ重ね合わせの試作**: 動画ページから別のAR試作画面へ進み、カメラ映像の上に説明や実写映像を重ねる。HTTPS、カメラ許可、iPhone・Androidの実機動作を確認する。位置固定はこの段階の合格条件にしない。
3. **対象物への位置合わせ**: 現場の対象物またはマーカーを認識し、映像・指示を追従させる。照明、遮蔽、手ぶれ、端末差、作業時の安全性を現場で評価し、成立した工程から採用する。

## 実装前に確認するもの

- `TEST!!.mp4` を既存工程に紐付けるか独立動画とするか、公開してよい内容か。
- 動画を見られる対象者。ここでは「承認済みの利用者・職員」と仮定した。
- QRを貼る場所と印刷サイズ。読み取り後の画面に作業の邪魔になる要素がないかを現場で確認する。
- 実機再生に必要な動画のコーデック、字幕、ポスターの有無。
