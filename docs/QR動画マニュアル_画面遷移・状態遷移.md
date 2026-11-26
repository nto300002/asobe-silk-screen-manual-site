# QR動画マニュアル：画面遷移図・状態遷移図

作成日: 2026-11-17  
対象: シルクスクリーン スキルチェック Sites版  
状態: 設計案（画面・APIは未実装）  
詳細仕様: [QR動画マニュアル_画面・API設計.md](./QR動画マニュアル_画面・API設計.md)

`{stepId}` は既存マニュアルの工程ID、`{videoId}` は下書き・公開版ごとの動画レコードID、`{entryId}` は差し替え後も変わらない動画の公開用ID。**初期UIでは既存工程の「詳しいマニュアル」とQR先の専用ページに同じYouTube動画を埋め込み、左メニューから工程付き・独立動画の一覧を開ける。**工程付き動画のQRは工程URL、独立動画のQRは `entryId` の固定URLを指す。職員の下書き確認用QRは `videoId` を含む別のURLを指す。R2方式は後から追加できる保存方法として図に残す。

## 1. 利用者の画面遷移

```mermaid
flowchart TD
    Start([作業場所のQRを読む]) --> VideoGate["/manual/video/{stepId}"]
    StandaloneQR([独立動画のQRを読む]) --> StandaloneGate["/manual/videos/{entryId}"]
    Manual["既存の工程カード"] -->|動画を見る| Detail["詳しいマニュアル<br/>説明の直後にYouTubeを埋め込み"]
    Manual -->|? 詳しいマニュアル| Detail
    Detail --> YouTube[YouTubeで開く]
    Detail -->|動画を別ページで見る| VideoGate
    Nav["左メニュー：動画マニュアル一覧"] --> LibraryGate["/manual/videos"]
    LibraryGate --> LibraryLogin{ログイン・セッションあり?}
    LibraryLogin -- なし --> LibrarySession["/session?return_to=/manual/videos"]
    LibrarySession --> LibraryGate
    LibraryLogin -- あり --> LibraryRole{承認済みアカウント?}
    LibraryRole -- いいえ --> LibraryDenied[承認待ち・利用不可の案内]
    LibraryRole -- はい --> Library["公開動画をカード一覧表示<br/>工程の動画・その他の動画"]
    Library -->|工程付き| VideoGate
    Library -->|独立動画| StandaloneGate
    StandaloneGate --> StandaloneLogin{ログイン・セッションあり?}
    StandaloneLogin -- なし --> StandaloneSession["/session?return_to=独立動画ページ"]
    StandaloneSession --> StandaloneGate
    StandaloneLogin -- あり --> StandaloneRole{承認済みアカウント?}
    StandaloneRole -- いいえ --> LibraryDenied
    StandaloneRole -- はい --> StandalonePublished{公開版がある?}
    StandalonePublished -- はい --> StandaloneVideo["独立動画の再生ページ<br/>工程チェックへの導線なし"]
    StandalonePublished -- いいえ --> StandaloneMissing["現在公開されていません"]
    StandaloneVideo --> Library
    StandaloneMissing --> Library
    VideoGate --> Login{ログイン・サイト内セッションあり?}
    Login -- なし --> Session["/session?return_to=動画ページ"]
    Session --> ChatGPT[ChatGPTでログイン・利用開始]
    ChatGPT --> VideoGate
    Login -- あり --> Role{承認済みで有効なアカウント?}
    Role -- いいえ --> Denied[承認待ち・利用不可の案内]
    Role -- はい --> Step{工程IDが存在する?}
    Step -- いいえ --> MissingStep[工程が見つからない案内]
    MissingStep --> List["/skill 工程一覧"]
    Step -- はい --> Public{公開動画がある?}
    Public -- なし --> NoVideo[動画は現在公開されていない・文章の手順]
    Public -- あり --> Video["工程専用ページ<br/>初期版は同じYouTube動画を埋め込み"]
    Video --> YouTube
    Video -->|動画が再生できない| Fallback[文章の手順・再試行・YouTubeで開く]
    NoVideo --> CheckLink["この工程のスキルチェックへ<br/>/skill?step={stepId}"]
    Video --> CheckLink
    Fallback --> CheckLink
    Video --> List
    CheckLink --> Selected{利用者が選択済み?}
    Selected -- いいえ --> Picker[利用者選択画面]
    Picker --> Check[該当工程のスキルチェック]
    Selected -- はい --> Check
    Check --> List
```

「詳しいマニュアル」内の埋め込みとQR先の専用ページは、同じ公開動画IDを読む。工程内のプレーヤーは詳細ダイアログを開いたときだけ読み込み、閉じたら再生を止める。左メニューの一覧は工程データと別の固定リンクであり、工程付き・独立動画を同じカード形式で表示する。一般利用者には公開動画だけを表示し、職員には下書きカード・追加・編集操作も表示する。独立動画には工程チェックへの導線を表示しない。工程カード本体とスキルチェックのダイアログは現行のチェック操作を担う。「YouTubeで開く」は外部のYouTubeページへ進む。`/skill?step={stepId}` はマニュアルとアカウント情報の読込後に処理する。利用者を選ぶ必要がある場合は `pendingStep` に工程IDを保持し、選択後に該当工程を開く。仮登録者は現行画面と同じ閲覧のみの表示とする。動画を見ただけでは進捗は変わらない。

