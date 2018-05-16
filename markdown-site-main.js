const ORIGINAL_TITLE = document.title;

const MATH_JAX_CONFIG = {
    tex2jax: {
        inlineMath: [['${', '}']],
        displayMath: [['\\[', '\\]'], ['[[[[[', ']]]]]']],
    },
    jax: ['input/TeX', 'output/CommonHTML'],
    extensions: ['tex2jax.js', 'MathMenu.js', 'MathZoom.js', 'AssistiveMML.js', 'a11y/accessibility-menu.js'],
    TeX: {extensions: ['AMSmath.js', 'AMSsymbols.js', 'noErrors.js', 'noUndefined.js']},
    displayAlign: 'left',
    displayIndent: '2em',
};

const UI_SELECTOR = 'input, select, button, textarea, [contenteditable]';

// Add MathJax config to the page.
const el = document.createElement('script');
el.type = 'text/x-mathjax-config';
el.text = 'MathJax.Hub.Config(' + JSON.stringify(MATH_JAX_CONFIG) + ')';
document.head.appendChild(el);

// Load library scripts needed.
const scriptPromises = [];
script('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/9.12.0/languages/excel.min.js',
    script('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/9.12.0/highlight.min.js'));
script('https://unpkg.com/marked/marked.min.js');
script('https://unpkg.com/showdown/dist/showdown.min.js');
script('https://cdnjs.cloudflare.com/ajax/libs/mathjax/2.7.4/MathJax.js');
script('https://unpkg.com/mermaid/dist/mermaid.min.js');

class Compiler {
    static compile(raw) {
        const converter = new showdown.Converter({
            metadata: true,
            tables: true,
            underline: true,
            emoji: true,
            tasklists: true,
            strikethrough: true,
            simplifiedAutoLink: true,
            excludeTrailingPunctuationFromURLs: true,
            requireSpaceBeforeHeadingText: true,
        });

        const html = converter.makeHtml(raw);

        const box = document.createElement('div');
        box.innerHTML = html;
        for (const el of box.querySelectorAll('p, td, li')) {
            if (el.tagName === 'P' && el.textContent === '[TOC]') {
                const toc = document.createElement('ol');
                toc.classList.add('toc');
                el.parentElement.replaceChild(toc, el);
            }
            Compiler.symbolize(el);
            Compiler.applyPriority(el);
            Compiler.applyAttrs(el);
        }

        const frontMatter = converter.getMetadata();
        for (const codeEl of box.querySelectorAll('pre > code'))
            Compiler.highlightSyntax(codeEl, frontMatter);

        for (const el of box.querySelectorAll('h1, h2, h3, h4'))
            Compiler.addPermanentLinks(el);

        return {frontMatter, html: box.innerHTML};
    }

    static highlightSyntax(codeEl, frontMatter) {
        if (codeEl.classList.contains('language-math')) {
            const repl = document.createElement('div');
            repl.textContent = '[[[[[\n' + codeEl.textContent + '\n]]]]]';
            const preEl = codeEl.parentElement;
            preEl.parentElement.replaceChild(repl, preEl);
        }

        if (codeEl.classList.contains('language-mermaid')) {
            const repl = document.createElement('div');
            repl.classList.add('mermaid');
            repl.textContent = codeEl.textContent;
            const preEl = codeEl.parentElement;
            preEl.parentElement.replaceChild(repl, preEl);
        }

        const match = codeEl.className.match(/\blanguage-(\w+)/);
        if (!match)
            return;

        let lang = match[1];

        if (!lang && frontMatter)
            lang = frontMatter.defaultLang;

        if (lang && window.hljs.getLanguage(lang))
            codeEl.innerHTML = window.hljs.highlight(lang, codeEl.innerText).value;
    }

    static addPermanentLinks(el) {
        const id = el.innerText.toLowerCase().replace(/[^\w]+/g, '-');
        el.setAttribute('id', id);
        const href = '#' + location.hash.split('#', 2)[1] + '#' + id;
        el.innerHTML = '<span class=headline>' + el.innerHTML + '</span> <a href="' + href +
            '" class=link title="Permalink to ' + el.innerText + '">&para;</a>';
    }

    static applyOrdinalIndicators(el) {
        /* Not working because the changes are being messed with by the other markup changes we're doing.
        for (const node of el.childNodes) {
            if (node.nodeType === Node.TEXT_NODE) {
                const html = node.textContent.replace(/(\d+)(st|nd|rd|th)/ig, '$1<sup>$2</sup>');
                const dummy = el.cloneNode();
                dummy.innerHTML = html;
                const children = Array.from(dummy.childNodes);
                for (const child of children)
                    el.insertBefore(child, node);
                node.remove();
            }
        }
        //*/
    }

