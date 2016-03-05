'use strict';

var request = require( 'request' );

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

            request( requestOptions , requestCallback );
        } );
    } );
};
