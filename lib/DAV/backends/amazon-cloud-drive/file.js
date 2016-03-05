'use strict';

var jsDAV_ACD_Node = require( './node' );
var jsDAV_ACD_Util = require( './util' );
var jsDAV_File = require( 'jsDAV/lib/DAV/file' );

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

        var requestOptions = {
            url: '/nodes/' + this.metadata.id + '/content',
            headers: {},
        };

        if(
            null !== start
            && null !== end
            && this.metadata.eTagResponse
            && this.metadata.contentProperties
            && this.metadata.contentProperties.hasOwnProperty( 'size' )
        ) {
            requestOptions.headers['if-range'] = this.metadata.eTagResponse;
            requestOptions.headers['range'] = 'bytes ' + start + '-' + end + '/' + this.metadata.contentProperties.size;
        }

        jsDAV_ACD_Util.acdRequest( this.tree.amazonAuth , 'contentUrl' , requestOptions , cbacdgetstream , function( error , response , body ) {
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
    },
} );