    static applyAttrs(el) {
        const child = el.firstChild;
        if (!child || child.nodeType !== Node.TEXT_NODE)
            return;

        const match = child.textContent.match(/^{([-.#\w]+?)}\s*/);
        if (match) {
            child.textContent = child.textContent.substr(match[0].length);
            for (const attr of match[1].match(/[.#][-\w]+/g)) {
                if (attr.startsWith('.'))
                    el.classList.add(attr.substr(1));
                else if (attr.startsWith('#'))
                    el.setAttribute('id', attr.substr(1));
            }
        }
    }

    static applyPriority(el) {
        const child = el.firstChild;
        if (!child || child.nodeType !== Node.TEXT_NODE)
            return;

        const match = child.textContent.match(/^!+\s*/);
        if (match) {
            child.textContent = child.textContent.substr(match[0].length);
            el.classList.add('highlight-' + match[0].trim().length);
        }
    }

    static symbolize(el) {
        for (const node of el.childNodes) {
            if (node.nodeType !== Node.ELEMENT_NODE || node.tagName !== 'CODE') {
                node.textContent = node.textContent.replace(/->/g, '\u2192').replace(/<-/g, '\u2190');
            }
        }
    }
}

class Finder {
    constructor(el) {
        this.el = el;

        this.pages = [];
        this.searchInput = this.el.querySelector('input');
        this.listing = this.el.querySelector('.listing');
        this.activeLink = this.prevNeedle = null;

        document.body.addEventListener('keydown', this.onKeyDown.bind(this));

        // Detect the `X` button click in the search input.
        this.searchInput.addEventListener('click', (event) => {
            setTimeout(() => {
                if (this.searchInput.value === '')
                    this.applyFilter();
            });
        });

        this.el.addEventListener('click', (event) => {
            if (event.target.tagName === 'A')
                this.el.classList.add('hide');
        });
    }

    load(pagesUrl) {
        this.pagesUrl = pagesUrl;

        fetch(this.pagesUrl)
            .then((response) => response.ok ? response.text() : Promise.reject(response))
            .then((text) => {
                this.pages.splice(0, this.pages.length);
                for (let page of text.trim().split('\n'))
                    this.pages.push(page.replace(/^\.\//, ''));
                this.pages.sort();
                this.applyFilter();
            })
            .catch((response) => {
                console.warn('Could not load pages from `' + pagesUrl + '`.', response);
            });
    }

    onKeyDown(event) {
        if (event.target !== this.searchInput) {
            if (!event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey &&
                !event.target.matches(UI_SELECTOR)) {
                if (event.key === 'f') {
                    event.preventDefault();
                    this.el.classList.remove('hide');
                    this.searchInput.focus();
                    this.searchInput.value = '';
                    this.applyFilter();
                }

                if (event.key === 'r') {
                    // FIXME: Think of a better API to reload the page.
                    mainEl.dataset.page = '';
                    App.onHashChange();
                }
            }

            return;
        }

        if (event.key === 'Escape') {
            if (this.searchInput.value) {
                this.searchInput.value = '';
                this.applyFilter();
                this.searchInput.focus();
            } else {
                this.el.classList.add('hide');
            }

        } else if (event.key === 'Enter') {
            this.activeLink.click();
            this.el.classList.add('hide');

        } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            const direction = event.key === 'ArrowUp' ? 'previous' : 'next',
                siblingProp = direction + 'ElementSibling';
            if (this.activeLink[siblingProp]) {
                this.activeLink.classList.remove('active');
                this.activeLink = this.activeLink[siblingProp];
                this.activeLink.classList.add('active');
            }

        } else {
            setTimeout(() => this.applyFilter());

        }
    }

    applyFilter() {
        const needle = this.searchInput.value.toLowerCase();
        if (needle === this.prevNeedle)
            return;

        this.listing.innerHTML = '<em>Searching&hellip;</em>';
        const links = this.listing.querySelectorAll('a');
        if (this.activeLink)
            this.activeLink.classList.remove('active');
        this.activeLink = null;

        const matches = [];

        for (let page of this.pages) {
            const {score, hlMarkup} = Finder.checkMatch(page, needle);
            if (score)
                matches.push({score, page, hlMarkup});
        }
        matches.sort((a, b) => b.score - a.score);

        const markup = [];
        for (const {page, hlMarkup} of matches)
            markup.push('<a href="#', page, '">', hlMarkup, '</a>\n');
        this.listing.innerHTML = markup.join('');

        this.activeLink = this.listing.firstElementChild;
        if (this.activeLink)
            this.activeLink.classList.add('active');

        this.prevNeedle = needle;
    }

    /**
     * A simple home made fuzzy matching algorithm implementation. Returns the match score. If it's 0, then there is no
     * match. Otherwise, the positive integer returned is a measure of how good the match is.
     * @param haystack {String} Search in this string.
     * @param needle {String} Search for this string.
     * @returns object with two properties, `score` and `hlMarkup` which is the highlighted haystack.
     */
    static checkMatch(haystack, needle) {
        if (needle === '')
            return {score: 1, hlMarkup: haystack};

        haystack = haystack.toLowerCase();
        let i = 0, j = 0;
        const needleLen = needle.length;
        const haystackLen = haystack.length;
        let jLastMatched = 0, score = 0;

        const matchedHaystack = [];
        let inMatch = false;
        const HL_OPEN = '<span class=hl>', HL_CLOSE = '</span>';

        while (i < needleLen && j < haystackLen) {
            const nc = needle[i];
            const hc = haystack[j];

            if (nc === hc) {
                score += 10;

                if (jLastMatched === j - 1)
                    score += 40;
                //score = score - (4 * (i - jLastMatched - 1)) // See graph of `y=4(x-1)`.

                if (j === 0 || haystack[j - 1] === ' ') {
                    score += 10;
                    if (i === 0)
                        score += 25;
                    if (j === 0)
                        score += 25;
                }

                if (!inMatch) {
                    matchedHaystack.push(HL_OPEN);
                    inMatch = true;
                }

                ++i;
                jLastMatched = j;

            } else if (inMatch) {
                matchedHaystack.push(HL_CLOSE);
                inMatch = false;

            }

            matchedHaystack.push(hc);
            ++j;
        }

        if (i < needleLen)
            return {score: 0, hlMarkup: haystack};

        // All else being same, smaller haystacks should score more.
        score += Math.ceil(20 * needleLen / haystackLen);

        if (inMatch)
            matchedHaystack.push(HL_CLOSE);
        matchedHaystack.push(haystack.substr(j));

        return {score: score, hlMarkup: matchedHaystack.join('')};
    }
}

class Loader {
    static load(url, el) {
        return fetch(url, {cache: 'no-cache'})
            .then((response) => Loader.onResponse(el, response))
            .then(Loader.showPage)//.catch(Loader.onError);
    }

    static onResponse(el, response) {
        if (response.ok) {
            return Promise.all([
                Promise.resolve(el),
                response.text(),
                Promise.resolve(response.headers),
            ]);
        } else {
            return Promise.reject([el, response]);
        }
    }

    static onError([el, response]) {
        console.error('Error fetching document.', response);
        const tplEl = document.getElementById('status' + response.status);
        if (tplEl) {
            el.innerHTML = '';
            el.appendChild(tplEl.content);
        } else {
            el.innerHTML = '<h1 style="color:red">Error Loading Document<br>' + response.status + ': ' +
                response.statusText + '</h1>';
        }
        return Promise.reject();
    }

    static showPage([el, text, headers]) {
        const {frontMatter, html} = Compiler.compile(text);
        el.innerHTML = html + '<div class=page-end><span>&#10087;</span></div>';
        const hasTitleH1 = el.firstElementChild.tagName === 'H1';

        document.title = (hasTitleH1 ? el.firstElementChild.innerText + ' - ' : '') + ORIGINAL_TITLE;
        const pageDesc = [];

        const authorEl = document.querySelector('meta[name="author"]');
        if (authorEl)
            pageDesc.push('Written by ' + authorEl.content + '.');

        if (headers.has('last-modified')) {
            const lastModified = new Date(headers.get('last-modified'));
            pageDesc.push('Last modified <time datetime="' + lastModified.toISOString() + '">' + lastModified +
                '</time>.');
        }

        el.firstElementChild.insertAdjacentHTML(
            hasTitleH1 ? 'afterend' : 'beforebegin',
            '<p class=page-desc>' + pageDesc.join(' ') + '</p>');

        for (const e of el.getElementsByTagName('a'))
            if (e.href.endsWith('.md'))
                e.setAttribute('href', location.hash.match(/^#(.*\/)?/)[0] + e.getAttribute('href'));

        for (const codeEl of el.querySelectorAll('pre > code')) {
            codeEl.insertAdjacentHTML('beforebegin', '<button class=copy-btn type=button>Copy</button>');
            codeEl.previousElementSibling.addEventListener('click', (event) => {
                navigator.clipboard.writeText(codeEl.innerText);
            });
        }

        for (const tableEl of el.getElementsByTagName('table'))
            new FancyTable(tableEl).apply();

        // Table of Contents.
        const tocEl = el.querySelector('ol.toc');
        if (tocEl) {
            tocEl.innerHTML = 'Loading table of contents&hellip;';
            const markup = [];
            const pagePrefix = location.hash.substr(1).split('#', 1)[0] + '#';
            let headers, minLevel;

            if (el.querySelectorAll('h1').length === 1 && el.firstElementChild.tagName === 'H1') {
                minLevel = 2;
                headers = el.querySelectorAll('h2, h3');
            } else {
                minLevel = 1;
                headers = el.querySelectorAll('h1, h2, h3');
            }

            let lastLevel = 0;
            for (const head of headers) {
                const level = parseInt(head.tagName.substr(1));
                if (level > minLevel && level > lastLevel)
                    markup.push('<ol>');
                if (level < lastLevel)
                    markup.push('</ol>');
                markup.push('<li><a href="' + head.lastElementChild.getAttribute('href') + '">' +
                    head.firstElementChild.innerHTML + '</a>');
                lastLevel = level;
            }

            tocEl.innerHTML = markup.join('\n');
        }

        const autoFocusEl = el.querySelector('[autofocus]');
        if (autoFocusEl)
            autoFocusEl.focus();

        return new Promise((resolve, reject) => {
            Loader.evalEmbedded(el, frontMatter);
            App.updateTimeDisplays();
            MathJax.Hub.Queue(['Typeset', MathJax.Hub]);
            mermaid.init();
            resolve();
        });
    }

    static evalEmbedded(parent, frontMatter) {
        for (const codeEl of parent.querySelectorAll('code.lang-javascript')) {
            const match = codeEl.innerText.split('\n')[0].match(/\/\/\s*@(.+)$/);
            if (!match)
                continue;
            const config = JSON.parse(match[1]);
            if (config.eval) {
                const fn = new Function(codeEl.innerText);
                fn.call({
                    preEl: codeEl.parentElement,
                    codeEl,
                    frontMatter,
                    hide: this.contextHide,
                    articleEl: mainEl,
                    config,
                });
                codeEl.parentElement.classList.add('evaluated');
            }
        }
    }

    static contextHide(opts) {
        opts = opts || {};
        const p = document.createElement('p');
        p.innerHTML = '<button>' + (opts.text || 'Show Code') + '</button>';
        p.firstElementChild.addEventListener('click', () => {
            p.remove();
            this.preEl.style.display = '';
        });
        this.preEl.insertAdjacentElement('afterend', p);
        this.preEl.style.display = 'none';
    }
}

class LoadingOSD {
    static getBox() {
        if (!this._box) {
            document.body.insertAdjacentHTML('beforeend', '<div class=loading-box>Loading&hellip;</div>');
            this._box = document.body.lastElementChild;
        }
        return this._box;
    }

    static show() {
        this.getBox().classList.remove('hide');
    }

    static hide() {
        this.getBox().classList.add('hide');
    }
}

class FancyTable {
    constructor(tableEl) {
        this.tableEl = tableEl;
        this.rows = Array.from(this.tableEl.tBodies[0].getElementsByTagName('tr'));
        this.sorts = [];
        this.boundRowCompareFn = this.rowCompareFn.bind(this);
    }

    apply() {
        this.tableEl.classList.add('fancy');
        this.tableEl.addEventListener('click', this.onClick.bind(this));
    }

    onClick(event) {
        if (event.target.tagName === 'A')
            return;

        const th = event.target.closest('th, td');
        if (th.tagName !== 'TH')
            return;

        const index = Array.from(th.parentElement.children).indexOf(th);
        let isFound = false, i = 0, removeAt = null;

        for (const sorting of this.sorts) {
            if (sorting.index === index) {
                if (sorting.isAsc)
                    sorting.isAsc = false;
                else
                    removeAt = i;
                isFound = true;
                break;
            }
            i++;
        }

        if (!isFound)
            this.sorts.push({index, isAsc: true});
        if (removeAt !== null)
            this.sorts.splice(removeAt, 1);

        this.orderRows();
        this.updateMarkers();
    }

    orderRows() {
        const sortedRows = this.rows.slice().sort(this.boundRowCompareFn);
        const tBody = this.tableEl.tBodies[0];
        for (const tr of sortedRows)
            tBody.appendChild(tr);
    }

    rowCompareFn(tr1, tr2) {
        for (const {index, isAsc} of this.sorts) {
            const td1 = tr1.children[index], td2 = tr2.children[index];
            if (td1.textContent < td2.textContent)
                return isAsc ? -1 : 1;
            if (td1.textContent > td2.textContent)
                return isAsc ? 1 : -1;
        }
        return 0;
    }

    updateMarkers() {
        for (const marker of this.tableEl.querySelectorAll('.sort-marker'))
            marker.remove();

        const ths = this.tableEl.tHead.getElementsByTagName('th');
        let i = 1;
        for (const sorting of this.sorts) {
            const th = ths[sorting.index];
            th.insertAdjacentHTML(
                'beforeend',
                '\n<span class=sort-marker>' +
                '<span class=marker>' + (sorting.isAsc ? '▲' : '▼') + '</span>' +
                '<span class=num>' + i + '</span></span>');
            ++i;
        }
    }
}

class App {
    static onHashChange(event) {
        if (event)
            event.preventDefault();
        LoadingOSD.show();

        let page = location.hash.substr(1), jump = null;
        if (page.indexOf('#') >= 0)
            [page, jump] = page.split('#', 2);
        if (!page || page.endsWith('/'))
            page += 'index.md';

        if (page === mainEl.dataset.page) {
            (jump ? mainEl.querySelector('#' + jump) : mainEl.firstElementChild).scrollIntoView();
            LoadingOSD.hide();
            return;
        }

        mainEl.dataset.page = '';

        Loader.load(page, mainEl)
            .then(() => {
                if (jump)
                    mainEl.querySelector('#' + jump).scrollIntoView();
                mainEl.dataset.page = page;
            })
            .finally(LoadingOSD.hide.bind(LoadingOSD));
    }

    static updateTimeDisplays() {
        for (const timeEl of document.querySelectorAll('time[datetime]')) {
            const time = new Date(timeEl.dateTime);
            timeEl.innerText = App.timeInWords(time) + ' ago';
            timeEl.title = time.toString();
        }
    }

    static timeInWords(time) {
        // Source: https://stackoverflow.com/a/3177838/151048
        const seconds = Math.floor((new Date() - time) / 1000);

        let interval = Math.floor(seconds / 31536000);
        if (interval > 1)
            return interval + ' years';

        interval = Math.floor(seconds / 2592000);
        if (interval > 1)
            return interval + ' months';

        interval = Math.floor(seconds / 86400);
        if (interval > 1)
            return interval + ' days';

        interval = Math.floor(seconds / 3600);
        if (interval > 1)
            return interval + ' hours';

        interval = Math.floor(seconds / 60);
        if (interval > 1)
            return interval + ' minutes';

        return Math.floor(seconds) + ' seconds';
    }

    static main() {
        window.addEventListener('hashchange', App.onHashChange);
        App.onHashChange();

        setInterval(App.updateTimeDisplays, 60000);
        App.updateTimeDisplays();

        new Finder(document.getElementById('finder')).load('pages.txt');
    }
}

document.body.insertAdjacentHTML('afterbegin', `
    <article id=main></article>
    <div id="finder" class="hide">
        <input type="search" placeholder="Type to filter&hellip;">
        <div class="listing"></div>
    </div>

    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/9.12.0/styles/github.min.css">
`);

for (const script of document.querySelectorAll('script[src]')) {
    const src = script.getAttribute('src');
    if (src.endsWith('markdown-site-main.js')) {
        const link = document.createElement('link');
        link.setAttribute('rel', 'stylesheet');
        link.setAttribute('href', src.replace('markdown-site-main.js', 'master.css'));
        document.head.appendChild(link);
        break;
    }
}

const mainEl = document.getElementById('main');

Promise.all(scriptPromises).then(App.main);

function script(url, after) {
    const el = document.createElement('script');
    el.setAttribute('async', 'async');
    el.src = url;

    if (after)
        after.then(() => document.head.appendChild(el));
    else
        document.head.appendChild(el);

    const promise = new Promise((resolve, reject) => {
        el.onload = () => resolve();
    });

    scriptPromises.push(promise);
    return promise;
}
