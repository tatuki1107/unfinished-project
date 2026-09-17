package example;

import javelin.ui.App;
import javelin.ui.Component;
import javelin.ui.State;
import javelin.ui.VNode;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

import static javelin.ui.Html.*;

@App("#app")
public class Counter extends Component<Void> {
    private State<String> category = state("all");
    private State<String> selected = state("game");
    private State<Boolean> composerOpen = state(false);
    private State<Boolean> saved = state(false);
    private State<Integer> newBranches = state(0);

    /* Compiler coverage retained for the Javelin UI example test suite. */
    private String item = "field";
    private static String LABEL = "label";

    public VNode render() {
        VNode status = renderStatus(newBranches.get());

        return div(
                className("app-shell"),
                div(
                        className("compiler-probe"),
                        cssModule("styles/counter.module.css", "panel"),
                        tw("bg-indigo-600 hover:bg-indigo-700"),
                        status,
                        renderFeatures()
                ),
                div(id("product-root"))
        );
    }

    private VNode renderHeader() {
        return tag("header",
                className("site-header"),
                div(
                        className("header-inner"),
                        a(
                                href("#app"),
                                className("brand-link"),
                                aria("label", "誰かの未完成プロジェクト ホーム"),
                                img(className("brand-logo"), src("/brand/unfinished-project-logo.png"), alt("誰かの未完成プロジェクト")),
                                img(className("brand-symbol"), src("/brand/unfinished-project-symbol.png"), alt(""))
                        ),
                        tag("nav",
                                className("header-nav"),
                                aria("label", "メインナビゲーション"),
                                a(href("#feed-title"), text("作品を探す")),
                                a(href("/about.html"), text("このプロジェクトについて")),
                                a(href("#app"), text("お知らせ"))
                        ),
                        div(
                                className("header-actions"),
                                button(
                                        type("button"),
                                        className("icon-button"),
                                        aria("label", "通知"),
                                        img(src("/icons/bell.svg"), alt(""))
                                ),
                                button(
                                        type("button"),
                                        className("primary-button header-cta"),
                                        aria("label", "未完成を置く"),
                                        onClick(() -> {
                                            saved.set(false);
                                            composerOpen.set(true);
                                        }),
                                        img(src("/icons/plus.svg"), alt("")),
                                        span(text("未完成を置く"))
                                ),
                                button(type("button"), className("avatar-button"), aria("label", "プロフィール"), span(text("K")))
                        )
                )
        );
    }

    private VNode renderIntro() {
        return tag("section",
                className("intro"),
                div(
                        className("intro-copy-block"),
                        p(className("kicker"), text("OPEN CREATIVE PROJECTS")),
                        h1(text("続きを、待っている作品。")),
                        p(className("intro-copy"), text("誰かが途中で置いた物語や音楽、ゲームのアイデア。気になる作品を見つけて、あなたの枝を伸ばそう。"))
                ),
                div(
                        id("about"),
                        className("intro-art"),
                        img(src("/art/hero-collage.png"), alt("青空と電線を切り取ったコラージュ")),
                        p(className("intro-note"), text("未完成は、誰かのはじまり。")),
                        p(className("intro-art-caption"), text("きっと、どこかでつながっている。"))
                )
        );
    }

    private VNode renderFilters() {
        return div(
                className("filter-bar"),
                div(
                        className("filter-scroll"),
                        filterButton("all", "leaf", "すべて", "24"),
                        filterButton("novel", "pen-nib", "小説", "11"),
                        filterButton("music", "music-notes", "音楽", "8"),
                        filterButton("game", "game-controller", "ゲーム企画", "5")
                ),
                button(
                        type("button"),
                        className("sort-button"),
                        img(src("/icons/funnel.svg"), alt("")),
                        span(text("新着順")),
                        img(src("/icons/caret-down.svg"), alt(""))
                )
        );
    }

