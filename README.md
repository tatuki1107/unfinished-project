# 誰かの未完成プロジェクト

未完成の小説・音楽・ゲーム企画を公開し、別の人が続きを作る創作サイトです。原作と派生作品のつながりをツリーでたどれます。

- 公開サイト: https://unfinished-project-eta.vercel.app/
- Javelin UIホームページ: https://javelin-ui-showcase.vercel.app/
- 元フレームワーク: https://github.com/tatuki1107/javelin-ui

## 機能

- カテゴリ・キーワードによる作品検索と並び替え
- 本文閲覧、作者メモ、派生条件、原作と続きの表示
- 本文入力・TXT取り込み・ファイル添付・外部URL
- 登録・ログイン、投稿・編集、公開範囲の選択
- コメント、ブックマーク、通知、通報

## 技術構成

Javelin UIで画面の土台を生成し、作品画面とAPI通信はJavaScriptを併用しています。React / Next.jsのアプリではありません。

| 対象 | 実装 |
| --- | --- |
| UI基盤 | Javelin UI、JavaからJavaScriptへのコンパイル |
| 作品画面 | JavaScript ES Modules、独自CSS、Phosphor Icons |
| 本番API | Node.js、Vercel Functions |
| 認証・データ・添付 | Supabase Auth、PostgreSQL、private Storage |
| ローカル評価版 | Node.js組み込みSQLite |

コンパイラとランタイムを同梱しています。元フレームワークの説明は[こちら](docs/JAVELIN_README.md)。

## ローカルで試す

Node.js 24とJDK 17以上を用意してください。

```bash
npm ci
npm run dev
```

http://127.0.0.1:5173/ で開きます。ローカル評価版は `data/` にSQLiteと添付を保存します。本番Supabaseとの同期はありません。

ローカル評価用ログイン: `madoka@example.com` / `demo1234`。デモアカウントとDBを本番へ持ち込まないでください。本番モードではデモデータの新規作成を抑止しています。

## Supabase版

1. 自分のSupabaseプロジェクトを作成し、`supabase/migrations/202609180001_initial.sql` を新しい環境へ適用します。既存テーブルがある環境へそのまま再実行しないでください。
2. `.env.example` を `.env.local` にコピーし、自分の接続先・キーを設定します。
3. 以下を実行します。

```bash
npm run build
npm run check:supabase
npm run serve:cloud
```

Supabase版は http://127.0.0.1:5174/ です。AuthのSite URL・Redirect URLsを使用するURLに合わせて設定してください。`SUPABASE_SECRET_KEY` はサーバー専用で、ブラウザコード・公開ソース・ログへ埋め込まないでください。

## Vercelへのデプロイ

JDKのあるローカル環境でビルドし、Vercel Build Output APIの成果物を送る方式です。GitHubリポジトリの作成だけでは自動デプロイは有効になりません。

```bash
npx vercel link
# Vercel側に以下の環境変数を設定
# SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY / SUPABASE_SECRET_KEY
npm run build:vercel
npx vercel deploy --prebuilt --prod
```

送信先プロジェクトを必ず確認し、各自のSupabase接続先・キーを使用してください。

## テスト

```bash
npm test
npm run build
```

`scripts/smoke-cloud.mjs` は実際のSupabaseへ検証用データを書き込みます。専用テスト環境で実行してください。

## サンプル作品

`content/samples/` はAI制作サンプルです。作者は架空で、実在ユーザーの利用実績ではありません。音楽は歌詞・編曲案で音源未制作、ゲームは未実装の企画書です。

`scripts/seed-long-samples.mjs` は明示的な `--publish` 指定で実アカウントと作品を登録します。単なる起動手順として実行しないでください。登録済みアカウントの資格情報は収録していません。

## 公開範囲と注意

- ソース・素材・テスト・スキーマを収録。環境変数の実値、DB、利用者の添付、アカウント資格情報、発表資料は除外しています。
- 一覧は最新200件、ツリーには表示上限があります。全件検索とページングは今後の改善対象です。
- メール到達性、通報対応、規約・プライバシー告知、バックアップ復元の運用確認は別途必要です。
- GitHubへのpushによる本番環境の変更は行いません。

## 出典

このサイトは [tatuki1107/javelin-ui](https://github.com/tatuki1107/javelin-ui) を基に開発しました。Javelin UIはalpha版で、Javaの全構文に対応するものではありません。素材の利用条件は各素材・同梱ライセンスに従ってください。リポジトリ全体に新しい包括ライセンスは付与していません。
