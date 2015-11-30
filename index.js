#!/usr/bin/env node
'use strict';

// Support the popular "config" npm module, but don't require it
var config;
try {
    config = require('config');
} catch (e) {
    config = {};
}

// Configuration
var port = process.env.PORT || config.port || 8080;
var hostname = process.env.HOSTNAME || config.hostname || 'localhost';
var lockDir = process.env.LOCK_DIR || config.lockDir || ( __dirname + '/data' );
var tmpDir = process.env.TMP_DIR || config.tmpDir || ( __dirname + '/tmp' );
var httpBasePath = process.env.MOUNT || config.httpBasePath || '/';
var debugMode = Boolean(process.env.DEBUG) || config.debug || false;

// Set up the HTTP listening server
var http = require( 'http' );
var server = http.createServer();
server.on( 'listening' , function() {
    console.log( 'Listening on http://' + hostname + ':' + port );
    // TODO: Open auth page if auth invalid
} );
server.listen( port , hostname );

// Set up express
var express = require( 'express' );
var app = express();
server.on( 'request' , app );
app.use( express.static( __dirname + '/public' ) ); // Handle static pages provided by the app
// TODO: Handle auth data coming bacck from public/signin.html

// Set up jsDAV/WebDAV on the root path so that WinXP will play nicely
var JSDAV = require( 'jsDAV/lib/jsdav' );
var JSDAV_Locks_Backend_FS = require( 'jsDAV/lib/DAV/plugins/locks/fs' );
JSDAV.debugMode = debugMode;
var locksBackend = JSDAV_Locks_Backend_FS.new( lockDir );
var jsdav = JSDAV.mount( {
    node: __dirname + '/mnt' , // TODO: Instead of "node" use "tree" and create a jsDAV_Tree_ACD class. See ~line 102 in node_modules/jsDAV/lib/DAV/server.js: this.tree = jsDAV_Tree_Filesystem.new(options.node, options);
    locksBackend: locksBackend,
    server: server,
    mount: httpBasePath,
    standalone: false,
    tmpDir: tmpDir,
} );
app.use( jsdav.exec.bind( jsdav ) ); // Use the exec method as the callback for anything express didn't understand

