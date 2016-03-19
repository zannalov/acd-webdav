'use strict';

var request = require( 'request' );

var JSDAV = require( 'jsDAV/lib/jsdav' );
var Util = require( 'jsDAV/lib/shared/util' );
var Exc = require( 'jsDAV/lib/shared/exceptions' );

var MAX_ATTEMPTS = 8;

require( 'request-debug' )( request , function( type , data /* , r */ ) {
    if( JSDAV.debugMode ) {
        Util.log( 'request-debug' , type , data );
    }
} );

module.exports.acdRequest = function acdRequest( amazonAuth , endpointName , requestOptions , directCallback , responseCallback , pipe , requestCallback ) {
    var attempt = 0;

    function _acdRequest() {
        amazonAuth.getHeadersAndEndpoint( function( error , headers , endpoint ) {
            if( error ) {
                return directCallback( new Exc.jsDAV_Exception( 'Error encountered while trying to get headers or endpoint prior to performing request' ) );
            }

            var selectedEndpoint = endpoint[ endpointName ].replace( /\/+$/ , '' );
            var requestOptionsUrl = requestOptions.url.replace( /^\/+/ , '' );

            if( 0 !== requestOptions.url.indexOf( selectedEndpoint ) ) {
                requestOptions.url = selectedEndpoint + '/' + requestOptionsUrl;
            }

            requestOptions.timeout = requestOptions.timeout || 300000;

            requestOptions.headers = requestOptions.headers || {};
            for( var k in headers ) {
                requestOptions.headers[ k ] = headers[ k ];
            }

            function shouldRetry( err , res ) {
                return Boolean( !err && -1 !== [ 401 , 429 , 500 , 503 ].indexOf( res.statusCode ) && MAX_ATTEMPTS > attempt );
            }

            if( !pipe ) {
                request( requestOptions , function( err , res , body ) {
                    if( shouldRetry( err , res ) ) {
                        _acdRequestRetry();
                    } else {
                        responseCallback( err , res , body );
                    }
                } );
            } else {
                var req = request( requestOptions );
                req.on( 'error' , function( err ) {
                    responseCallback( err );
                } );
                if( requestCallback ) {
                    requestCallback( req );
                }
                req.on( 'response' , function( res ) {
                    if( shouldRetry( null , res ) ) {
                        req.abort();
                        _acdRequestRetry();
                    } else {
                        responseCallback( null , res );
                    }
                } );
            }
        } );
    }

    function _acdRequestRetry() {
        var delay = Math.round( Math.random() * Math.pow( 2 , attempt ) * 1000 );
        ++ attempt;
        setTimeout( _acdRequest , delay );
    }

    _acdRequest();
};
