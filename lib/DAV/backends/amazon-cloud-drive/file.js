'use strict';

var jsDAV_ACD_Node = require( './node' );
var jsDAV_File = require( 'jsDAV/lib/DAV/file' );

var request = require( 'request' );

var Exc = require( 'jsDAV/lib/shared/exceptions' );
var Util = require( 'jsDAV/lib/shared/util' );

var jsDAV_ACD_File = module.exports = jsDAV_ACD_Node.extend( jsDAV_File , {
    getSize: function( cbacdfs ) {
        return cbacdfs( null , this.metadata.contentProperties && this.metadata.contentProperties.size || null );
    },

    getETag: function( cbacdgetag ) {
        return cbacdgetag( null , this.metadata.eTagResponse );
    },

    getContentType: function( cbacdmime ) {
        return cbacdmime( null , this.metadata.contentProperties && this.metadata.contentProperties.contentType || 'application/octet-stream' );
    },

    getContentLength: function( cbacdmime ) {
        if( this.metadata.contentProperties && this.metadata.contentProperties.hasOwnProperty( 'size' ) ) {
            return cbacdmime( null , this.metadata.contentProperties.size );
        }

        return cbacdmime( null , null );
    },

    getStream: function( start , end , cbacdgetstream ) {
        var realPath = this.realPath;
        var nicePath = this.tree.stripSandbox( realPath );

        this.tree.amazonAuth.getHeadersForRequest( function( error , headers ) {
            if( error ) {
                return cbacdgetstream( new Exc.jsDAV_Exception( 'Error encountered while trying to get headers prior to fetching content of ' + nicePath ) );
            }

            this.tree.amazonAuth.getEndpoint( function( error , endpoint ) {
                if( error ) {
                    return cbacdgetstream( new Exc.jsDAV_Exception( 'Error encountered while trying to get endpoint prior to fetching content of ' + nicePath ) );
                }

                if(
                    null !== start
                    && null !== end
                    && this.metadata.eTagResponse
                    && this.metadata.contentProperties
                    && this.metadata.contentProperties.hasOwnProperty( 'size' )
                ) {
                    headers['if-range'] = this.metadata.eTagResponse;
                    headers['range'] = 'bytes ' + start + '-' + end + '/' + this.metadata.contentProperties.size;
                }

                var req = request( {
                    url: endpoint.contentUrl + '/nodes/' + this.metadata.id + '/content',
                    headers: headers,
                } , function( error , response , body ) {
                    if( error ) {
                        return cbacdgetstream( new Exc.jsDAV_Exception( 'Error while fetching content of ' + nicePath ) );
                    }

                    if( 200 !== response.statusCode ) {
                        var exc = new Exc.jsDAV_Exception( 'Error fetching contents of ' + nicePath );
                        exc.code = res.statusCode;
                        return cbacdgetstream( exc );
                    }

                    return cbacdgetstream( null , body );
                } );
            }.bind( this ) );
        }.bind( this ) );
    },
} );
