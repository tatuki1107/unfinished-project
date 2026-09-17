# セキュリティ方針

- `text()`は常にDOM Textノードを生成し、HTMLとして解釈しません。
- 生HTMLを挿入するAPIは提供しません。
- `href()`と`src()`は`javascript:`と`vbscript:`を拒否します。
- `tag()`はタグ名を検証し、script、iframe、object、embedを拒否します。
- 開発サーバーはpublic directory外へのパス解決を拒否します。
- JavaScript生成とランタイムは`eval`や`new Function`を使用しません。
- HTTP応答に`X-Content-Type-Options: nosniff`を付与します。

Javaソースとビルド設定は信頼された入力として扱います。依存関係の監査は`npm audit`、Java APIの型検査は`npm run check:java`で行います。
