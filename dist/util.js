'use strict';

/**
 * Module dependencies.
 */

var _ = require('lodash');
var lev = require('leven');
var request = require('request');
var fs = require('fs');
var mkdirp = require('mkdirp');
var chalk = require('chalk');
var strip = require('strip-ansi');

var util = {

  /**
  * Handles tabbed auto-completion based on
  * the doc index. Works perfectly. Looks ugly
  * as hell. Hey: It works.
  *
  * @param {String} text
  * @param {Integer} iteration
  * @param {Object} index
  * @return {String or Array}
  * @api public
  */

  autocomplete: function autocomplete(text, iteration, index, matchFn) {
    var commands = util.command.prepare(text, {}, index);
    var lastWord = String(commands[commands.length - 1]).trim();
    var otherWords = commands.slice(0, commands.length - 1);
    var poss = [];

    var levels = 0;
    var possibleObjects = util.matchAgainstIndex(_.clone(commands), index, function () {
      levels++;
    });

    var formatted = this.formatAutocomplete(possibleObjects);
    var possibilities = Object.keys(possibleObjects);
    var match = matchFn(String(lastWord).trim(), possibilities);

    var response = undefined;
    if (match && levels !== otherWords.length + 1) {
      var space = possibilities.indexOf(String(match).trim()) > -1 ? ' ' : '';
      response = '' + String(otherWords.join(' ') + ' ' + match).trim() + space;
    } else {
      var space = levels === otherWords.length + 1 ? ' ' : '';
      var original = '' + String(commands.join(' ')).trim() + space;
      if (iteration > 1 && possibilities.length > 1) {
        response = [formatted];
      } else if (iteration > 1 && possibilities.length === 1 && otherWords.length !== levels) {
        response = String('' + original + possibilities[0]).trim() + ' ';
      } else {
        response = original;
      }
    }
    return response;
  },

  /**
  * Takes an array of index items to be displayed
  * under tabbed autocompletion. Gathers their '__class'
  * from the index ('method', 'property', 'doc', etc.)
  * and separates them into groups based on this.
  * If worthwhile, draws and color-separates classes
  * into fancy columns so the data is really, really
  * easy to digest.
  *
  * @param {Array} possibilities
  * @return {String}
  * @api public
  */

  formatAutocomplete: function formatAutocomplete(possibilities) {
    var self = this;
    var cats = ['method', 'property', 'object', 'doc'];
    var data = {};
    var all = Object.keys(possibilities) || [];

    function filter(objs, type) {
      var results = {};
      for (var item in objs) {
        if (objs[item].__class === type) {
          results[item] = objs[item];
        }
      }
      return Object.keys(results);
    }

    // If the object has children, add a slash.
    var newPoss = {};
    for (var item in possibilities) {
      var keys = Object.keys(possibilities[item]);
      keys = keys.filter(function (key) {
        return String(key).slice(0, 2) !== '__';
      });
      if (keys.length > 0) {
        newPoss[item + '/'] = _.clone(possibilities[item]);
      } else {
        newPoss[item] = possibilities[item];
      }
    }

    // Build an array of each class ('method', 'doc', etc.),
    // filed under the `data` object.
    var matches = [];
    for (var i = 0; i < cats.length; ++i) {
      data[cats[i]] = filter(newPoss, cats[i]);
      matches = matches.concat(data[cats[i]]);
    }

    // Data.remainer takes care of any items that don't
    // have a `__class` attribute in the index.
    data.remainder = all.filter(function (item) {
      return matches.indexOf(item) > -1 || matches.indexOf(item + '/') > -1 ? false : true;
    });

    // Get the widest item of them all
    // (mirror, mirror on the wall).
    var maxWidth = 0;
    all.forEach(function (item) {
      var width = String(item).length;
      maxWidth = width > maxWidth ? width : maxWidth;
    });
    maxWidth = maxWidth + 3;

    // The headers aren't measured for width, and
    // so if the thinnest property is less than the
    // "Properties" header, it's goinna look ugly.
    maxWidth = maxWidth < 12 ? 12 : maxWidth;

    // Determine how many display columns get allocated
    // per data class ('method', 'property', etc.),
    // based on how many children each data class has.
    var numColumns = Math.floor((process.stdout.columns - 2) / maxWidth);
    var dataColumns = {};
    var totalAllocated = 0;
    var maxItem = undefined;
    var max = 0;
    for (var item in data) {
      if (data[item].length > 0) {
        dataColumns[item] = Math.floor(data[item].length / all.length * numColumns) || 1;
        totalAllocated += dataColumns[item];
        max = dataColumns[item] > max ? dataColumns[item] : max;
        maxItem = dataColumns[item] === max ? item : maxItem;
      }
    }

    // Do correction on the above figures to ensure we don't
    // top over the max column amount.
    var columnOverflow = totalAllocated - numColumns;
    if (columnOverflow > 0) {
      dataColumns[maxItem] = dataColumns[maxItem] - columnOverflow;
    }

    // Methods and Properties go alphabetical.
    // Docs go in exact sequences.
    data.method.sort();
    data.property.sort();

    // Colors by class.
    var colors = {
      'method': 'green',
      'property': 'blue',
      'object': 'yellow',
      'doc': 'white',
      'remainder': 'gray'
    };

    // Fancy names by class.
    var names = {
      'method': 'Methods',
      'property': 'Properties',
      'object': 'Objects',
      'doc': 'Docs',
      'remainder': 'Other'
    };

    // This takes a class, such as `method`,
    // and draws x number of columns for that
    // item based on the allocated number of
    // column (`dataColumns[class]`). Returns
    // a \n-broken chunk of text.
    function drawClassBlock(item) {
      var ctr = 1;
      var arr = data[item];
      var columns = dataColumns[item];
      var width = maxWidth - 2;
      var color = colors[item];
      var fullWidth = (width + 2) * columns;
      var lines = '';
      var line = '';
      var longestLine = 0;
      function endLine() {
        var lineWidth = strip(line).length;
        longestLine = lineWidth > longestLine ? lineWidth : longestLine;
        lines += line + '\n';
        line = '';
        ctr = 1;
      }
      for (var i = 0; i < arr.length; ++i) {
        var _item = self.pad(arr[i], width) + '  ';
        _item = color ? chalk[color](_item) : _item;
        line += _item;
        if (ctr >= columns) {
          endLine();
        } else {
          ctr++;
        }
      }
      if (line !== '') {
        endLine();
      }
      lines = lines.split('\n').map(function (ln) {
        return self.pad(ln, longestLine);
      }).join('\n');
      var title = self.pad(names[item], longestLine);
      var divider = chalk.gray(self.pad('', longestLine - 2, '-') + '  ');
      lines = chalk.white(chalk.bold(title)) + '\n' + divider + '\n' + lines;
      return lines;
    }

    // Throw all blocks into an array, and
    // note how many rows down the longest block
    // goes.
    var combined = [];
    var longest = 0;
    for (var item in dataColumns) {
      var lines = drawClassBlock(item).split('\n');
      longest = lines.length > longest ? lines.length : longest;
      combined.push(lines);
    }

    var maxHeight = process.stdout.rows - 4;
    maxHeight = maxHeight > 24 ? 24 : maxHeight;

    // Match pad all other blocks with white-space
    // lines at the bottom to match the length of
    // the longest block. In other words, make the
    // blocks... blocks.
    combined = combined.map(function (lines) {
      var lineLength = strip(lines[0]).length;
      for (var i = lines.length; i < longest; ++i) {
        lines.push(self.pad('', lineLength));
      }

      var numRealLines = lines.filter(function (line) {
        return strip(line).trim() !== '';
      }).length;

      // If we've exceeded the max height and have
      // content, do a fancy `...` and cut the rest
      // of the content.
      if (numRealLines > maxHeight && String(lines[maxHeight - 1]).trim() !== '') {
        var ellip = numRealLines - maxHeight + ' more ...';
        ellip = chalk.gray(ellip.length > lineLength ? '...' : ellip);
        lines = lines.slice(0, maxHeight - 1);
        lines.push(self.pad(ellip, lineLength));
      }
      return lines;
    });

    longest = maxHeight < longest ? maxHeight + 1 : longest;

    // Now play Tetris. Join the blocks.
    var fnl = '';
    for (var i = 0; i < longest; ++i) {
      for (var j = 0; j < combined.length; ++j) {
        if (combined[j][i]) {
          fnl += combined[j][i];
        }
      }
      fnl += '\n';
    }

    // Interject a two-space pad to the left of
    // the blocks, and do some cleanup at the end.
    fnl = fnl.split('\n').map(function (ln) {
      return '  ' + ln;
    }).join('\n').replace(/ +$/, '').replace(/\n$/g, '') + '';

    return fnl;

    //console.log(fnl);

    //dataColumns.remainder = Math.floor((data.remainder.length / all.length * numColumns));

    //console.log(dataColumns)

    /*
    let types = 0;
    types = (methods.length > 0) ? types + 1 : types;
    types = (properties.length > 0) ? types + 1 : types;
    types = (docs.length > 0) ? types + 1 : types;
    types = (remainder.length > 0) ? types + 1 : types;
    */

    //console.log(numColumns);
    //console.log(dataColumns)

    //console.log(chalk.blue(JSON.stringify(data.method, null, '  ')));
    //console.log(chalk.magenta(JSON.stringify(data.property, null, '  ')));
    //console.log(chalk.yellow(JSON.stringify(data.doc, null, '  ')));
    //console.log(chalk.green(JSON.stringify(data.remainder, null, '  ')));
  },

  /**
  * Takes an existing array of words
  * and matches it against the index.
  * Whenever a word can be standardized
  * with the index, such as on casing,
  * it cleans up the word and returns it.
  * For example,
  * ['the', 'veryquick ', 'fox'] will become
  * ['the', 'veryQuick', 'fox']
  * based on the index.
  *
  * @param {Array} arr
  * @param {Object} idx
  * @param {Function} each
  * @param {Array} results
  * @return {Array} results
  * @api public
  */

  standardizeAgainstIndex: function standardizeAgainstIndex(arr, idx, each, results) {
    results = results || [];
    each = each || function () {};
    var word = arr.shift();

    // Use a levenshtein distance algorithm
    // to look for appriximate matches. If we feel
    // safe enough, automagically adopt the match.
    if (String(word).trim().length > 0) {
      var res = util.levenshteinCompare(word, idx);

      if (res.distance === 0) {
        word = res.key;
      } else if (res.distance === 1 && res.difference > 3) {
        word = res.key;
      } else if (res.distance === 2 && res.difference > 5 && String(res.key).length > 5) {
        word = res.key;
      }
    }

    var response = undefined;
    if (idx[word]) {
      each(arr, idx[word]);
      results.push(word);
      response = util.standardizeAgainstIndex(arr, idx[word], each, results);
    } else {
      if (word) {
        results.push(word);
      }
      response = results;
    }
    return response;
  },

  parseCommandsFromPath: function parseCommandsFromPath(path) {
    var parts = String(path).split('docs/');
    var commands = '';
    if (parts.length > 1) {
      parts.shift();
      commands = parts.join('docs/');
    } else {
      commands = path;
    }
    return String(commands).split('/');
  },

  levenshteinCompare: function levenshteinCompare(word, obj) {
    var keys = Object.keys(obj);
    var results = {
      firstKey: undefined,
      firstDistance: 1000,
      secondKey: undefined,
      secondDistance: 1000
    };
    for (var i = 0; i < keys.length; ++i) {
      if (keys[i] === 'index') {
        continue;
      }
      var distance = lev(String(word).trim().toLowerCase(), String(keys[i]).trim().toLowerCase());
      if (distance < results.firstDistance) {
        results.firstDistance = distance;
        results.firstKey = keys[i];
      } else if (distance < results.secondDistance) {
        results.secondDistance = distance;
        results.secondKey = keys[i];
      }
    }
    return {
      key: results.firstKey,
      distance: results.firstDistance,
      difference: results.secondDistance - results.firstDistance
    };
  },

  /**
  * Takes an existing array of words
  * and matches it against the index, returning
  * all available commands for the next
  * command, having matched x commands so far.
  * For example,
  * ['the', 'quick', 'brown'] will return
  * ['fox', 'dog', 'goat']
  * based on the index, as the index has
  * three .md files in the `brown` folder.
  *
  * @param {Array} arr
  * @param {Object} idx
  * @param {Function} each
  * @return {Array} results
  * @api public
  */

  matchAgainstIndex: function matchAgainstIndex(arr, idx, each) {
    each = each || function () {};
    var word = arr.shift();
    var result = undefined;
    if (idx[word]) {
      each(arr, idx[word]);
      result = util.matchAgainstIndex(arr, idx[word], each);
    } else {
      var items = {};
      for (var item in idx) {
        if (idx.hasOwnProperty(item) && String(item).slice(0, 2) !== '__' && String(item) !== 'index') {
          var match = String(word || '').toLowerCase() === String(item).slice(0, String(word || '').length).toLowerCase();
          if (match) {
            items[item] = idx[item];
          }
        }
      }
      result = items;
    }
    return result;
  },

  each: function each(nodes, fn, parents) {
    var self = this;
    parents = parents || [];
    for (var node in nodes) {
      fn(node, nodes, parents);
      if (_.isObject(nodes[node])) {
        var _parent = _.clone(parents);
        _parent.push(node);
        self.each(nodes[node], fn, _parent);
      }
    }
  },

  fetchRemote: function fetchRemote(path, cb) {
    request(path, function (err, response, body) {
      if (!err) {
        if (body === 'Not Found') {
          cb('Not Found', undefined);
        } else {
          cb(undefined, body, response);
        }
      } else {
        cb(err, '');
      }
    });
  },

  pad: function pad(str, width, delimiter) {
    width = Math.floor(width);
    delimiter = delimiter || ' ';
    var len = Math.max(0, width - strip(str).length);
    return str + Array(len + 1).join(delimiter);
  },

  /** 
   * Kind of like mkdirp, but without another depedency.
   *
   * @param {String} dir
   * @return {Util}
   * @api public
   */

  mkdirSafe: function mkdirSafe(dir, levels) {
    return mkdirp.sync(dir);

    dir = String(dir).trim();
    if (dir === '') {
      return;
    }

    levels = levels || 0;
    var dirExists = undefined;
    try {
      dirExists = fs.statSync(dir);
    } catch (e) {
      if (levels > 20) {
        throw new Error(e);
      }
      dirExists = false;
    }
    if (!dirExists) {
      var success = true;
      try {
        fs.mkdirSync(dir);
      } catch (e) {
        success = false;
      }

      if (!success) {
        var parts = dir.split('/');
        parts.pop();
        var parentDir = parts.join('/');
        this.mkdirSafe(parentDir, levels++);
        this.mkdirSafe(dir, levels++);
      }
    }
    return this;
  },

  extensions: {
    '__basic': '.md',
    '__detail': '.detail.md',
    '__install': '.install.md'
  },

  command: {

    /**
    * Takes a raw string entered by the user,
    * sanitizes it and returns it as an array
    * of words.
    *
    * @param {String} str
    * @return {Array}
    * @api public
    */

    prepare: function prepare(str, options, index) {
      options = options || {};
      var all = [];
      var commands = _.isArray(str) ? str : String(str).trim().split(' ');
      for (var i = 0; i < commands.length; ++i) {
        var parts = commands[i].split('.');
        for (var j = 0; j < parts.length; ++j) {
          var word = String(parts[j]).trim().replace(/\)/g, '').replace(/\(/g, '').replace(/\;/g, '');
          all.push(word);
        }
      }

      var standardized = util.standardizeAgainstIndex(_.clone(all), index);
      return standardized;
    },

    /**
    * Takes a raw string and converts it into
    * a ready URL root to try loading.
    *
    * @param {String} str
    * @return {String}
    * @api public
    */

    buildPath: function buildPath(str, options, index) {
      var all = util.command.prepare(str, options, index);
      var indexObject = util.command.getIndex(_.clone(all), index);
      var response = {
        path: undefined,
        exists: false,
        suggestions: undefined,
        index: undefined
      };

      if (!indexObject) {
        response.exists = false;
      } else if (_.isArray(indexObject)) {
        response.suggestions = indexObject;
      } else {
        response.index = indexObject;
        response.exists = true;
      }
      var path = all.join('/');
      response.path = path;
      return response;
    },

    /**
    * Returns the deepest index object
    * for a given array of commands.
    *
    * @param {Array} arr
    * @param {Object} idx
    * @param {Array} results
    * @return {Boolean} valid
    * @api public
    */

    getIndex: function getIndex(arr, idx) {
      var word = arr.shift();
      var result = undefined;
      if (idx[word]) {
        result = util.command.getIndex(arr, idx[word]);
      } else if (!word) {
        if (idx.index) {
          if (_.isObject(idx.index)) {
            idx.index.__isIndexFile = true;
          }
          result = idx.index;
        } else if (idx.__basic) {
          result = idx;
        } else {
          result = Object.keys(idx);
        }
      }
      return result;
    },

    /**
    * Takes the end string of command,
    * 'splice' in 'js array splice',
    * reads its index JSON, and compares
    * these to the passed in options in order
    * to determine the valid .md structure, i.e.
    * splice.md, splice.detail.md, splice.install.md,
    * etc. etc. etc.
    *
    * @param {Array} arr
    * @param {Object} idx
    * @param {Array} results
    * @return {Boolean} valid
    * @api public
    */

    buildExtension: function buildExtension(path, index, options) {
      var result = undefined;

      if (_.isObject(index) && index.__isIndexFile === true) {
        path += '/index';
      }

      if (options.detail && index.__detail) {
        result = path + '.detail.md';
      } else if (options.install && index.__install) {
        result = path + '.install.md';
      } else {
        result = path + '.md';
      }
      return result;
    }
  }
};

module.exports = util;