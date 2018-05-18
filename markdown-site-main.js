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
            } else {
                Compiler.symbolize(el);
                Compiler.applyPriority(el);
                Compiler.applyAttrs(el);
                Compiler.applyOrdinalIndicators(el);
            }
        }

        const frontMatter = converter.getMetadata();
        for (const codeEl of box.querySelectorAll('pre > code'))
            Compiler.highlightSyntax(codeEl, frontMatter);

        for (const el of box.querySelectorAll('h1, h2, h3, h4'))
            Compiler.addPermanentLinks(el);

        return {frontMatter, box};
    }

    static highlightSyntax(codeEl, frontMatter) {
        if (!Compiler.ignoredLangs) {
            Compiler.hljsMoreLangs = {};
            Compiler.ignoredLangs = new Set(['none', 'math', 'mermaid']);
        }

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
        let lang = match ? match[1] : null;

        if (!lang && frontMatter) {
            lang = frontMatter.defaultLang;
            codeEl.classList.add(lang, 'language-' + lang);
        }

        if (!lang || Compiler.ignoredLangs.has(lang))
            return;

        if (hljs.getLanguage(lang)) {
            codeEl.innerHTML = hljs.highlight(lang, codeEl.innerText).value;
        } else {
            if (!Compiler.hljsMoreLangs[lang])
                Compiler.hljsMoreLangs[lang] = script(
                    `https://cdnjs.cloudflare.com/ajax/libs/highlight.js/9.12.0/languages/${lang}.min.js`);
            Compiler.hljsMoreLangs[lang].then(() => {
                codeEl.innerHTML = hljs.highlight(lang, codeEl.innerText).value;
            });
        }
    }

    static addPermanentLinks(el) {
        const id = el.innerText.toLowerCase().replace(/[^\w]+/g, '-');
        el.setAttribute('id', id);
        const href = '#' + location.hash.split('#', 2)[1] + '#' + id;
        el.innerHTML = `<span class=headline>${el.innerHTML}</span>` +
            ` <a href="${href}" class=link title="Permalink to ${el.innerText}">&para;</a>`;
    }

    static applyOrdinalIndicators(el) {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {acceptNode});

        function acceptNode(node) {
            let parent = node;
            while ((parent = parent.parentElement) && parent !== el)
                if (parent.tagName === 'CODE')
                    return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
        }

        while (walker.nextNode()) {
            const node = walker.currentNode;
            const parent = node.parentElement;

            let text = node.textContent, hasMatch = false, match;
            while (match = text.match(/(\d+)(st|nd|rd|th)/i)) {
                hasMatch = true;
                parent.insertBefore(document.createTextNode(text.substr(0, match.index + match[1].length)), node);
                const indicator = document.createElement('sup');
                indicator.innerText = match[2];
                parent.insertBefore(indicator, node);
                text = text.substr(match.index + match[1].length + match[2].length);
            }

            if (hasMatch) {
                parent.insertBefore(document.createTextNode(text), node);
                node.remove();
            }
        }
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
        const repls = {
            '<->': '\u2194',
            '<-': '\u2190',
            '->': '\u2192',
            '<=': '\u21D0',
            '=>': '\u21D2',
            '---': '\u2014',
            '--': '\u2013',
        };
        for (const node of el.childNodes) {
            if (node.nodeType !== Node.ELEMENT_NODE || node.tagName !== 'CODE') {
                let text = node.textContent;
                for (const [key, value] of Object.entries(repls))
                    text = text.replace(new RegExp(key, 'g'), value);
                node.textContent = text;
            }
        }
    }
}

class Finder {
    constructor(title) {
        this.el = document.createElement('div');
        this.el.className = 'finder hide';
        this.el.innerHTML = (title ? `<h2>${title}</h2>` : '') + '<input type="search" placeholder="Type to filter&hellip;">' +
            ' <div class="listing"></div>';
        document.body.appendChild(this.el);

        this.dex = [];
        this.searchInput = this.el.querySelector('input');
        this.listing = this.el.querySelector('.listing');
        this._activeLink = this.prevNeedle = null;

        this.searchInput.addEventListener('keydown', this.onKeyDown.bind(this));

        // Detect the `X` button click in the search input.
        this.searchInput.addEventListener('click', (event) => {
            setTimeout(() => {
                if (this.searchInput.value === '')
                    this.applyFilter();
            });
        });

        this.el.addEventListener('click', (event) => {
            if (event.target.tagName === 'A')
                this.hide();
        });
    }

