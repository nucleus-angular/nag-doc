/*
 Copyright (c) 2011, Yahoo! Inc. All rights reserved.
 Code licensed under the BSD License:
 http://yuilibrary.com/license/
 */
//var MD = require("node-markdown").Markdown,
var marked = require('marked'),
mkdirp = require('mkdirp'),
//fs = require('graceful-fs'),
fs = require('fs'),
noop = function() {},
path = require('path'),
_path = require('path'),
DEFAULT_RETURN_TAGS = 'code|em|strong|span|a|pre|dl|dd|dt|ul|li|ol',
TEMPLATE,
Encoder = require('node-html-encoder').Encoder,
encoder = new Encoder('entity'),
rimraf = require('rimraf');

//copy from wrench.js
var copyDirSyncRecursive = function(sourceDir, newDirLocation, opts) {
  try {
    if(fs.statSync(newDirLocation).isDirectory()) {
      if(typeof opts !== 'undefined' && opts.forceDelete) {
        exports.rmdirSyncRecursive(newDirLocation);
      } else {
        return new Error('You are trying to delete a directory that already exists. Specify forceDelete in the opts argument to override this. Bailing~');
      }
    }
  } catch(e) { }

  /*  Create the directory where all our junk is moving to; read the mode of the source directory and mirror it */
  var checkDir = fs.statSync(sourceDir);
  try {
    fs.mkdirSync(newDirLocation, checkDir.mode);
  } catch (e) {
    //if the directory already exists, that's okay
    if (e.code !== 'EEXIST') throw e;
  }

  var files = fs.readdirSync(sourceDir);

  for(var i = 0; i < files.length; i++) {
    // ignores all files or directories which match the RegExp in opts.filter
    if(typeof opts !== 'undefined') {
      if(!opts.whitelist && opts.filter && files[i].match(opts.filter)) continue;
      // if opts.whitelist is true every file or directory which doesn't match opts.filter will be ignored
      if(opts.whitelist && opts.filter && !files[i].match(opts.filter)) continue;
      if (opts.excludeHiddenUnix && /^\./.test(files[i])) continue;
    }

    var currFile = fs.lstatSync(_path.join(sourceDir, files[i]));

    var fCopyFile = function(srcFile, destFile) {
      if(typeof opts !== 'undefined' && opts.preserveFiles && fs.existsSync(destFile)) return;

      var contents = fs.readFileSync(srcFile);
      fs.writeFileSync(destFile, contents);
    };

    if(currFile.isDirectory()) {
      /*  recursion this thing right on back. */
      copyDirSyncRecursive(_path.join(sourceDir, files[i]), _path.join(newDirLocation, files[i]), opts);
    } else if(currFile.isSymbolicLink()) {
      var symlinkFull = fs.readlinkSync(_path.join(sourceDir, files[i]));

      if (typeof opts !== 'undefined' && !opts.inflateSymlinks) {
        fs.symlinkSync(symlinkFull, _path.join(newDirLocation, files[i]));
        continue;
      }

      var tmpCurrFile = fs.lstatSync(_path.join(sourceDir, symlinkFull));
      if (tmpCurrFile.isDirectory()) {
        copyDirSyncRecursive(_path.join(sourceDir, symlinkFull), _path.join(newDirLocation, files[i]), opts);
      } else {
        /*  At this point, we've hit a file actually worth copying... so copy it on over. */
        fCopyFile(_path.join(sourceDir, symlinkFull), _path.join(newDirLocation, files[i]));
      }
    } else {
      /*  At this point, we've hit a file actually worth copying... so copy it on over. */
      fCopyFile(_path.join(sourceDir, files[i]), _path.join(newDirLocation, files[i]));
    }
  }
};

/**
 * Takes the `JSON` data from the `DocParser` class, creates and parses markdown and handlebars
 based templates to generate static HTML content
 * @class DocBuilder
 * @module nagdoc
 */

