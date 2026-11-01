# Our Recipe Box

A private recipe app for our two Android phones. Browse and search recipes, filter by protein, One-fer or Two-fer, and meal, get a random "Surprise us" pick, keep a meal plan, leave quick notes, and add or edit recipes right from the app.

**Live app:** https://jake4518.github.io/recipe-box/

## Features

- **Browse and filter:** search by name or ingredient. The three buttons under the search bar filter by Protein, Once or twice (One-fer / Two-fer), and Meal. The Filters button at the bottom has everything else.
- **Meal plan:** tap the bookmark on any recipe to add it. The Meal plan tab shows everything planned.
- **Recipe page:** shows total time, a "Screen on" button that keeps the phone awake while cooking, and each step's ingredients listed right under the step. Checking off an ingredient anywhere checks it off everywhere on the page.
- **Quick notes:** "Add a note for next time" on any recipe, for tweaks to try before updating the recipe itself. Recipes with notes show a "1 note" tag on their card.
- **Import from a link:** when adding a recipe, paste a link from a recipe site and tap Import. It fills in the name, ingredients, directions, time, and a guess at protein and One-fer or Two-fer. Photos are added by hand.
- **Back button:** steps back one layer at a time (open panel, then recipe, then Meal plan to All recipes, then search and filters) before leaving the app.
- **Always dark:** the app uses its dark look on every phone, whatever the phone is set to.
- **Version label:** the bottom of the recipe list shows "Recipe Box version X".

## How it works

- **The app** lives in this repo and is served by GitHub Pages. It installs on Android from Chrome as a real app.
- **Recipe data** lives in a Google Sheet called "Recipe Box" (the `Recipes` tab) in Jake's personal Google account. That Sheet is the source of truth.
- **The backend** is an Apps Script attached to that Sheet. The app talks to it to load, save, delete, update the meal plan, save notes, and import recipes from links.
- **Photos** live in this repo under `photos/`. New photos uploaded from the app are compressed on the phone, then committed here by the Apps Script.
- **Access** is protected by a shared passcode, entered once per phone along with your name. The passcode and GitHub token are stored only in the Apps Script's Script Properties, never in this repo.

## What's in this repo

| Path | What it is |
| --- | --- |
| `index.html` | The page that loads the app |
| `app.js` | All the app logic |
| `styles.css` | All the styling |
| `sw.js` | Offline support, caching, and updates |
| `manifest.webmanifest` | App name, colors, icons, and app ID for installing |
| `icons/` | App icons (`icon-192.png`, `icon-512.png`, `apple-touch-icon.png`) |
| `photos/full/` | Full size recipe photos (recipe page) |
| `photos/thumb/` | Small recipe photos (cards) |
| `.github/workflows/pages.yml` | Publishes the site whenever something changes |

## The Google Sheet

Each recipe is one row in the `Recipes` tab. The `Format notes` tab explains each column. A few worth knowing:

- **ingredients:** one per line. A line starting with `##` is a sub-group heading, like `## Toppings`.
- **steps:** one per line.
- **tweaks:** the quick notes, one per line, like `2026-10-18 | Jake | Double the beans`. A plain line typed straight into the Sheet works too. This column is added automatically the first time someone saves a note.
- **id:** don't change this once set. The app uses it to link photos and edits.

Editing the Sheet directly is fine. The app picks up changes next time it's opened.

## Recurring maintenance

**Renew the GitHub token before it expires.** Expires on: `YYYY-MM-DD`

When it expires, photo uploads stop working (everything else keeps working) and the app says the token expired. To renew:

1. GitHub > Settings > Developer settings > Personal access tokens > Fine-grained tokens
2. Regenerate the "recipe-box photos" token (or make a new one with Contents: Read and write on this repo only)
3. In the Apps Script, go to Project Settings > Script Properties and replace `GITHUB_TOKEN`
4. Update the date above

## Making changes

**Update the app:** upload the changed files to the main page of this repo. Every time app files change, bump `VERSION` at the top of `sw.js` (like `v16` to `v17`) and `APP_VERSION` near the top of `app.js` so you can see the change land. Phones load the new version the first time the app is opened after GitHub shows a green check in the Actions tab.

**Things that need a reinstall on each phone:** changes to the icon, the app name, or the bar colors in `manifest.webmanifest`. Android only reads those at install time (or updates them on its own after a day or so).

**Update the Apps Script:** paste in the new code and save, then Deploy > Manage deployments > pencil icon > Version: New version > Deploy. Never use "New deployment," since that creates a new URL and the app stops connecting.

**Change the passcode:** Apps Script > Project Settings > Script Properties > edit `PASSCODE`. Each phone asks for the new one next time it opens.

**Uploading folders to GitHub:** the GitHub upload page flattens folders you drag in. To add files to a folder, open that folder in the repo first, then use Add file > Upload files from inside it. To create a new folder, use Add file > Create new file and type a name like `photos/full/keep.txt`.

**Replacing a photo directly on GitHub:** use a new file name. Phones keep photos forever, so a file with the same name keeps showing the old picture. Changing a photo from inside the app handles this automatically.

## Installing on a phone

1. Open https://jake4518.github.io/recipe-box/ in Chrome
2. Three-dot menu > Install and create shortcut > Install (not "Create shortcut")
3. Open the app, enter the passcode and your name

It should show up in the app drawer, open full screen with no address bar, and have no little Chrome logo on its icon.

## Troubleshooting

- **Phone shows an old version:** Chrome > Settings > Site settings > All sites > jake4518.github.io > Clear & reset, then reopen the app and enter the passcode again. Recipes are safe in the Sheet.
- **Chrome says the app is already installed but it won't open:** Chrome's record of the app got stuck. Uninstall the app (it's listed as "Our Recipe Box" under Settings > Apps, if it's there at all), then Chrome > Delete browsing data > All time > only "Cookies and site data" > Delete. Close Chrome, reopen it, and install again. This signs you out of websites in Chrome but keeps history, bookmarks, and passwords.
- **Chrome only offers a shortcut, not Install:** check that everything in `icons/` is present, then refresh the page in Chrome and try again.
- **Photos show as emojis:** the photo file is missing from `photos/full` or `photos/thumb`, or the name doesn't match the `photo` column in the Sheet. New photos can take a minute or two to appear on the other phone.
- **"The photo didn't upload because the GitHub token expired":** see token renewal above.
- **"The passcode changed":** the `PASSCODE` Script Property was edited. Enter the new one.
- **Import says the site blocks it or has no recipe:** some sites block automated requests or don't include recipe data. Fill those in by hand.
- **A step lists the wrong ingredient:** the app matches ingredients to steps by the words in each step, so it gets about 93% right. Steps that name ingredients ("add the garlic and cumin") match best. Everything is always in the main Ingredients list.
- **Error messages:** when something fails, the message ends with the reason in brackets, which helps figure out what went wrong. The Apps Script's Executions page also logs every error.
- **Undo a mistake:** the Sheet has version history (File > Version history), and every change in this repo can be seen under Commits.

## Ideas for later

- A "we made this" log
- Weekly grocery list from the meal plan
- Servings and scaling
