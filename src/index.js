// Copyright 1999-2018. Plesk International GmbH. All rights reserved.

'use strict';

const { URL } = require('url');
const fs = require('fs');
const fse = require('fs-extra');
const path = require('path');
const https = require('https');
const cheerio = require('cheerio');
const { minify: minifyFn } = require('html-minifier');

const downloadFile = (src, dst) => new Promise((resolve, reject) => {
    https.get(src, res => {
        const file = fs.createWriteStream(dst);
        res.pipe(file);
        file.on('finish', resolve);
        file.on('error', reject);
    });
});

const getHTML = src => new Promise((resolve, reject) => {
    https.get(src, res => {
        let data = '';
        res.on('data', chunk => {
            data += chunk;
        });

        res.on('end', () => {
            resolve(data);
        });
        res.on('error', reject);
    });
});

const removeUselessNodes = $ => {
    [
        'head title',
        'head script[src="/wp-content/themes/plesk/assets/js/plugins/cookies/cookiesSystem.js"]',
        'head meta[name="description"]',
        'head link[rel="canonical"]',
        'head link[rel="next"]',
        'head meta[property^="og:"]',
        'head meta[name^="twitter:"]',
        'header .mk-page-section-wrapper',
        '#mk-boxed-layout meta',
        'script:contains("googletagmanager")',
        'noscript:contains("googletagmanager")',
        '.header-toolbar-contact',
        '.main-nav-side-search',
        '.responsive-searchform',
        'script:contains("!loading")',
        'script:contains("livechatinc.com")',
    ].forEach(selector => {
        $(selector).remove();
    });
};

const removeHighlightFromMenu = $ => {
    $('.current-menu-item').removeClass('current-menu-item');
};

const fixLinks = $ => {
    $('a[href]').each((i, node) => {
        const { href } = node.attribs;
        if (href.startsWith('/') && !href.startsWith('//')) {
            node.attribs.href = `https://www.plesk.com${href}`;
        }
    });
};

const fixRoot = $ => {
    $('#theme-page')
        .empty()
        .removeAttr('class')
        .removeAttr('role')
        .removeAttr('itemprop')
        .attr('id', 'root');
};

const addPlaceholders = ($, placeholders = {}) => {
    if (placeholders.title) {
        $('head').append(`<title>${placeholders.title}</title>`);
    }
    if (placeholders.head) {
        if (placeholders.head.prepend) {
            $('head').prepend(placeholders.head.prepend);
        }
        if (placeholders.head.append) {
            $('head').append(placeholders.head.append);
        }
    }
    if (placeholders.body) {
        if (placeholders.body.prepend) {
            $('body').prepend(placeholders.body.prepend);
        }
        if (placeholders.body.append) {
            $('body').append(placeholders.body.append);
        }
    }
    if (placeholders.root) {
        $('#root').append(placeholders.root);
    }
};

const applyToSources = async ($, fn) => {
    const lazyFns = [];
    const collect = attr => (...args) => {
        lazyFns.push(() => fn(attr)(...args));
    };
    $('img[data-cfsrc*="/wp-content/"]').each(collect('data-cfsrc'));
    $('link[href*="/wp-content/"]').each(collect('href'));
    $('script[src*="/wp-content/"]').each(collect('src'));
    $('script[src*="/wp-includes/"]').each(collect('src'));
    for (let lazyFn of lazyFns) {
        await lazyFn();
    }
};

const fixSources = async ($, selectors) => {
    const fn = attr => (i, node) => {
        let src = node.attribs[attr];
        if (src.startsWith('//')) {
            src = `https:${src}`;
        }
        node.attribs[attr] = src.replace(/(https)?:\/\/www.plesk.com\//, '/');
    };
    await applyToSources($, fn);
};

const collectFiles = async ($, { publicDirectory, origin }) => {
    const fn = attr => async (i, node) => {
        let src = node.attribs[attr];
        const dst = path.resolve(publicDirectory, src.replace(/^\//, ''));
        if (!dst.startsWith(path.resolve(publicDirectory))) {
            throw new Error(`The source url "${src}" is invalid`);
        }
        if (!fs.existsSync(dst)) {
            await fse.ensureDir(path.dirname(dst));
            await downloadFile(origin + src, dst);
        }
    };
    await applyToSources($, fn);
};

const downloadLayout = async ({ url = 'https://www.plesk.com/extensions/', filename, publicDirectory, placeholders, minify = false, modify } = {}) => {
    if (!publicDirectory) {
        throw new Error('The "publicDirectory" option is required');
    }

    let html = await getHTML(url);
    const $ = cheerio.load(html, { decodeEntities: false });

    const { origin } = new URL(url);

    if (origin === 'https://www.plesk.com') {
        removeUselessNodes($);
        removeHighlightFromMenu($);
        fixLinks($);
        fixSources($);
        fixRoot($);
    }

    addPlaceholders($, placeholders);

    await collectFiles($, { publicDirectory, origin });

    if (typeof modify === 'function') {
        modify($);
    }

    html = $.html();
    if (minify) {
        html = minifyFn(html, {
            collapseWhitespace: true,
            minifyCSS: true,
            minifyJS: true,
        });
    }
    if (!filename) {
        filename = path.resolve(publicDirectory, 'index.tpl');
    }

    await fse.ensureDir(path.dirname(filename));
    fs.writeFileSync(filename, html);
};

exports.downloadLayout = downloadLayout;
