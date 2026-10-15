# Find funding for your business (business-finding-funding)

The Find funding for your business service, owned by the GOV.UK Business team (`@alphagov/gov-uk-business-team`). It is being built from the pages and content tested in the pilot prototype.

It is written in [TypeScript](https://www.typescriptlang.org/) and built with [Express](https://expressjs.com/), [Nunjucks](https://mozilla.github.io/nunjucks/) and the [GOV.UK Design System](https://design-system.service.gov.uk/) (`govuk-frontend`). It runs on Heroku.

It asks about the visitor's company, using Companies House, the local authority area they want funding in, and what they need the funding for. It then shows funding schemes that match, which they can add to a shortlist.

On Heroku it reads the funding schemes from the [funding data API](https://github.com/alphagov/business-finding-funding-api), which publishes the schemes in TPX's One Platform schema workbook. Locally, and in the tests, it uses made-up schemes from its own data file. See [Funding data](#funding-data) and [Reading the schemes from the funding data API](#reading-the-schemes-from-the-funding-data-api).

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
| `/save-results` | Emails a link to the results and shortlist. See [Emailing a link to the results](#emailing-a-link-to-the-results) |
| `/saved-results/*` | Where the emailed link goes. Brings back the answers and shows the results |
| `/password`   | Asks for the site password                           |
| `/health`     | Health check that returns `{"status":"ok"}`, or `{"status":"error"}` with status 503 if Redis cannot be reached |
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
| `src/session.ts`     | Keeps the visitor's answers in Redis. See [Visitors' answers](#visitors-answers) |
| `src/companies-house.ts` | Searches for companies and gets their details from Companies House |
| `src/postcodes.ts`   | Checks postcodes and finds their local authority using [postcodes.io](https://postcodes.io/) |
| `src/journey/steps.ts` | The order of the questions, when each one applies, and which page comes next |
| `src/journey/questions.ts` | The questions answered by choosing from a list: wording, options and error messages |
| `src/journey/sectors.ts` | The sectors, and how they are suggested from SIC codes   |
| `src/journey/routes.ts` | The Express routes for the question pages                 |
| `src/funding/schemes.ts` | The format of the funding data, and the checks run on it when the app starts |
| `src/funding/source.ts` | Where the schemes come from: the data file, or the funding data API |
| `src/funding/match.ts` | The rules for which schemes to show and which are most relevant |
| `src/funding/format.ts` | How schemes are shown on the results and shortlist pages |
| `src/funding/routes.ts` | The Express routes for the results, shortlist and emailed link |
| `src/funding/results-link.ts` | Puts the answers into the emailed link, encrypted, and reads them back |
| `src/notify.ts`      | Sends emails using [GOV.UK Notify](https://www.notifications.service.gov.uk/) |
| `data/funding-schemes.json` | Made-up funding schemes, used locally and in the tests |
| `src/info.ts`        | Builds the `/info` response                                     |
| `views/`             | Nunjucks page templates                                         |
| `test/`              | Tests, written in TypeScript                                    |

The app keeps nothing in memory or on local disk between requests, and takes all its settings from environment variables. The visitor's answers are kept in Redis. This means it can run on more than one server at a time, and move from Heroku to another platform, such as AWS Lambda, by replacing `src/server.ts` rather than rewriting the app.

## Visitors' answers

The visitor's answers, including their shortlist, are kept in Heroku Redis. The browser only holds a cookie called `session` with a random session ID, signed with `SESSION_SECRET` so it cannot be changed. The cookie is only set once there is something to save, and lasts until the browser is closed.

- Answers are kept for 24 hours after the visitor last used them, then Redis deletes them. This is `SESSION_HOURS` in `src/session.ts`.
- The Heroku Redis Mini plan does not keep data if Redis restarts, for example during maintenance, so visitors may occasionally have to start again. Visitors can keep their results by emailing themselves a link.
- The plan holds 25 MB, enough for thousands of visitors at a time.
- If Redis cannot be reached, the question pages show an error page, the reason is written to the logs, and `/health` reports an error. The start page still works.

Heroku Redis needs an encrypted connection, but its certificates cannot be checked against a certificate authority, so, as Heroku's instructions say, the app does not check them.

When running locally without `REDIS_URL`, answers are kept in the app's memory and lost when it restarts. To use Redis locally, start it with Docker:

```sh
docker compose up -d --wait
REDIS_URL=redis://localhost:6379 npm run dev
```

The next page is always the first question that applies and has not been answered. This means the change links on the check answers page return there once any new questions have been answered, and answers to questions that stop applying are removed.

As the service grows, keep its rules (for example, matching businesses to funding schemes) in their own modules, separate from the Express routes, so they can be tested and moved on their own.

## Funding data

Unless `FUNDING_API_URL` is set, the funding schemes come from `data/funding-schemes.json`, which holds made-up schemes. While `example` is `true` in that file, or in the API's list of schemes, the results and shortlist pages say the schemes are made up and not real.

Each scheme has:

| Field | Required | What it is |
| ----- | -------- | ---------- |
| `id` | Yes | A unique name using lower case letters and numbers, joined by hyphens or underscores, for example `growth-guarantee-scheme` or `start_up_loans_uk`. Shortlists store this, so do not change it once published |
| `type` | Yes | `loan`, `grant` or `equity` |
| `name`, `provider`, `summary` | Yes | Shown on the scheme's card |
| `url` | Yes | The provider's page about the scheme, starting `https://` |
| `checkedOn` | Yes | When the details were last checked with the provider, like `2026-10-08` |
| `eligibility` | Yes | A list of who can apply |
| `areas` | No | Where the scheme is available: lists of `countries` (for example `England`), `regions` (for example `North West`) and `localAuthorities` (ONS codes, for example `E08000003` for Manchester). Leave out for the whole of the UK |
| `amount` | No | `min` and `max` in pounds. Leave out either if there is no limit |
| `sectors`, `purposes` | No | The answer values from `src/journey/sectors.ts` and `src/journey/questions.ts` the scheme is for. Leave out if it is for all |
| `closesOn` | No | The last day to apply. Closed schemes are not shown |
| `status` | No | From the funding data API, for example `open`, `open-paused` or `pre-launch`. Only open schemes are shown. Leave out in the data file, where every scheme is treated as open |
| `matchFundingRequired` | No | `true` if the business must pay part of the costs |
| `interestRate`, `repaymentTerm`, `fees` | No | Shown for loans |
| `contribution`, `decisionTime` | No | Shown for grants |
| `investmentType` | No | Shown for equity |

The app checks the file when it starts and will not start if anything is wrong. `npm test` checks it too.

Which schemes are shown, and which are "most relevant", is decided in `src/funding/match.ts`. The rules are described at the top of that file. They are a starting point and need agreeing with policy.

### Reading the schemes from the funding data API

When `FUNDING_API_URL` is set, the schemes are read from the [funding data API](https://github.com/alphagov/business-finding-funding-api) instead of `data/funding-schemes.json`.

- They are checked in the same way as the data file.
- They are kept for 5 minutes before the API is asked again.
- If the API cannot be reached, or sends schemes with problems, the last copy is used and a warning is written to the logs, so a short outage does not stop people seeing their results. If there is no earlier copy, the results page shows an error and the reason is written to the logs.

To run both locally, start the API in its own folder with `npm run dev`, then run this in this folder:

```sh
FUNDING_API_URL=http://localhost:3001 npm run dev
```

## Settings

| Environment variable      | Purpose |
| ------------------------- | ------- |
| `SITE_PASSWORD`           | The shared password. See [Password protection](#password-protection) |
| `SESSION_SECRET`          | A long random value used to sign the session cookie and encrypt emailed links. Changing it clears everyone's answers and stops emailed links working |
| `REDIS_URL`               | Where visitors' answers are kept. Heroku Redis sets it. See [Visitors' answers](#visitors-answers) |
| `COMPANIES_HOUSE_API_KEY` | A [Companies House API key](https://developer.company-information.service.gov.uk/) for the live service. GOV.UK Business team members can ask the team for it |
| `NOTIFY_API_KEY`          | A GOV.UK Notify API key, for emailing links to the results |
| `NOTIFY_RESULTS_TEMPLATE_ID` | The ID of the Notify email template for the link. See [Emailing a link to the results](#emailing-a-link-to-the-results) |
| `SERVICE_URL`             | The address of the site, for example `https://govuk-business-finding-funding-906e3c5bb434.herokuapp.com`, used in emailed links. Needed in production |
| `FUNDING_API_URL`         | The address of the funding data API, for example `http://localhost:3001`. Leave out to read the schemes from `data/funding-schemes.json` |

On Heroku, set these under **Settings > Config Vars**.

When running locally, all of them are optional:

- without `SESSION_SECRET`, a new one is made each time the app starts, so answers and emailed links stop working when it restarts
- without `COMPANIES_HOUSE_API_KEY`, the app uses made-up companies from `src/companies-house.ts`. Search for "example" to see them
- without `NOTIFY_API_KEY`, no emails are sent. The link that would have been emailed is written to the terminal instead
- without `SERVICE_URL`, emailed links use the address the page was requested from
- without `FUNDING_API_URL`, the schemes are read from `data/funding-schemes.json`
- without `REDIS_URL`, answers are kept in the app's memory and lost when it restarts

In production, the question pages show an error page if `SESSION_SECRET`, `REDIS_URL` or `COMPANIES_HOUSE_API_KEY` is missing, and the reason is written to the logs. The start page and `/health` still work.

If `NOTIFY_API_KEY`, `NOTIFY_RESULTS_TEMPLATE_ID` or `SERVICE_URL` is missing in production, the email page says the email could not be sent, and the reason is written to the logs.

The postcode lookup uses the public postcodes.io API and needs no key.

## Emailing a link to the results

Visitors can ask for an email with a link back to their results and shortlist. The link holds their answers, encrypted with a key derived from `SESSION_SECRET`, so nothing extra is stored to make it work. Links stop working after 30 days, or if `SESSION_SECRET` changes. The email address is only passed to GOV.UK Notify.

To set it up in [GOV.UK Notify](https://www.notifications.service.gov.uk/):

1. Create an email template with the subject `Your funding options for ((business_name))`. The message must use the placeholders `((business_name))`, `((link))` and `((expiry_date))`, for example:

   ```text
   You asked for a link to your funding results and shortlist for ((business_name)).

   # See your results

   ((link))

   ^ The link will work until ((expiry_date)). Anyone with the link can see your answers, so do not forward this email.

   # Before you apply

   Check each scheme’s eligibility and closing date on the provider’s website. Schemes can change or close at short notice.

   ---

   If you did not ask for this email, you can ignore it. No one can see your answers without the link.

   Find funding for your business

   This is a test service. It is not a real service.
   ```

   In Notify, `#` makes a heading, `^` makes inset text and `---` makes a horizontal line.

2. Set `NOTIFY_RESULTS_TEMPLATE_ID` to the template's ID.
3. Create an API key under **API integration > API keys** and set it as `NOTIFY_API_KEY`. While the Notify service is in trial mode, use a **Team and guest list** key. Emails can then only go to members of the Notify team and addresses on its guest list. Anyone else is told that the site is a trial.

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

The tests keep answers in memory. Two tests also use a real Redis, and are skipped unless `TEST_REDIS_URL` is set. To run them locally:

```sh
docker compose up -d --wait
TEST_REDIS_URL=redis://localhost:6379 npm test
```

GitHub Actions runs all three on every pull request and on each change to `main`, with its own Redis, so the Redis tests always run there (see `.github/workflows/test.yml`). The check is called `test`.

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
4. requests `/health`, which also checks Redis, and checks it returns `{"status":"ok"}`

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
