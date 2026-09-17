# Framework status

Javelin UI 0.8はalpha段階のフロントエンドフレームワークです。Javaの意味を保持できないコードは、もっともらしい別動作へ変換せずコンパイルエラーにします。

## 実装済み基盤

- State、record props、typed Context、component children
- keyed Virtual DOM、DOM-range Fragment、array root、SVG、Portal
- effect／cleanup、lifecycle、ref、祖先Error Boundary
- 型付きFormField、ネスト／guard／redirect対応SPA Router、same-origin navigation、安全なURL／属性
- REST Resource、retry／timeout、stale-while-revalidate、IndexedDB永続cache、offline表示、再接続更新
- Tailwind CSS、検証付きCSS Modules
- 外部lazy ES Module、依存Component対応`@Lazy`、共有module抽出、production chunk splitting、State保持HMR
- key、ARIA、accessibility、HTML nestingの開発診断
- javac AST／型解析、Java source map、原子的production build
- npm／Mavenパッケージ構成
- Chrome／Firefox／WebKit実ブラウザ確認

## Javaコンパイラ契約

直接および間接的な`javelin.ui.Component`継承を扱えます。間接継承の基底classは同じコンパイル対象ソースに含める必要があります。

対応済みの数値関連処理には、32-bit整数overflow、整数除算、float丸め、文字の数値演算、1次元配列の既定値、`Integer.parseInt`、`Double.parseDouble`、`Float.parseFloat`、byte／short／char／int／float／double castがあります。

以下は引き続きfail-closedです。

- Method overload
- 明示的Component constructor
- Java `long`
- 多次元のdimension指定配列
- narrowingを伴うcompound assignment
- custom record constructor／method
- 動的なCSS Moduleパス／class名
- 未対応Java標準ライブラリ、reflection、thread、file I/O

## 残っているbeta作業

- lazy chunkのprefetch／preload方針
- CSS Modulesの完全な`:global`、`composes`、keyframe、import、URL semantics
- HMRのfield signature照合とComponent移動追跡
- 実ブラウザmatrixのCI自動実行
- より広いARIA／HTML validator
- npm／Maven公開用namespace、license、repository、publisher metadata

これらは今後のロードマップであり、現在異なる意味で黙ってエミュレートしている機能ではありません。
