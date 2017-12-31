/*!*****************************************************
 * mark.js-website
 * https://github.com/julmot/mark.js/tree/website
 * Copyright (c) 2016–2018, Julian Kühnel
 * All Rights Reserved
 *******************************************************/
"use strict";
const handlebars = require("handlebars"),
    metalsmith = require("metalsmith"),
    collections = require("metalsmith-collections"),
    templatesprecompile = require("metalsmith-in-place"),
    marked = require("marked"),
    markdown = require("metalsmith-markdown"),
    templates = require("metalsmith-layouts"),
    beautify = require("metalsmith-beautify"),
    del = require("del"),
    fs = require("fs"),
    ncp = require("ncp").ncp;

/**
 * Location settings
 */
const targetDir = "./",
    buildDir = "build/tmp/",
    docsDir = "src/docs/",
    templatesDir = "src/templates/",
    templatePartialsDir = "src/templates/partials/",
    metadataConfig = "src/docs/metadata.json",
    packageConfig = "package.json",
    collectionsConfig = "src/docs/toc.json",
    beautifyConfig = ".jsbeautifyrc";

/**
 * Common utilities
 */
const readJSON = file => {
    return JSON.parse(fs.readFileSync(file, "utf8"));
};

/**
 * Handlebars helpers
 */
// Checks if a string contains a substring
handlebars.registerHelper("contains", function (str, patt, opt) {
    if(str.toString().indexOf(patt.toString()) !== -1) {
        return opt.fn(this);
    }
    return opt.inverse(this);
});
// Increments a given counter (e.g. @index)
handlebars.registerHelper("inc", function (value) {
    return parseInt(value) + 1;
});
// Returns a random string
handlebars.registerHelper("randomStr", function (value) {
    return Math.random().toString(36).substring(7);
});
// Checks if the specified value is not false
handlebars.registerHelper("ifNotFalse", function (value, options) {
    if(value !== false) {
        return options.fn(this);
    }
    return options.inverse(this);
});
// Checks if the stack of articles contains articles with a heading
handlebars.registerHelper("ifArticlesWithHeading", function (stack, options) {
    for(var i = 0, len = stack.length; i < len; i++){
        if(stack[i]["heading"] !== false){
            return options.fn(this);
        }
    }
    return options.inverse(this);
});
// Converts a string for usage as anchor
handlebars.registerHelper("anchor", function (str) {
    return str.replace(/[^\w\s]/gi, "").replace(/[\s]/gi, "-").toLowerCase();
});
// A custom counter that can be used as an alternative to @index
let counter = 0;
handlebars.registerHelper("resetCounter", function () {
    counter = 0;
});
handlebars.registerHelper("incrementCounter", function () {
    return ++counter;
});
handlebars.registerHelper("getCounter", function () {
    return counter;
});

/**
 * Documentation generation using Metalsmith
 */
metalsmith(__dirname)
    .source(docsDir)
    .destination(buildDir)
    .metadata({ // allow accessing metadata via handlebars
        "defaults": readJSON(metadataConfig),
        "pkg": readJSON(packageConfig)
    })
    .ignore("*.json") // don't generate .json files
    .use(collections(
        (() => {
            // Sort TOC by items (if specified)
            const toc = readJSON(collectionsConfig),
                sorter = order => {
                    order = order || [];
                    return(one, two) => {
                        const a = one.title;
                        const b = two.title;

                        if(!a && !b) return 0;
                        if(!a) return 1;
                        if(!b) return -1;

                        const i = order.indexOf(a);
                        const j = order.indexOf(b);

                        if(~i && ~j) {
                            if(i < j) return -1;
                            if(j < i) return 1;
                            return 0;
                        }

                        if(~i) return -1;
                        if(~j) return 1;

                        a = a.toLowerCase();
                        b = b.toLowerCase();
                        if(a[0] === '.') return 1;
                        if(b[0] === '.') return -1;
                        if(a < b) return -1;
                        if(b < a) return 1;
                        return 0;
                    };
                };
            for(let item in toc) {
                if(Array.isArray(toc[item].sortBy)) {
                    toc[item].sortBy = sorter(toc[item].sortBy);
                }
            }
            return toc;
        })()
    ))
    .use(templatesprecompile({ // precompiles handlebars in markdown files
        "engine": "handlebars",
        "partials": templatePartialsDir
    }))
    .use(markdown({
        "renderer": (() => {
            let renderer = new marked.Renderer({
                "smartypants": true,
                "smartLists": true,
                "gfm": true,
                "tables": true,
                "breaks": false,
                "sanitize": false
            });
            // As it is not possible to generate custom classes, it is necessary
            // to pass a bootstrap table renderer (https://git.io/vwD7Z)
            renderer.table = function (header, body) {
                /* beautify preserve:start */
                return "<div class=\"table-responsive\">"
                    + "<table class=\"table table-bordered table-striped\">"
                        + "<thead>"
                        + header
                        + "</thead>"
                        + "<tbody>"
                        + body
                        + "</tbody>"
                    + "</table>"
                + "</div>";
                /* beautify preserve:end */
            }
            return renderer;
        })()
    }))
    .use(templates({
        "directory": templatesDir,
        "partials": templatePartialsDir,
        "engine": "handlebars",
        "preventIndent": true
    }))
    /*
    // Currently disabled as of https://git.io/vwDiK
    .use(beautify( // beautify HTML
        readJSON(beautifyConfig)
    ))
    */
    .build(err => {
        if(err) {
            console.log(err);
        } else {
            // Delete include files that were generated due to the fact that
            // using .ignore() on Metalsmith will exclude the files also
            // from collections. So they weren't ignored.
            // Reference: https://git.io/vVSUn
            del(`${buildDir}*/**`).then(paths => {
                // Copy HTML files for integration with assets
                ncp(`${buildDir}/`, `${targetDir}/`, err => {
                    if(err) {
                        console.log(err);
                    } else {
                        // Delete build files.
                        del(`${buildDir}**`);
                    }
                });
            });
        }
    });
