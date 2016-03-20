'use strict';

var jsDAV_ACD_Util = require( './util' );
var jsDAV_ACD_Node = require( './node' );

var jsDAV_Collection = require( 'jsDAV/lib/DAV/collection' );
var jsDAV_iQuota = require( 'jsDAV/lib/DAV/interfaces/iQuota' );

var Exc = require( 'jsDAV/lib/shared/exceptions' );
var Util = require( 'jsDAV/lib/shared/util' );

var jsDAV_ACD_Directory = jsDAV_ACD_Node.extend( jsDAV_Collection , jsDAV_iQuota , {
    getChild: function( name , cbacdgetchild ) {
        this.tree._getNodeForPath( [ name ] , cbacdgetchild , this );
    },

    getChildren: function( cbacdgetchildren ) {
        var ids = Object.keys( this.metadata.children );
        var nodes = [];
        if( ids.length ) {
            return jsDAV_ACD_Util.asyncShift( ids , function( id , childCompleteCallback ) {
                var realPath = this.tree.cleanupPath( this.realPath + '/' + this.metadata.children[ id ] );
                this.tree._getNodeById( realPath , id , function( err , node ) {
                    nodes.push( node );
                    childCompleteCallback();
                } );
            }.bind( this ) , function() {
                cbacdgetchildren( null , nodes );
            }.bind( this ) );
        }

        return this._getChildren( cbacdgetchildren , [] , null );
    },

    _getChildren: function( cbacdgetchildren , nodes , nextToken ) {
        var realPath = this.realPath;
        var nicePath = this.tree.stripSandbox( realPath );

        var filters = 'filters=' + encodeURIComponent( [
            'kind:(FILE AND FOLDER)',
            'status:AVAILABLE',
            'parents:' + this.metadata.id,
        ].join( ' AND ' ) );

        var url = '/nodes?' + filters + ( nextToken ? '&startToken=' + encodeURIComponent( nextToken ) : '' );

        this.acdRequest( {
            endpointName: 'metadataUrl',
            requestOptions: {
                url: url,
            },
            directCallback: cbacdgetchildren,
            responseCallback: function( error , res , body ) {
                if( error ) {
                    return cbacdgetchildren( new Exc.jsDAV_Exception( 'Error while fetching children of ' + nicePath ) );
                }

                if( 200 !== res.statusCode ) {
                    var exc = new Exc.jsDAV_Exception( 'Error fetching children of ' + nicePath );
                    exc.code = res.statusCode;
                    return cbacdgetchildren( exc );
                }

                try {
                    body = JSON.parse( body );
                } catch( e ) {
                    return cbacdgetchildren( new Exc.jsDAV_Exception( 'Error decoding response from ACD for children of ' + nicePath ) );
                }

                if( !body.data || !body.data.map ) {
                    return cbacdgetchildren( new Exc.jsDAV_Exception( 'Error decoding body.data while fetching children of ' + nicePath ) );
                }

                nodes = nodes.concat( body.data.map( function( metadata ) {
                    return this.tree._initNode( realPath + '/' + metadata.name , metadata );
                }.bind( this ) ) );

                if( body.nextToken && body.data.length ) {
                    this._getChildren( cbacdgetchildren , nodes , body.nextToken );
                } else {
                    var allMetadata = [];
                    nodes.forEach( function( node ) {
                        allMetadata.push( node.metadata );
                    } );
                    this.tree.acdCache.updateMetadata( allMetadata , function() {
                        return cbacdgetchildren( null , nodes );
                    } );
                }
            }.bind( this ),
        } );
    },

    createFile: function( name , data , enc , cbacdcreatefile ) {
        var realPath = this.realPath + '/' + name;
        var nicePath = this.tree.stripSandbox( realPath );

        var requestOptions = {
            url: '/nodes?suppress=deduplication',
            method: 'POST',
            formData: {
                metadata: JSON.stringify( {
                    name: name,
                    kind: 'FILE',
                    parents: [ this.metadata.id ],
                } ),
                content: {
                    value: data,
                    options: {
                        filename: name,
                        contentType: Util.mime.type( name ),
                    },
                },
            },
        };

        this.acdRequest( {
            endpointName: 'contentUrl',
            requestOptions: requestOptions,
            directCallback: cbacdcreatefile,
            responseCallback: function( error , res /* , body */ ) {
                if( error ) {
                    return cbacdcreatefile( new Exc.jsDAV_Exception( 'Error while creating file ' + nicePath ) );
                }

                if( 201 !== res.statusCode ) {
                    var exc = new Exc.jsDAV_Exception( 'Error creating file ' + nicePath );
                    exc.code = res.statusCode;
                    return cbacdcreatefile( exc );
                }

                return cbacdcreatefile( null );
            }.bind( this ),
        } );
    },

    createDirectory: function( name , cbacdcreatedirectory ) {
        var realPath = this.realPath + '/' + name;
        var nicePath = this.tree.stripSandbox( realPath );

        this.acdRequest( {
            endpointName: 'metadataUrl',
            requestOptions: {
                url: '/nodes?localId=' + Date.now() + '-' + Math.random(),
                method: 'POST',
                json: true,
                body: {
                    name: name,
                    kind: 'FOLDER',
                    parents: [ this.metadata.id ],
                },
            },
            directCallback: cbacdcreatedirectory,
            responseCallback: function( error , res /* , body */ ) {
                if( error ) {
                    return cbacdcreatedirectory( new Exc.jsDAV_Exception( 'Error while creating directory ' + nicePath ) );
                }

                if( 201 !== res.statusCode ) {
                    var exc = new Exc.jsDAV_Exception( 'Error creating directory ' + nicePath );
                    exc.code = res.statusCode;
                    return cbacdcreatedirectory( exc );
                }

                return cbacdcreatedirectory( null );
            }.bind( this ),
        } );
    },
} );

module.exports = jsDAV_ACD_Directory;
