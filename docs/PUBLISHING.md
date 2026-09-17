# Publishing checklist

The npm tarballs and Maven artifacts can be built locally, but registry publication must use names and legal metadata owned by the publisher.

## Decisions required before the first release

- Select an SPDX license and add the corresponding `LICENSE` file and package/POM metadata.
- Select the public source repository URL and developer identity.
- Confirm ownership of the npm scope `@javelin-ui` and the unscoped `create-javelin-ui` name.
- Confirm ownership of the Maven namespace `dev.javelin` in Central Publisher Portal.

## npm

```bash
npm run packages:check
npm publish --workspace @javelin-ui/runtime --access public
npm publish --workspace @javelin-ui/cli --access public
npm publish --workspace create-javelin-ui --access public
```

Add `license`, `repository`, `homepage`, and `bugs` to every publishable `package.json` after the values above are selected.

## Maven Central

The `central-release` profile attaches source and Javadoc JARs, signs artifacts with GPG, and uses the Central Publisher Portal Maven plugin. Add the required project URL, license, developers, and SCM metadata to the parent POM before using it.

Configure a `central` server token in Maven `settings.xml`, configure the signing key, then run:

```bash
mvn -Pcentral-release deploy
```

Automatic publication is intentionally disabled so the first deployment can be reviewed in Central Publisher Portal before it becomes immutable.
