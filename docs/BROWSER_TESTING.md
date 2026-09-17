# Browser testing

実ブラウザ確認にはPlaywright CLIを利用できます。プロジェクト本体へPlaywrightを依存追加する必要はありません。

```bash
npm start
npx --yes --package @playwright/cli playwright-cli install-browser firefox
npx --yes --package @playwright/cli playwright-cli install-browser webkit

npx --yes --package @playwright/cli playwright-cli -s=javelin-chrome open http://127.0.0.1:5173 --browser chrome
npx --yes --package @playwright/cli playwright-cli -s=javelin-chrome snapshot
```

`snapshot`で取得した最新refを使ってボタン操作を行い、再度snapshotとconsoleを確認します。

```bash
npx --yes --package @playwright/cli playwright-cli -s=javelin-chrome click REF
npx --yes --package @playwright/cli playwright-cli -s=javelin-chrome snapshot
npx --yes --package @playwright/cli playwright-cli -s=javelin-chrome console error
```

同じ手順を`--browser firefox`と`--browser webkit`でも実行します。2026-07-26時点で3ブラウザすべてについて、初期描画、State更新、Tailwind適用、HMR後のState保持、コンソールエラー0を確認しています。
