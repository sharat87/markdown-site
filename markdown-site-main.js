const scripts = [
    'https://unpkg.com/marked/marked.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/9.12.0/highlight.min.js',
];

for (const script of scripts) {
    const el = document.createElement('script');
    el.src = script;
    document.head.appendChild(el);
}

document.body.insertAdjacentHTML('afterbegin', `
    <article id=main></article>
    <div id="finder" class="hide">
        <input type="search" placeholder="Type to filter&hellip;">
        <div class="listing"></div>
    </div>
    <div id="loadingBox">Loading&hellip;</div>

    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/9.12.0/styles/github.min.css">
`);

for (const script of document.querySelectorAll('script[src]')) {
    let src = script.getAttribute('src');
    if (src.endsWith('markdown-site-main.js')) {
        src = src.replace('markdown-site-main.js', 'master.css');
        const link = document.createElement('link');
        link.setAttribute('rel', 'stylesheet');
        link.setAttribute('href', src);
        document.head.insertAdjacentElement('beforeend', link);
        break;
    }
}

const ORIGINAL_TITLE = document.title;

const mainEl = document.getElementById('main');
const loadingEl = document.getElementById('loadingBox');

const mainInterval = setInterval(main, 200);

class Compiler {
    compile(raw) {
        if (!this.renderer)
            this.makeRenderer();
        return window.marked(raw, {
            smartypants: true,
            highlight: (code) => window.hljs.highlightAuto(code).value,
            renderer: this.renderer,
        });
    }

    makeRenderer() {
        this.renderer = new marked.Renderer();
        this.renderer.paragraph = Compiler.renderParagraph;
        this.renderer.listitem = Compiler.renderListItem;
    }

    static renderParagraph(html) {
        const para = document.createElement('p');
        para.innerHTML = html;

        for (const node of para.childNodes) {
            let content = node.textContent;
            if (node.nodeType !== Node.ELEMENT_NODE || node.tagName !== 'CODE')
                content = Compiler.symbolize(content);

            const match = content.match(/^{(.+?)}\s*/);

            if (match) {
                content = content.substr(match[0].length);
                const attrs = match[1].split(/\s+/);
                for (const attr of attrs) {
                    if (attr.startsWith('.'))
                        para.classList.add(attr.substr(1));
                    else if (attr.startsWith('#'))
                        para.setAttribute('id', attr.substr(1));
                }
            }

            node.textContent = content;
        }

        return para.outerHTML;
    }

    static renderListItem(html) {
        const li = document.createElement('li');

        const match = html.match(/^!+\s*/);
        if (match) {
            html = html.substr(match[0].length);
            li.classList.add('highlight-' + match[0].trim().length);
        }

        li.innerHTML = html;
        return li.outerHTML;
    }

    static symbolize(text) {
        return text.replace(/->/g, '\u2192').replace(/<-/g, '\u2190');
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

        this.el.addEventListener('click', (event) => {
            if (event.target.tagName === 'A')
                this.el.classList.add('hide');
        });
    }

    load(pagesUrl) {
        this.pagesUrl = pagesUrl;

        fetchText(this.pagesUrl).then((text) => {
            this.pages.splice(0, this.pages.length);
            for (let page of text.trim().split('\n'))
                this.pages.push(page.replace(/^\.\//, ''));
            this.pages.sort();
            this.applyFilter();
        });
    }

    onKeyDown(event) {
        if (event.target !== this.searchInput) {
            if (event.key === 'f') {
                event.preventDefault();
                this.el.classList.remove('hide');
                this.searchInput.focus();
                this.searchInput.value = '';
                this.applyFilter();
            }

            if (event.key === 'r') {
                onHashChange();
            }

            return;
        }

        if (event.key === 'Escape') {
            if (this.searchInput.value) {
                this.searchInput.value = '';
                this.applyFilter();
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
            const {score, hlMarkup} = checkMatch(page, needle);
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
}

const compiler = new Compiler();

function main() {
    if (!(window.marked && window.hljs))
        return;
    clearInterval(mainInterval);
    window.addEventListener('hashchange', onHashChange);
    onHashChange();
    new Finder(document.getElementById('finder')).load('pages.txt');
}

function onHashChange(event) {
    if (event)
        event.preventDefault();
    loadingEl.classList.remove('hide');
    let page = location.hash.substr(1);
    if (!page || page.endsWith('/'))
        page += 'index.md';

    let count = 1;
    render(page, mainEl, onDone);
    // TODO: Add sidebar and nav-bar.

    function onDone() {
        if (!--count)
            loadingEl.classList.add('hide');
    }
}

function render(url, el, cb) {
    fetchText(url).then((text) => {
        el.innerHTML = compiler.compile(text);

        if (el.firstElementChild.tagName === 'H1')
            document.title = el.firstElementChild.innerText + ' - ' + ORIGINAL_TITLE;
        else
            document.title = ORIGINAL_TITLE;

        for (const e of el.getElementsByTagName('a'))
            if (e.href.endsWith('.md'))
                e.setAttribute('href', '#' + e.getAttribute('href'));

        setTimeout(() => evalEmbedded(el));

        cb && cb();
    });
}

function evalEmbedded(parent) {
    for (const codeEl of parent.querySelectorAll('code.lang-javascript')) {
        const match = codeEl.innerText.split('\n')[0].match(/\/\/\s*@(.+)$/);
        if (!match)
            continue;
        const config = JSON.parse(match[1]);
        if (config.eval) {
            const fn = new Function(codeEl.innerText);
            fn.call(codeEl);
            codeEl.parentElement.classList.add('evaluated');
        }
    }
}

/**
 * A simple home made fuzzy matching algorithm implementation. Returns the match score. If it's 0, then there is no
 * match. Otherwise, the positive integer returned is a measure of how good the match is.
 * @param haystack {String} Search in this string.
 * @param needle {String} Search for this string.
 * @returns object with two properties, `score` and `hlMarkup` which is the highlighted haystack.
 */
function checkMatch(haystack, needle) {
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

            // TODO: Consider other word delimiters.
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

function fetchText(url) {
    return fetch(url, {cache: 'no-cache'}).then((response) => response.text());
}
