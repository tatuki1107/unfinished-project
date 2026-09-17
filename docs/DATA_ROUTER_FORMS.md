# REST、Router、Form、UI部品

## REST Resource

`resource`は生成直後にリクエストし、Componentの破棄時に自動cancelします。再読込は`reload()`、表示先行更新は`mutate()`を使います。同じResource内では古い応答が新しい応答を上書きしません。

```java
private Resource<User> user = resource("/api/user", json ->
    new User(json.string("name"), json.integer("age")),
    resourceOptions()
        .retry(3)
        .retryDelay(500)
        .timeout(5000)
        .staleTime(30000)
        .cacheTime(86400000)
        .persistent("current-user")
        .offline(true)
        .revalidateOnReconnect(true)
);

public VNode render() {
    if (user.loading()) return spinner("読込中");
    if (user.errorMessage() != null) return p(text(user.errorMessage()));
    return p(text(user.get().name()));
}
```

対応methodはGET、POST、PUT、PATCH、DELETEです。資格情報はsame-origin、request bodyはJSONです。自動retryは二重更新を避けるためGETだけに適用され、待機時間は指数的に増えます。`staleTime`までは即時再利用し、`cacheTime`までは古い値を表示しながら再取得します。`persistent`を指定するとIndexedDBへ保存され、offline時にも表示し、`online`復帰時に再検証します。

## Router

```java
router(
    route("/", () -> component(Home.class)),
    routeGroup("/admin", page -> div(component(AdminNav.class), page),
        guard(() -> session.isAdmin(), "/login",
            route("/users/:id", params -> text(params.get("id")))
        ),
        route("*", () -> text("管理画面が見つかりません"))
    ),
    redirect("/old", "/new"),
    route("*", () -> component(NotFound.class))
)
```

path parameter、query、hash、nested layout、guard、redirect、catch-allに対応します。`link`と`navigate`はsame-originだけを許可します。

## FormField

```java
private FormField<String> email = field("", value ->
    value.contains("@") ? null : "メールアドレスが不正です"
);

public VNode render() {
    return form(
        input(type("email"), email.input()),
        when(email.touched(), () -> p(text(email.error()))),
        button(disabled(!formValid(email)), text("保存"))
    );
}
```

文字列以外はparserとvalidatorを渡します。`input()`はcontrolled valueと`onInput`をまとめて返し、`reset()`で初期値へ戻せます。

## UI primitives

`modal(open, label, ...)`はPortalとdialog ARIAを組み込み、`spinner(label)`はstatus ARIAを組み込みます。見た目はTailwind utility classで上書きできます。現段階ではfocus trap、toast、combobox、date pickerなどの完全なcomponent libraryは含みません。
