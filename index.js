#!/usr/bin/env node
'use strict';

// Support the popular "config" npm module, but don't require it
var config;
try {
    config = require('config');
} catch (e) {
    config = {};
}

// libraries and data
var JSDAV = require( 'jsDAV/lib/jsdav' );
var JSDAV_Locks_Backend_FS = require( 'jsDAV/lib/DAV/plugins/locks/fs' );
var http = require( 'http' );

// Configuration
var port = process.env.PORT || config.port || 8080;
var lockDir = process.env.LOCK_DIR || config.lockDir || ( __dirname + '/data' );
var tmpDir = process.env.TMP_DIR || config.tmpDir || ( __dirname + './tmp' );
var mount = process.env.MOUNT || config.mount || '/';
var debugMode = Boolean(process.env.DEBUG) || config.debug || false;

// Set up the HTTPS listening server
var server = http.createServer().listen( port );

// Set up jsDAV elements
JSDAV.debugMode = debugMode;
var locksBackend = JSDAV_Locks_Backend_FS.new( lockDir );

// Set up WebDAV on the root path so that WinXP will play nicely
var jsdav = JSDAV.mount( {
    node: __dirname + '/mnt' , // TODO: Instead of "node" use "tree" and create a jsDAV_Tree_ACD class. See ~line 102 in node_modules/jsDAV/lib/DAV/server.js: this.tree = jsDAV_Tree_Filesystem.new(options.node, options);
    locksBackend: locksBackend ,
    server: server ,
    mount: mount ,
    tmpDir: tmpDir ,
} );

// Indicate that setup is complete
console.log( 'Ready ' + (new Date()).toISOString() );
