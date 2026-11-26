export const sections = [
  {
    id: "data", number: "01", title: "データ加工", subtitle: "注文データを版に使える形へ整える", icon: "pen",
    steps: [
      { id: "data-receive", title: "顧客データを確認する", description: "紙・画像・Illustratorデータを受け取る", image: "/data-receive-example.jpg", imageAlt: "黒いパーカーの上に置かれたデザイン原稿", items: ["受け取ったデータの種類を確認した", "デザインの内容を確認した", "プリントに使うデータを用意した"] },
      { id: "data-levels", title: "Photoshopでレベル調整する", description: "グレーや濃淡を確認する", image: "/data-levels-example.jpg", imageAlt: "グレーのパーカーに定規を当ててデザイン位置を測る様子", items: ["グレー部分を確認した", "必要なレベル調整を行った", "必要に応じてハーフトーンを使った"] },
      { id: "data-trace", title: "Illustratorでトレースする", description: "画像を版に適した形へ整える", items: ["ラスターデータとベクターデータの違いを確認した", "必要な部分をトレースした", "白黒で表現できるデータになっている"] },
      { id: "data-layout", title: "出力データを仕上げる", description: "A3ノビ・高解像度・トンボを確認する", items: ["解像度を高めに設定した", "A3ノビのサイズを確認した", "トンボ（レジストレーション）を配置した", "OHPフィルムに印刷/OHPフィルムを二重に印刷した"] }
    ]
  },
  {
    id: "plate", number: "02", title: "版作成", subtitle: "露光と水洗いで版を作る", icon: "layers",
    steps: [
      { id: "plate-center", title: "枠の真ん中を測る", description: "OHPフィルムを使って中心を確認", items: ["枠の真ん中を測った", "OHPフィルムに中心位置を確認した"] },
      { id: "plate-align", title: "位置を合わせる", description: "出力したデザインを配置", items: ["OHPフィルムの印刷側を版に貼る。", "デザインの位置を確認した", "枠とOHPフィルムの位置を合わせた", "上下をセロテープで留めた", "露光機へ持っていく"], progressIndices: [4, 0, 1, 2, 3] },
      { id: "plate-expose", title: "露光", description: "道具を重ねてLEDで露光する", items: ["スポンジを乗せる", "鉄板を乗せる", "ポリタンクを乗せる", "タイマーの針が93秒数の位置になっているか確認した", "LEDをつけた", "92秒を目安に露光した"], progressRefs: [["plate-sponge", 0], ["plate-iron", 0], ["plate-tank", 0], ["plate-expose", 0], ["plate-expose", 1], ["plate-expose", 2]] },
      { id: "plate-wash", title: "水洗いする", description: "感光剤の不要な部分を落とす", items: ["OHPフィルムを剥がす", "ウェスに多めに水を含ませて、表裏につける。\n少し時間を置いてから優しく擦って落としていく。", "デザイン部分が抜けていることを確認した。"], progressIndices: [2, 3, 1] },
      { id: "plate-tape", title: "仕上げ", description: "拭き取り・乾燥・二重露光・テープ貼り", items: ["タオルでフレームを優しく拭く", "ドライヤーで乾燥させる", "露光機で錘を乗せずに二重露光する(92秒)", "フレームの四隅にマスキングテープを貼る"], progressIndices: [2, 3, 4, 0] }
    ]
  },
  {
    id: "print", number: "03", title: "プリント", subtitle: "版をセットしてインクを落とす", icon: "print",
    steps: [
      { id: "print-align-first", title: "プリント位置を合わせる", description: "刷る位置を決める", items: ["プリントする位置を確認した", "位置を合わせた"] },
      { id: "print-glue", title: "プラテンにスプレーのりをかける", description: "作業面を準備する", items: ["プラテンを確認した", "スプレーのりをかけた"] },
      { id: "print-align-second", title: "位置を再確認する", description: "セット前にずれを確認", items: ["プリント位置を再確認した", "ずれがないことを確認した"] },
      { id: "print-set", title: "版をセットする", description: "位置を保って固定", items: ["版をセットした", "版の位置を確認した"] },
      { id: "print-ink", title: "インクを乗せる", description: "版にインクを置く", items: ["使用するインクを確認した", "版にインクを乗せた"] },
      { id: "print-squeegee", title: "スキージになじませる", description: "インクを均一にする", items: ["インクをスキージになじませた", "インクの状態を確認した"] },
      { id: "print-pass", title: "インクを落とす", description: "スキージを2往復する", items: ["スキージを2往復した", "プリントの状態を確認した"] },
      { id: "print-dry", title: "乾かす", description: "水性はドライヤー・油性は熱波", items: ["インクの種類を確認した", "水性ならドライヤー、油性なら熱波で乾かした", "乾き具合を確認した"] }
    ]
  }
];

export const steps = sections.flatMap(section => section.steps);
export const totalItems = steps.reduce((sum, step) => sum + step.items.length, 0);
