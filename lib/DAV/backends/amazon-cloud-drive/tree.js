'use strict';

var jsDAV_Tree = require( 'jsDAV/lib/DAV/tree' );
var jsDAV_ACD_Directory = require( './directory' );
var jsDAV_ACD_File = require( './file' );
var jsDAV_ACD_Util = require( './util' );

var path = require( 'path' );

var request = require( 'request' );

var Exc = require( 'jsDAV/lib/shared/exceptions' );
var Util = require( 'jsDAV/lib/shared/util' );

var jsDAV_ACD_Tree = module.exports = jsDAV_Tree.extend( {
    initialize: function( options ) {
        this.options = options;
        this.amazonAuth = options.amazonAuth;
        this.basePath = '/' + Util.trim( options.path || '' , '/' );
    },

    // Returns a new node for the given path
    getNodeForPath: function( requestedPath , cbacdgnfp ) {
        var realPath = this.getRealPath( requestedPath );
        if ( ! this.insideSandbox( realPath ) ) {
            var nicePath = this.stripSandbox( realPath );
            return cbacdgnfp( new Exc.Forbidden( 'You are not allowed to access ' + nicePath ) );
        }

        this._getNodeForPath( realPath , cbacdgnfp , null );
    },

    // Returns a new node for the given path, drilling down from the root folder of ACD
    _getNodeForPath: function( realPathRemaining , cbacdgnfp , parentNode ) {
        var pathChunks = realPathRemaining.split( '/' );
        var nextPathChunk = pathChunks.shift();
        var realPath = ( '/' + Util.trim( parentNode && parentNode.realPath || '' , '/' ) + '/' + nextPathChunk ).replace( /\/\/+/ , '/' );
        var nicePath = this.stripSandbox( realPath );

        var filters = [
            'kind:(FILE AND FOLDER)',
            'status:AVAILABLE',
        ];

        if( !parentNode ) {
            filters.push( 'isRoot:true' );
        } else {
            filters.push( 'parents:' + parentNode.metadata.id );
            filters.push( 'name:' + nextPathChunk );
        }

        filters = 'filters=' + encodeURIComponent( filters.join( ' AND ' ) );

        jsDAV_ACD_Util.acdRequest( this.amazonAuth , 'metadataUrl' , { url: '/nodes?' + filters } , cbacdgnfp , ( function( error , res , body ) {
            if( error ) {
                cbacdgnfp( new Exc.jsDAV_Exception( 'Error while fetching ' + nicePath ) );
                return;
            }

            if( 200 !== res.statusCode ) {
                var exc = new Exc.jsDAV_Exception( 'Error fetching ' + nicePath );
                exc.code = res.statusCode;
                cbacdgnfp( exc );
                return;
            }

            try {
                body = JSON.parse( body );
            } catch( e ) {
                cbacdgnfp( new Exc.jsDAV_Exception( 'Error decoding response from ACD for ' + nicePath ) );
                return;
            }

            if( 1 !== body.count ) {
                cbacdgnfp( new Exc.FileNotFound( 'File ' + nicePath + ' not found' ) );
                return;
            }

            var metadata = body.data[ 0 ];

            var node = null;
            if( 'FOLDER' === metadata.kind ) {
                node = jsDAV_ACD_Directory.new( this , realPath , metadata );
            } else if( 'FILE' === metadata.kind ) {
                node = jsDAV_ACD_File.new( this , realPath , metadata );
            } else {
                cbacdgnfp( new Exc.UnsupportedMediaType( 'Path ' + nicePath + ' is an unsupported media type' ) );
                return;
            }

            if( pathChunks.length ) {
                this._getNodeForPath( pathChunks.join( '/' ) , cbacdgnfp , node );
            } else {
                cbacdgnfp( null , node );
            }
        } ).bind( this ) );
    },

    // Returns the full path within ACD (in case we are mounted on a sub-directory)
    getRealPath: function( publicPath ) {
        return path.join( '/' , Util.trim( this.basePath , '/' ) , Util.trim( publicPath , '/' ) );
    },
} );
