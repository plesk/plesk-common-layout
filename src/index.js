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

const addPlaceholders = ($, placeholders) => {
    if (!placeholders) {
        return;
    }
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

const downloadLayout = async ({ publicDirectory, placeholders, minify = false } = {}) => {
    if (!publicDirectory) {
        throw new Error('The "publicDirectory" option is required');
    }
    let html = await getHTML('https://www.plesk.com/extensions/');
    const $ = cheerio.load(html);

    removeUselessNodes($);
    removeHighlightFromMenu($);
    fixLinks($);
    addPlaceholders($, placeholders);

    // empty nodes
    $('#theme-page')
        .empty()
        .removeAttr('class')
        .removeAttr('role')
        .removeAttr('itemprop')
        .attr('id', 'root');

    // modify nodes
    $('.mk-header-padding-wrapper').attr('style', 'min-height: 130px');

    await collectFiles($, publicDirectory);

    html = $.html();
    if (minify) {
        html = minifyFn(html, {
            collapseWhitespace: true,
            minifyCSS: true,
            minifyJS: true,
        });
    }

    fs.writeFileSync(path.resolve(publicDirectory, 'index.tpl'), html);
};

exports.downloadLayout = downloadLayout;