## 2. 職員の画面遷移

```mermaid
flowchart TD
    Staff["/manual/videos<br/>職員の動画カード一覧"] --> Create{カードの操作}
    Create -->|下書き・保管済み表示・追加・編集・非公開| CardGrant{編集許可あり?}
    CardGrant -- なし --> CardPasskey["/passkey?return_to=カード復帰URL"]
    CardPasskey -->|認証成功| Staff
    CardGrant -- あり --> Action{編集操作}
    Action -- ＋ 動画を追加 --> NewCard["新規登録カード<br/>タイトルとYouTube URLを入力"]
    NewCard --> Scope{"紐付け先<br/>既定：その他の動画"}
    Scope -->|工程付きの場合だけ工程を選択| Source{保存方法}
    Scope -->|工程なし| Source
    Source -- 初期版・YouTube --> YT[下書きを作成]
    Source -- 将来・MP4 --> R2[MP4をアップロードして下書きを作成]
    Action -- 公開カードの編集 --> Existing{同じentryIdの下書きあり?}
    Existing -- あり --> Draft
    Existing -- なし --> Copy[編集用コピーを作成]
    Action -- 将来・保存方法をMP4に変更 --> SourceDraft{別方式の下書きあり?}
    SourceDraft -- あり --> SourceConflict["409 別方式の下書きあり<br/>既存を開く／取り下げる"]
    SourceConflict -->|既存を開く| Draft
    SourceConflict -->|職員が明示的に取り下げ| Archive
    SourceDraft -- なし --> CopyR2["targetSourceType=r2で下書き作成<br/>entryIdを維持"]
    CopyR2 --> Draft
    Action -- 下書きカードの編集 --> Draft[下書きカードの編集フォーム]
    R2 --> Draft
    YT --> Draft
    Copy --> Draft
    Draft --> Edit["カード内でタイトル・URL等を編集<br/>R2なら任意のポスター・字幕を追加"]
    Edit --> Draft
    Draft -->|将来・R2の動画ファイルを差し替え| FileReplace["下書きへMP4をPUT<br/>entryId・stepIdは維持"]
    FileReplace -->|版番号更新・実機確認を無効化| Draft
    Draft -->|キャンセル| Staff
    Draft -->|下書きを取り下げる| Archive
    NewCard -->|保存前にキャンセル| Staff
    Draft --> Share["プレビューを開く・リンクをコピー・職員用QR"]
    Share --> PreviewGate["/staff/manual/videos/{videoId}/preview"]
    PreviewGate --> Session{ログイン・セッションあり?}
    Session -- なし --> Login["/session?return_to=プレビューURL"]
    Login --> PreviewGate
    Session -- あり --> StaffRole{職員・管理者?}
    StaffRole -- いいえ --> Forbidden[403 権限なし]
    StaffRole -- はい --> Grant{パスキー編集許可あり?}
    Grant -- なし --> Passkey["/passkey?return_to=プレビューURL"]
    Passkey -->|認証成功| PreviewGate
    Grant -- あり --> MediaReady{再生元が利用可能?}
    MediaReady -- いいえ --> MissingMedia["未登録の案内とアップロード導線<br/>再生確認・公開は無効"]
    MissingMedia --> Draft
    MediaReady -- はい --> Preview[下書きプレビュー]
    Preview --> Ios[iPhone Safariで再生・確認]
    Preview --> Android[Android Chromeで再生・確認]
    Ios --> Ready{現行版で両端末の確認済み?}
    Android --> Ready
    Ready -- いいえ --> Preview
    Ready -- はい --> Current{公開対象IDが下書き作成時と同じ?}
    Current -- いいえ --> Stale["409 古い下書き<br/>公開版は維持"]
    Stale --> Draft
    Current -- はい --> Publish[公開操作]
    Publish --> Staff
    Action -->|非公開| Archive[保管済み一覧]
    Action -->|保管済みタブを開く| Archive
    Archive -->|30日以内のカードで復元| Restore{同じentryIdの下書きあり?}
    Restore -- なし --> Draft
    Restore -- あり --> RestoreConflict["409 既存下書きの案内"]
    RestoreConflict --> Archive
    Archive -->|30日以降・管理者が完全削除| Purged[削除完了]
```