    private VNode filterButton(String idValue, String iconName, String labelText, String countText) {
        return button(
                type("button"),
                className(Objects.equals(category.get(), idValue) ? "filter-chip " + idValue + " active" : "filter-chip " + idValue),
                aria("pressed", Objects.equals(category.get(), idValue)),
                onClick(() -> {
                    category.set(idValue);
                    saved.set(false);
                    if (!Objects.equals(idValue, "all")) {
                        selected.set(idValue);
                    }
                }),
                span(className("filter-icon"), img(src("/icons/" + iconName + ".svg"), alt(""))),
                span(text(labelText)),
                tag("small", text(countText))
        );
    }

    private VNode renderFeed() {
        List<VNode> cards = new ArrayList<>();

        if (Objects.equals(category.get(), "all") || Objects.equals(category.get(), "novel")) {
            cards.add(renderNovelCard());
        }
        if (Objects.equals(category.get(), "all") || Objects.equals(category.get(), "music")) {
            cards.add(renderMusicCard());
        }
        if (Objects.equals(category.get(), "all") || Objects.equals(category.get(), "game")) {
            cards.add(renderGameCard());
        }

        return fragment(
                div(
                        className("section-heading"),
                        div(h2(id("feed-title"), text("新しく置かれた作品")), p(text(cards.size() + "件を表示中"))),
                        a(href("#app"), className("text-link"), span(text("すべて見る")), img(src("/icons/arrow-right.svg"), alt("")))
                ),
                div(className("project-list"), cards)
        );
    }

    private VNode renderNovelCard() {
        return tag("article",
                className("card-wrap"),
                button(
                        type("button"),
                        className(Objects.equals(selected.get(), "novel") ? "project-card novel selected" : "project-card novel"),
                        aria("pressed", Objects.equals(selected.get(), "novel")),
                        onClick(() -> {
                            selected.set("novel");
                            saved.set(false);
                        }),
                        span(className("project-visual"), img(src("/art/rain-novel.png"), alt("雨に濡れた町の小説イメージ"))),
                        span(
                                className("project-content"),
                                span(className("project-meta"), span(className("category-label"), text("小説")), span(className("updated"), img(src("/icons/clock.svg"), alt("")), text("3日前"))),
                                span(className("project-title"), text("雨が止むまで名前を忘れる")),
                                span(className("project-excerpt"), text("雨が降るたび、町の人々はひとつずつ固有名詞を忘れていく。第3章の途中まで。")),
                                span(className("project-footer"),
                                        span(className("author"), span(className("mini-avatar blue"), text("鈴")), span(text("鈴木まどか"))),
                                        span(className("branch-count"), img(src("/icons/git-fork.svg"), alt("")), strongText("12"), span(className("branch-label"), text("本の続き")), span(className("branch-unit"), text("本")))
                                )
                        ),
                        span(className("card-arrow"), img(src("/icons/arrow-right.svg"), alt("")))
                )
        );
    }

    private VNode renderMusicCard() {
        return tag("article",
                className("card-wrap"),
                button(
                        type("button"),
                        className(Objects.equals(selected.get(), "music") ? "project-card music selected" : "project-card music"),
                        aria("pressed", Objects.equals(selected.get(), "music")),
                        onClick(() -> {
                            selected.set("music");
                            saved.set(false);
                        }),
                        span(className("project-visual"), img(src("/art/four-am-blue.png"), alt("夜明け前の町を描いた音楽ジャケット"))),
                        span(
                                className("project-content"),
                                span(className("project-meta"), span(className("category-label"), text("音楽")), span(className("updated"), img(src("/icons/clock.svg"), alt("")), text("5日前"))),
                                span(className("project-title"), text("午前四時のブルー")),
                                span(className("project-excerpt"), text("Aメロとサビだけのデモ。低いピアノと生活音で、朝に溶ける夜を残しました。")),
                                span(className("project-footer"),
                                        span(className("author"), span(className("mini-avatar pink"), text("安")), span(text("安西ルイ"))),
                                        span(className("branch-count"), img(src("/icons/git-fork.svg"), alt("")), strongText("7"), span(className("branch-label"), text("本のアレンジ")), span(className("branch-unit"), text("本")))
                                )
                        ),
                        span(className("card-arrow"), img(src("/icons/arrow-right.svg"), alt("")))
                )
        );
    }

