# Our Recipe Box

A private recipe app for our two phones. Browse and search recipes, filter by protein or meal count, get a random "Surprise us" pick, keep a meal plan, and add or edit recipes right from the app.

**Live app:** https://jake4518.github.io/recipe-box/

## How it works

- **The app** lives in this repo and is served by GitHub Pages. It installs on Android from Chrome like a regular app.
- **Recipe data** lives in a Google Sheet called "Recipe Box" (the `Recipes` tab) in Jake's personal Google account. That Sheet is the source of truth.
- **The backend** is an Apps Script attached to that Sheet. The app talks to it to load, save, delete, and update the meal plan.
- **Photos** live in this repo under `photos/`. New photos uploaded from the app are compressed on the phone, then committed here by the Apps Script.
- **Access** is protected by a shared passcode, entered once per phone. The passcode and GitHub token are stored only in the Apps Script's Script Properties, never in this repo.

## What's in this repo

| Path | What it is |
| --- | --- |
| `index.html` | The page that loads the app |
| `app.js` | All the app logic |
| `styles.css` | All the styling |
| `sw.js` | Offline support and caching |
| `manifest.webmanifest` | App name, colors, and icons for installing |
| `icons/` | App icons |
| `photos/full/` | Full size recipe photos (recipe page) |
| `photos/thumb/` | Small recipe photos (cards) |
| `.github/workflows/pages.yml` | Publishes the site whenever something changes |

## Recurring maintenance

**Renew the GitHub token before it expires.** Expires on: `YYYY-MM-DD`

When it expires, photo uploads stop working (recipe edits still work). To renew:

1. GitHub > Settings > Developer settings > Personal access tokens > Fine-grained tokens
2. Regenerate the "recipe-box photos" token (or make a new one with Contents: Read and write on this repo only)
3. In the Apps Script, go to Project Settings > Script Properties and replace `GITHUB_TOKEN`
4. Update the date above

## Common changes

**Change the passcode:** Apps Script > Project Settings > Script Properties > edit `PASSCODE`. Each phone will ask for the new one next time it opens.

**Update the app code:** edit the file here, then bump `VERSION` at the top of `sw.js` (for example `v1` to `v2`) so phones pick up the change. It may take one or two app opens to show up.

**Update the Apps Script:** after editing the code, go to Deploy > Manage deployments > pencil icon > Version: New version > Deploy. The URL stays the same, so the app doesn't need changes.

**Edit recipes in bulk:** edit the Google Sheet directly. The `Format notes` tab explains each column. The app picks up changes next time it's opened.

## Troubleshooting

- **Photos show as emojis:** the photo file is missing from `photos/full` or `photos/thumb`, or the name doesn't match the `photo` column in the Sheet. New photos can take a minute or two to appear on the other phone.
- **"The photo didn't upload because the GitHub token expired":** see token renewal above.
- **"The passcode changed":** the `PASSCODE` Script Property was edited. Enter the new one.
- **Chrome only offers a shortcut, not Install:** check that everything in `icons/` is present, then refresh the page in Chrome and try again.
- **Undo a mistake:** the Sheet has version history (File > Version history), and every change in this repo can be seen under Commits.

## Ideas for later

- A "we made this" log
- Weekly grocery list from the meal plan
- Servings and scaling
