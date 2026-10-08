# Find funding for your business (business-finding-funding)

The Find funding for your business service, owned by the GOV.UK Business team (`@alphagov/gov-uk-business-team`). It is being built from the pages and content tested in the pilot prototype.

It is written in [TypeScript](https://www.typescriptlang.org/) and built with [Express](https://expressjs.com/), [Nunjucks](https://mozilla.github.io/nunjucks/) and the [GOV.UK Design System](https://design-system.service.gov.uk/) (`govuk-frontend`). It runs on Heroku.

It asks about the visitor's company, using Companies House, the local authority area they want funding in, and what they need the funding for. It then shows funding schemes that match, which they can add to a shortlist.

The funding schemes are made-up examples until the real data is ready. See [Funding data](#funding-data).

## What it includes

| Path          | Purpose                                              |
| ------------- | ---------------------------------------------------- |
| `/`           | Start page                                           |
| `/business-name` | What is your company called?                      |
| `/select-business` | Choose the company from the Companies House search results |
| `/confirm-business` | Check the company details                      |
| `/registered-address` | Use the registered address to find funding? (skipped if it has no UK postcode) |
| `/postcode`   | Postcode of the business premises or area             |
| `/confirm-area` | Shows the local authority for the postcode          |
| `/sector`     | What sector is your business in? Suggested from the company's SIC codes |
| `/purpose`    | What best describes what you're trying to achieve?  |
| `/premises-area` | Is the property you want to buy or rent in the funding area? (only if moving or expanding premises) |
| `/premises-postcode` | Postcode of the property (only if it is somewhere else) |
| `/confirm-premises-area` | Shows the local authority for the property's postcode |
| `/amount`     | How much money do you need?                          |
| `/timeframe`  | When do you need the funding?                        |
| `/match-funding` | Could your business cover part of the costs itself? |
| `/equity`     | Are you open to giving investors a stake in your business? (only if the business may not be able to cover part of the costs) |
| `/check-answers` | Check your answers                                |
| `/results`    | Funding schemes that match the answers, grouped into loans, grants and equity finance |
| `/shortlist`  | Schemes the visitor has added to their shortlist     |
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
| `src/session.ts`     | Keeps the visitor's answers in a signed cookie                  |
| `src/companies-house.ts` | Searches for companies and gets their details from Companies House |
| `src/postcodes.ts`   | Checks postcodes and finds their local authority using [postcodes.io](https://postcodes.io/) |
| `src/journey/steps.ts` | The order of the questions, when each one applies, and which page comes next |
| `src/journey/questions.ts` | The questions answered by choosing from a list: wording, options and error messages |
| `src/journey/sectors.ts` | The sectors, and how they are suggested from SIC codes   |
| `src/journey/routes.ts` | The Express routes for the question pages                 |
| `src/funding/schemes.ts` | The format of the funding data, and the checks run on it when the app starts |
| `src/funding/match.ts` | The rules for which schemes to show and which are most relevant |
| `src/funding/format.ts` | How schemes are shown on the results and shortlist pages |
| `src/funding/routes.ts` | The Express routes for the results and shortlist          |
| `data/funding-schemes.json` | The funding schemes                                   |
| `src/info.ts`        | Builds the `/info` response                                     |
| `views/`             | Nunjucks page templates                                         |
| `test/`              | Tests, written in TypeScript                                    |

The app keeps nothing in memory or on local disk between requests, and takes all its settings from environment variables. The visitor's answers are kept in a cookie, signed so they cannot be changed. This means it can move from Heroku to another platform, such as AWS Lambda, by replacing `src/server.ts` rather than rewriting the app.

The next page is always the first question that applies and has not been answered. This means the change links on the check answers page return there once any new questions have been answered, and answers to questions that stop applying are removed.

As the service grows, keep its rules (for example, matching businesses to funding schemes) in their own modules, separate from the Express routes, so they can be tested and moved on their own.

## Funding data

The funding schemes are in `data/funding-schemes.json`. While `example` is `true` in that file, the results and shortlist pages say the schemes are made up and not real.

Each scheme has:

| Field | Required | What it is |
| ----- | -------- | ---------- |
| `id` | Yes | A unique name using lower case letters, numbers and hyphens, for example `growth-guarantee-scheme`. Shortlists store this, so do not change it once published |
| `type` | Yes | `loan`, `grant` or `equity` |
| `name`, `provider`, `summary` | Yes | Shown on the scheme's card |
| `url` | Yes | The provider's page about the scheme, starting `https://` |
| `checkedOn` | Yes | When the details were last checked with the provider, like `2026-10-08` |
| `eligibility` | Yes | A list of who can apply |
| `areas` | No | Where the scheme is available: lists of `countries` (for example `England`), `regions` (for example `North West`) and `localAuthorities` (ONS codes, for example `E08000003` for Manchester). Leave out for the whole of the UK |
| `amount` | No | `min` and `max` in pounds. Leave out either if there is no limit |
| `sectors`, `purposes` | No | The answer values from `src/journey/sectors.ts` and `src/journey/questions.ts` the scheme is for. Leave out if it is for all |
| `closesOn` | No | The last day to apply. Closed schemes are not shown |
| `matchFundingRequired` | No | `true` if the business must pay part of the costs |
| `interestRate`, `repaymentTerm`, `fees` | No | Shown for loans |
| `contribution`, `decisionTime` | No | Shown for grants |
| `investmentType` | No | Shown for equity |

The app checks the file when it starts and will not start if anything is wrong. `npm test` checks it too.

Which schemes are shown, and which are "most relevant", is decided in `src/funding/match.ts`. The rules are described at the top of that file. They are a starting point and need agreeing with policy.

## Settings

| Environment variable      | Purpose |
| ------------------------- | ------- |
| `SITE_PASSWORD`           | The shared password. See [Password protection](#password-protection) |
| `SESSION_SECRET`          | A long random value used to sign the answers cookie. Changing it clears everyone's answers |
| `COMPANIES_HOUSE_API_KEY` | A [Companies House API key](https://developer.company-information.service.gov.uk/) for the live service. GOV.UK Business team members can ask the team for it |

On Heroku, set these under **Settings > Config Vars**.

When running locally, all three are optional:

- without `SESSION_SECRET`, a new one is made each time the app starts, so answers are lost when it restarts
- without `COMPANIES_HOUSE_API_KEY`, the app uses made-up companies from `src/companies-house.ts`. Search for "example" to see them

In production, the question pages show an error page if `SESSION_SECRET` or `COMPANIES_HOUSE_API_KEY` is missing, and the reason is written to the logs. The start page and `/health` still work.

The postcode lookup uses the public postcodes.io API and needs no key.

## Password protection

All pages ask for a single shared password, except `/health`, `/robots.txt` and `/assets/*`. Once someone enters it, a cookie keeps them signed in for 7 days.

The password is set by the `SITE_PASSWORD` environment variable. It is not stored in this repository.

- On Heroku, set it under **Settings > Config Vars**. Changing it restarts the app and signs everyone out.
- If `SITE_PASSWORD` is missing in production, the site shows an error instead of opening up.
- If it is missing when running locally, password protection is turned off.

In production, plain HTTP requests are redirected to HTTPS.

## Run it locally

Requires Node.js 24. If you use `nvm` or `fnm`, run `nvm use` or `fnm use` in this folder to pick it up from `.nvmrc`.

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

### How deployment works

Every change merged to `main` is deployed automatically by the `deploy` job in `.github/workflows/test.yml`, once the `test` job has passed. The job runs `scripts/deploy-heroku.sh`, which:

1. packages the commit and uploads it to Heroku
2. builds it, showing Heroku's build log in the GitHub Actions log
3. waits for the new release to start, then checks it is still running after Heroku's 60 second start-up limit
4. requests `/health` and checks it returns `{"status":"ok"}`

If the build fails, the job fails and the previous release keeps running. If the new release does not start, crashes, or does not answer `/health`, the job rolls the app back to the release that was live before, then fails. If the rollback itself fails, the job log says so and shows the command to run by hand: `heroku rollback -a govuk-business-finding-funding`.

To redeploy without a code change, run the **Test and deploy** workflow by hand on `main` from the Actions tab.

### Setting up deployment

This only needs doing once, by someone with access to the Heroku app:

1. Create a Heroku API key for this repository only. In Heroku, go to **Account settings > Applications > Authorizations > Create authorization** and give it a description such as "alphagov/business-finding-funding deploys". Do not use your personal API key.
2. In this repository, go to **Settings > Environments > New environment** and create an environment called `heroku`. Under **Deployment branches and tags**, allow only `main`.
3. In the `heroku` environment, add an environment secret called `HEROKU_API_KEY` containing the key from step 1.

To revoke deploy access, delete the authorisation in Heroku. To rotate the key, create a new authorisation, update the secret, then delete the old authorisation.

## Licence

[MIT](LICENCE), Crown Copyright (Government Digital Service).
