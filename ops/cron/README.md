# Daily sync job

`npm run sync:retry` runs `scripts/sync-retry.script.ts`, which calls `runSyncRetryJob` in `app/.server/jobs/sync-retry.job.ts` (spec §7.8). It works through every shop that has certificates, queue rows or pending media, or only the shop passed with `--shop`.

For each shop:

1. Gets an offline Admin API client with `unauthenticated.admin(shop)`, which refreshes an expiring offline token.
   - No offline session: the shop is skipped (`skipped: "no_session"`) and its queue rows stay.
   - The refresh failed (a 5xx or a network error): the job waits 30 s and tries once more, then skips the shop (`"unavailable"`).
   - The refresh token was rejected (`InvalidJwtError`, `invalid_subject_token`): the shop is skipped at once (`"reauth_required"`) and `job.reauth_required` is logged. Waiting won't help. A staff member opening the app stores a new offline token.
2. With `--all`, enqueues an UPSERT for every certificate that has no queue row, to re-push content after a mapping change or `import:legacy --no-mirror`. The new rows are fresh, so step 4 doesn't push them in this run. The next run does: the nightly one, or a manual run at least 15 minutes later.
3. Completes pending media (files still processing when the certificate was saved) and pushes the certificates that changed.
4. Makes sure the `coa_certificate` definition exists, then retries the due queue rows: rows with failed attempts and intent rows older than 15 minutes. Younger intent rows are skipped because the push from the app may still be running. An `auth` or `access_denied` error stops the shop there.
5. Runs the reconcile sweep, unless step 4 stopped. Every live certificate with no entry and no queue row gets its entry re-created. Entries without a live certificate are counted as `untrackedEntries` and logged as `job.untracked_entries`, but never deleted. A shop with no certificates is skipped entirely, so a wiped database can't touch the backup.

An exception inside one shop is logged as `job.shop_failed`, that shop is reported as `"unavailable"`, and the next shop runs.

`--dry-run` makes no Shopify call and writes nothing. `processed` is the number of due rows and `mediaResolved` is the number of pending file ids. With `--all` it enqueues nothing, and the count is the same, because the rows `--all` adds aren't due until the next run.

There's no lock. Every step is idempotent (upserts by handle, guarded deletes, version-checked resolution), so an overlapping run or a push from the app can't corrupt anything.

## Output

The last line of each run is the result, one JSON array:

```text
[{"shop":"example.myshopify.com","processed":2,"fixed":2,"stillFailing":0,"stuck":0,"mediaResolved":0,"untrackedEntries":0,"entriesRecreated":1}]
```

`stillFailing` counts rows with at least one failed attempt, after the run. A row that reaches 7 attempts is counted in `stuck` and logged as `job.stuck`; it keeps being retried every day. The lines before it are JSON log events on stderr (`mirror.sync_failed`, `job.shop_failed` and so on); stdout carries only the result. The exit code is 0 unless the script itself crashed (1, logged as `job.crashed`), so a skipped shop only shows up in the output.

## Local schedule (launchd)

`com.iconicshirts.coa-sync-retry.plist` runs `npm run sync:retry` in an interactive login zsh (`/bin/zsh -lic`) every day at 03:00 in the Mac's time zone. Output and errors go to `/Users/macbook/Library/Logs/coa-sync-retry.log` (launchd doesn't expand `~`, so the path is absolute).

Install it yourself. Implementers never install system agents.

```sh
cp ops/cron/com.iconicshirts.coa-sync-retry.plist ~/Library/LaunchAgents/ && launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.iconicshirts.coa-sync-retry.plist
```

Run it now:

```sh
launchctl kickstart -k gui/$(id -u)/com.iconicshirts.coa-sync-retry
```

Or run the plist's command by hand, exactly as launchd does:

```sh
env -i HOME="$HOME" /bin/zsh -lic "cd '/Users/macbook/work/split/iconic-shirts-coa-manager' && npm run sync:retry"
```

Check the last run with `tail -n 20 ~/Library/Logs/coa-sync-retry.log`, or `launchctl print gui/$(id -u)/com.iconicshirts.coa-sync-retry` for the last exit code.

Uninstall:

```sh
launchctl bootout gui/$(id -u)/com.iconicshirts.coa-sync-retry && rm ~/Library/LaunchAgents/com.iconicshirts.coa-sync-retry.plist
```

Before you install:

- Postgres.app must be running at 03:00. Turn on its "Start at login" setting.
- launchd starts the job with a bare environment. The plist runs `/bin/zsh -lic`: `-l` reads `~/.zprofile`, and `-i` makes the shell interactive so it also reads `~/.zshrc`, where nvm is loaded on this Mac. Check that this prints a path (on 2026-09-27 it printed `/Users/macbook/.nvm/versions/node/v23.5.0/bin/npm`):

  ```sh
  env -i HOME="$HOME" /bin/zsh -lic 'command -v npm'
  ```

  Anything `~/.zshrc` prints lands in the log before the job's own lines (today it prints nothing). The job's stdout still carries only the result line.

- `.env` must hold `DATABASE_URL`, `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET` and `SCOPES`. The npm script loads it with `--env-file-if-exists`.

If the Mac is asleep at 03:00, launchd runs the job when it wakes, and several missed runs are coalesced into one (`man launchd.plist`, StartCalendarInterval). The man page only covers sleep, so don't count on a catch-up after a shutdown.

The equivalent crontab line, if you prefer cron (cron skips the runs the Mac sleeps through):

```sh
0 3 * * * /bin/zsh -lic 'cd /Users/macbook/work/split/iconic-shirts-coa-manager && npm run sync:retry' >> ~/Library/Logs/coa-sync-retry.log 2>&1
```

## Production schedule

In production the host's scheduler runs `npm run sync:retry` every day at 03:00 Europe/London, in the same image as the app. `tsx` is a runtime dependency because the Dockerfile runs `npm ci --omit=dev`. The job needs the app's environment (`DATABASE_URL`, `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SCOPES`), serves no requests and exits when it's done. The entry goes into the deploy config once the host is chosen. Examples:

Kubernetes (`timeZone` is stable since 1.27):

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: coa-sync-retry
spec:
  schedule: "0 3 * * *"
  timeZone: Europe/London
  concurrencyPolicy: Forbid
  jobTemplate:
    spec:
      backoffLimit: 0
      template:
        spec:
          restartPolicy: Never
          containers:
            - name: sync-retry
              image: <app image>
              command: ["npm", "run", "sync:retry"]
              envFrom:
                - secretRef:
                    name: coa-manager-env
```

crontab, with a cron that reads `CRON_TZ` (cronie and supercronic do; check your cron's `crontab(5)` first):

```sh
CRON_TZ=Europe/London
0 3 * * * cd /app && npm run sync:retry
```

Fly.io: a scheduled Machine (`fly machine run <image> npm run sync:retry --schedule daily --restart no`) runs on a fuzzy daily cycle, so you can't pick 03:00. For a fixed time, run supercronic with the crontab above in its own process group and keep exactly one Machine in it:

```toml
[processes]
  app = "npm run docker-start"
  cron = "supercronic /app/crontab"
```

```sh
fly scale count cron=1
```

Render: a cron job service. Render schedules are always in UTC, so `0 3 * * *` is 03:00 in London in winter and 04:00 during British Summer Time.

```yaml
services:
  - type: cron
    name: coa-sync-retry
    runtime: docker
    schedule: "0 3 * * *"
    dockerCommand: npm run sync:retry
```
