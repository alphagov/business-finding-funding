# Find funding for your business (business-finding-funding)

A placeholder application for the Find funding for your business service, owned by the GOV.UK Business team (`@alphagov/gov-uk-business-team`). It will be replaced by the supplier's proof of concept once that code has been checked.

It is written in [TypeScript](https://www.typescriptlang.org/) and built with [Express](https://expressjs.com/), [Nunjucks](https://mozilla.github.io/nunjucks/) and the [GOV.UK Design System](https://design-system.service.gov.uk/) (`govuk-frontend`). It runs on Heroku. It does not search for funding or collect any information.

## What it includes

| Path          | Purpose                                              |
| ------------- | ---------------------------------------------------- |
| `/`           | Start page using the GOV.UK page template            |
| `/password`   | Asks for the site password                           |
| `/health`     | Health check that returns `{"status":"ok"}`          |
| `/info`       | App version, Node.js version, Heroku stack and operating system (needs the password) |
| `/robots.txt` | Stops search engines crawling the site               |
| `/assets/*`   | GOV.UK Frontend styles, scripts, fonts and images    |

Every response also sends an `X-Robots-Tag: noindex, nofollow` header so the site is not listed in search results.

## How the code is organised

| File                 | Purpose                                                        |
| -------------------- | -------------------------------------------------------------- |
| `src/config.ts`      | Reads all settings from environment variables, in one place     |
| `src/app.ts`         | Creates the Express application from those settings             |
| `src/server.ts`      | Starts the application on a port. The only file tied to running as a long-lived server |
| `src/password.ts`    | Shared password protection                                      |
| `src/info.ts`        | Builds the `/info` response                                     |
| `views/`             | Nunjucks page templates                                         |
| `test/`              | Tests, written in TypeScript                                    |

The app keeps nothing in memory or on local disk between requests, and takes all its settings from environment variables. This means it can move from Heroku to another platform, such as AWS Lambda, by replacing `src/server.ts` rather than rewriting the app.

As the service grows, keep its rules (for example, matching businesses to funding schemes) in their own modules, separate from the Express routes, so they can be tested and moved on their own.

## Password protection

All pages ask for a single shared password, except `/health`, `/robots.txt` and `/assets/*`. Once someone enters it, a cookie keeps them signed in for 7 days.

The password is set by the `SITE_PASSWORD` environment variable. It is not stored in this repository.

- On Heroku, set it under **Settings > Config Vars**. Changing it restarts the app and signs everyone out.
- If `SITE_PASSWORD` is missing in production, the site shows an error instead of opening up.
- If it is missing when running locally, password protection is turned off.

In production, plain HTTP requests are redirected to HTTPS.

## Run it locally

Requires Node.js 24.

```sh
npm install
npm run dev
```

Then go to http://localhost:3000. `npm run dev` runs the TypeScript directly and restarts when you save a file. To test the password page, start it with a password:

```sh
SITE_PASSWORD=choose-a-password npm run dev
```

To run the compiled version, as Heroku does:

```sh
npm run build
npm start
```

## Checks

| Command             | What it does                                         |
| ------------------- | ---------------------------------------------------- |
| `npm run typecheck` | Checks the TypeScript types in `src/` and `test/`     |
| `npm run build`     | Compiles `src/` into JavaScript in `dist/`           |
| `npm test`          | Runs the tests                                       |

GitHub Actions runs all three on every pull request and on each change to `main` (see `.github/workflows/test.yml`). The check is called `test`.

## Deploy to Heroku

Heroku:

- installs all dependencies, runs `npm run build` to compile the TypeScript, then removes the development-only packages
- uses `Procfile` to start the web process (`npm start`, which runs `node dist/server.js`)
- uses `engines.node` in `package.json` to choose the Node.js version
- sets the `PORT` environment variable automatically

The compiled `dist/` folder is not committed to the repository.

The application is deployed to the `govuk-business-finding-funding` app in the `government-digital-service` team.

## Licence

[MIT](LICENCE), Crown Copyright (Government Digital Service).
