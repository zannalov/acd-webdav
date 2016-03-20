'use strict';

var stream = require( 'stream' );

var jsDAV_ACD_Node = require( './node' );

var jsDAV_File = require( 'jsDAV/lib/DAV/file' );

var Exc = require( 'jsDAV/lib/shared/exceptions' );
var Util = require( 'jsDAV/lib/shared/util' );

var jsDAV_ACD_File = jsDAV_ACD_Node.extend( jsDAV_File , {
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

    putStream: function( handler , type , cbacdputstream ) {
        var realPath = this.realPath;
        var nicePath = this.tree.stripSandbox( realPath );

        var contentLength = handler.httpRequest.headers[ 'content-length' ];
        var size = handler.httpRequest.headers[ 'x-file-size' ];

        if( !contentLength && !size ) {
            // We just can't cope with it if we don't know the size ahead of
            // time, whether or not it's chunked. Something goes wrong in the
            // form-data portion of the stream. So delegate back to .put()
            handler.getRequestBody( 'binary' , null , false , function( err , body ) {
                if( !Util.empty( err ) ) {
                    return handler.handleError( err );
                }

                this.put( body , 'binary' , cbacdputstream );
            }.bind( this ) );
            return;
        }

        var setupRequestToAcd = function( knownLength ) {
            var handlePutComplete = ( function( error , res , body ) {
                if( error ) {
                    return cbacdputstream( new Exc.jsDAV_Exception( 'Error while sending file ' + nicePath ) );
                }

                if( 200 !== res.statusCode ) {
                    var exc = new Exc.jsDAV_Exception( 'Error sending file ' + nicePath );
                    exc.code = res.statusCode;
                    return cbacdputstream( exc );
                }

                this.tree.acdCache.updateMetadata( body , function() {
                    cbacdputstream( null );
                } );
            } ).bind( this );

            var passthrough = new stream.PassThrough();

            this.acdRequest( {
                endpointName: 'contentUrl',
                requestOptions: {
                    url: '/nodes/' + this.metadata.id + '/content',
                    method: 'PUT',
                    formData: {
                        content: {
                            value: passthrough,
                            options: {
                                filename: this.metadata.name,
                                contentType: Util.mime.type( this.metadata.name ),
                                knownLength: knownLength,
                            },
                        },
                    },
                },
                directCallback: cbacdputstream,
                responseCallback: handlePutComplete,
            } );

            return passthrough;
        }.bind( this );

        if( size ) {
            var chunkedUploads = handler.server.chunkedUploads;
            var track = chunkedUploads[ realPath ];
            if( !track ) {
                track = chunkedUploads[ realPath ] = {
                    writable: setupRequestToAcd( parseInt( size , 10 ) ), // Writable stream
                    timeout: null, // setTimeout handle
                    size: 0, // transfered so far
                };
            }

            var resetTimer = function() {
                clearTimeout( track.timeout );
                track.timeout = setTimeout( function() {
                    delete chunkedUploads[ realPath ];
                    track.writable.emit( 'error' , new Error( 'timed out' ) );
                    track.writable.end();
                } , 30000 );
            };

            var passthrough = new stream.PassThrough();

            passthrough.on( 'data' , function( chunk ) {
                resetTimer();

                // Chunk may be a buffer, and buffer.length doesn't necessarily
                // match data length. So tell the buffer to give us a binary
                // string and count its length.
                track.size += chunk.toString( 'binary' ).length;
            } );

            passthrough.on( 'end' , function() {
                if( track.size === parseInt( size , 10 ) ) {
                    clearTimeout( track.timeout );
                    delete chunkedUploads[ realPath ];
                    track.writable.end();
                } else {
                    resetTimer();
                }
            } );

            resetTimer();

            passthrough.pipe( track.writable , { end: false } );

            handler.getRequestBody( type , passthrough , true , cbacdputstream );
        } else {
            handler.getRequestBody( type , setupRequestToAcd( parseInt( contentLength , 10 ) ) , true , cbacdputstream );
        }
    },

    getStream: function( start , end , cbacdgetstream ) {
        var realPath = this.realPath;
        var nicePath = this.tree.stripSandbox( realPath );

        var requestOptions = {
            url: '/nodes/' + this.metadata.id + '/content',
            headers: {},
            encoding: null,
            gzip: true,
        };

        if(
            null !== start &&
            null !== end &&
            this.metadata.eTagResponse &&
            this.metadata.contentProperties &&
            this.metadata.contentProperties.hasOwnProperty( 'size' )
        ) {
            requestOptions.headers['if-range'] = this.metadata.eTagResponse;
            requestOptions.headers.range = 'bytes ' + start + '-' + end + '/' + this.metadata.contentProperties.size;
        }

        this.acdRequest( {
            endpointName: 'contentUrl',
            requestOptions: requestOptions,
            directCallback: cbacdgetstream,
            responseCallback: function( error , res ) {
                if( error ) {
                    return cbacdgetstream( new Exc.jsDAV_Exception( 'Error while fetching content of ' + nicePath ) );
                }

                if( 200 !== res.statusCode ) {
                    var exc = new Exc.jsDAV_Exception( 'Error fetching contents of ' + nicePath + ' statusCode ' + res.statusCode );
                    exc.code = res.statusCode;
                    return cbacdgetstream( exc );
                }

                res.on( 'data' , function( data ) {
                    cbacdgetstream( null , data );
                } );

                res.on( 'end' , function() {
                    cbacdgetstream();
                } );
            },
            pipe: true,
        } );
    },

    put: function( data , enc , cbacdputfile ) {
        var realPath = this.realPath;
        var nicePath = this.tree.stripSandbox( realPath );

        this.acdRequest( {
            endpointName: 'contentUrl',
            requestOptions: {
                url: '/nodes/' + this.metadata.id + '/content',
                method: 'PUT',
                formData: {
                    content: {
                        value: data,
                        options: {
                            filename: this.metadata.name,
                            contentType: Util.mime.type( this.metadata.name ),
                        },
                    },
                },
            },
            directCallback: cbacdputfile,
            responseCallback: function( error , res , body ) {
                if( error ) {
                    return cbacdputfile( new Exc.jsDAV_Exception( 'Error while creating file ' + nicePath ) );
                }

                if( 200 !== res.statusCode ) {
                    var exc = new Exc.jsDAV_Exception( 'Error updating file ' + nicePath );
                    exc.code = res.statusCode;
                    return cbacdputfile( exc );
                }

                this.tree.acdCache.updateMetadata( body , function() {
                    cbacdputfile( null );
                } );
            }.bind( this ),
        } );
    },

    get: function( cbacdgetfile ) {
        var realPath = this.realPath;
        var nicePath = this.tree.stripSandbox( realPath );

        var requestOptions = {
            url: '/nodes/' + this.metadata.id + '/content',
            headers: {},
            encoding: null,
            gzip: true,
        };

        this.acdRequest( {
            endpointName: 'contentUrl',
            requestOptions: requestOptions,
            directCallback: cbacdgetfile,
            responseCallback: function( error , res , body ) {
                if( error ) {
                    return cbacdgetfile( new Exc.jsDAV_Exception( 'Error while fetching content of ' + nicePath ) );
                }

                if( 200 !== res.statusCode ) {
                    var exc = new Exc.jsDAV_Exception( 'Error fetching contents of ' + nicePath + ' statusCode ' + res.statusCode );
                    exc.code = res.statusCode;
                    return cbacdgetfile( exc );
                }

                cbacdgetfile( null , body );
            }.bind( this ),
        } );
    },
} );

module.exports = jsDAV_ACD_File;
