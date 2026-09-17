# Advanced frontend features

## Ancestor Error Boundary

子孫コンポーネントの初期描画、props更新、State更新中に発生した例外は、最も近い祖先の`fallback`で処理されます。

```java
public class Boundary extends Component<Void> {
    public VNode render() {
        return component(RiskyPage.class);
    }

    protected VNode fallback(Throwable error) {
        return p(text("表示に失敗しました: " + error.getMessage()));
    }
}
```

## Portal

モーダルや通知を現在のコンポーネント階層とは別のDOM領域へ描画できます。Portalは専用のDOM範囲を使うため、対象要素に既に存在するノードを変更しません。

```java
portal("#overlay-root",
    div(role("dialog"), aria("label", "確認"), text("モーダル内容"))
)
```

## Lazy module and code splitting

Java Componentには`@Lazy`を付けるだけで、ブラウザが必要になった時点で読む独立ES Moduleを生成できます。production buildではesbuildのchunk splittingが有効です。

```java
@Lazy
public final class SettingsPage extends Component<Void> {
    public VNode render() {
        return h1(text("設定"));
    }
}

// 通常のComponentから利用
component(SettingsPage.class)
```

`@Lazy` Componentから通常Component、record、enum、別のlazy Componentを参照できます。共通定義は自動生成される`javelin.shared.mjs`へ一度だけ出力されます。循環を避けるため、`@App`ルートへの逆参照とlazy Component同士の継承はコンパイル時に停止します。

既存のJavaScript ES Moduleも`lazy`で読み込めます。

```java
private static final Class<? extends Component<PageProps>> Settings =
    lazy("./settings-page.mjs", "SettingsPage");

public VNode render() {
    return component(Settings, new PageProps("設定"));
}
```


## State-preserving HMR

開発サーバーはビルド成功後に新しいapp moduleを動的importします。Component名とState宣言順が同じ場合、値を新しいComponentインスタンスへ復元します。

次の場合は安全のため初期値へ戻ることがあります。

- Component名を変更した
- Componentの階層順を大きく変更した
- Stateの宣言順または型を変更した
- ページ自体を再読み込みした

## Development diagnostics

`npm start`では以下を`console.warn`で報告します。

- `each()`で複数要素を返しているのに`key()`がない
- `img`に`alt()`がない
- 空の`button`にaccessible nameがない
- `ul`直下に`li`以外がある
- `p`内にblock要素がある
- 未知または不正なARIA属性

production bundleでは診断は無効です。