    private VNode renderGameCard() {
        return tag("article",
                className("card-wrap"),
                button(
                        type("button"),
                        className(Objects.equals(selected.get(), "game") ? "project-card game selected" : "project-card game"),
                        aria("pressed", Objects.equals(selected.get(), "game")),
                        onClick(() -> {
                            selected.set("game");
                            saved.set(false);
                        }),
                        span(className("project-visual"), img(src("/art/underwater-post.png"), alt("海底に沈んだ郵便ポストの企画イメージ"))),
                        span(
                                className("project-content"),
                                span(className("project-meta"), span(className("category-label"), text("ゲーム企画")), span(className("updated"), img(src("/icons/clock.svg"), alt("")), text("1週間前"))),
                                span(className("project-title"), text("海底郵便局 — 届かない手紙の配達員")),
                                span(className("project-excerpt"), text("沈んだ町を巡り、生前に届かなかった手紙を配る探索ゲーム。最初の3エリアまで設計済み。")),
                                span(className("project-footer"),
                                        span(className("author"), span(className("mini-avatar yellow"), text("佐")), span(text("佐伯つぐみ"))),
                                        span(className("branch-count"), img(src("/icons/git-fork.svg"), alt("")), strongText("4"), span(className("branch-label"), text("本の派生企画")), span(className("branch-unit"), text("本")))
                                )
                        ),
                        span(className("card-arrow"), img(src("/icons/arrow-right.svg"), alt("")))
                )
        );
    }

    private VNode renderDetail() {
        String title = "雨が止むまで名前を忘れる";
        String detailType = "小説";
        String iconName = "pen-nib";
        String theme = "novel";
        String detail = "第3章の途中で止まっています。結末は決めていません。町から『雨』という言葉が消えた後を、自由に書いてください。";
        String progress = "18 / 42 ページ";
        String root = "原案 / 鈴木まどか";
        String childA = "記憶を売る店 編";
        String childB = "弟の名前 編";
        String artwork = "/art/rain-novel.png";
        String author = "鈴木まどか";

        if (Objects.equals(selected.get(), "music")) {
            title = "午前四時のブルー";
            detailType = "音楽";
            iconName = "music-notes";
            theme = "music";
            detail = "ボーカルも歌詞も仮のままです。別の声、別の楽器、まったく違うテンポで、この夜の続きを作ってください。";
            progress = "2:18 / BPM 74";
            root = "原曲 / 安西ルイ";
            childA = "雨音リミックス";
            childB = "朝焼けのコーラス";
            artwork = "/art/four-am-blue.png";
            author = "安西ルイ";
        }
        if (Objects.equals(selected.get(), "game")) {
            title = "海底郵便局";
            detailType = "ゲーム企画";
            iconName = "game-controller";
            theme = "game";
            detail = "物語、ゲームループ、ビジュアル案のどこからでも参加できます。最後の配達先はまだ空白です。";
            progress = "企画書 14ページ";
            root = "原案 / 佐伯つぐみ";
            childA = "手紙収集ADV案";
            childB = "二人協力版";
            artwork = "/art/underwater-post.png";
            author = "佐伯つぐみ";
        }

        return div(
                className("detail-card " + theme),
                div(
                        className("detail-hero"),
                        div(span(className("detail-type"), text(detailType)), h2(text(title)), p(className("detail-progress"), text("作者 " + author + "　｜　" + progress))),
                        button(type("button"), className("bookmark-button"), aria("label", "気になるに追加"), img(src("/icons/bookmark-simple.svg"), alt("")))
                ),
                p(className("detail-copy"), text(detail)),
                div(
                        className("permission"),
                        img(src("/icons/check-circle.svg"), alt("")),
                        div(strongText("派生・改変OK"), p(text("作者表記を引き継いでください")))
                ),
                button(
                        type("button"),
                        className("primary-button fork-button"),
                        onClick(() -> {
                            saved.set(false);
                            composerOpen.set(true);
                        }),
                        img(src("/icons/git-fork.svg"), alt("")),
                        span(text("この続きをつくる")),
                        img(className("button-arrow"), src("/icons/arrow-right.svg"), alt(""))
                ),
                div(
                        className("lineage-header"),
                        div(tag("h3", text("派生ツリー")), p(text("この作品から生まれた続き"))),
                        button(type("button"), className("tree-link"), text("全体を見る"))
                ),
                div(
                        className("tree"),
                        div(className("tree-root-card"), img(src(artwork), alt("")), div(strongText(title), p(text(root)))),
                        div(
                                className("tree-children"),
                                div(className("tree-node branch-green"), span(className("tree-avatar"), img(src("/icons/file-text.svg"), alt(""))), div(strongText(childA), p(text("たなか海　・　3本の枝")))),
                                div(className("tree-node branch-pink"), span(className("tree-avatar"), img(src("/icons/music-notes.svg"), alt(""))), div(strongText(childB), p(text("yuzu　・　5本の枝")))),
                                div(className("tree-node branch-blue"), span(className("tree-avatar"), img(src("/icons/books.svg"), alt(""))), div(strongText("あの夏、海に捨てた言葉たち"), p(text("夏目ソラ　・　4本の枝")))),
                                when(newBranches.get() > 0, () -> div(className("tree-node new-node"), span(className("tree-avatar new"), img(src("/icons/sparkle.svg"), alt(""))), div(strongText("あなたの新しい枝"), p(text("下書きを保存しました")))))
                        ),
                        button(type("button"), className("tree-add"), onClick(() -> composerOpen.set(true)), text("＋　この先に、あなたの続きが待っています"))
                )
        );
    }

