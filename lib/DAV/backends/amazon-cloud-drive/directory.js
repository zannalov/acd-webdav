'use strict';

var jsDAV_ACD_Node = require( './node' );
var jsDAV_ACD_File = require( './file' );
var jsDAV_Collection = require( 'jsDAV/lib/DAV/collection' );
var jsDAV_iQuota = require( 'jsDAV/lib/DAV/interfaces/iQuota' );

var request = require( 'request' );

var Exc = require( 'jsDAV/lib/shared/exceptions' );
var Util = require( 'jsDAV/lib/shared/util' );

var jsDAV_ACD_Directory = module.exports = jsDAV_ACD_Node.extend( jsDAV_Collection , jsDAV_iQuota , {
    cachedChildren: null,

    getChild: function( name , cbacdgetchild ) {
        var realPath = this.realPath.replace( /\/+$/ , '' ) + '/' + name;
        var nicePath = this.tree.stripSandbox( realPath );

        if( this.cachedChildren ) {
            for( var x = 0 ; x < this.cachedChildren.length ; ++ x ) {
                if( this.cachedChildren[ x ].realPath === realPath ) {
                    return cbacdgetchild( null , this.cachedChildren[ x ] );
                }
            }

            return cbacdgetchild( new Exc.FileNotFound( 'File with name ' + nicePath + ' could not be located' ) );
        }

        var filters = 'filters=' + encodeURIComponent( [
            'kind:(FILE AND FOLDER)',
            'status:AVAILABLE',
            'parents:' + this.metadata.id,
            'name:' + name,
        ].join( ' AND ' ) );

        this.tree.amazonAuth.getHeadersForRequest( function( error , headers ) {
            if( error ) {
                return cbacdgetchild( new Exc.jsDAV_Exception( 'Error encountered while trying to get headers prior to fetching child ' + nicePath ) );
            }

            this.tree.amazonAuth.getEndpoint( function( error , endpoint ) {
                if( error ) {
                    return cbacdgetchild( new Exc.jsDAV_Exception( 'Error encountered while trying to get endpoint prior to fetching child ' + nicePath ) );
                }

                request( {
                    url: endpoint.metadataUrl + '/nodes?' + filters,
                    headers: headers,
                } , ( function( error , res , body ) {
                    if( error ) {
                        return cbacdgetchild( new Exc.jsDAV_Exception( 'Error while fetching child ' + nicePath ) );
                    }

                    if( 200 !== res.statusCode ) {
                        var exc = new Exc.jsDAV_Exception( 'Error fetching child ' + nicePath );
                        exc.code = res.statusCode;
                        return cbacdgetchild( exc );
                    }

                    try {
                        body = JSON.parse( body );
                    } catch( e ) {
                        return cbacdgetchild( new Exc.jsDAV_Exception( 'Error decoding response from ACD for child ' + nicePath ) );
                    }

                    if( !body.data || !body.data.map ) {
                        return cbacdgetchild( new Exc.jsDAV_Exception( 'Error decoding body.data while fetching child ' + nicePath ) );
                    }

                    if( 1 !== body.data.length ) {
                        return cbacdgetchild( new Exc.FileNotFound( 'File with name ' + nicePath + ' could not be located' ) );
                    }

                    return cbacdgetchild( null , this.tree._initNode( realPath , body.data[ 0 ] ) );
                } ).bind( this ) );
            }.bind( this ) );
        }.bind( this ) );
    },

        if( this.cachedChildren ) {
            return cbacdgc( null , this.cachedChildren );
        }

        var realPath = this.realPath;
        var nicePath = this.tree.stripSandbox( realPath );

        var filters = 'filters=' + encodeURIComponent( [
            'kind:(FILE AND FOLDER)',
            'status:AVAILABLE',
            'parents:' + this.metadata.id,
        ].join( ' AND ' ) );

        this.tree.amazonAuth.getHeadersForRequest( function( error , headers ) {
            if( error ) {
                return cbacdgc( new Exc.jsDAV_Exception( 'Error encountered while trying to get headers prior to fetching children of ' + nicePath ) );
            }

            this.tree.amazonAuth.getEndpoint( function( error , endpoint ) {
                if( error ) {
                    return cbacdgc( new Exc.jsDAV_Exception( 'Error encountered while trying to get endpoint prior to fetching children of ' + nicePath ) );
                }

                request( {
                    url: endpoint.metadataUrl + '/nodes?' + filters,
                    headers: headers,
                } , ( function( error , res , body ) {
                    if( error ) {
                        return cbacdgc( new Exc.jsDAV_Exception( 'Error while fetching children of ' + nicePath ) );
                    }

                    if( 200 !== res.statusCode ) {
                        var exc = new Exc.jsDAV_Exception( 'Error fetching children of ' + nicePath );
                        exc.code = res.statusCode;
                        return cbacdgc( exc );
                    }

                    try {
                        body = JSON.parse( body );
                    } catch( e ) {
                        return cbacdgc( new Exc.jsDAV_Exception( 'Error decoding response from ACD for children of ' + nicePath ) );
                    }

                    if( !body.data || !body.data.map ) {
                        return cbacdgc( new Exc.jsDAV_Exception( 'Error decoding body.data while fetching children of ' + nicePath ) );
                    }

                    var nodes = body.data.map( function( metadata ) {
                        return this.tree._initNode( realPath.replace( /\/+$/ , '' ) + '/' + metadata.name , metadata );
                    }.bind( this ) );
                    // TODO: Fetch all pages

                    this.cachedChildren = nodes;
                    return cbacdgc( null , nodes );
                } ).bind( this ) );
            }.bind( this ) );
        }.bind( this ) );
    },
} );
