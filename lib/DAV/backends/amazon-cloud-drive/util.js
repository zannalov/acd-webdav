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

module.exports.acdRequest = function acdRequest( amazonAuth , endpointName , requestOptions , directCallback , requestCallback ) {
    var attempt = 0;

    function _acdRequest() {
        amazonAuth.getHeadersForRequest( function( error , headers ) {
            if( error ) {
                return directCallback( new Exc.jsDAV_Exception( 'Error encountered while trying to get headers prior to performing request' ) );
            }

            amazonAuth.getEndpoint( function( error , endpoint ) {
                if( error ) {
                    return directCallback( new Exc.jsDAV_Exception( 'Error encountered while trying to get endpoint prior to performing request' ) );
                }

                if( 0 !== requestOptions.url.indexOf( endpoint[ endpointName ] ) ) {
                    requestOptions.url = endpoint[ endpointName ] + requestOptions.url;
                }

                requestOptions.timeout = requestOptions.timeout || 300000;

                requestOptions.headers = requestOptions.headers || {};
                for( var k in headers ) {
                    requestOptions.headers[ k ] = headers[ k ];
                }

                request( requestOptions , function( err , res , body ) {
                    if( !err && -1 !== [ 401 , 429 , 500 , 503 ].indexOf( res.statusCode ) && MAX_ATTEMPTS > attempt ) {
                        _acdRequestRetry();
                    } else {
                        requestCallback( err , res , body );
                    }
                } );
            } );
        } );
    }

    function _acdRequestRetry() {
        var delay = Math.round( Math.random() * Math.pow( 2 , attempt ) * 1000 );
        ++ attempt;
        setTimeout( _acdRequest , delay );
    }

    _acdRequest();
};
