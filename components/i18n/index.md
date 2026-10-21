Texts of the apps live in their own YAML files, but editors want to change them without a release.
The i18n service holds a catalog of message keys per application, lets administrators write
draft translations in a CMS, and publishes the drafts as a release. An app fetches the published
bundle of its locale and lays it over its built-in texts.

Status: the [contract](/technical/api/) and the [database](/technical/database/i18n/) are in
[stratastax-contract](/technical/components/contract/), and the consumer side is in
[stratastax-flutter](/technical/components/flutter/). The service and the CMS are not built yet.

## The contract

| For                                | Operations                                                                                                                                                                                                   |
|------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Apps (role `stx-i18n:bundle-read`) | `getBundle`: the published texts of a locale, with `ETag` and `304 Not Modified`; `listPublishedLocales`                                                                                                     |
| The CMS                            | applications and their locales; importing the key catalog from the YAML files; reading keys with the status per locale; writing and discarding drafts (`If-Match`); publishing a release (`Idempotency-Key`) |

A translation is `MISSING`, `DRAFT`, `PUBLISHED` or `CHANGED` (a draft on top of a published text).
Texts are ICU MessageFormat and may only use the placeholders of their key, so a translation can
never break the app's typed messages. An import marks keys that disappeared from the app as
obsolete; they are no longer published.

## In an app

```yaml
backends:
  i18n:
    baseUrl: https://i18n.stratastax.dev
    auth: serviceAccount
    serviceAccount: { clientId: match-tracker-i18n, scopes: [stx-i18n:bundle-read] }
i18n:
  remote: { backend: i18n, application: match-tracker }
```

The app shows its compiled texts (or the cached bundle) at once and never waits for the backend;
the bundle is fetched in the background and swapped in. Only existing keys are overridden, and a
text with unknown placeholders or invalid ICU is left out. It reads with a service account of its
own, not with the user's login: the texts are the same for everyone and are needed before a login.
That account only has the read scope of published bundles, because a client secret in an app is
not a secret.