    private VNode renderComposer() {
        return div(
                className("modal-backdrop"),
                div(
                        className("composer"),
                        role("dialog"),
                        aria("modal", "true"),
                        aria("labelledby", "composer-title"),
                        div(
                                className("composer-head"),
                                div(span(className("modal-icon"), img(src("/icons/git-fork.svg"), alt(""))), div(p(className("kicker"), text("NEW BRANCH")), h2(id("composer-title"), text("続きを置く")))),
                                button(type("button"), className("close-button"), onClick(() -> composerOpen.set(false)), aria("label", "閉じる"), img(src("/icons/x.svg"), alt("")))
                        ),
                        p(className("composer-intro"), text("まだ曖昧なアイデアでも大丈夫。まずは新しい枝として残してみよう。")),
                        label(forId("branch-title"), text("枝のタイトル")),
                        input(id("branch-title"), className("text-input"), placeholder("例：雨の名前を探す旅")),
                        label(forId("branch-note"), text("どんな続きを作りますか")),
                        textarea(id("branch-note"), className("text-area"), placeholder("考えている展開や、変えてみたいポイントを書いてください。")),
                        div(
                                className("composer-foot"),
                                p(text("下書きはあとから編集できます")),
                                button(
                                        type("button"),
                                        className("primary-button save-button"),
                                        onClick(() -> {
                                            newBranches.set(newBranches.get() + 1);
                                            composerOpen.set(false);
                                            saved.set(true);
                                        }),
                                        img(src("/icons/check-circle.svg"), alt("")),
                                        span(text("下書きを保存"))
                                )
                        )
                )
        );
    }

    private VNode renderToast() {
        return div(
                className("success-toast"),
                role("status"),
                img(src("/icons/check-circle.svg"), alt("")),
                div(strongText("新しい枝を保存しました"), p(text("派生ツリーに追加されています"))),
                button(type("button"), onClick(() -> saved.set(false)), aria("label", "閉じる"), img(src("/icons/x.svg"), alt("")))
        );
    }

    private VNode strongText(String value) {
        return tag("strong", text(value));
    }

    private VNode renderStatus(int value) {
        if (value == 0) {
            return p(text("まだ枝はありません"));
        }
        return p(text("Count: " + value));
    }

    private VNode renderFeatures() {
        List<String> features = List.of("Java", "AST", "Tailwind");
        List<VNode> items = new ArrayList<>();

        for (String feature : features) {
            items.add(span(key(feature), text(feature)));
        }

        return div(items);
    }

    private VNode compilerScopeProbe() {
        for (String item : List.of("local")) {
            text(item);
        }
        return div(text(item), text(LABEL));
    }
}
