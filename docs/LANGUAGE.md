# Javaサブセット仕様

## 対応する宣言

- `@App("css selector")`を付けたルートコンポーネント1個
- `@Lazy`を付けた遅延ロード対象コンポーネント
- `class Name extends Component<PropsRecord>`
- `record`によるprops
- `State<T> name = state(expression)`フィールド
- `VNode render()`
- `void mounted()`、`void unmounted()`
- `VNode fallback(Throwable error)`
- `boolean shouldUpdate(P previousProps, P nextProps)`
- private helper method
- static field
- enum

コンポーネント内の任意フィールドや任意メソッドは、変換漏れを防ぐためエラーになります。ビジネスロジックはサポートされる式、record、またはJavaScriptへ明確に対応づけられたフレームワークAPIで記述します。

## 式の対応

- 文字列、boolean、null、JavaScriptで安全に表現できる数値
- 算術、比較、論理、三項演算子。整数除算、32-bit整数overflow、float丸めをJava互換へ変換
- Javaラムダ
- `List.of` → 配列
- `Set.of` → Set
- `Map.of` → `Map`
- `Objects.equals` → `Object.is`
- `String.valueOf`、数値の`parse...`
- `record`アクセサー
- `String.length()`／配列length
- ローカル変数と代入
- `if`／`else`
- `while`／`do while`
- 通常for／拡張for
- `break`／`continue`／`throw`
- `ArrayList`／`LinkedList`の配列変換
- Java整数除算の`Math.trunc`変換
- 1次元配列、文字の数値演算、primitive cast

`long`リテラルと演算はJavaScript Numberで正確に表せないため拒否します。構文と型検査には`javac` ASTを使い、JavaScriptへ安全に対応づけられないTreeは位置付きエラーにします。

## UI API

- 要素: `div`、`span`、`h1`、`h2`、`p`、`button`、`input`、`textarea`、`label`、`ul`、`li`、`a`、`img`
- 任意要素: `tag("section", ...)`
- 構造: `fragment`、`component`、`each`、`when`
- identity: `key`
- 属性: `className`、`id`、`value`、`checked`、`disabled`、`placeholder`、`href`、`src`、`alt`、`role`、`aria`、`data`、`style`
- Tailwind: `tw`、`twWhen`
- イベント: `onClick`、`onInput`、`onChange`
- DOM参照: `ref`
- 非同期データ: `resource`、`Resource<T>`、型検証付き`JsonValue`
- フォーム: `field`、`FormField<T>`、`formValid`
- ルーター: `route`、`routeGroup`、`guard`、`redirect`、`router`、`link`、`navigate`
- UI部品: `portal`、`modal`、`spinner`

## 意味保証

全ソースは最初に`javac --release 17`で型検査します。その後、対応表にあるASTだけをJavaScriptへ変換します。対応していない構文、標準ライブラリ呼び出し、JavaScriptで値域を保持できない`long`などは、推測変換せずファイル・行・列付きのコンパイルエラーにします。

`@Lazy`は対象Java Componentを`Name.lazy.mjs`へ分離します。参照する通常Component、record、enum、別のlazy境界は`javelin.shared.mjs`からimportされ、同じ定義を複数chunkへ複製しません。`@App`ルートへの逆参照と、lazy Component同士の継承だけは循環を避けるためコンパイルエラーになります。

## 意図的な非対応

- Java標準ライブラリ全体
- reflection、threads、synchronized、native
- classloader、ファイルI/O、JVM固有API
- メソッドオーバーロードのJava意味論
- Java `long`と任意精度の暗黙変換
- 生HTMLの挿入

対応外のJava全体が必要な場合は、J2CLやTeaVMのような完全なJava-to-JavaScriptコンパイラを下層に採用する設計変更が必要です。
