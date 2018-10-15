// Copyright 1999-2018. Plesk International GmbH. All rights reserved.

'use strict';

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

    // add root node
    const node = $('#theme-page')
        .empty()
        .removeAttr('class')
        .removeAttr('role')
        .removeAttr('itemprop');
    if (placeholders.root) {
        node.append(placeholders.root);
    } else {
        node.attr('id', 'root');
    }
};

const collectFiles = async ($, publicDirectory) => {
    const files = new Set();
    const createFileCollector = attr => (i, node) => {
        let src = node.attribs[attr];
        if (src.startsWith('//')) {
            src = `https:${src}`;
        }
        node.attribs[attr] = src.replace(/(https)?:\/\/www.plesk.com\//, '/');
        files.add(src);
    };
    $('img[data-cfsrc^="https://www.plesk.com/wp-content/"]').each(createFileCollector('data-cfsrc'));
    $('link[href*="//www.plesk.com/wp-content/"]').each(createFileCollector('href'));
    $('script[src*="//www.plesk.com/wp-content/"]').each(createFileCollector('src'));
    $('script[src*="//www.plesk.com/wp-includes/"]').each(createFileCollector('src'));

    for (const src of files) {
        const dst = path.resolve(publicDirectory, src.replace('https://www.plesk.com/', ''));
        if (!dst.startsWith(path.resolve(publicDirectory))) {
            throw new Error(`The source url "${src}" is invalid`);
        }
        if (!fs.existsSync(dst)) {
            await fse.ensureDir(path.dirname(dst));
            await downloadFile(src, dst);
        }
    }
};

const downloadLayout = async ({ filename, publicDirectory, placeholders, minify = false, modify } = {}) => {
    if (!publicDirectory) {
        throw new Error('The "publicDirectory" option is required');
    }
    let html = await getHTML('https://www.plesk.com/extensions/');
    const $ = cheerio.load(html, { decodeEntities: false });

    removeUselessNodes($);
    removeHighlightFromMenu($);
    fixLinks($);
    addPlaceholders($, placeholders);

    await collectFiles($, publicDirectory);

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
