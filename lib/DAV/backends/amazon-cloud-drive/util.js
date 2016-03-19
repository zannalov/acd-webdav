'use strict';

var request = require( 'request' );

var JSDAV = require( 'jsDAV/lib/jsdav' );
var Util = require( 'jsDAV/lib/shared/util' );
var Exc = require( 'jsDAV/lib/shared/exceptions' );

require( 'request-debug' )( request , function( type , data /* , r */ ) {
    if( JSDAV.debugMode ) {
        Util.log( 'request-debug' , type , data );
    }
} );

module.exports.MAX_ATTEMPTS = 8;

// opts.maxAttempts OPTIONAL overrides module.exports.MAX_ATTEMPTS
// opts.amazonAuth REQUIRED auth object
// opts.directCallback REQUIRED callback( error ), called when we can't get auth info
// opts.endpointName REQUIRED key of endpoint to prefix onto opts.requestOptions.url
// opts.requestOptions REQUIRED object of options to pass to request module
// opts.pipe OPTIONAL if true, don't wait for body to be returned, simply use callbacks to provide request/response objects to caller
// opts.responseCallback REQUIRED callback( err [ , res [ , body ] ] ), called when response (and body) are ready. body will only be provided if opts.pipe is false.
// opts.requestCallback OPTIONAL callback( req ), useful for piping input to request
module.exports.acdRequest = function acdRequest( opts ) {
    var attempt = 0;

    if( !opts.hasOwnProperty( 'maxAttempts' ) ) {
        opts.maxAttempts = module.exports.MAX_ATTEMPTS;
    }

    function _acdRequest() {
        opts.amazonAuth.getHeadersAndEndpoint( function( error , headers , endpoint ) {
            function hasRemainingAttempts() {
                return Boolean( opts.maxAttempts > attempt );
            }

            if( error ) {
                if( hasRemainingAttempts() ) {
                    _acdRequestRetry();
                } else {
                    opts.directCallback( new Exc.jsDAV_Exception( 'Error encountered while trying to get headers or endpoint prior to performing request' ) );
                }

                return;
            }

            var selectedEndpoint = endpoint[ opts.endpointName ].replace( /\/+$/ , '' );
            var requestOptionsUrl = opts.requestOptions.url.replace( /^\/+/ , '' );

            if( 0 !== opts.requestOptions.url.indexOf( selectedEndpoint ) ) {
                opts.requestOptions.url = selectedEndpoint + '/' + requestOptionsUrl;
            }

            opts.requestOptions.timeout = opts.requestOptions.timeout || 300000;

            opts.requestOptions.headers = opts.requestOptions.headers || {};
            for( var k in headers ) {
                opts.requestOptions.headers[ k ] = headers[ k ];
            }

            function shouldRetry( res ) {
                return Boolean( -1 !== [ 401 , 429 , 500 , 503 ].indexOf( res.statusCode ) && hasRemainingAttempts() );
            }

            var req = null;
            if( !opts.pipe ) {
                req = request( opts.requestOptions , function( err , res , body ) {
                    if( !err && shouldRetry( res ) ) {
                        _acdRequestRetry();
                    } else {
                        opts.responseCallback( err , res , body );
                    }
                } );
            } else {
                req = request( opts.requestOptions );
                req.on( 'error' , function( err ) {
                    opts.responseCallback( err );
                } );
                req.on( 'response' , function( res ) {
                    if( shouldRetry( res ) ) {
                        req.abort();
                        _acdRequestRetry();
                    } else {
                        opts.responseCallback( null , res );
                    }
                } );
            }

            if( opts.requestCallback ) {
                opts.requestCallback( req );
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
