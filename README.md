# Ridgeline (working title)

An original 2D physics hill-climb driving game for iPhone and iPad, built as an
installable web app. See [PLAN.md](PLAN.md) for the build plan and task list.

## Develop

```
npm install
npm run dev      # local server; open the printed Network URL on a phone on the same Wi-Fi
npm run check    # type-check and run the handling tests
npm run build    # production build in dist/
```

Controls: hold the right half of the screen for gas and the left half for
brake. On a keyboard use the arrow keys or A/D; R restarts.

## Play on a phone

Every push to `main` is checked, built and published to GitHub Pages by
`.github/workflows/deploy.yml`. In Safari, open the Pages address and use
Share, then "Add to Home Screen" for a full-screen launch.
