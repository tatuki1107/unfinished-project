# Changelog

## 0.8.0-alpha.1

- Configurable retry with exponential delay and request timeout
- Stale-while-revalidate memory cache with independent stale and retention times
- IndexedDB persistent cache, offline rendering, and reconnect revalidation
- Java Component dependencies across `@Lazy` boundaries
- Generated `javelin.shared.mjs` for shared records, enums, and Components

## 0.7.0-alpha.1

- REST Resource with typed JSON decoding, cancellation, cache, reload, and optimistic mutation
- Nested Router groups, guards, redirects, and scoped catch-all routes
- Typed FormField validation plus modal and spinner primitives
- Java `@Lazy` Component code splitting with fail-closed dependency boundaries
- Expanded conformance tests and Java support contract

## 0.6.0-alpha.1

- Added ancestor error boundaries and DOM-range portals.
- Added lazy browser modules, production chunk splitting, and state-preserving development HMR.
- Added development diagnostics for list keys, ARIA, accessible names, and invalid HTML nesting.
- Added safe lowering for one-dimensional arrays, character arithmetic, Java numeric parsing, primitive numeric casts, integer overflow, float rounding, and indirect component inheritance.
- Added repeatable Chrome, Firefox, and WebKit browser verification guidance.
- Fixed State field generation after a real-browser test exposed an invalid `this.this.state(...)` expression.

## 0.5.0-alpha.1

- Added real DOM-range fragments, array roots, and SVG namespaces.
- Added typed Context propagation and expanded form/router APIs.
- Fixed Java static methods and fully qualified Component inheritance.
- Unsupported overloads, constructors, indirect inheritance, and duplicate simple names now fail closed.
- Added compiler caching, serialized rebuilds, localhost binding, config validation, and physical public-path checks.
- Expanded AST and runtime regression coverage.
- Hardened URL handling against control-character and `data:` scheme bypasses.
- Made production output replacement transactional and stopped Tailwind temporary files from triggering watch rebuild loops.
- Added component children, context-driven updates through `shouldUpdate`, collision-free route params, and explicit SVG attributes.
- Java constructs whose semantics are not preserved (dimensioned arrays, character arithmetic, narrowing compound assignments, numeric parse calls, and custom record bodies) now fail closed.
- CSS Module paths and class names are validated during builds, and dynamic references are rejected by the compiler.

## 0.4.0-alpha.1

- 標準コンパイル経路をNode tokenizerからjavac ASTへ移行
- javac型検査、型付き整数除算、位置付き診断
- ローカル変数、複数statement、if、while、for、拡張for、helper method
- record、enum、ラムダ、List／Map／Set、ArrayList基本変換
- Java source mapをCLI bundleへ接続
- Maven Java API、compiler、compile pluginを分離
- npm runtime、CLI、create-appをworkspaceへ分離
- npm tarball dry-runと生成プロジェクトの本番ビルド検証

## 0.3.0

- Tailwind CSS CLIを開発・本番ビルドへ統合
- JavaソースとHTMLの明示的なutility検出
- `tw()`、`twWhen()` Java API
- variants、arbitrary values、CSS theme対応
- minify済みCSSとcontent hash
- 開発サーバーから生成CSSを配信

## 0.2.0

- 正規表現変換をtokenizerと構文検証へ置換
- 行・列付き診断とJava source map
- 子コンポーネント、record props、key差分
- lifecycle、effect cleanup、fallback、shouldUpdate、ref
- フォームproperty、イベント保持、URL安全性
- SPA router
- 本番bundle、ハッシュ、minify、source map、public資産
- watch、自動再読込、ブラウザエラー表示、SPA fallback
- Java型検査コマンド
- jsdomとHTTPを含むテスト拡充
