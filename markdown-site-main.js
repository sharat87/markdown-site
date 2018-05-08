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
script('https://cdnjs.cloudflare.com/ajax/libs/mathjax/2.7.4/MathJax.js');
script('https://unpkg.com/mermaid/dist/mermaid.min.js');

class Compiler {
    static compile(raw) {
        let frontMatter = null;
        if (raw.startsWith('{\n')) {
            const endIndex = raw.indexOf('\n}\n');
            frontMatter = JSON.parse(raw.substr(0, endIndex + 2));
            raw = raw.substr(endIndex + 3);
        }

        return {
            frontMatter,
            html: window.marked(raw, {
                smartypants: true,
                renderer: Compiler.makeRenderer(frontMatter),
            }),
        };
    }

    static makeRenderer(frontMatter) {
        const renderer = new marked.Renderer();
        renderer.code = (text, lang) => Compiler.renderCode.call(renderer, text, lang, frontMatter);
        renderer.paragraph = Compiler.renderParagraph;
        renderer.listitem = Compiler.renderListItem;
        return renderer;
    }

    static renderCode(text, lang, frontMatter) {
        if (!lang && text.startsWith(':::')) {
            text = text.substr(3);
            const index = text.indexOf('\n');
            lang = text.substr(0, index);
            text = text.substr(index + 1);

        } else if (!lang) {
            lang = frontMatter.defaultLang;

        }

        if (lang === 'math')
            return '<p>[[[[[' + text + ']]]]]</p>';

        if (lang === 'mermaid')
            return '<div class=mermaid>' + text + '</div>';

        const pre = document.createElement('pre');
        pre.innerHTML = '<code></code>';
        if (lang && window.hljs.listLanguages().indexOf(lang) >= 0) {
            pre.firstElementChild.classList.add(this.options.langPrefix + lang);
            pre.firstElementChild.innerHTML = window.hljs.highlight(lang, text).value;
        } else {
            pre.firstElementChild.innerText = text;
        }
        return pre.outerHTML;
    }

    static renderParagraph(html) {
        const para = document.createElement('p');
        para.innerHTML = html.replace(/^note\b/i, '<span class=note>$&</span>');

        for (const node of para.childNodes) {
            let content = node.textContent;
            if (node.nodeType !== Node.ELEMENT_NODE || node.tagName !== 'CODE')
                content = Compiler.symbolize(content);

            const match = content.match(/^{([-.a-z]+?)}\s*/);

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

        Compiler.applyPriority(para);
        return para.outerHTML;
    }

    static renderListItem(html) {
        const li = document.createElement('li');
        li.innerHTML = html;
        Compiler.applyPriority(li);
        return li.outerHTML;
    }

    static applyPriority(el) {
        const match = el.innerHTML.match(/^!+\s*/);
        if (match) {
            el.innerHTML = el.innerHTML.substr(match[0].length);
            el.classList.add('highlight-' + match[0].trim().length);
        }
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
            if (!event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey) {
                if (event.key === 'f') {
                    event.preventDefault();
                    this.el.classList.remove('hide');
                    this.searchInput.focus();
                    this.searchInput.value = '';
                    this.applyFilter();
                }

                if (event.key === 'r') {
                    App.onHashChange();
                }
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

class Loader {
    static load(url, el) {
        return fetch(url, {cache: 'no-cache'})
            .then(this.onResponse)
            .then(([text, headers]) => this.showPage(el, text, headers))
            .catch((response) => this.onError(el, response));
    }

    static onResponse(response) {
        if (response.ok) {
            return Promise.all([
                response.text(),
                Promise.resolve(response.headers),
            ]);
        } else {
            return Promise.reject(response);
        }
    }

    static onError(el, response) {
        console.error('Error fetching document.', response);
        el.innerHTML = '<h1 style="color:red">Error Loading Document<br>' + response.status + ': ' +
            response.statusText + '</h1>';
        return Promise.reject();
    }

    static showPage(el, text, headers) {
        const {frontMatter, html} = Compiler.compile(text);
        el.innerHTML = html + '<div class="page-end"><span>&#10087;</span></div>';
        const hasTitleH1 = el.firstElementChild.tagName === 'H1';

        document.title = (hasTitleH1 ? el.firstElementChild.innerText + ' - ' : '') + ORIGINAL_TITLE;

        const lastModified = new Date(headers.get('last-modified'));
        el.firstElementChild.insertAdjacentHTML(
            hasTitleH1 ? 'afterend' : 'beforebegin',
            '<p class="last-mod-msg">Last modified <time datetime="' + lastModified.toISOString() + '">' +
                lastModified + '</time>.</p>');

        const authorEl = document.querySelector('meta[name="author"]');
        if (authorEl)
            el.firstElementChild.insertAdjacentHTML(
                hasTitleH1 ? 'afterend' : 'beforebegin',
                '<p class="author-msg">Written by ' + authorEl.content + '.</p>');

        for (const e of el.getElementsByTagName('a'))
            if (e.href.endsWith('.md'))
                e.setAttribute('href', '#' + e.getAttribute('href'));

        setTimeout(() => {
            this.evalEmbedded(el, frontMatter);
            App.updateTimeDisplays();
            MathJax.Hub.Queue(['Typeset', MathJax.Hub]);
            mermaid.init();
        });

        return Promise.resolve();
    }

    static evalEmbedded(parent, frontMatter) {
        for (const codeEl of parent.querySelectorAll('code.lang-javascript')) {
            const match = codeEl.innerText.split('\n')[0].match(/\/\/\s*@(.+)$/);
            if (!match)
                continue;
            const config = JSON.parse(match[1]);
            if (config.eval) {
                const fn = new Function(codeEl.innerText);
                fn.call({preEl: codeEl.parentElement, codeEl, frontMatter, hide: this.contextHide});
                codeEl.parentElement.classList.add('evaluated');
            }
        }
    }

    static contextHide() {
        const showBtn = document.createElement('button');
        showBtn.innerText = 'Show Code';
        showBtn.addEventListener('click', () => {
            showBtn.remove();
            this.preEl.style.display = '';
        });
        this.preEl.insertAdjacentElement('afterend', showBtn);
        this.preEl.style.display = 'none';
    }
}

class App {
    static onHashChange(event) {
        if (event)
            event.preventDefault();
        loadingEl.classList.remove('hide');
        let page = location.hash.substr(1);
        if (!page || page.endsWith('/'))
            page += 'index.md';

        Promise.all([
            Loader.load(page, mainEl),
        ]).finally(() => loadingEl.classList.add('hide'));
    }

    static updateTimeDisplays() {
        for (const timeEl of document.querySelectorAll('time[datetime]'))
            timeEl.innerText = App.timeInWords(new Date(timeEl.dateTime)) + ' ago';
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

        setInterval(App.updateTimeDisplays, 1000);
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
    <div id="loadingBox">Loading&hellip;</div>

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
const loadingEl = document.getElementById('loadingBox');

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