YUI.add('doc-builder', function(Y) {
  var Lang = Y.Lang,
  trim = Lang.trim;

  //var DEFAULT_THEME = themeDir = path.join(__dirname, '../', 'themes', 'angular-new');

  Y.DocBuilder = function(options, data) {
    this.options = options;
    /*if (options.helpers) {
      this._addHelpers(options.helpers);
    }
    if (options.themedir) {
      themeDir = options.themedir;
    }*/

    this.data = data;
    Y.log('Building..', 'info', 'builder');
    this.files = 0;
    var self = this;

    this.cacheTemplates = true;
    if (options.cacheTemplates === false) {
      this.cacheTemplates = false;
    }

  };

  Y.DocBuilder.prototype = {
    /**
     * The default tags to use in return descriptions (for Markdown).
     * @property defaultReturnTags
     * @type String
     */
    defaultReturnTags: DEFAULT_RETURN_TAGS,
    /**
     * The default tags to use in params descriptions (for Markdown).
     * @property defaultTags
     * @type String
     */
    defaultTags: 'p|' + DEFAULT_RETURN_TAGS,

    /*****************************************************************************************/
    /*************************************   NEW CODE    *************************************/
    /*****************************************************************************************/
    cachedData: [],

    jsonPath: null,

    webPath: null,

    searchableData: [],

    topLevelItems: {
      'modules': {
        singleName: 'module',
        items: []
      },
      'classes': {
        singleName: 'class',
        items: ['method', 'property', 'respondto', 'event']
      },
      'ngservices': {
        singleName: 'ngservice',
        items: ['method', 'property', 'respondto', 'event', 'ngwatch']
      },
      'ngdirectives': {
        singleName: 'ngdirective',
        items: ['method', 'property', 'respondto', 'event', 'ngwatch']
      },
      'ngcontrollers': {
        singleName: 'ngcontroller',
        items: ['method', 'property', 'respondto', 'event', 'ngwatch']
      },
      'ngfilters': {
        singleName: 'ngfilter',
        items: []
      },
      'ngvalues': {
        singleName: 'ngvalue',
        items: []
      }
    },

    filterFileName: function(f) {
      return f.replace(/[\/\\]/g, '_') + '.html';
    },

    addFoundAt: function(itemObject) {
      var self = this;
      if (itemObject.file && itemObject.line && !self.options.nocode) {
        itemObject.foundAt = '../source_files/' + self.filterFileName(itemObject.file) + '#l' + itemObject.line;
        if (itemObject.path) {
          itemObject.foundAt = itemObject.path + '#l' + itemObject.line;
        }

        //add the name of the source code file that will be generated for easy access
        itemObject.sourceFileName = self.filterFileName(itemObject.file);
      }
      return itemObject;
    },

    /*markdown: function(md, def, tags) {
      return MD(md, def, tags);
    },*/

    markdown: function(markdown) {
      return marked(markdown);
    },

    _parseCode: function (html) {
      return html;
    },

    //@todo: review code
    augmentItem: function(itemObject) {
      var self = this;
      itemObject = self.addFoundAt(itemObject);
      Y.each(itemObject, function(i, k1) {
        if (i && i.forEach) {
          Y.each(i, function(a, k) {
            if (!(a instanceof Object)) {
              return;
            }
            if (!a.type) {
              a.type = 'Object'; //Default type is Object
            }
            if (a.final === '') {
              a.final = true;
            }
            if (!a.description) {
              a.description = ' ';
            } else {
              //a.description = markdown(a.description, true, self.defaultTags);
              a.description = self.markdown(a.description);
            }
            //support markdown in example does not seem to add anything, only adds in confusion with it add in html where it should not be there
            if (a.example) {
             a.example = self.markdown(a.example);
           }
            a = self.addFoundAt(a);

            Y.each(a, function(c, d) {
              if (c.forEach || (c instanceof Object)) {
                c = self.augmentItem(c);
                a[d] = c;
              }
            });

            itemObject[k1][k] = a;
          });
        } else if (i instanceof Object) {
          i = self.addFoundAt(i);
          Y.each(i, function(v, k) {
            if (k === 'final') {
              itemObject[k1][k] = true;
            }
            if (k === 'description'/* || k === 'example'*/) {
              if (k1 === 'return') {
                [k1][k] = self.markdown(v/*, true, self.defaultReturnTags*/);
              } else if (v.forEach || (v instanceof Object)) {
                itemObject[k1][k] = self.augmentItem(v);
              } else {
                //o[k1][k] = markdown(v, true, self.defaultTags);
                itemObject[k1][k] = self.markdown(v);
              }
            }
          });
        } else if (k1 === 'description'/* || k1 === 'example'*/) {
          //o[k1] = markdown(i, true, self.defaultTags);
          itemObject[k1] = self.markdown(i);
        }
      });
      return itemObject;
    },

    normalizeTopLevelItem: function(topLevelItemObject) {
      //normalize naming to camelCase
      topLevelItemObject.pluginFor = topLevelItemObject.plugin_for;
      delete topLevelItemObject.plugin_for;

      topLevelItemObject.extensionFor = topLevelItemObject.extension_for;
      delete topLevelItemObject.extension_for;

      // /remove unneeded data
      delete topLevelItemObject.classitems;
      delete topLevelItemObject.ngdirectiveitems;
      delete topLevelItemObject.ngcontrolleritems;
      delete topLevelItemObject.ngserviceitems;
    },

    augmentTopLevelItem: function(type, topLevelObject) {
      var self = this
      var topLevelItemSingleName = self.topLevelItems[type].singleName;
      var processedItems = {};
      topLevelObject = self.augmentItem(topLevelObject);
      topLevelObject.componentType = topLevelItemSingleName;

      //process each type of item and cache that data
      if(self.data[topLevelItemSingleName + 'items']) {
        self.data[topLevelItemSingleName + 'items'].forEach(function(item) {
          if (item[topLevelItemSingleName] === topLevelObject.name) {
            if(!processedItems[item.itemtype]) {
              processedItems[item.itemtype] = [];
            }

            processedItems[item.itemtype].push(item);
          }
        });

        //augment each type of item to the object with the cached data
        self.topLevelItems[type]['items'].forEach(function(itemName) {
          topLevelObject.type = topLevelItemSingleName;
          self[itemName + 'DataAugmentation'](processedItems[itemName], topLevelObject);
        });
      }

      var searchValue = topLevelObject.name;

      if(topLevelObject.module) {
        searchValue = topLevelObject.module + '/' + searchValue;
      }

      self.searchableData.push({
        module: topLevelObject.module,
        name: topLevelObject.name,
        jsonPath: self.generateJsonFilePath(type, topLevelObject.name, true),
        componentType: topLevelItemSingleName,
        search: searchValue
      });
    },

    methodDataAugmentation: function(items, topLevelObject) {
      var self = this;
      var methods = [];

      if(items && items.length > 0) {
        items.forEach(function(item) {
          item = self.augmentItem(item);
          item.params = item.params || [];
          item.examples = item.example || [];
          delete item.example;

          if(!item.examples.forEach) {
            item.examples = [item.examples];
          }

          item.examples.forEach(function(example, key) {
            item.examples[key] = trim(example);//self._parseCode(self.markdown(v));
          });

          item.hasAccessType = item.access;
          item.parameterCount = item.params.length;

          // If this item is provided by a module other
          // than the module that provided the original
          // class, add the original module name to the
          // item's `providedBy` property so we can
          // indicate the relationship.
          if ((item.submodule || item.module) !== (topLevelObject.submodule || topLevelObject.module)) {
            item.providedBy = (item.submodule || item.module);
          }

          //normalize method object
          item.parameters = item.params;
          delete item.params;

          //remove unnecessary data
          delete item.itemtype;

          methods.push(item);
        });
      }

      if(methods.length > 0) {
        methods.sort(self.nameSort);
        topLevelObject['methods'] = methods;
      }
    },

    propertyDataAugmentation: function(items, topLevelObject) {
      var self = this;
      var properties = [];

      if(items && items.length > 0) {
        items.forEach(function(item) {
          item = self.augmentItem(item);

          if (!item.type) {
            item.type = 'unknown';
          }

          if (item.final === '') {
            item.final = true;
          }

          /*if (item.example && item.example.length) {
            if (item.example.forEach) {
              var example = '';
              item.example.forEach(function(v) {
                example += self._parseCode(self.markdown(v));
              });
              item.example = example;
            } else {
              item.example = self._parseCode(self.markdown(item.example));
            }
          }*/

          // If this item is provided by a module other
          // than the module that provided the original
          // class, add the original module name to the
          // item's `providedBy` property so we can
          // indicate the relationship.
          if ((item.submodule || item.module) !== (topLevelObject.submodule || topLevelObject.module)) {
            item.providedBy = (item.submodule || item.module);
          }

          //remove unnecessary data
          delete item.itemtype;

          properties.push(item);
        });
      }

      if(properties.length > 0) {
        properties.sort(self.nameSort);
        topLevelObject['properties'] = properties;
      }
    },
    
    respondtoDataAugmentation: function(items, topLevelObject) {
      var self = this;
      var respondTos = [];

      if(items && items.length > 0) {
        items.forEach(function(item) {
          item = self.augmentItem(item);

          //remove unnecessary data
          delete item.itemtype;

          respondTos.push(item);
        });
      }

      if(respondTos.length > 0) {
        respondTos.sort(self.nameSort);
        topLevelObject.respondTos = respondTos;
      }
    },
    
    ngwatchDataAugmentation: function(items, topLevelObject) {
      var self = this;
      var ngWatches = [];

      if(items && items.length > 0) {
        items.forEach(function(item) {
          item = self.augmentItem(item);

          //remove unnecessary data
          delete item.itemtype;

          ngWatches.push(item);
        });
      }

      if(ngWatches.length > 0) {
        ngWatches.sort(self.nameSort);
        topLevelObject.ngWatches = ngWatches;
      }
    },

    eventDataAugmentation: function(items, topLevelObject) {
      var self = this;
      var events = [];

      if(items && items.length > 0) {
        items.forEach(function(item) {
          item = self.augmentItem(item);

          /*if (item.example && item.example.length) {
            if (item.example.forEach) {
              var e = '';
              item.example.forEach(function(v) {
                e += self._parseCode(self.markdown(v));
              });
              item.example = e;
            } else {
              item.example = self._parseCode(self.markdown(item.example));
            }
          }*/

          // If this item is provided by a module other
          // than the module that provided the original
          // class, add the original module name to the
          // item's `providedBy` property so we can
          // indicate the relationship.
          if ((item.submodule || item.module) !== (topLevelObject.submodule || topLevelObject.module)) {
            item.providedBy = (item.submodule || item.module);
          }

          delete item.itemtype;

          events.push(item);
        });
      }

      if(events.length > 0) {
        events.sort(self.sortName);
        topLevelObject.events = events;
      }
    },

    buildJsonData: function() {
      var self = this;

      //create the sub json filter for each top level item
      Object.keys(self.topLevelItems).forEach(function(topLevelItemKey) {
        Object.keys(self.data[topLevelItemKey]).forEach(function(dataKey) {
          var topLevelObject = self.data[topLevelItemKey][dataKey];
          /*if(topLevelItemKey == 'modules') {
            self.searchableData.push({
              module: topLevelObject.name,
              name: topLevelObject.name,
              jsonPath: self.generateJsonFilePath('modules', topLevelObject.name, true),
              type: 'module',
              componentType: 'module',
              search: topLevelObject.name
            });
          }*/

          self.normalizeTopLevelItem(topLevelObject);
          self.augmentTopLevelItem(topLevelItemKey, topLevelObject);
          self.cachedData.push(topLevelObject);
        });
      });

      self.searchableData.sort(self.nameSort);

      //@todo: research: support multiple extends?
      //check for @extends
      Object.keys(self.topLevelItems).forEach(function(topLevelItemKey) {
        Object.keys(self.data[topLevelItemKey]).forEach(function(dataKey) {
          var topLevelObject = self.data[topLevelItemKey][dataKey];
          var extendedData = null;
          var extendParts = [];

          if(topLevelObject.extends) {
            extendParts = topLevelObject.extends.split('/');

            self.cachedData.forEach(function(cachedObject) {
              if(!extendedData) {
                //this give support to @extend ObjectName
                if(extendParts.length == 1 && cachedObject.name == extendParts[0]) {
                  extendedData = cachedObject;
                  //this gives support for @extend ModuleName/ObjectName
                } else if(extendParts.length == 2 && cachedObject.name == extendParts[0] && cachedObject.name == extendParts[1]) {
                  extendedData = cachedObject;
                }
              }
            });

            var extendableData = ['methods', 'properties', 'events', 'respondTos'];

            extendableData.forEach(function(extendableDataName) {
              if(extendedData[extendableDataName]) {
                if(topLevelObject[extendableDataName]) {
                  topLevelObject[extendableDataName] = topLevelObject[extendableDataName].concat(extendedData[extendableDataName]);
                } else {
                  topLevelObject[extendableDataName] = extendedData[extendableDataName];
                }
              }
            });
          }
        });
      });
    },

    buildJsonFiles: function() {
      var self = this;

      //create the root json folder
      if(fs.existsSync(self.options.outdir + self.webPath + self.jsonPath)) {
        rimraf.sync(self.options.outdir + self.webPath + self.jsonPath);
      } else if(!fs.existsSync(self.options.outdir + self.webPath)) {
        fs.mkdirSync(self.options.outdir + self.webPath);
      }

      fs.mkdirSync(self.options.outdir + self.webPath + self.jsonPath); 

      //create the files
      Object.keys(self.topLevelItems).forEach(function(topLevelItemKey) {
        fs.mkdirSync(self.options.outdir + self.webPath + self.jsonPath + '/' + topLevelItemKey);

        Object.keys(self.data[topLevelItemKey]).forEach(function(dataKey) {
          var topLevelObject = self.data[topLevelItemKey][dataKey];

          self.buildJsonFile(topLevelItemKey, topLevelObject)
        });
      });

      fs.writeFileSync(self.options.outdir + self.webPath + self.jsonPath + '/' + 'search-data.json', JSON.stringify(self.searchableData, null, ' '), 'ascii');
    },

    nameSort: function(a, b) {
      if (!a.name || !b.name) {
        return 0;
      }

      var an = a.name.toLowerCase();
      var bn = b.name.toLowerCase();
      var ret = 0;

      if (an < bn) {
        ret = -1;
      }
      if (an > bn) {
        ret =  1
      }
      return ret;
    },

    buildJsonFile: function(type, jsonObject, fileName) {
      var self = this;
      fileName = fileName || jsonObject.name;
      var path = self.generateJsonFilePath(type, fileName);

      //debug version
      fs.writeFileSync(path, JSON.stringify(jsonObject, null, ' '), 'ascii');

      //fs.writeFileSync(path, JSON.stringify(topLevelObject), 'ascii');
    },

    buildSourceFiles: function() {
      var self = this;

      if(fs.existsSync(self.options.outdir + self.webPath + '/source_files')) {
        rimraf.sync(self.options.outdir + self.webPath + '/source_files');
      }

      fs.mkdirSync(self.options.outdir + self.webPath + '/source_files');

      Object.keys(self.data.files).forEach(function(filePath) {
        var fileContents = fs.readFileSync(filePath, 'ascii');
        fs.writeFileSync(self.options.outdir + self.webPath + '/source_files/' + self.filterFileName(filePath), encoder.htmlEncode(fileContents), 'ascii');
      });
    },

    generateJsonFilePath: function(type, fileName, webPath) {
      var self = this;
      var path = webPath ? '' : self.options.outdir + self.webPath;
      return path + self.jsonPath + '/' + type + '/' + self.fileNameNormalize(fileName) + '.json'
    },

    fileNameNormalize: function(name) {
      //building just incase I need it but does nothing right now
      return name;
    },

    /*copyApplicationFiles: function() {
      var self = this;
      copyDirSyncRecursive(themeDir, self.options.outdir, {forceDelete: true});
    },*/

    downloadApplicationFiles: function(callback) {
      var starttime = (new Date()).getTime();
      var self = this;

      if(self.options.docApp) {
        Y.log('Downloading the nag doc viewer application', 'info', 'builder');
        var request = require('request');
        var AdmZip = require('adm-zip');
        var ncp = require('ncp').ncp;

        var download = function(url, dest, cb) {
          var file = fs.createWriteStream(dest);
          var response = request(url);
          response.pipe(file);
          file.on('finish', function() {
            file.close();
            cb();
          });
        };

        //make sure we don't have any old directory that are going to be overwritten
        rimraf.sync('./tmpappdir');
        rimraf.sync(self.options.outdir);

        //create the temporary location for the doc application
        mkdirp.sync('./tmpappdir');

        download(self.options.docApp.url, './tmpappdir/download.zip', function() {
          Y.log('Download finished', 'info', 'builder');
          var zip = new AdmZip('./tmpappdir/download.zip');
          Y.log('Extracting zip file', 'info', 'builder');
          zip.extractAllTo('./tmpappdir');
          Y.log('Extracted zip file', 'info', 'builder');

          Y.log('Moving application to proper location', 'info', 'builder');
          ncp('./tmpappdir' + self.options.docApp.zipPath, self.options.outdir, function(err) {
            if (err) {
              console.error(err);
            }

            rimraf.sync('./tmpappdir');

            var endtime = (new Date()).getTime();
            var timer = ((endtime - starttime) / 1000) + ' seconds';
            Y.log('Downloaded and extracted the nag doc viewer application in ' + timer, 'info', 'builder');
            callback();
          });
        });
      } else {

        callback();
      }
    },

    compile: function(cb) {
      var self = this;
      var starttime;

      self.jsonPath = '/' + self.options.jsonDir || '/json';
      self.webPath = '/' + self.options.webDir || '/web';

      //todo: enable when debugging: fs.writeFileSync('./builder-output.json', JSON.stringify(self.data, null, ' '), 'ascii');

      //this.copyApplicationFiles();
      this.downloadApplicationFiles(function() {
        starttime = (new Date()).getTime();
        Y.log('Compiling Templates', 'info', 'builder');
        self.buildJsonData();
        self.buildJsonFiles();
        self.buildSourceFiles();

        var endtime = (new Date()).getTime();
        var timer = ((endtime - starttime) / 1000) + ' seconds';
        Y.log('Finished writing files in ' + timer, 'info', 'builder');
      });
    }
  }
});
