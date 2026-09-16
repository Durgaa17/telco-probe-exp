# telco-probe-exp

Offline-only **port 80 reachability scanner**.

Pure client-side · works on GitHub Pages · no backend required.

## Features

- **Manual scan** – type any IP / hostname and probe port 80
- **Sample Test** – loads a public IP list and probes each entry 5 times
- List is cached in `localStorage` so it still works offline after the first load
- Clean, responsive UI (phone + Android TV friendly)
- Fully commented source

## Live site

After the first successful deploy the site will be available at:

`https://durgaa17.github.io/telco-probe-exp/`

(Enable **Settings → Pages → Source = GitHub Actions** if it is not already set.)

## How the probe works

Because the page is served over HTTPS, the browser cannot read real HTTP status codes from plain `http://` targets (mixed-content rules).  
The offline probe therefore uses:

```js
fetch(`http://${target}:80/favicon.ico`, { mode: 'no-cors' })
```

- Resolve → host answered → **REACHABLE**
- Reject / timeout → **NOT REACHABLE**

This is best-effort only. Many real open hosts will still show as unreachable due to browser security.

## Project structure

```
├── index.html          # page shell (easy to extend later)
├── css/style.css       # clean dark theme, responsive
├── js/app.js           # all logic, fully commented
├── .github/workflows/deploy.yml
└── README.md
```

## Local preview

Just open `index.html` in a browser, or serve the folder:

```bash
npx serve .
```

## Sample list source

https://raw.githubusercontent.com/Durgaa17/Raam-Public-Vless/refs/heads/main/scaniplist.txt