    load(pagesUrl) {
        this.pagesUrl = pagesUrl;

        fetch(this.pagesUrl)
            .then((response) => response.ok ? response.text() : Promise.reject(response))
            .then((text) => {
                this.dex.splice(0, this.dex.length);
                for (let page of text.trim().split('\n')) {
                    const hash = page.replace(/^\.\//, '');
                    this.dex.push({hash, text: hash});
                }
                this.dex.sort((a, b) => a.text < b.text ? -1 : (a.text > b.text ? 1 : 0));
                this.applyFilter();
            })
            .catch((response) => {
                console.warn('Could not load dex from `' + pagesUrl + '`.', response);
            });
    }

    show() {
        this.el.classList.remove('hide');
        this.searchInput.focus();
        this.searchInput.value = '';
        this.applyFilter();
    }

    hide() {
        this.el.classList.add('hide');
    }

    get activeLink() {
        return this._activeLink;
    }

    set activeLink(link) {
        if (this._activeLink)
            this._activeLink.classList.remove('active');

        this._activeLink = link;

        if (this._activeLink) {
            this._activeLink.classList.add('active');
            const maxScrollTop = this._activeLink.offsetTop,
                minScrollTop = this._activeLink.offsetTop + this._activeLink.clientHeight - this.el.clientHeight;
            this.el.scrollTop = Math.min(maxScrollTop, Math.max(minScrollTop, this.el.scrollTop));
        }
    }

    onKeyDown(event) {
        if (event.key === 'Escape') {
            if (this.searchInput.value) {
                this.searchInput.value = '';
                this.applyFilter();
                this.searchInput.focus();
            } else {
                this.hide();
            }

        } else if (event.key === 'Enter') {
            this._activeLink.click();

        } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            const direction = event.key === 'ArrowUp' ? 'previous' : 'next',
                siblingProp = direction + 'ElementSibling',
                sibling = this._activeLink[siblingProp];
            if (sibling)
                this.activeLink = sibling;
            else if (event.key === 'ArrowUp')
                this.el.scrollTop = 0;

        } else {
            setTimeout(() => this.applyFilter());

        }
    }

