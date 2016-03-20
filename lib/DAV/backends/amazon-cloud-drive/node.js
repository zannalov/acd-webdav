'use strict';

var jsDAV_ACD_Util = require( './util' );

var jsDAV_iNode = require( 'jsDAV/lib/DAV/interfaces/iNode' );
var Util = require( 'jsDAV/lib/shared/util' );
var Exc = require( 'jsDAV/lib/shared/exceptions' );

var jsDAV_ACD_Node = jsDAV_iNode.extend( {
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

    acdRequest: function( opts ) {
        opts.amazonAuth = this.tree.amazonAuth;
        return jsDAV_ACD_Util.acdRequest( opts );
    },

    getName: function() {
        return this.metadata.name || '';
    },

    setName: function( newName , cbacdsetname ) {
        var realPath = this.realPath;
        var nicePath = this.tree.stripSandbox( realPath );

        newName = Util.splitPath( newName ).pop();

        this.acdRequest( {
            endpointName: 'metadataUrl',
            requestOptions: {
                url: '/nodes/' + this.metadata.id,
                method: 'PATCH',
                json: true,
                body: {
                    name: newName,
                },
            },
            directCallback: cbacdsetname,
            responseCallback: function( error , res , body ) {
                if( error ) {
                    return cbacdsetname( new Exc.jsDAV_Exception( 'Error while renaming ' + nicePath + ' to ' + newName ) );
                }

                if( 200 !== res.statusCode ) {
                    var exc = new Exc.jsDAV_Exception( 'Error renaming ' + nicePath + ' to ' + newName );
                    exc.code = res.statusCode;
                    return cbacdsetname( exc );
                }

                this.tree.acdCache.updateMetadata( body , function() {
                    cbacdsetname( null );
                } );
            }.bind( this ),
        } );
    },

    getLastModified: function( cbacdgetlm ) {
        return cbacdgetlm( null , new Date( this.metadata.modifiedDate ) );
    },

    exists: function( cbacdexists ) {
        this.tree.getNodeForPath( this.path , function( err , node ) {
            cbacdexists( err , Boolean( node ) );
        } );
    },

    'delete': function( cbacddelete ) {
        var realPath = this.realPath;
        var nicePath = this.tree.stripSandbox( realPath );

        this.acdRequest( {
            endpointName: 'metadataUrl',
            requestOptions: {
                url: '/trash/' + this.metadata.id,
                method: 'PUT',
                json: true,
                body: {
                    kind: this.metadata.kind,
                    name: this.metadata.name,
                },
            },
            directCallback: cbacddelete,
            responseCallback: function( error , res , body ) {
                if( error ) {
                    return cbacddelete( new Exc.jsDAV_Exception( 'Error while deleting ' + nicePath ) );
                }

                if( 200 !== res.statusCode ) {
                    var exc = new Exc.jsDAV_Exception( 'Error deleting ' + nicePath );
                    exc.code = res.statusCode;
                    return cbacddelete( exc );
                }

                this.tree.acdCache.updateMetadata( body , function() {
                    cbacddelete( null );
                } );
            }.bind( this ),
        } );
    },
} );

module.exports = jsDAV_ACD_Node;
