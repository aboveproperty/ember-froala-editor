/* jshint node: true */
'use strict';

// Module requirements
var fs             = require('fs');
var path           = require('path');
var Funnel         = require('broccoli-funnel');
var MergeTrees     = require('broccoli-merge-trees');
var VersionChecker = require('ember-cli-version-checker');


// Resolve the froala-editor node path once..
var froalaPath = path.dirname(
  require.resolve( 'froala-editor/package.json' )
);

// For ember-cli < 2.7 findHost doesnt exist so we backport from that version
// for earlier version of ember-cli.
//https://github.com/ember-cli/ember-cli/blame/16e4492c9ebf3348eb0f31df17215810674dbdf6/lib/models/addon.js#L533
function findHostShim() {
  var current = this;
  var app;
  do {
    app = current.app || app;
  } while (current.parent.parent && (current = current.parent));
  return app;
}

module.exports = {
  name: 'ember-froala-editor',


  // Addon build option defaults
  defaultOptions: {
    plugins   : true, // == ALL available plugins
    languages : false,
    themes    : false
  },


  // https://github.com/ember-cli/ember-cli-version-checker#forember
  init() {
    this._super.init && this._super.init.apply( this, arguments );
    var checker = new VersionChecker( this );
    checker.forEmber().assertAbove(
      '2.4.2',
      'To use ember-froala-editor you must have ember 2.4.2 or later for an important bug fix!'
    ); // https://github.com/emberjs/ember.js/releases/tag/v2.4.2
  }, // init()


  // https://simplabs.com/blog/2017/02/13/npm-libs-in-ember-cli.html
  treeForVendor( vendorTree ) {
    var superTree = this._super.treeForVendor.apply( this, arguments );
    var froalaTree = new Funnel( froalaPath, {
      include : ['css/**/*','js/**/*'],
      destDir : 'froala-editor'
    });
    if ( superTree ) {
      return new MergeTrees([ superTree, froalaTree ]);
    } else if ( vendorTree ) {
      return new MergeTrees([ vendorTree, froalaTree ]);
    } else {
      return froalaTree;
    }
  }, // treeForVendor()


  included( app, parent ) {


    // http://ember-cli.com/extending/#addon-entry-point
    this._super.included.apply( this, arguments );

    // https://ember-cli.com/extending/#broccoli-build-options-for-in-repo-addons
    var findHost = this._findHost || findHostShim;
    var target = findHost.call(this);

    // Build options by merging default options
    // with the apps ember-cli-build.js options
    var options = Object.assign(
      this.defaultOptions,
      ( target.options[ this.name ] || {} )
    );


    // When importing files, import from vendor instead of the node path
    var vendorPath = path.join( 'vendor', 'froala-editor');


    // Import the base Froala Editor files
    target.import( path.join( vendorPath, 'js', 'froala_editor.min.js' ) );
    target.import({
      development : path.join( vendorPath, 'css', 'froala_editor.css' ),
      production  : path.join( vendorPath, 'css', 'froala_editor.min.css' )
    });
    target.import({
      development : path.join( vendorPath, 'css', 'froala_style.css' ),
      production  : path.join( vendorPath, 'css', 'froala_style.min.css' )
    });


    // Bucket for import list / details
    var additionalAssets = [];


    // Import the other Froala Editor files (when requested)
    if ( options.plugins && options.plugins !== [] ) {
      additionalAssets.push({
        label     : 'Plugin(s)',
        paths     : [path.join( 'js', 'plugins' ), path.join( 'js', 'third_party' )],
        files     : options.plugins,
        extension : '.min.js'
      });
      additionalAssets.push({
        label     : 'Plugin CSS',
        paths     : [path.join( 'css', 'plugins' ), path.join( 'css', 'third_party' )],
        files     : options.plugins,
        extension : '.css',
        optional  : true
      });
    }
    if ( options.languages && options.languages !== [] ) {
      additionalAssets.push({
        label     : 'Language(s)',
        paths     : [path.join( 'js', 'languages' )],
        files     : options.languages,
        extension : '.js'
      });
    }
    if ( options.themes && options.themes !== [] ) {
      additionalAssets.push({
        label     : 'Themes(s)',
        paths     : [path.join( 'css', 'themes' )],
        files     : options.themes,
        extension : '.css'
      });
    }


    // Access to `this` context within the `.forEach()` loop below
    var addon = this;


    // Common logic to import plugins / languages / themes
    additionalAssets.forEach(function( asset ){


      // List of files for the given path
      // var pathFiles = fs.readdirSync( path.join( froalaPath, asset.path ) );
      // List of files for the given path(s)
      let pathFiles = {}; // key = filename, value = relative path with filename

      // Build complete list of files in all paths
      asset.paths.forEach( assetPath => {
        fs.readdirSync(
          path.join( froalaPath, assetPath )
        ).forEach( fileName => {
          pathFiles[ fileName ] = path.join( assetPath, fileName );
        });
      });

      // Bucket for missing files
      var missingFiles = [];


      // Convert the option value to an array,
      // depending on the option type
      if ( typeof asset.files === 'boolean' ) {


        // Generate a list of _all_ the available files
        // asset.files = pathFiles.map(function( file ){
        asset.files = Object.keys(pathFiles).map(function( file ){  
          return file.split('.')[0]; // remove extensions
        }).reduce(function( files, file ){
          if ( files.indexOf( file ) === -1 ) files.push( file );
          return files; // return a unique list
        }, []);


      } else if ( typeof asset.files === 'string' ) {
        asset.files = [ asset.files ];


      } else if ( !Array.isArray( asset.files ) ) {
        throw new Error(
          `${addon.name}: ${asset.label} ` +
          'option in ember-cli-build.js is an invalid type, ' +
          'ensure it is either a boolean (all or none), ' +
          'string (just one), or array (specific list)'
        );
      }


      // Loop through each requested file
      asset.files.forEach(function( file ){


        // Make sure the requested file exists
        // if ( pathFiles.indexOf( file + asset.extension ) === -1 ) {
        if ( !pathFiles.hasOwnProperty( file + asset.extension ) ) {
          missingFiles.push( file );
          return; // continue;
        }


        // If the file type is CSS then import both
        // the non-minified and minified versions
        if ( asset.extension === '.css' ) {
          target.import({
            development : path.join( vendorPath, pathFiles[file + asset.extension] ),
            production  : path.join( vendorPath, pathFiles[file + '.min' + asset.extension] )
          });
        } else {
          target.import(
            //path.join( vendorPath, asset.path, file + asset.extension )
            path.join( vendorPath, pathFiles[file + asset.extension] )
          );
        }


      }); // files.forEach()


      // Display an error message if any required files are missing
      if ( missingFiles.length > 0 && !asset.optional ) {
        throw new Error(
          `${addon.name}: ${asset.label} ` +
          'specified in ember-cli-build.js are missing, ' +
          `make sure they are spelled correctly (${missingFiles.join(', ')})`
        );
      }


    }); // additionalAssets.forEach()


  } // included()


}; // module.exports
