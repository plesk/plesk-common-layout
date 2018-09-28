# Plesk Layout

## Installation

```
yarn add -D https://github.com/plesk/plesk-common-layout.git
```

## Options

* `publicDirectory` **string** **required** A path to the webserver public directory. A place which will contain downloaded layout (index.html) and some downloaded static files.
* `minify` **boolean** Minify layout's html or not.
* `placeholders` **object** The layout contains some points which you can override by your custom values.
    * `title` **string** A page title. For example: `Plesk Web Installer`.
    * `css` **string** May contain html with links to stylesheets or a custom string for a template engine. For example: `<link rel="stylesheet" href="/assets/bundle.css" />`.
    * `js` **string** May contain html with some scripts or a custom string for a template engine. For example: `<script src="/assets/bundle.js"></script>`.

## Usage

```js
const { resolve } = require('path');
const { downloadLayout } = require('plesk-common-layout');

const options = {
    publicDirectory: resolve(__dirname, './public'),
    minify: true,
    placeholders: {
        title: '{{ title }}',
        js: '{{ js }}',
    },
};

(async () => {
    await downloadLayout(options);
})();
```