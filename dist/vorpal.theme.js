'use strict';

var chalk = require('chalk');

module.exports = function (vorpal, options) {
  var parent = options.parent;

  vorpal.command('set theme <name>', 'Sets the syntax highlighting theme.').action(function (args, cb) {
    var theme = parent.cosmetician.theme(args.name);
    if (theme === false) {
      this.log('\n  ' + chalk.yellow('Er... That\'s not a valid theme.') + '\n  What about one of these?\n');
      var themes = parent.cosmetician.getThemes() || [];
      this.log('  ' + themes.join('\n  ') + '\n');
    } else {
      this.log('\n  ' + chalk.cyan('Successfully set theme to ' + args.name + '.') + '\n');
    }
    cb();
  });

  vorpal.command('get theme', 'Displays the current syntax highlighting theme.').action(function (args, cb) {
    var prefs = parent.clerk.prefs.get();
    this.log('\n  ' + prefs.theme + '\n');
    cb();
  });

  vorpal.command('get themes', 'Displays the current syntax highlighting theme.').action(function (args, cb) {
    this.log('\n  ' + chalk.cyan('Available themes:') + '\n');
    var themes = parent.cosmetician.getThemes() || [];
    this.log('  ' + themes.join('\n  '));
    this.log(' ');
    cb();
  });
};