新規登録ではタイトルとYouTube URLだけを必須とし、工程への紐付けは任意とする。公開カードの「編集」は同じ `entryId` の同方式の下書きがあれば再利用し、なければ1件だけコピーする。公開行は直接変えない。将来のMP4差し替えはコピーしたR2下書きのファイルを更新するため、公開用の `entryId` と工程URLを維持する。YouTubeからR2へ保存方法を変える際に別方式の下書きがあれば `409` で止め、職員に既存下書きを開くか取り下げるかを示す。自動取り下げや自動再試行は行わない。取り下げ後、職員が元の公開カードから `targetSourceType=r2` の下書きを作り、ファイル更新APIを使う。MP4未登録の下書きプレビューは説明とアップロード導線だけを表示し、再生確認・公開は無効にする。保存前の新規カードの「キャンセル」はレコードを作らず、保存済み下書きの「キャンセル」は未保存入力だけを捨てて下書きを残す。下書きの取り下げは別操作で `archived` にする。職員・管理者は `/manual/videos?view=archived` の保管済みタブでカードを開き、30日以内は「下書きに復元」を押せる。カード一覧で認証・パスキー許可が切れた場合は `/manual/videos?view=drafts&edit={videoId}`、保管済みカードなら `/manual/videos?view=archived&archive={videoId}`、新規カードなら `/manual/videos?new=1`、公開カードなら `/manual/videos?focus={entryId}` に復帰する。認証後にコピー作成・復元を自動再実行しない。下書きの固定プレビューURLは職員専用で、URL自体に認証情報は含まない。端末ごとにログインとパスキー認証を行う。既存の `/passkey` は戻り先URLに未対応のため、実装時に安全なサイト内 `return_to` を受け取り、認証成功後にカードURLまたはプレビューURLへ戻す。確認後に下書きの内容を変更すると、両端末の確認は無効になる。

## 3. 動画レコードの状態遷移

この図は**1件の動画レコード**の状態を示す。公開済み動画の編集用コピーは新しいレコードとして `draft` から始まり、元の `published` レコードはそのまま残る。

```mermaid
stateDiagram-v2
    [*] --> draft: 新規登録・編集用コピー
    draft --> draft: 内容更新・R2ファイル差し替え・実機確認
    draft --> published: 両端末確認・R2ならMP4登録・公開対象IDが一致
    draft --> archived: 下書きを取り下げ
    published --> archived: 非公開・新下書きへの差し替え
    archived --> draft: 30日以内・同じentryIdの下書きなし
    archived --> deleted: 30日以降に管理者が完全削除
    deleted --> [*]

    note right of published
      内容の直接変更は禁止。
      変更は別IDの下書きを作る。
    end note
```

同じ `entry_id` の有効な `draft` は部分ユニーク索引で1件だけにする。新下書きの公開時には、作成時の `base_published_id` と現在の公開対象IDを同じトランザクションで比較する。不一致なら `409` で下書きを維持し、旧公開版を上書きしない。一致した場合に同じ `entry_id` の旧 `published` を `archived` へ移す。工程付きの場合は同じ工程の別 `entry_id` の公開版も保管し、1工程1公開動画を守る。独立動画は他の独立動画を保管しない。切替に失敗した場合は旧動画を公開したままにする。一般向けAPIは `published` のみ返す。工程が残り、公開動画がなくなった場合は、作業場所のQRから文章の手順とスキルチェックへのリンクを表示する。独立動画の公開版がなくなった場合は固定URLで「現在公開されていません」と一覧へのリンクを表示する。完全削除では、参照されなくなったR2ファイルを確認して削除する。YouTube動画本体は削除しない。

## 4. 下書きの実機確認状態

実機確認は下書きの**内容版番号ごと**に管理する。以下の `確認なし`、`iPhoneのみ`、`Androidのみ`、`両端末` は `draft` 内の確認状態であり、動画レコードの公開状態ではない。

```mermaid
stateDiagram-v2
    state "確認なし" as None
    state "iPhoneのみ" as IosOnly
    state "Androidのみ" as AndroidOnly
    state "両端末を確認" as Both
    state "公開可能" as Ready
    [*] --> None: 下書き作成・編集用コピー
    None --> IosOnly: iPhone Safariで確認
    None --> AndroidOnly: Android Chromeで確認
    IosOnly --> Both: Android Chromeで確認
    AndroidOnly --> Both: iPhone Safariで確認
    Both --> Ready: 現行版の記録が一致・R2なら再生時間あり
    None --> None: 内容変更
    IosOnly --> None: 内容変更で版番号更新
    AndroidOnly --> None: 内容変更で版番号更新
    Both --> None: 内容変更で版番号更新
    Ready --> None: 内容変更で版番号更新
    Ready --> [*]: 公開操作
```

確認ボタンは実際に再生が始まった後に表示する。職員が一時停止・シーク・音声・任意のポスターと字幕を確認してから押す。公開APIは両端末の確認記録が現在の版番号と一致することを検査する。

## 5. 段階的なAR対応

第1段階は既存工程の「詳しいマニュアル」とQR先の専用ページの両方に同じYouTube埋め込みを表示し、動画一覧から工程付き・独立動画を開けるようにする。R2保存は必要になった時点で追加する。第2段階では動画ページから別のカメラ試作画面へ進む導線を追加する。第3段階で対象物・マーカーの認識と位置合わせを検証する。AR画面の遷移は実機試作の結果で確定し、QRの固定URLは維持する。
