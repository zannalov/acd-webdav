#!/usr/bin/env node
'use strict';

var DAV_backends_amazonCloudDrive_directory = require( './lib/DAV/backends/amazon-cloud-drive/directory.js' );
var DAV_backends_amazonCloudDrive_file = require( './lib/DAV/backends/amazon-cloud-drive/file.js' );
var DAV_backends_amazonCloudDrive_node = require( './lib/DAV/backends/amazon-cloud-drive/node.js' );
var DAV_backends_amazonCloudDrive_tree = require( './lib/DAV/backends/amazon-cloud-drive/tree.js' );

if( require.main !== module ) {
    module.exports = {
        directory: DAV_backends_amazonCloudDrive_directory,
        file: DAV_backends_amazonCloudDrive_file,
        node: DAV_backends_amazonCloudDrive_node,
        tree: DAV_backends_amazonCloudDrive_tree,
    };

    return;
}

// Support the popular "config" npm module, but don't require it
var config;
try {
    config = require('config');
} catch (e) {
    config = {};
}

// Modules
var fs = require( 'fs' );
var http = require( 'http' );
var open = require( 'open' );
var express = require( 'express' );
var AmazonAuth = require( './lib/DAV/backends/amazon-cloud-drive/auth.js' ).AmazonAuth;
var JSDAV = require( 'jsDAV/lib/jsdav' );
var JSDAV_Locks_Backend_FS = require( 'jsDAV/lib/DAV/plugins/locks/fs' );

// Configuration
var port = process.env.PORT || config.port || 8080;
var hostname = process.env.HOSTNAME || config.hostname || 'localhost';
var lockDir = process.env.LOCK_DIR || config.lockDir || ( __dirname + '/data' );
var tmpDir = process.env.TMP_DIR || config.tmpDir || ( __dirname + '/tmp' );
var httpBasePath = process.env.HTTP_BASE_PATH || config.httpBasePath || '/';
var amazonCredentialsJsonFile = config.amazonCredentialsJsonFile || ( __dirname + '/.amazon-credentials.json' );
var amazonAuthConfig = config.amazonAuthConfig || {
    client_id: 'amzn1.application-oa2-client.154adc9fd7224fac84b1277290c7edae',
    client_secret: null,
    scope: 'clouddrive:read_all clouddrive:write',
    redirect_uri: 'http://localhost:8080/signin.html',
};

// Load Amazon credentials (if stored)
var amazonCredentials = null;
try {
    var amazonCredentials = JSON.parse( fs.readFileSync( amazonCredentialsJsonFile ) );

    for( var k in amazonAuthConfig ) {
        if( amazonAuthConfig[ k ] !== amazonCredentials[ k ] ) {
            console.log( k + ' doesn\'t match, ignoring stored credentials' );
            throw 'jump to catch';
        }
    }
} catch ( e ) {
    amazonCredentials = null;
}

// Set up the Amazon auth
var amazonAuth = new AmazonAuth( amazonCredentials || amazonAuthConfig );
function saveAmazonCredentials() {
    fs.writeFile( amazonCredentialsJsonFile , JSON.stringify( amazonAuth ) , function( err ) {
        console.log( 'Saved ' + amazonCredentialsJsonFile );
    } );
}
console.log( 'Auth URL is: ' + amazonAuth.generateAuthUrl() );
amazonAuth.on( 'token' , saveAmazonCredentials );
amazonAuth.on( 'endpoint' , saveAmazonCredentials );

// Set up the HTTP listening server
var server = http.createServer();
var mountUrl = 'http://' + hostname + ':' + port;
server.on( 'listening' , function() {
    console.log( 'Listening on ' + mountUrl );

    amazonAuth.getToken( function( token ) {
        if( !token ) {
            open( amazonAuth.generateAuthUrl() );
        } else {
            console.log( 'Ready!' );
        }
    } );
} );
server.listen( port , hostname );

// Set up express
var app = express();
server.on( 'request' , app );
app.use( express.static( __dirname + '/public' ) ); // Handle static pages provided by the app
app.get( '/signin' , function( req , res ) {
    amazonAuth.processTokenResponse( req.query , function( token ) {
        if( token ) {
            res.writeHead( 200 );
            res.end( '<!DOCTYPE html>Thanks! You may now mount <a href="' + mountUrl + '">' + mountUrl + '</a>' );
            console.log( 'Ready!' );
        } else {
            res.writeHead( 400 );
            res.end( 'There was an error processing the token. Please try again.' );
        }
    } );
} );

// Set up jsDAV/WebDAV on the root path so that WinXP will play nicely
JSDAV.debugMode = false; // TODO: Get debug messages into logger
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
