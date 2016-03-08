'use strict';

var request = require( 'request' );

var JSDAV = require( 'jsDAV/lib/jsdav' );
var Util = require( 'jsDAV/lib/shared/util' );
require( 'request-debug' )( request , function( type , data , r ) {
    if( JSDAV.debugMode ) {
        Util.log( 'request-debug' , type , data );
    }
} );

module.exports.acdRequest = function acdRequest( amazonAuth , endpointName , requestOptions , directCallback , requestCallback ) {
    amazonAuth.getHeadersForRequest( function( error , headers ) {
        if( error ) {
            return directCallback( new Exc.jsDAV_Exception( 'Error encountered while trying to get headers prior to performing request' ) );
        }

        amazonAuth.getEndpoint( function( error , endpoint ) {
            if( error ) {
                return directCallback( new Exc.jsDAV_Exception( 'Error encountered while trying to get endpoint prior to performing request' ) );
            }

            requestOptions.url = endpoint[ endpointName ] + requestOptions.url;

            requestOptions.headers = requestOptions.headers || {};
            for( var k in headers ) {
                if( !requestOptions.hasOwnProperty( k ) ) {
                    requestOptions.headers[ k ] = headers[ k ];
                }
            }

            // TODO: 401 : The client passed in the invalid Auth token. Client should refresh the token and then try again.
            request( requestOptions , requestCallback );
        } );
    } );
};
