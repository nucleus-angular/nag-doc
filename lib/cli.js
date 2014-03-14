#!/usr/bin/env node
/*
Copyright (c) 2011, Yahoo! Inc. All rights reserved.
Code licensed under the BSD License:
http://yuilibrary.com/license/
*/

/**
* Parses the arguments, creates the options and passes them to `Y.YUIDoc` and then `Y.DocBuilder`.
* @class CLI
* @module nagdoc
*/

var Y = require('./index'),
    path = require('path');

var options = Y.Options(Y.Array(process.argv, 2));

Y.log('Starting Nag Doc@' + Y.packageInfo.version + ' using YUI@' + Y.version + ' with NodeJS@' + process.versions.node, 'info', 'nag-doc');

var starttime = (new Date).getTime();

options = Y.Project.init(options);

Y.log('Starting Nag Doc with the following options:', 'info', 'nag-doc');
var opts = Y.clone(options);
if (opts.paths && opts.paths.length && (opts.paths.length > 10)) {
    opts.paths = [].concat(opts.paths.slice(0, 5), ['<paths truncated>'], options.paths.slice(-5));
}
Y.log(opts, 'info', 'nag-doc');

if (options.server) {
    Y.Server.start(options);
} else {

    var json = (new Y.YUIDoc(options)).run();
    options = Y.Project.mix(json, options);

    if (!options.parseOnly) {
        var builder = new Y.DocBuilder(options, json);
        builder.compile(function() {
            var endtime = (new Date).getTime();
            Y.log('Completed in ' + ((endtime - starttime) / 1000) + ' seconds' , 'info', 'nag-doc');
        });
    }
}
