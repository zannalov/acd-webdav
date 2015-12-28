'use strict';

var jsDAV_ACD_Node = require( './node' );
var jsDAV_File = require( 'jsDAV/lib/DAV/file' );

var Exc = require( 'jsDAV/lib/shared/exceptions' );
var Util = require( 'jsDAV/lib/shared/util' );

var jsDAV_ACD_File = module.exports = jsDAV_ACD_Node.extend( jsDAV_File , {
    getSize: function( cbacdfs ) {
        return cbacdfs( null , this.metadata.contentProperties && this.metadata.contentProperties.size || 0 );
    },

    getETag: function( cbacdgetag ) {
        return cbacdgetag( null , this.metadata.eTagResponse );
    },

    getContentType: function( cbacdmime ) {
        return cbacdmime( null , this.metadata.contentProperties && this.metadata.contentProperties.contentType || 'application/octet-stream' );
    },
} );
