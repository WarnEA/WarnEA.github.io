# Anthony Warnecke's website

A Quarto academic portfolio covering microbial genetics, plasmid biology and bacterial evolution.

Preview locally with `quarto preview`. Build the complete website with `quarto render`; the generated pages are in `_site/`.

Edit page content in the root `.qmd` files and shared navigation and metadata in `_quarto.yml`. The responsive light and dark themes are in `styles.css`, with blog styles in `writing.css`. The site uses system fonts and local assets, without external font or image dependencies.

Research details use native HTML disclosures. The CV includes a print button and print styles for saving a PDF through the browser.

The Writing section is in the navigation. Add dated `.qmd` files with a title, description and categories to `posts/`; the publication index updates automatically through `assets/writing-list.ejs`.

The homepage is a single introduction, with the navbar providing the main navigation. Its entrance animation runs once and respects reduced-motion preferences.

Bluesky, LinkedIn and ORCID profile links appear in the navbar, including on mobile.

Click the small plasmid icon in the footer, or type `plasmid` outside a text field, to discover Plasmid pong. Two bacterial paddles return a plasmid ball using mouse/touch, W/S or the arrow keys. First to three wins. The bacteria come together, connect through a pilus, and pass a resistance gene to turn the losing bacterium into a resistant zombie. The game includes a computer opponent, scores, pause and restart controls; its finite win animation respects reduced-motion preferences. Mobile rendering uses cached artwork, a capped pixel density and at most 60 frames per second. The interface is in `assets/site.js`; game and transfer logic are in `assets/pong-engine.js`, with tests in `assets/pong-engine.test.js`.

The game description and status use `COURT.winningScore` from `assets/pong-engine.js`. After editing game scripts, update `assetVersion` in `assets/site-extras.html` so visitors receive the new assets, and run `quarto render` to refresh the generated site. GitHub Pages builds and deploys automatically when changes are pushed to `main`.
