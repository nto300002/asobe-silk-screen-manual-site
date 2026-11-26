# シルクスクリーン スキルチェック（Sites版）

[Notionのマニュアル](https://app.notion.com/p/3ecffab34d9680ddb51fdc4d2162a219?pvs=25)を元にした、工程ごとのスキルチェックアプリです。ローカル版 `../silk-screen-skill-check` を元に作成し、公開版の利用者と進捗はSitesのD1に保存します。

工程本体を押すとスキルチェックが開き、右端の `?` を押すと詳細マニュアルが開きます。`?` はReact Iconsから生成したSVGです。詳細文はNotionの記載を元にし、短い工程には確認のヒントを補っています。

## 開発

```sh
npm install
npm run db:generate
node /Users/naotoyasuda/.codex/plugins/cache/openai-curated-remote/sites/1.0.0-a/scripts/build-site.mjs
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_left_wendell_rand.sql
npm start
```

既にローカルD1へマイグレーションを適用した場合、再適用しないでください。Sitesへの公開時はマイグレーションが自動適用されます。

認証はありません。サイトを閲覧できる人は全利用者の名前と進捗を閲覧・変更できます。
