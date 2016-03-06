'use strict';

var jsDAV_ACD_Util = require( './util' );

var jsDAV_iNode = require( 'jsDAV/lib/DAV/interfaces/iNode' );
var Util = require( 'jsDAV/lib/shared/util' );
var Exc = require( 'jsDAV/lib/shared/exceptions' );

var path = require( 'path' );

var jsDAV_ACD_Node = module.exports = jsDAV_iNode.extend( {
    // Prepares the node for use
    initialize: function( tree , realPath , metadata ) {
        this.tree = tree;
        this.realPath = realPath;
        this.path = this.tree.stripSandbox( realPath );

        /* {
            isRoot: true, [or property not present]
            eTagResponse: 'GBDpOQzItFo',
            id: 'Vq-uivrMRVSsMv3Ak6slwA',
            kind: 'FOLDER', // FOLDER, FILE, ASSET
            version: 2,
            labels: [],
            contentProperties: { // may not be present
                extension: 'txt',
                size: 12,
                document: { title: '', documentVersion: '0', authors: [] },
                contentType: 'text/plain',
                version: 1,
                md5: 'f0ef7081e1539ac00ef5b761b4fb01b3'
            },
            createdDate: '2013-03-22T02:00:29.231Z',
            createdBy: 'CloudDriveFiles',
            restricted: false,
            modifiedDate: '2015-12-28T06:21:27.242Z',
            name: 'WebDAV', // Not present when isRoot:true
            isShared: false,
            parents: [ 'Vq-uivrMRVSsMv3Ak6slwA' ],
            status: 'AVAILABLE'
        }
        */
        this.metadata = metadata;
    },

    // Returns the name of the node
    getName: function() {
        return this.metadata.name || '';
    },

    /*
    // Renames the node
    // cbacdsetname() TODO
    // cbacdsetname( err ) TODO
    setName: function( name , cbacdsetname ) {
    },
    */

    // Returns the last modification time, as a unix timestamp
    // cbacdgetlm( err ); TODO
    // cbacdgetlm( null , this.$stat.mtime ); TODO
    getLastModified: function( cbacdgetlm ) {
        return cbacdgetlm( null , new Date(this.metadata.modifiedDate) );
    },

    /*
    // Returns whether a node exists or not
    // cbacdexists( bool ) TODO
    exists: function( cbacdexists ) {
        cbacdexists( true );
    },
    */

    'delete': function( cbacddelete ) {
        var realPath = this.realPath;
        var nicePath = this.tree.stripSandbox( realPath );

        var requestOptions = {
            url: '/trash/' + this.metadata.id,
            method: 'PUT',
            json: true,
            body: {
                kind: this.metadata.kind,
                name: this.metadata.name,
            },
        };

        jsDAV_ACD_Util.acdRequest( this.tree.amazonAuth , 'metadataUrl' , requestOptions , cbacddelete , ( function( error , res , body ) {
            if( error ) {
                return cbacddelete( new Exc.jsDAV_Exception( 'Error while deleting ' + nicePath ) );
            }

            if( 200 !== res.statusCode ) {
                var exc = new Exc.jsDAV_Exception( 'Error deleting ' + nicePath );
                exc.code = res.statusCode;
                return cbacddelete( exc );
            }

            var realDirPath = path.dirname( nicePath.replace( /\/*$/ , '' ) );

            this.tree.getNodeForPath( realDirPath , ( function( err , parentNode ) {
                if( !err ) {
                    // Clear the cache for every change
                    parentNode.cachedChildren = null;
                }

                return cbacddelete( null );
            } ).bind( this ) );
        } ).bind( this ) );
    },
} );
