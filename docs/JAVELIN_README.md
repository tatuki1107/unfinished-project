# Javelin UI 0.8 alpha

Javelin UIは、Javaでコンポーネントを記述し、`javac`のASTと型情報を使ってブラウザ向けJavaScriptへ変換するフロントエンドフレームワークです。React互換ではなく、Javaの型・class・record・lambdaを活かした独自APIです。

## 必要な環境

- Node.js 20以上
- JDK 17以上
- Maven Pluginを使う場合はMaven 3.9以上

## コマンド

```bash
npm install
npm start
npm run build
npm test
npm run packages:check
```

開発サーバーは標準で`http://127.0.0.1:5173`を使用します。JavaやCSSを変更すると、Stateを可能な範囲で維持したままHMR更新します。

## 基本コンポーネント

```java
@App("#app")
public class Counter extends Component<Void> {
    private State<Integer> count = state(0);

    public VNode render() {
        return div(
            tw("rounded-3xl bg-white p-10 shadow-xl"),
            p(text("Count: " + count.get())),
            button(
                onClick(() -> count.update(value -> value + 1)),
                text("+1")
            )
        );
    }
}
```

## 実装済み機能

- State、props、typed Context、children
- keyed Virtual DOM、DOM-range Fragment、SVG
- effect、cleanup、mount/unmount、ref
- 祖先Error Boundary
- Portal
- SPA Router、query、hash、catch-all
- form、controlled property、安定したevent handler
- Tailwind CSS、検証付きCSS Modules
- 外部ES Module向けlazy loadingとproduction chunk splitting
- State保持型HMR
- key、ARIA、アクセシビリティ、HTML構造の開発時診断
- Java配列、文字数値演算、整数overflow、数値parse、primitive cast、間接Component継承
- source map、原子的production build、npm／Maven配布物
- Chrome、Firefox、WebKit実ブラウザ検証

## 高度なAPI

Error Boundary、Portal、lazy loading、HMRの仕様と例は[高度な機能](docs/ADVANCED.md)を参照してください。対応Java構文は[Framework status](docs/FRAMEWORK_STATUS.md)、CSSは[CSS Modules](docs/CSS_MODULES.md)、ブラウザ確認手順は[Browser testing](docs/BROWSER_TESTING.md)にまとめています。

## 設定

```json
{
  "sourceDirectory": "src/main/java",
  "outputDirectory": "dist",
  "publicDirectory": "public",
  "entryHtml": "index.html",
  "tailwindInput": "styles/app.css",
  "cssModuleDirectories": ["styles", "src/main/java"],
  "host": "127.0.0.1",
  "port": 5173,
  "basePath": "/",
  "spaFallback": true,
  "sourceMaps": true,
  "minify": true
}
```

Javelin UIはまだalphaです。Java全体をJavaScriptへ変換するものではなく、意味を保持できない構文は位置付きコンパイルエラーとして停止します。
