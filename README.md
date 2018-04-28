# Markdown Site

This is a simple viewer for markdown files in pretty view in the browser.

I keep my notes as markdown files organised into folders. It's convenient to be able to read them in the browser with
the markdown files compiled as HTML. But I didn't want to add a build step.

Here's how this works:

1. You have a folder with a bunch of markdown files (possibly with subfolders with markdown files as well).
2. Get the `index.html` from this project and drop it in your folder.
3. (Optional) Run `find * -type f -iname '*.md' > pages.txt` in the folder to enable file finder.
3. Start a file-serving HTTP server in this folder, for example, with `python3 -m http.server 8010`.
4. Open `localhost:8010` and view your markdown files in the browser.

If you did step 3, you can hit `f` to open a finder popup that supports fuzzy searching to quickly switch to a file.

The markdown to HTML compilation happens in the browser and navigation is done using hash-change events.

## License

MIT License.

## Thanks

This project uses the following libraries:

1. [Marked.js](https://marked.js.org).
2. [highlight.js](https://highlightjs.org).

## Contribute

Please open an issue to discuss any bug of feature suggestion you have. Thank you.
