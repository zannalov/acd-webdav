'use strict';

var crypto = require( 'crypto' );

var jsDAV_ACD_Node = require( './node' );
var jsDAV_ACD_File = require( './file' );
var jsDAV_ACD_Util = require( './util' );
var jsDAV_Collection = require( 'jsDAV/lib/DAV/collection' );
var jsDAV_iQuota = require( 'jsDAV/lib/DAV/interfaces/iQuota' );

var Exc = require( 'jsDAV/lib/shared/exceptions' );
var Util = require( 'jsDAV/lib/shared/util' );

var mime = require( 'mime' );

var jsDAV_ACD_Directory = module.exports = jsDAV_ACD_Node.extend( jsDAV_Collection , jsDAV_iQuota , {
    getChild: function( name , cbacdgetchild ) {
        var realPath = this.realPath.replace( /\/+$/ , '' ) + '/' + name;
        var nicePath = this.tree.stripSandbox( realPath );

        var filters = 'filters=' + encodeURIComponent( [
            'kind:(FILE AND FOLDER)',
            'status:AVAILABLE',
            'parents:' + this.metadata.id,
            'name:' + name,
        ].join( ' AND ' ) );

        jsDAV_ACD_Util.acdRequest( this.tree.amazonAuth , 'metadataUrl' , { url: '/nodes?' + filters } , cbacdgetchild , ( function( error , res , body ) {
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
    },

    getChildren: function( cbacdgetchildren ) {
        var realPath = this.realPath;
        var nicePath = this.tree.stripSandbox( realPath );

        var filters = 'filters=' + encodeURIComponent( [
            'kind:(FILE AND FOLDER)',
            'status:AVAILABLE',
            'parents:' + this.metadata.id,
        ].join( ' AND ' ) );

        jsDAV_ACD_Util.acdRequest( this.tree.amazonAuth , 'metadataUrl' , { url: '/nodes?' + filters } , cbacdgetchildren , ( function( error , res , body ) {
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

            var nodes = body.data.map( function( metadata ) {
                return this.tree._initNode( realPath.replace( /\/+$/ , '' ) + '/' + metadata.name , metadata );
            }.bind( this ) );
            // TODO: Fetch all pages

            return cbacdgetchildren( null , nodes );
        } ).bind( this ) );
    },

    createFile: function( name , data , enc , cbacdcreatefile ) {
        var realPath = this.realPath.replace( /\/+$/ , '' ) + '/' + name;
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
                        contentType: mime.lookup( name ),
                    },
                },
            },
        };

        jsDAV_ACD_Util.acdRequest( this.tree.amazonAuth , 'contentUrl' , requestOptions , cbacdcreatefile , ( function( error , res , body ) {
            if( error ) {
                return cbacdcreatefile( new Exc.jsDAV_Exception( 'Error while creating file ' + nicePath ) );
            }

            if( 201 !== res.statusCode ) {
                var exc = new Exc.jsDAV_Exception( 'Error creating file ' + nicePath );
                exc.code = res.statusCode;
                return cbacdcreatefile( exc );
            }

            return cbacdcreatefile( null );
        } ).bind( this ) );
    },

    createDirectory: function( name , cbacdcreatedirectory ) {
        var realPath = this.realPath.replace( /\/+$/ , '' ) + '/' + name;
        var nicePath = this.tree.stripSandbox( realPath );

        var requestOptions = {
            url: '/nodes?localId=' + Date.now() + '-' + Math.random(),
            method: 'POST',
            json: true,
            body: {
                name: name,
                kind: 'FOLDER',
                parents: [ this.metadata.id ],
            },
        };

        jsDAV_ACD_Util.acdRequest( this.tree.amazonAuth , 'metadataUrl' , requestOptions , cbacdcreatedirectory , ( function( error , res , body ) {
            if( error ) {
                return cbacdcreatedirectory( new Exc.jsDAV_Exception( 'Error while creating directory ' + nicePath ) );
            }

            if( 201 !== res.statusCode ) {
                var exc = new Exc.jsDAV_Exception( 'Error creating directory ' + nicePath );
                exc.code = res.statusCode;
                return cbacdcreatedirectory( exc );
            }

            return cbacdcreatedirectory( null );
        } ).bind( this ) );
    },
} );