    applyFilter() {
        const needle = this.searchInput.value.toLowerCase();
        if (needle === this.prevNeedle)
            return;

        this.listing.innerHTML = '<em>Searching&hellip;</em>';
        this.activeLink = null;

        const matches = [];

        for (const {text, hash} of this.dex) {
            const {score, hlMarkup} = Finder.checkMatch(text, needle);
            if (score)
                matches.push({score, hash, hlMarkup});
        }
        matches.sort((a, b) => b.score - a.score);

        const markup = [];
        for (const {hash, hlMarkup} of matches)
            markup.push('<a href="#', hash, '">', hlMarkup, '</a>\n');
        this.listing.innerHTML = markup.join('');

        this.activeLink = this.listing.firstElementChild;

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

        const haystackLower = haystack.toLowerCase();
        let i = 0, j = 0;
        const needleLen = needle.length;
        const haystackLen = haystackLower.length;
        let jLastMatched = 0, score = 0;

        const matchedHaystack = [];
        let inMatch = false;
        const HL_OPEN = '<span class=hl>', HL_CLOSE = '</span>';

        while (i < needleLen && j < haystackLen) {
            const nc = needle[i];
            const hc = haystackLower[j];

            if (nc === hc) {
                score += 10;

                if (jLastMatched === j - 1)
                    score += 40;
                //score = score - (4 * (i - jLastMatched - 1)) // See graph of `y=4(x-1)`.

                if (j === 0 || haystackLower[j - 1] === ' ') {
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

            matchedHaystack.push(haystack[j]);
            ++j;
        }

        if (i < needleLen)
            return {score: 0, hlMarkup: haystackLower};

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
        const {frontMatter, box} = Compiler.compile(text);
        for (const child of el.childNodes)
            el.removeChild(child);
        for (const child of box.childNodes)
            el.appendChild(child);
        el.insertAdjacentHTML('beforeend', '<div class=page-end><span>&#10087;</span></div>');

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
            const preEl = codeEl.parentElement;
            preEl.insertAdjacentHTML('beforebegin', '<div class=pre-code-box> <button type=button>Copy</button> </div>');
            preEl.previousElementSibling.insertAdjacentElement('afterbegin', preEl);
            preEl.nextElementSibling.addEventListener('click', () => navigator.clipboard.writeText(codeEl.innerText.trim()));
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
        for (const codeEl of parent.querySelectorAll('code.language-javascript')) {
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
        const box = this.preEl.closest('.pre-code-box') || this.preEl;
        box.insertAdjacentElement('afterend', p);
        box.style.display = 'none';
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
                App.outlineFinder.dex.splice(0, App.outlineFinder.dex.length);
                for (const header of mainEl.querySelectorAll('h1, h2, h3, h4')) {
                    App.outlineFinder.dex.push({
                        text: header.querySelector('span').innerText,
                        hash: header.querySelector('a').getAttribute('href').substr(1),
                    });
                }
                App.outlineFinder.dex.sort((a, b) => a.text < b.text ? -1 : (a.text > b.text ? 1 : 0));
                App.outlineFinder.applyFilter();
            })
            .finally(LoadingOSD.hide.bind(LoadingOSD));
    }

    static onKeyDown(event) {
        if (!event.ctrlKey && !event.altKey && !event.metaKey && !event.target.matches(UI_SELECTOR)) {

            if (event.key === 'Escape') {
                App.pageFinder.hide();
                App.outlineFinder.hide();
                document.getElementById('helpBox').classList.add('hide');

            } else if (event.key === 'f') {
                event.preventDefault();
                App.pageFinder.show();

            } else if (event.key === 's') {
                event.preventDefault();
                App.outlineFinder.show();

            } else if (event.key === 'r') {
                // FIXME: Think of a better API to reload the page.
                mainEl.dataset.page = '';
                App.onHashChange();

            } else if (event.key === '?') {
                document.getElementById('helpBox').classList.remove('hide');

            }
        }
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
        App.pageFinder = new Finder('Find page');
        App.pageFinder.load('pages.txt');

        App.outlineFinder = new Finder('Go to header');

        document.body.addEventListener('keydown', App.onKeyDown);
        window.addEventListener('hashchange', App.onHashChange);
        App.onHashChange();

        setInterval(App.updateTimeDisplays, 60000);
        App.updateTimeDisplays();
    }
}

function boot() {
    // Add MathJax config to the page.
    const el = document.createElement('script');
    el.type = 'text/x-mathjax-config';
    el.text = 'MathJax.Hub.Config(' + JSON.stringify(MATH_JAX_CONFIG) + ')';
    document.head.appendChild(el);

    // Load library scripts needed.
    const scriptsPromise = Promise.all([
        script('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/9.12.0/highlight.min.js'),
        script('https://unpkg.com/marked/marked.min.js'),
        script('https://unpkg.com/showdown/dist/showdown.min.js'),
        script('https://cdnjs.cloudflare.com/ajax/libs/mathjax/2.7.4/MathJax.js'),
        script('https://unpkg.com/mermaid/dist/mermaid.min.js'),
    ]);

    document.body.insertAdjacentHTML('afterbegin', `
        <article id=main></article>
        <div id="helpBox" class="hide overlay">
            <h2>Hotkeys</h2>
            <table>
                <tr> <th>f</th> <td>Open page finder.</td> </tr>
                <tr> <th>s</th> <td>Open header finder.</td> </tr>
                <tr> <th>r</th> <td>Reload current page.</td> </tr>
                <tr> <th>ESC</th> <td>Close any finder or overlay.</td> </tr>
            </table>
            <p><em>Hit Escape to close.</em></p>
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

    window.mainEl = document.getElementById('main');

    scriptsPromise.then(App.main);
}

function script(url) {
    const el = document.createElement('script');
    el.setAttribute('async', 'async');
    el.src = url;
    document.head.appendChild(el);
    return new Promise((resolve/*, reject*/) => {
        el.onload = resolve;
    });
}
