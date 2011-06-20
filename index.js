var wrap = require('./lib/wrap');
var fs = require('fs');
var coffee = require('coffee-script');

var exports = module.exports = function (opts) {
    if (!opts) {
        opts = {};
    }
    else if (Array.isArray(opts)) {
        opts = { require : opts };
    }
    else if (typeof opts !== 'object') {
        opts = { require : [ opts ] };
    }
    
    if (!opts.require) opts.require = [];
    
    if (opts.base) {
        throw new Error(
            'Base is no longer a valid option.'
            + 'Pass in file or files to the require option and browserify will'
            + ' look at the require()s recursively to include only the files it'
            + 'needs automatically.'
        );
    }
    
    var watches = [];
    var w = wrap()
        .use('.coffee', function (body) {
            return coffee.compile(body)
        })
    ;
    
    if (opts.watch) {
        w.use(function (body, file) {
            var watcher = function (curr, prev) {
                if (curr.nlink === 0) {
                    // deleted
                    delete w.files[file];
                    
                    _cache = null;
                }
                else if (curr.mtime !== prev.mtime) {
                    // modified
                    fs.unwatchFile(file);
                    var f = w.files[file];
                    delete w.files[file];
                    w.require(file, f.root);
                    
                    _cache = null;
                }
            };
            
            if (typeof opts.watch === 'object') {
                fs.watchFile(file, opts.watch, watcher);
            }
            else {
                fs.watchFile(file, watcher);
            }
            
            return body;
        })
    }
    
    if (opts.filter) {
        w.use('post', function (body) {
            return opts.filter(body);
        });
    }
    
    w.ignore(opts.ignore || []);
    w.require(opts.require);
    
    if (opts.entry) {
        if (Array.isArray(opts.entry)) {
            opts.entry.forEach(function (e) {
                w.addEntry(e);
            });
        }
        else {
            w.addEntry(opts.entry);
        }
    }
    
    var modified = new Date();
    var _cache = null;
    var listening = false;
    var self = function (req, res, next) {
        if (!_cache) self.bundle();
        
        if (!listening && req.connection && req.connection.server) {
            req.connection.server.on('close', function () {
                Object.keys(w.files).forEach(function (file) {
                    fs.unwatchFile(file);
                });
            });
        }
        listening = true;
        
        if (req.url.split('?')[0] === (opts.mount || '/browserify.js')) {
            res.statusCode = 200;
            res.setHeader('last-modified', modified.toString());
            res.setHeader('content-type', 'text/javascript');
            res.end(_cache);
        }
    };
    
    Object.keys(w).forEach(function (key) {
        self[key] = w[key];
    });
    
    Object.keys(wrap.prototype).forEach(function (key) {
        self[key] = w[key].bind(w);
    });
    
    self.bundle = function () {
        var src = w.bundle.apply(w, arguments);
        _cache = src;
        return src;
    };
    
    return self;
};

exports.bundle = function (opts) {
    return exports(opts).bundle();
};
